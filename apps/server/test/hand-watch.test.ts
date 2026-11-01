import { afterEach, describe, expect, it } from 'vitest';
import { seededRng } from '../src/engine/index.js';
import { toGameView } from '../src/rooms/projections.js';
import { RoomError, RoomManager } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';
import { buildState, filler, handOf, n } from './helpers.js';

const managers: RoomManager[] = [];
afterEach(() => {
  for (const m of managers) m.closeAll('test over');
  managers.length = 0;
});

/** Ana, Ben and Cat are in play; Dan was knocked out and holds nothing. */
function table() {
  const manager = new RoomManager({
    rng: seededRng(7),
    reconnectGraceMs: 60_000,
    checkInvariants: false,
    onRoomUpdated: () => {},
    onRoomClosed: () => {},
  });
  managers.push(manager);
  const { room, player: ana } = manager.createRoom('Ana', 'female', 's1', 6);
  const others = ['Ben', 'Cat', 'Dan'].map((name, i) => {
    const { player } = manager.joinRoom(room.code, name, 'male', `s${i + 2}`);
    manager.setReady(room.code, player.id, true);
    return player;
  });
  manager.startGame(room.code, ana.id);
  const state = buildState({
    hands: [filler(2), [n('blue', 1), n('blue', 2)], [n('green', 7), n('green', 8)], []],
    top: n('red', 1),
    drawPile: filler(4),
  });
  [ana, ...others].forEach((p, i) => {
    state.players[i]!.id = p.id;
  });
  state.players[3]!.status = 'eliminated';
  state.players[3]!.eliminationReason = 'mercy';
  room.game = state;
  room.turnHoldUntil = 0;
  const [ben, cat, dan] = others as [(typeof others)[0], (typeof others)[0], (typeof others)[0]];
  return { manager, room, ana, ben, cat, dan };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
  throw new Error('Expected the request to be refused');
}

const viewOf = (room: Room, id: string) => toGameView(room, id)!;

describe('watching a hand after a knockout (docs/RULES.md §5.17)', () => {
  it('lets only a knocked-out player ask, and only someone still in play', () => {
    const { manager, room, ana, ben, dan } = table();
    expect(refusal(() => manager.requestWatch(room.code, ana.id, ben.id))).toBe('INVALID_MOVE');
    expect(refusal(() => manager.requestWatch(room.code, dan.id, dan.id))).toBe('INVALID_TARGET');
    room.game!.players[2]!.status = 'eliminated';
    const cat = room.players[2]!;
    expect(refusal(() => manager.requestWatch(room.code, dan.id, cat.id))).toBe('INVALID_TARGET');
  });

  it('shows the asked player who is asking and whose hand they already watch', () => {
    const { manager, room, ben, cat, dan } = table();
    manager.requestWatch(room.code, dan.id, ben.id);
    expect(viewOf(room, dan.id).watch.outgoing).toEqual({ targetId: ben.id });
    expect(viewOf(room, ben.id).watch.incoming).toEqual([{ watcherId: dan.id, watchingId: null }]);
    expect(refusal(() => manager.requestWatch(room.code, dan.id, cat.id))).toBe('INVALID_MOVE');

    manager.respondToWatch(room.code, ben.id, dan.id, true);
    manager.requestWatch(room.code, dan.id, cat.id);
    expect(viewOf(room, cat.id).watch.incoming).toEqual([
      { watcherId: dan.id, watchingId: ben.id },
    ]);
  });

  it('sends the hand only after the answer is yes, and moves the watch with a second yes', () => {
    const { manager, room, ben, cat, dan } = table();
    const benCards = handOf(room.game!, 1).map((c) => c.id);
    const catCards = handOf(room.game!, 2).map((c) => c.id);
    manager.requestWatch(room.code, dan.id, ben.id);
    expect(JSON.stringify(viewOf(room, dan.id))).not.toContain(benCards[0]);

    expect(manager.respondToWatch(room.code, ben.id, dan.id, true).granted).toBe(true);
    const watching = viewOf(room, dan.id).watch.watching;
    expect(watching?.hand.map((c) => c.id)).toEqual(benCards);
    expect(viewOf(room, ben.id).watch.watchers).toEqual([dan.id]);
    expect(JSON.stringify(viewOf(room, dan.id))).not.toContain(catCards[0]);

    manager.requestWatch(room.code, dan.id, cat.id);
    manager.respondToWatch(room.code, cat.id, dan.id, true);
    expect(viewOf(room, dan.id).watch.watching?.targetId).toBe(cat.id);
    expect(viewOf(room, ben.id).watch.watchers).toEqual([]);
    expect(JSON.stringify(viewOf(room, dan.id))).not.toContain(benCards[0]);
  });

  it('keeps a declined request private, and ends a watch the player takes back', () => {
    const { manager, room, ben, dan } = table();
    const benCards = handOf(room.game!, 1).map((c) => c.id);
    manager.requestWatch(room.code, dan.id, ben.id);
    expect(manager.respondToWatch(room.code, ben.id, dan.id, false).granted).toBe(false);
    expect(viewOf(room, dan.id).watch).toMatchObject({ outgoing: null, watching: null });
    expect(refusal(() => manager.respondToWatch(room.code, ben.id, dan.id, false))).toBe(
      'INVALID_TARGET',
    );

    manager.requestWatch(room.code, dan.id, ben.id);
    manager.respondToWatch(room.code, ben.id, dan.id, true);
    manager.respondToWatch(room.code, ben.id, dan.id, false);
    expect(JSON.stringify(viewOf(room, dan.id))).not.toContain(benCards[0]);
  });

  it('lets the watcher withdraw or stop', () => {
    const { manager, room, ben, dan } = table();
    manager.requestWatch(room.code, dan.id, ben.id);
    manager.stopWatching(room.code, dan.id);
    expect(viewOf(room, ben.id).watch.incoming).toEqual([]);
    manager.requestWatch(room.code, dan.id, ben.id);
    manager.respondToWatch(room.code, ben.id, dan.id, true);
    manager.stopWatching(room.code, dan.id);
    expect(viewOf(room, dan.id).watch.watching).toBeNull();
  });

  it('ends by itself when the watched player is out, and at the end of the round', () => {
    const { manager, room, ben, dan } = table();
    manager.requestWatch(room.code, dan.id, ben.id);
    manager.respondToWatch(room.code, ben.id, dan.id, true);
    room.game!.players[1]!.status = 'eliminated';
    expect(viewOf(room, dan.id).watch.watching).toBeNull();
    room.game!.players[1]!.status = 'active';
    expect(viewOf(room, dan.id).watch.watching).not.toBeNull();
    room.status = 'roundOver';
    expect(viewOf(room, dan.id).watch.watching).toBeNull();
  });
});
