import { drawValueOf, type Card } from './card.types.js';
import type { EventSink, GameState, PendingDraw } from './game.types.js';
import { drawCardsInto } from './pile.js';
import type { Rng } from './rng.js';
import { advanceTurn, playerAt } from './turn-manager.js';

/** A Draw Card may answer a pending penalty when its value is >= the last stacked value. */
export function canStackOnto(card: Card, pending: PendingDraw): boolean {
  const value = drawValueOf(card);
  return value !== null && value >= pending.lastValue;
}

/** Adds a Draw Card to the stack. Total and last value are tracked separately. */
export function pushDrawPenalty(
  state: GameState,
  actorId: string,
  value: number,
  targetIndex: number,
  events: EventSink,
): void {
  const total = (state.pendingDraw?.total ?? 0) + value;
  state.pendingDraw = { total, lastValue: value };
  events.push({
    type: 'drawStackGrew',
    playerId: actorId,
    targetId: playerAt(state, targetIndex).id,
    total,
    lastValue: value,
  });
}

/**
 * The current player takes the whole stack and loses their turn. If the Mercy Rule
 * eliminates them mid-draw, the rest of the penalty is void (the stack is resolved).
 * Either way the turn passes to the next active player after them.
 */
export function acceptPendingPenalty(state: GameState, rng: Rng, events: EventSink): void {
  const pending = state.pendingDraw;
  if (!pending) throw new Error('No pending penalty');
  const index = state.currentIndex;
  const player = playerAt(state, index);
  state.pendingDraw = null;
  const outcome = drawCardsInto(state, index, pending.total, rng, events, 'penalty');
  events.push({
    type: 'penaltyAccepted',
    playerId: player.id,
    total: pending.total,
    drawn: outcome.drawn.length,
  });
  advanceTurn(state, index);
}
