/**
 * Switches for rule details the official sheet leaves ambiguous.
 * Each choice is documented in docs/RULES.md §6 ("Ambiguities and chosen policies").
 */
export const RULES_CONFIG = {
  /** A player may draw on their turn even while holding a playable card (house rule; the official sheet forbids it). */
  allowVoluntaryDraw: true,
  /** With two active players, Wild Reverse Draw 4 puts the penalty on the player who played it (official sheet). */
  twoPlayerWildReverseDraw4HitsPlayer: true,
  /** Stack responses only need an equal or higher draw value; color is irrelevant. */
  stackingIgnoresColor: true,
  /**
   * A draw you chose to make that brings you to 25 cards spares you if the drawn card is playable:
   * you must play it straight away (house rule, docs/RULES.md §5.13 and §6 A13).
   */
  lastChanceDraw: true,
  /** Mercy knockouts score the 250 bonus; forfeits (leaving/timeouts) do not. */
  forfeitCountsAsKnockout: false,
  /** Max entries kept in the public action log. */
  logLimit: 150,
} as const;
