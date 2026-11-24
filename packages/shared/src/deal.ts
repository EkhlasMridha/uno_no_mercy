import { STARTING_HAND_SIZE } from './constants.js';

/** How the opening deal is paced. The server holds the table for `totalMs`; the client animates it. */
export interface DealTiming {
  /** Cards dealt in all: seven to each player. */
  cards: number;
  /** Time between two cards leaving the deck. */
  gapMs: number;
  /** Time one card takes to slide from the deck to its player. */
  travelMs: number;
  /** From the first card leaving the deck to the last one landing. */
  totalMs: number;
}

/** A small table is dealt at an unhurried hand's pace; a big one speeds up so it never drags. */
const TARGET_DEAL_MS = 5000;
const MIN_GAP_MS = 45;
const MAX_GAP_MS = 240;
const TRAVEL_MS = 460;

/** The pace of the opening deal for a table of `playerCount` (docs/RULES.md §5.18). */
export function dealTiming(playerCount: number): DealTiming {
  const cards = STARTING_HAND_SIZE * Math.max(playerCount, 1);
  const gapMs = Math.round(Math.max(MIN_GAP_MS, Math.min(MAX_GAP_MS, TARGET_DEAL_MS / cards)));
  return { cards, gapMs, travelMs: TRAVEL_MS, totalMs: (cards - 1) * gapMs + TRAVEL_MS };
}

/**
 * How many cards the player `offset` seats after the dealer's left (0 = the first one dealt to)
 * holds `elapsedMs` into the deal. Cards go round the table one at a time, seven rounds.
 */
export function cardsDealtTo(offset: number, playerCount: number, elapsedMs: number): number {
  const { gapMs, travelMs, cards } = dealTiming(playerCount);
  if (elapsedMs >= (cards - 1) * gapMs + travelMs) return STARTING_HAND_SIZE;
  const lastLanded = Math.floor((elapsedMs - travelMs) / gapMs);
  if (lastLanded < offset) return 0;
  return Math.min(STARTING_HAND_SIZE, Math.floor((lastLanded - offset) / playerCount) + 1);
}
