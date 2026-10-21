import { describe, expect, it } from 'vitest';
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
import { chooseComputerMove } from '../src/rooms/computer-player.js';
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
        const mover = state.players
          .map((p) => ({ playerId: p.id, command: chooseComputerMove(state, p.id, rng) }))
          .find((m) => m.command !== null);
        expect(mover, `seed ${seed}: no computer move at version ${state.version}`).toBeDefined();
        const outcome = applyCommand(state, mover!.playerId, mover!.command!, rng, {
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
});

describe('scoring', () => {
  it('uses the official card values', () => {
    expect(cardPoints({ id: 'c1', kind: 'number', color: 'red', value: 7 })).toBe(7);
    expect(cardPoints({ id: 'c2', kind: 'skipEveryone', color: 'red' })).toBe(20);
    expect(cardPoints({ id: 'c3', kind: 'wildDraw10' })).toBe(50);
  });
});
