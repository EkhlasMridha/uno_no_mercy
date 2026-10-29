import type {
  Direction,
  EliminationReason,
  GameEvent,
  GameLogEntry,
  PendingDrawView,
  PlayedCardEntry,
  UnoStatus,
  EndReason,
} from '@nomercy/shared';
import type { Card, CardColor } from './card.types.js';

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  status: 'active' | 'eliminated';
  eliminationReason: EliminationReason | null;
  uno: UnoStatus;
}

export type EnginePhase =
  /** The current player must play, stack, draw or accept a penalty. */
  | { type: 'turn' }
  /**
   * The current player has started drawing. Only the card they drew last may be played, and only
   * if it is playable (`playableCardId`); otherwise, or if they prefer, they draw again.
   * `lastChance`: that draw was their 25th card and it is playable, so playing it is their only move
   * (docs/RULES.md §5.13).
   */
  | { type: 'drawing'; playableCardId: string | null; lastChance: boolean }
  /** A Wild Color Roulette was played; the victim (current player) must name a color. */
  | { type: 'rouletteColor'; victimId: string }
  /**
   * The victim named `color` and now draws one face-up card per draw command until it appears.
   * Revealed cards go straight into their hand; `revealedIds` marks which ones are on show.
   */
  | { type: 'rouletteReveal'; victimId: string; color: CardColor; revealedIds: string[] }
  | { type: 'finished'; winnerId: string | null; reason: EndReason | null };

export type PendingDraw = PendingDrawView;

export interface GameState {
  /** Incremented on every successful transition. */
  version: number;
  /** Seat order. Eliminated players stay in place but are skipped. */
  players: PlayerState[];
  drawPile: Card[];
  /** Last element is the top card. */
  discardPile: Card[];
  /** Hands of eliminated players, returned to play on the next reshuffle. */
  setAside: Card[];
  currentColor: CardColor;
  direction: Direction;
  currentIndex: number;
  dealerIndex: number;
  phase: EnginePhase;
  /** Cumulative draw penalty and the last stacked value, stored separately. */
  pendingDraw: PendingDraw | null;
  log: GameLogEntry[];
  logSeq: number;
  /**
   * The plays still lying on the discard pile, oldest first (public). A reshuffle gathers all but the
   * top card into the deck, so only the top card's entry survives it.
   */
  playHistory: PlayedCardEntry[];
  /** How many plays this round went back into the deck: the round position of `playHistory[0]`. */
  playHistoryStart: number;
  /** When all of these players are out, the round ends with no winner. Empty: play to the end. */
  endWhenOut: string[];
}

export type GameCommand =
  | {
      type: 'playCard';
      cardId: string;
      color?: CardColor | undefined;
      swapTargetId?: string | undefined;
      declareUno?: boolean | undefined;
      /** Discard All: which same-color cards to discard too. Omitted means all of them. */
      discardIds?: string[] | undefined;
    }
  | { type: 'draw' }
  | { type: 'acceptPenalty' }
  | { type: 'chooseRouletteColor'; color: CardColor }
  | { type: 'callUno' }
  | { type: 'catchUno'; targetId: string }
  /** Server-internal: player left the room or their reconnect window expired. */
  | { type: 'forfeit' };

export type EventSink = GameEvent[];
