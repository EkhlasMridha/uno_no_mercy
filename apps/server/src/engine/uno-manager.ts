import { UNO_PENALTY_CARDS } from '@nomercy/shared';
import { fail } from './errors.js';
import type { EventSink, GameState } from './game.types.js';
import { drawCardsInto } from './pile.js';
import type { Rng } from './rng.js';
import { requirePlayer } from './turn-manager.js';

/**
 * Catch window policy (docs/RULES.md §5.9): a player whose hand becomes exactly one card
 * without declaring becomes "vulnerable". The window closes as soon as a *different* player
 * performs a turn action (play, draw, accept penalty, roulette color) — i.e. the next
 * player begins their turn. After that the player is "safe" until their hand size changes.
 */
export function closeCatchWindows(state: GameState, actorId: string): void {
  for (const player of state.players) {
    if (player.id !== actorId && player.uno === 'vulnerable') player.uno = 'safe';
  }
}

/** Normalizes UNO status after any hand change. */
export function syncUnoStatus(state: GameState): void {
  for (const player of state.players) {
    if (player.status !== 'active' || player.hand.length !== 1) {
      player.uno = 'none';
    } else if (player.uno === 'none') {
      player.uno = 'vulnerable';
    }
  }
}

export function callUno(state: GameState, playerId: string, events: EventSink): void {
  const { player } = requirePlayer(state, playerId);
  if (player.status !== 'active') fail('INVALID_MOVE', 'Eliminated players cannot call UNO');
  if (player.hand.length !== 1) fail('INVALID_MOVE', 'You can only call UNO with one card left');
  if (player.uno === 'declared') fail('INVALID_MOVE', 'You already called UNO');
  player.uno = 'declared';
  events.push({ type: 'unoCalled', playerId });
}

export function catchUno(
  state: GameState,
  catcherId: string,
  targetId: string,
  rng: Rng,
  events: EventSink,
): void {
  const { player: catcher } = requirePlayer(state, catcherId);
  if (catcher.status !== 'active') fail('INVALID_MOVE', 'Eliminated players cannot catch');
  if (catcherId === targetId) fail('INVALID_TARGET', 'You cannot catch yourself');
  const target = state.players.findIndex((p) => p.id === targetId);
  const targetPlayer = state.players[target];
  if (!targetPlayer || targetPlayer.status !== 'active') {
    fail('INVALID_TARGET', 'That player is not in the game');
  }
  if (targetPlayer.uno !== 'vulnerable' || targetPlayer.hand.length !== 1) {
    fail('INVALID_TARGET', 'That player cannot be caught right now');
  }
  events.push({ type: 'unoCaught', playerId: targetId, catcherId });
  targetPlayer.uno = 'none';
  drawCardsInto(state, target, UNO_PENALTY_CARDS, rng, events, 'unoPenalty');
}
