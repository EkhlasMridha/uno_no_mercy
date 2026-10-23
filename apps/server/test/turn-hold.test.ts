import { afterEach, describe, expect, it } from 'vitest';
import { TURN_HOLD_MS } from '@nomercy/shared';
import { seededRng, type GameCommand } from '../src/engine/index.js';
import { toGameView } from '../src/rooms/projections.js';
import { RoomError, RoomManager } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';
import { buildState, cardId, n } from './helpers.js';

let clock = 1_000_000;
const managers: RoomManager[] = [];

afterEach(() => {
  for (const m of managers) m.closeAll('test over');
  managers.length = 0;
});

/** Two people at a hand-built table: Ana (to move) holds two reds, Ben holds a red and two blues. */
function table(): { manager: RoomManager; room: Room; ana: string; ben: string } {
  const manager = new RoomManager({
    rng: seededRng(7),
    reconnectGraceMs: 60_000,
    checkInvariants: false,
    now: () => clock,
    onRoomUpdated: () => {},
    onRoomClosed: () => {},
  });
  managers.push(manager);
  const { room, player: host } = manager.createRoom('Ana', 'female', 's1', 4);
  const { player: guest } = manager.joinRoom(room.code, 'Ben', 'male', 's2');
  manager.setReady(room.code, guest.id, true);
  manager.startGame(room.code, host.id);
  const state = buildState({
    hands: [
      [n('red', 5), n('red', 6)],
      [n('red', 8), n('blue', 1), n('blue', 2)],
    ],
    top: n('red', 1),
    drawPile: [n('green', 3), n('green', 4)],
  });
  state.players[0]!.id = host.id;
  state.players[1]!.id = guest.id;
  room.game = state;
  room.turnHoldUntil = 0;
  return { manager, room, ana: host.id, ben: guest.id };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
  throw new Error('Expected the command to be refused');
}

describe('UNO breather after a play (docs/RULES.md §5.9)', () => {
  it('holds every turn action and catch for 2 seconds, but lets the player call UNO', () => {
    const { manager, room, ana, ben } = table();
    const play = (playerId: string, command: GameCommand) =>
      manager.executeGameCommand(room.code, playerId, command, null);

    play(ana, { type: 'playCard', cardId: cardId(room.game!, 0) });
    expect(room.game!.players[0]!.uno).toBe('vulnerable');

    const benCard = cardId(room.game!, 1);
    expect(refusal(() => play(ben, { type: 'catchUno', targetId: ana }))).toBe('TURN_HOLD');
    expect(refusal(() => play(ben, { type: 'playCard', cardId: benCard }))).toBe('TURN_HOLD');
    expect(refusal(() => play(ben, { type: 'draw' }))).toBe('TURN_HOLD');

    const benView = toGameView(room, ben, clock)!;
    expect(benView.turnHoldMs).toBe(TURN_HOLD_MS);
    expect(benView.me.validActions.playableCardIds).toEqual([]);
    expect(benView.me.validActions.canDraw).toBe(false);
    expect(benView.me.validActions.catchablePlayerIds).toEqual([]);
    expect(toGameView(room, ana, clock)!.me.validActions.canCallUno).toBe(true);

    play(ana, { type: 'callUno' });
    expect(room.game!.players[0]!.uno).toBe('declared');

    clock += TURN_HOLD_MS;
    expect(toGameView(room, ben, clock)!.turnHoldMs).toBe(0);
    play(ben, { type: 'playCard', cardId: benCard });
    expect(room.game!.players[1]!.hand).toHaveLength(2);
  });

  it('opens catching once the breather ends if UNO was never called', () => {
    const { manager, room, ana, ben } = table();
    manager.executeGameCommand(
      room.code,
      ana,
      { type: 'playCard', cardId: cardId(room.game!, 0) },
      null,
    );
    clock += TURN_HOLD_MS;
    expect(toGameView(room, ben, clock)!.me.validActions.catchablePlayerIds).toEqual([ana]);
    manager.executeGameCommand(room.code, ben, { type: 'catchUno', targetId: ana }, null);
    expect(room.game!.players[0]!.hand).toHaveLength(3);
  });

  it('does not pause between draws within one turn', () => {
    const { manager, room, ana } = table();
    // Nothing in Ana's hand matches, so each draw keeps the turn with her.
    room.game!.players[0]!.hand = room.game!.players[1]!.hand.splice(1);
    manager.executeGameCommand(room.code, ana, { type: 'draw' }, null);
    expect(room.turnHoldUntil).toBe(0);
    manager.executeGameCommand(room.code, ana, { type: 'draw' }, null);
    expect(room.game!.players[0]!.hand).toHaveLength(4);
  });
});
