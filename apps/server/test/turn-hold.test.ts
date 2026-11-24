import { afterEach, describe, expect, it, vi } from 'vitest';
import { STARTING_HAND_SIZE, TURN_HOLD_MS, cardsDealtTo, dealTiming } from '@nomercy/shared';
import { seededRng, type GameCommand } from '../src/engine/index.js';
import { toGameView } from '../src/rooms/projections.js';
import { RoomError, RoomManager } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';
import { act, buildState, card, cardId, n } from './helpers.js';

let clock = 1_000_000;
const managers: RoomManager[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const m of managers) m.closeAll('test over');
  managers.length = 0;
});

/** Two people at a hand-built table: Ana (to move) holds two reds, Ben holds a red and two blues. */
function table(onRoomUpdated: (room: Room) => void = () => {}): {
  manager: RoomManager;
  room: Room;
  ana: string;
  ben: string;
} {
  const manager = new RoomManager({
    rng: seededRng(7),
    reconnectGraceMs: 60_000,
    checkInvariants: false,
    now: () => clock,
    onRoomUpdated,
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
  room.dealUntil = 0;
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

  it('goes straight on when a play hands the turn back to its player', () => {
    const { manager, room, ana } = table();
    // With two players a Skip comes straight back to Ana.
    room.game!.players[0]!.hand = [card(act('skip', 'red')), card(n('red', 5)), card(n('red', 6))];
    manager.executeGameCommand(
      room.code,
      ana,
      { type: 'playCard', cardId: cardId(room.game!, 0) },
      null,
    );
    expect(room.game!.currentIndex).toBe(0);
    expect(room.turnHoldUntil).toBe(0);
    expect(toGameView(room, ana, clock)!.me.validActions.playableCardIds).toHaveLength(2);
    manager.executeGameCommand(
      room.code,
      ana,
      { type: 'playCard', cardId: cardId(room.game!, 0) },
      null,
    );
    expect(room.game!.players[0]!.hand).toHaveLength(1);
  });

  it('still holds a turn that comes back when the play left its player open to a catch', () => {
    const { manager, room, ana, ben } = table();
    room.game!.players[0]!.hand = [card(act('skip', 'red')), card(n('red', 5))];
    manager.executeGameCommand(
      room.code,
      ana,
      { type: 'playCard', cardId: cardId(room.game!, 0) },
      null,
    );
    expect(room.game!.currentIndex).toBe(0);
    expect(room.game!.players[0]!.uno).toBe('vulnerable');
    const lastCard = cardId(room.game!, 0);
    expect(
      refusal(() =>
        manager.executeGameCommand(room.code, ana, { type: 'playCard', cardId: lastCard }, null),
      ),
    ).toBe('TURN_HOLD');
    expect(
      refusal(() =>
        manager.executeGameCommand(room.code, ben, { type: 'catchUno', targetId: ana }, null),
      ),
    ).toBe('TURN_HOLD');
    expect(toGameView(room, ana, clock)!.me.validActions.canCallUno).toBe(true);
  });

  it('re-sends the table only once the breather is really over, even if the timer fires early', () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    let benId = '';
    const { manager, room, ana, ben } = table((r) => {
      sent.push(toGameView(r, benId, clock)!.turnHoldMs);
    });
    benId = ben;
    manager.executeGameCommand(
      room.code,
      ana,
      { type: 'playCard', cardId: cardId(room.game!, 0) },
      null,
    );
    // The timer fires on time but the wall clock is still a millisecond short of the deadline.
    clock += TURN_HOLD_MS - 1;
    vi.advanceTimersByTime(TURN_HOLD_MS);
    expect(sent).toEqual([]);

    clock += 1;
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([0]);
    expect(toGameView(room, ben, clock)!.me.validActions.playableCardIds).toHaveLength(1);
  });
});

describe('the opening deal (docs/RULES.md §5.18)', () => {
  function dealtTable(computers?: number) {
    const manager = new RoomManager({
      rng: seededRng(9),
      reconnectGraceMs: 60_000,
      checkInvariants: false,
      computerMoveDelayMs: 10,
      now: () => clock,
      onRoomUpdated: () => {},
      onRoomClosed: () => {},
    });
    managers.push(manager);
    if (computers) {
      const { room, player } = manager.createRoom('Ana', 'female', 's1', 2, computers);
      return { manager, room, ana: player.id };
    }
    const { room, player: host } = manager.createRoom('Ana', 'female', 's1', 4);
    const { player: guest } = manager.joinRoom(room.code, 'Ben', 'male', 's2');
    manager.setReady(room.code, guest.id, true);
    manager.startGame(room.code, host.id);
    return { manager, room, ana: host.id };
  }

  it('lets nobody act until every card has been dealt', () => {
    const { manager, room } = dealtTable();
    const { totalMs } = dealTiming(2);
    const first = room.game!.players[room.game!.currentIndex]!.id;
    const draw = () => manager.executeGameCommand(room.code, first, { type: 'draw' }, null);

    const view = toGameView(room, first, clock)!;
    expect(view.dealMs).toBe(totalMs);
    expect(view.me.validActions.playableCardIds).toEqual([]);
    expect(view.me.validActions.canDraw).toBe(false);
    expect(refusal(draw)).toBe('TURN_HOLD');

    clock += totalMs - 1;
    expect(refusal(draw)).toBe('TURN_HOLD');
    clock += 1;
    expect(toGameView(room, first, clock)!.dealMs).toBe(0);
    expect(toGameView(room, first, clock)!.me.validActions.canDraw).toBe(true);
    draw();
    expect(room.game!.players[room.game!.currentIndex]!.id).toBe(first);
  });

  it('keeps computers waiting for the deal too', () => {
    vi.useFakeTimers();
    const { room, ana } = dealtTable(1);
    const game = room.game!;
    game.currentIndex = game.players.findIndex((p) => p.id !== ana);
    const before = game.version;
    const { totalMs } = dealTiming(2);

    vi.advanceTimersByTime(totalMs + 100);
    expect(room.game!.version).toBe(before);

    // The refused computer queued its next try for when the deal would end; let that come round.
    clock += totalMs;
    vi.advanceTimersByTime(totalMs + 100);
    expect(room.game!.version).toBeGreaterThan(before);
  });

  it('deals one card at a time round the table, starting left of the dealer', () => {
    const { gapMs, travelMs, totalMs } = dealTiming(3);
    expect(cardsDealtTo(0, 3, travelMs - 1)).toBe(0);
    expect(cardsDealtTo(0, 3, travelMs)).toBe(1);
    expect(cardsDealtTo(1, 3, travelMs)).toBe(0);
    expect(cardsDealtTo(1, 3, travelMs + gapMs)).toBe(1);
    expect(cardsDealtTo(0, 3, travelMs + 3 * gapMs)).toBe(2);
    expect(cardsDealtTo(2, 3, totalMs - 1)).toBe(STARTING_HAND_SIZE - 1);
    for (const seat of [0, 1, 2]) expect(cardsDealtTo(seat, 3, totalMs)).toBe(STARTING_HAND_SIZE);
  });
});
