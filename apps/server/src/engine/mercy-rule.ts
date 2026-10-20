import { MERCY_HAND_LIMIT, type EliminationReason } from '@nomercy/shared';
import type { EventSink, GameState } from './game.types.js';
import { playerAt } from './turn-manager.js';

export function reachesMercyLimit(handSize: number): boolean {
  return handSize >= MERCY_HAND_LIMIT;
}

/**
 * Removes a player from the game. Their hand is set aside (outside the draw pile) and
 * only returns to play when the draw pile is next rebuilt from the discard pile.
 */
export function eliminatePlayer(
  state: GameState,
  index: number,
  reason: EliminationReason,
  events: EventSink,
): void {
  const player = playerAt(state, index);
  if (player.status !== 'active') return;
  const handSize = player.hand.length;
  player.status = 'eliminated';
  player.eliminationReason = reason;
  state.setAside.push(...player.hand);
  player.hand = [];
  player.uno = 'none';
  events.push({ type: 'playerEliminated', playerId: player.id, reason, handSize });
}

/** Applies the Mercy Rule to one player. Returns true if they were eliminated. */
export function enforceMercy(state: GameState, index: number, events: EventSink): boolean {
  const player = playerAt(state, index);
  if (player.status === 'active' && reachesMercyLimit(player.hand.length)) {
    eliminatePlayer(state, index, 'mercy', events);
    return true;
  }
  return false;
}

export function enforceMercyForAll(state: GameState, events: EventSink): void {
  state.players.forEach((_, index) => enforceMercy(state, index, events));
}
