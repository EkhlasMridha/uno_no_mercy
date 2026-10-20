import { DECK_SIZE } from '@nomercy/shared';
import type { GameState } from './game.types.js';

/** Development invariant: exactly 168 unique cards exist across all zones. */
export function assertCardConservation(state: GameState): void {
  const all = [
    ...state.drawPile,
    ...state.discardPile,
    ...state.setAside,
    ...state.players.flatMap((p) => p.hand),
  ];
  if (all.length !== DECK_SIZE) {
    throw new Error(`Card conservation violated: ${all.length} cards, expected ${DECK_SIZE}`);
  }
  const ids = new Set(all.map((c) => c.id));
  if (ids.size !== DECK_SIZE) {
    throw new Error(`Card conservation violated: ${DECK_SIZE - ids.size} duplicated card ids`);
  }
}
