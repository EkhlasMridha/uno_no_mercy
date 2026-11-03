import { afterEach, describe, expect, it } from 'vitest';
import { seededRng } from '../src/engine/index.js';
import { answerHandRequest, endHandShare, requestHand } from '../src/rooms/hand-share.js';
import { toGameView } from '../src/rooms/projections.js';
import { RoomError, RoomManager } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';

const managers: RoomManager[] = [];

afterEach(() => {
  for (const m of managers) m.closeAll('test over');
  managers.length = 0;
});

function newManager(): RoomManager {
  const manager = new RoomManager({
    rng: seededRng(11),
    reconnectGraceMs: 60_000,
    checkInvariants: false,
    onRoomUpdated: () => {},
    onRoomClosed: () => {},
  });
  managers.push(manager);
  return manager;
}

/** Ana, Ben and Cat mid-game, with Ana already knocked out. */
function table(): { manager: RoomManager; room: Room; ana: string; ben: string; cat: string } {
  const manager = newManager();
  const { room, player: ana } = manager.createRoom('Ana', 'female', 's1', 4);
  const { player: ben } = manager.joinRoom(room.code, 'Ben', 'male', 's2');
  const { player: cat } = manager.joinRoom(room.code, 'Cat', 'female', 's3');
  manager.setReady(room.code, ben.id, true);
  manager.setReady(room.code, cat.id, true);
  manager.startGame(room.code, ana.id);
  knockOut(room, ana.id);
  return { manager, room, ana: ana.id, ben: ben.id, cat: cat.id };
}

function knockOut(room: Room, playerId: string): void {
  const seat = room.game!.players.find((p) => p.id === playerId)!;
  seat.status = 'eliminated';
  seat.eliminationReason = 'mercy';
}

function handIds(room: Room, playerId: string): string[] {
  return room.game!.players.find((p) => p.id === playerId)!.hand.map((c) => c.id);
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

describe('seeing a hand once knocked out (docs/RULES.md §5.17)', () => {
  it('shows the hand only to the viewer, and only after the player agrees', () => {
    const { room, ana, ben, cat } = table();
    requestHand(room, ana, ben);

    expect(toGameView(room, ana)!.handShare.watching).toEqual({
      targetId: ben,
      status: 'pending',
      hand: null,
    });
    expect(toGameView(room, ben)!.handShare.watchers).toEqual([
      { viewerId: ana, status: 'pending' },
    ]);
    expect(toGameView(room, cat)!.handShare).toEqual({
      watching: null,
      refusedIds: [],
      watchers: [],
    });

    answerHandRequest(room, ben, ana, true);
    const watched = toGameView(room, ana)!.handShare.watching!;
    expect(watched.status).toBe('allowed');
    expect(watched.hand!.map((c) => c.id)).toEqual(handIds(room, ben));

    // Nobody else learns a single card of Ben's.
    const catView = JSON.stringify(toGameView(room, cat));
    for (const id of handIds(room, ben)) expect(catView).not.toContain(id);
  });

  it('only lets a knocked-out player ask, and only about someone still playing', () => {
    const { room, ana, ben, cat } = table();
    expect(refusal(() => requestHand(room, ben, cat))).toBe('INVALID_PHASE');
    expect(refusal(() => requestHand(room, ana, ana))).toBe('INVALID_TARGET');
    knockOut(room, cat);
    expect(refusal(() => requestHand(room, ana, cat))).toBe('INVALID_TARGET');
    expect(refusal(() => requestHand(room, ana, 'p_nobody_here'))).toBe('INVALID_TARGET');
    expect(refusal(() => answerHandRequest(room, ben, ana, true))).toBe('INVALID_TARGET');
  });

  it('remembers a no for the rest of the round, even after asking someone else', () => {
    const { room, ana, ben, cat } = table();
    requestHand(room, ana, ben);
    answerHandRequest(room, ben, ana, false);
    expect(toGameView(room, ana)!.handShare.watching).toBeNull();
    expect(toGameView(room, ana)!.handShare.refusedIds).toEqual([ben]);
    expect(refusal(() => requestHand(room, ana, ben))).toBe('INVALID_TARGET');

    requestHand(room, ana, cat);
    expect(refusal(() => requestHand(room, ana, ben))).toBe('INVALID_TARGET');
    expect(toGameView(room, ana)!.handShare.watching?.targetId).toBe(cat);
  });

  it('lets the player stop showing their hand, and the viewer stop watching', () => {
    const { room, ana, ben, cat } = table();
    requestHand(room, ana, ben);
    answerHandRequest(room, ben, ana, true);
    endHandShare(room, ben, ana);
    expect(toGameView(room, ana)!.handShare.watching).toBeNull();
    expect(toGameView(room, ben)!.handShare.watchers).toEqual([]);
    expect(refusal(() => requestHand(room, ana, ben))).toBe('INVALID_TARGET');
    expect(refusal(() => endHandShare(room, ben, ana))).toBe('INVALID_TARGET');

    requestHand(room, ana, cat);
    answerHandRequest(room, cat, ana, true);
    endHandShare(room, ana);
    expect(toGameView(room, ana)!.handShare.watching).toBeNull();
    expect(toGameView(room, cat)!.handShare.watchers).toEqual([]);
    // Stopping yourself is not a refusal: you may ask Cat again.
    requestHand(room, ana, cat);
    expect(toGameView(room, ana)!.handShare.watching?.targetId).toBe(cat);
  });

  it('ends when the watched player is knocked out, leaves, or a new round is dealt', () => {
    const { manager, room, ana, ben, cat } = table();
    requestHand(room, ana, ben);
    answerHandRequest(room, ben, ana, true);
    knockOut(room, ben);
    expect(toGameView(room, ana)!.handShare.watching).toBeNull();

    requestHand(room, ana, cat);
    manager.leaveRoom(room.code, cat);
    expect(room.handShares).toEqual([]);

    room.handShares.push({ viewerId: ana, targetId: ben, status: 'denied' });
    room.status = 'roundOver';
    manager.nextRound(room.code, room.hostId);
    expect(room.handShares).toEqual([]);
  });

  it('has a computer agree straight away', () => {
    const manager = newManager();
    const { room, player: solo } = manager.createRoom('Solo', 'male', 's1', 4, 2);
    knockOut(room, solo.id);
    const bot = room.players.find((p) => p.isComputer)!;
    requestHand(room, solo.id, bot.id);
    const watched = toGameView(room, solo.id)!.handShare.watching!;
    expect(watched.status).toBe('allowed');
    expect(watched.hand!.map((c) => c.id)).toEqual(handIds(room, bot.id));
  });
});
