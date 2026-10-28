import type { DrawReason } from '@nomercy/shared';
import type { Card } from './card.types.js';
import type { EventSink, GameState } from './game.types.js';
import { reachesMercyLimit, enforceMercy } from './mercy-rule.js';
import { shuffle, type Rng } from './rng.js';
import { playerAt } from './turn-manager.js';

export function topCard(state: GameState): Card {
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) throw new Error('Discard pile is empty');
  return top;
}

/**
 * Rebuilds the draw pile from every discard except the active top card, plus any
 * set-aside hands of eliminated players, and forgets the recycled plays. Returns the number of
 * recycled cards.
 */
export function reshuffleDiscardIntoDraw(state: GameState, rng: Rng, events: EventSink): number {
  const top = state.discardPile.pop();
  const pool = [...state.drawPile, ...state.discardPile, ...state.setAside];
  state.discardPile = top ? [top] : [];
  state.setAside = [];
  state.drawPile = shuffle(pool, rng);
  // The recycled plays are face down in the deck now, so nobody can look back at them any more.
  const gathered = Math.max(0, state.playHistory.length - 1);
  state.playHistory = state.playHistory.slice(gathered);
  state.playHistoryStart += gathered;
  if (pool.length > 0) events.push({ type: 'drawPileReshuffled', cards: pool.length });
  return pool.length;
}

/** True if a draw could yield a card (directly or after a reshuffle that keeps the top card). */
export function canSupplyCard(state: GameState): boolean {
  return (
    state.drawPile.length + Math.max(0, state.discardPile.length - 1) + state.setAside.length > 0
  );
}

/** Draws one card, reshuffling when the draw pile is empty. Returns null if no card exists anywhere. */
export function drawOne(state: GameState, rng: Rng, events: EventSink): Card | null {
  if (state.drawPile.length === 0) reshuffleDiscardIntoDraw(state, rng, events);
  return state.drawPile.pop() ?? null;
}

export interface DrawOutcome {
  drawn: Card[];
  eliminated: boolean;
  exhausted: boolean;
}

/**
 * Draws up to `count` cards into a player's hand one at a time. Stops immediately when the
 * player reaches the Mercy limit (they are eliminated) or when no card can be supplied.
 * `deferMercy` leaves the knockout to the caller, for the last-chance draw (docs/RULES.md §5.13).
 */
export function drawCardsInto(
  state: GameState,
  index: number,
  count: number,
  rng: Rng,
  events: EventSink,
  reason: DrawReason,
  deferMercy = false,
): DrawOutcome {
  const player = playerAt(state, index);
  const drawn: Card[] = [];
  let exhausted = false;
  for (let i = 0; i < count; i++) {
    const card = drawOne(state, rng, events);
    if (!card) {
      exhausted = true;
      break;
    }
    player.hand.push(card);
    drawn.push(card);
    if (reachesMercyLimit(player.hand.length)) break;
  }
  if (drawn.length > 0) {
    events.push({ type: 'cardsDrawn', playerId: player.id, count: drawn.length, reason });
  }
  if (exhausted) events.push({ type: 'drawPileExhausted', playerId: player.id });
  const eliminated = !deferMercy && enforceMercy(state, index, events);
  return { drawn, eliminated, exhausted };
}
