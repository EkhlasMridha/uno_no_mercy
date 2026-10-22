import { describe, expect, it, vi } from 'vitest';
import { CARD_COLORS, isWildCard, MAX_PLAYERS, type Card } from '@nomercy/shared';
import {
  applyCommand,
  assertCardConservation,
  createGame,
  getValidActions,
  seededRng,
  type GameCommand,
  type GameState,
} from '../src/engine/index.js';
import { computerMoves } from '../src/rooms/computer-player.js';
import { RoomManager } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';
import { buildState, filler, n, PLAYER_IDS } from './helpers.js';
import { scoreRound, cardPoints } from '../src/rooms/match-scoring.js';

/** Picks a random legal command for some player, using only the server's valid-action projection. */
function randomMove(
  state: GameState,
  pick: (n: number) => number,
): { playerId: string; command: GameCommand } | null {
  const order = state.players.map((p) => p.id);
  for (const playerId of order) {
    const actions = getValidActions(state, playerId);
    if (actions.catchablePlayerIds.length > 0 && pick(3) === 0) {
      return {
        playerId,
        command: { type: 'catchUno', targetId: actions.catchablePlayerIds[0] as string },
      };
    }
    if (actions.canCallUno && pick(2) === 0) return { playerId, command: { type: 'callUno' } };
  }
  for (const playerId of order) {
    const actions = getValidActions(state, playerId);
    const hand = state.players.find((p) => p.id === playerId)!.hand;
    if (actions.canChooseRouletteColor) {
      return { playerId, command: { type: 'chooseRouletteColor', color: CARD_COLORS[pick(4)]! } };
    }
    if (actions.playableCardIds.length > 0) {
      const cardId = actions.playableCardIds[pick(actions.playableCardIds.length)] as string;
      const card = hand.find((c) => c.id === cardId) as Card;
      const target = actions.swapTargetIds[pick(actions.swapTargetIds.length)];
      return {
        playerId,
        command: {
          type: 'playCard',
          cardId,
          color: isWildCard(card) ? CARD_COLORS[pick(4)] : undefined,
          swapTargetId: card.kind === 'number' && card.value === 7 ? target : undefined,
          declareUno: actions.canDeclareWithPlay && pick(2) === 0,
        },
      };
    }
    if (actions.canAcceptPenalty) return { playerId, command: { type: 'acceptPenalty' } };
    if (actions.canDraw) return { playerId, command: { type: 'draw' } };
  }
  return null;
}

describe('randomized full games', () => {
  it('always terminates with a winner and conserves all 168 cards', () => {
    let finishedByEmptyHand = 0;
    let finishedByLastStanding = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const rng = seededRng(seed);
      // Mostly classic 2–6 tables, plus every size up to MAX_PLAYERS.
      const playerCount = seed % 4 === 0 ? 2 + (seed % (MAX_PLAYERS - 1)) : 2 + (seed % 5);
      const players = Array.from({ length: playerCount }, (_, i) => ({
        id: `p_sim${String(i).padStart(5, '0')}`,
        name: `P${i}`,
      }));
      let { state } = createGame({ players, dealerIndex: seed, rng });
      let steps = 0;
      while (state.phase.type !== 'finished') {
        const move = randomMove(state, rng);
        expect(move, `seed ${seed}: no legal move at version ${state.version}`).not.toBeNull();
        const outcome = applyCommand(state, move!.playerId, move!.command, rng, {
          checkInvariants: true,
        });
        if (!outcome.ok)
          throw new Error(`seed ${seed}: ${outcome.error.code} ${outcome.error.message}`);
        state = outcome.state;
        steps++;
        expect(steps).toBeLessThan(20_000);
        // Mercy invariant: no active player ever holds 25+ cards after a transition.
        expect(state.players.every((p) => p.status !== 'active' || p.hand.length < 25)).toBe(true);
      }
      assertCardConservation(state);
      if (state.phase.reason === 'emptyHand') finishedByEmptyHand++;
      if (state.phase.reason === 'lastStanding') finishedByLastStanding++;
      expect(state.phase.winnerId).not.toBeNull();
      expect(scoreRound(state)?.winnerId).toBe(state.phase.winnerId);
    }
    expect(finishedByEmptyHand + finishedByLastStanding).toBe(120);
  });
});

describe('computer players', () => {
  it('finish every game legally when they fill the whole table', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seededRng(seed);
      const playerCount = [2, 4, 6, MAX_PLAYERS][seed % 4]!;
      const players = Array.from({ length: playerCount }, (_, i) => ({
        id: `p_cpu${String(i).padStart(5, '0')}`,
        name: `C${i}`,
      }));
      let { state } = createGame({ players, dealerIndex: seed, rng });
      let steps = 0;
      while (state.phase.type !== 'finished') {
        // Every seat is asked, since UNO calls and catches come from players off turn.
        const mover = computerMoves(
          state,
          state.players.map((p) => p.id),
          rng,
        )[0];
        expect(mover, `seed ${seed}: no computer move at version ${state.version}`).toBeDefined();
        const outcome = applyCommand(state, mover!.playerId, mover!.command, rng, {
          checkInvariants: true,
        });
        if (!outcome.ok)
          throw new Error(`seed ${seed}: ${outcome.error.code} ${outcome.error.message}`);
        state = outcome.state;
        steps++;
        expect(steps).toBeLessThan(20_000);
      }
      assertCardConservation(state);
      expect(state.phase.winnerId).not.toBeNull();
    }
  });

  it('let a computer call UNO before another computer can catch it', () => {
    const state = buildState({ hands: [filler(3), filler(3), [n('blue', 1)]], top: n('red', 5) });
    state.players[2]!.uno = 'vulnerable';
    // Seat 1 could catch seat 2, but seat 2 saves itself first even though it sits later.
    const [first] = computerMoves(state, [PLAYER_IDS[1]!, PLAYER_IDS[2]!], seededRng(1));
    expect(first).toEqual({ playerId: PLAYER_IDS[2], command: { type: 'callUno' } });
  });

  it('retry instead of freezing the table when a move is refused', () => {
    vi.useFakeTimers();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const manager = new RoomManager({
        rng: seededRng(3),
        reconnectGraceMs: 60_000,
        checkInvariants: true,
        computerMoveDelayMs: 10,
        onRoomUpdated: () => {},
        onRoomClosed: () => {},
      });
      const { room, player } = manager.createRoom('Solo', 'socket-1', 2, 1);
      const game = room.game!;
      game.currentIndex = game.players.findIndex((p) => p.id !== player.id);
      game.phase = { type: 'turn' };
      game.pendingDraw = null;
      // A missing card fails the conservation check, so every command is refused.
      const missing = game.drawPile.pop()!;
      const run = () =>
        (manager as unknown as { runComputerMove(r: Room): void }).runComputerMove(room);
      run();
      expect(room.game!.version).toBe(game.version);
      expect(room.computerTimer).not.toBeNull();

      game.drawPile.push(missing);
      vi.advanceTimersByTime(50);
      expect(room.game!.version).toBeGreaterThan(game.version);
      manager.closeAll('done');
    } finally {
      quiet.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('scoring', () => {
  it('uses the official card values', () => {
    expect(cardPoints({ id: 'c1', kind: 'number', color: 'red', value: 7 })).toBe(7);
    expect(cardPoints({ id: 'c2', kind: 'skipEveryone', color: 'red' })).toBe(20);
    expect(cardPoints({ id: 'c3', kind: 'wildDraw10' })).toBe(50);
  });
});
