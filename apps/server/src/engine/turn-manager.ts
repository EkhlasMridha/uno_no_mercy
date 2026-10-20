import type { Direction } from '@nomercy/shared';
import { fail } from './errors.js';
import type { GameState, PlayerState } from './game.types.js';

export function isActive(player: PlayerState): boolean {
  return player.status === 'active';
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter(isActive);
}

export function activePlayerCount(state: GameState): number {
  return activePlayers(state).length;
}

export function indexOfPlayer(state: GameState, playerId: string): number {
  return state.players.findIndex((p) => p.id === playerId);
}

export function playerAt(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  if (!player) throw new Error(`No player at seat ${index}`);
  return player;
}

export function requirePlayer(
  state: GameState,
  playerId: string,
): { index: number; player: PlayerState } {
  const index = indexOfPlayer(state, playerId);
  if (index < 0) fail('NOT_IN_ROOM', 'You are not a player in this game');
  return { index, player: playerAt(state, index) };
}

export function currentPlayer(state: GameState): PlayerState {
  return playerAt(state, state.currentIndex);
}

/**
 * Next active seat after `from` in the given direction. Works even when `from`
 * is an eliminated seat. Returns `from` if nobody else is active.
 */
export function nextActiveIndex(
  state: GameState,
  from: number,
  direction: Direction = state.direction,
): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const index = (((from + direction * step) % n) + n) % n;
    if (isActive(playerAt(state, index))) return index;
  }
  return from;
}

/** Moves the turn to the next active player after `from`, skipping `skip` additional active players. */
export function advanceTurn(state: GameState, from: number, skip = 0): void {
  let index = nextActiveIndex(state, from);
  for (let i = 0; i < skip; i++) index = nextActiveIndex(state, index);
  state.currentIndex = index;
}
