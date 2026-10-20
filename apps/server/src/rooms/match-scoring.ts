import { KNOCKOUT_BONUS_POINTS, isWildCard, type Card } from '@nomercy/shared';
import type { GameState } from '../engine/index.js';
import { RULES_CONFIG } from '../engine/rules-config.js';

/**
 * Optional official scoring, kept outside the core engine.
 * Number cards: face value · Colored action cards: 20 · Wild action cards: 50.
 */
export function cardPoints(card: Card): number {
  if (card.kind === 'number') return card.value;
  if (isWildCard(card)) return 50;
  return 20;
}

export interface RoundScore {
  winnerId: string;
  cardPoints: number;
  knockoutBonus: number;
  total: number;
}

/** Winner scores the cards left in active opponents' hands plus 250 per player knocked out this hand. */
export function scoreRound(game: GameState): RoundScore | null {
  if (game.phase.type !== 'finished' || !game.phase.winnerId) return null;
  const winnerId = game.phase.winnerId;
  const opponents = game.players.filter((p) => p.id !== winnerId);
  const points = opponents
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0), 0);
  const knockouts = opponents.filter(
    (p) =>
      p.eliminationReason === 'mercy' ||
      (RULES_CONFIG.forfeitCountsAsKnockout && p.eliminationReason === 'forfeit'),
  ).length;
  const knockoutBonus = knockouts * KNOCKOUT_BONUS_POINTS;
  return { winnerId, cardPoints: points, knockoutBonus, total: points + knockoutBonus };
}
