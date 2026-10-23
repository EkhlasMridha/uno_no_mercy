import type { Card, CardColor } from './cards.js';
import type { Gender } from './room-view.js';

/** 1 = clockwise, -1 = counterclockwise. */
export type Direction = 1 | -1;

export type EliminationReason = 'mercy' | 'forfeit';
export type WinReason = 'emptyHand' | 'lastStanding';
/** How a round ended: a win, or every person at a table with computers was knocked out (no winner). */
export type EndReason = WinReason | 'peopleOut';
export type DrawReason = 'noPlayableCard' | 'penalty' | 'unoPenalty' | 'roulette';

/**
 * UNO declaration status of a player.
 * - none: hand size is not 1
 * - vulnerable: has one card, has not declared, and can still be caught
 * - declared: has one card and called UNO
 * - safe: has one card, did not declare, but the catch window has closed
 */
export type UnoStatus = 'none' | 'vulnerable' | 'declared' | 'safe';

export interface PendingDrawView {
  /** Cumulative number of cards the current target must draw. */
  total: number;
  /** Value of the last Draw Card played; responses must be >= this. */
  lastValue: number;
}

/** Public events. Never contain hidden card identities. */
export type GameEvent =
  | {
      type: 'gameStarted';
      dealerId: string;
      firstPlayerId: string;
      topCard: Card;
      ignoredInitialCards: number;
    }
  | { type: 'cardPlayed'; playerId: string; card: Card; chosenColor: CardColor | null }
  | { type: 'cardsDrawn'; playerId: string; count: number; reason: DrawReason }
  | { type: 'drawStackGrew'; playerId: string; targetId: string; total: number; lastValue: number }
  | { type: 'penaltyAccepted'; playerId: string; total: number; drawn: number }
  | { type: 'turnSkipped'; playerId: string }
  | { type: 'directionReversed'; direction: Direction }
  | { type: 'everyoneSkipped'; playerId: string }
  | { type: 'discardedAll'; playerId: string; color: CardColor; count: number }
  | { type: 'handsSwapped'; playerId: string; targetId: string }
  /** Every pass that happened, in seat order; knocked-out seats are skipped. */
  | { type: 'handsPassed'; direction: Direction; passes: { fromId: string; toId: string }[] }
  | { type: 'rouletteStarted'; playerId: string; victimId: string }
  | { type: 'rouletteColorNamed'; victimId: string; color: CardColor }
  /** Roulette cards are drawn face up, so the card itself is public. */
  | { type: 'rouletteCardRevealed'; victimId: string; card: Card }
  | {
      type: 'rouletteResolved';
      victimId: string;
      color: CardColor;
      revealed: number;
      matched: boolean;
      /** Every card revealed, in order; they are now in the victim's hand. */
      cards: Card[];
    }
  | { type: 'drawPileReshuffled'; cards: number }
  | { type: 'drawPileExhausted'; playerId: string }
  | { type: 'unoCalled'; playerId: string }
  | { type: 'unoCaught'; playerId: string; catcherId: string }
  | { type: 'playerEliminated'; playerId: string; reason: EliminationReason; handSize: number }
  | { type: 'gameWon'; playerId: string; reason: WinReason };

export type GameEventType = GameEvent['type'];

export interface GameLogEntry {
  seq: number;
  event: GameEvent;
}

export type GamePhaseView =
  | { type: 'turn' }
  /** The player has started drawing; only their last drawn card may be played. */
  | { type: 'drawing'; playerId: string }
  | { type: 'rouletteColor'; victimId: string }
  /** The victim draws face-up cards one at a time until a card of `color` appears. */
  | { type: 'rouletteReveal'; victimId: string; color: CardColor; revealed: Card[] }
  | { type: 'finished'; winnerId: string | null; reason: EndReason | null };

export interface PublicPlayerView {
  id: string;
  name: string;
  seat: number;
  handCount: number;
  status: 'active' | 'eliminated';
  eliminationReason: EliminationReason | null;
  connected: boolean;
  uno: UnoStatus;
  isHost: boolean;
  /** A computer player run by the host server. */
  isComputer: boolean;
  /** Picks the player's avatar. Null for computer players, who are drawn as robots. */
  gender: Gender | null;
}

/** One card that went onto the discard pile this round. `playerId` is null for the starting card. */
export interface PlayedCardEntry {
  playerId: string | null;
  card: Card;
  chosenColor: CardColor | null;
}

export interface PublicGameView {
  players: PublicPlayerView[];
  currentPlayerId: string | null;
  direction: Direction;
  currentColor: CardColor;
  topCard: Card;
  discardCount: number;
  drawCount: number;
  setAsideCount: number;
  pendingDraw: PendingDrawView | null;
  phase: GamePhaseView;
  log: GameLogEntry[];
  /** Every card played this round, oldest first. Unaffected by reshuffles. */
  playHistory: PlayedCardEntry[];
}

/** Actions the requesting player may take right now, computed by the server engine. */
export interface ValidActions {
  playableCardIds: string[];
  /** Set once the player has started drawing and the card drawn last is playable: the only card they may play. */
  drawnPlayableCardId: string | null;
  canDraw: boolean;
  canAcceptPenalty: boolean;
  canChooseRouletteColor: boolean;
  canCallUno: boolean;
  /** True when the player may declare UNO together with playing their second-to-last card. */
  canDeclareWithPlay: boolean;
  catchablePlayerIds: string[];
  swapTargetIds: string[];
}

export interface PrivatePlayerView {
  playerId: string;
  hand: Card[];
  validActions: ValidActions;
}

export interface GameStateView {
  roomCode: string;
  version: number;
  public: PublicGameView;
  me: PrivatePlayerView;
  /**
   * Milliseconds left in the UNO breather after a play or turn change (docs/RULES.md §5.9). While
   * it runs, `validActions` only offers calling UNO; 0 when the table is open.
   */
  turnHoldMs: number;
}
