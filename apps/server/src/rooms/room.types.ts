import type {
  Ack,
  ChatMessage,
  Gender,
  RoomSettings,
  RoomStatus,
  RoundResultView,
} from '@nomercy/shared';
import type { GameState } from '../engine/index.js';
import type { CommandCache } from '../net/command-cache.js';

export interface RoomPlayer {
  id: string;
  name: string;
  /** Picks the avatar. Null for computer players. */
  gender: Gender | null;
  /** Secret, room-scoped. Only ever sent to this player's own socket. */
  reconnectToken: string;
  ready: boolean;
  socketId: string | null;
  disconnectedAt: number | null;
  /** Left or timed out during a game; removed when the room returns to the lobby. */
  departed: boolean;
  score: number;
  /** Seat played by the server (play with computer). Never has a socket. */
  isComputer: boolean;
  commandCache: CommandCache<Ack<unknown>>;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  /** Dropped out mid-game and the table agreed to wait: they may rejoin with the room code. */
  seatHeld: boolean;
}

/** A knocked-out player's request to see an active player's hand (docs/RULES.md §5.17). */
export interface HandShare {
  viewerId: string;
  targetId: string;
  /** Waiting for the target, agreed, or refused for the rest of the round. */
  status: 'pending' | 'allowed' | 'denied';
}

export interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  settings: RoomSettings;
  game: GameState | null;
  /** Group chat, newest last. Kept in memory only and gone with the room. */
  chat: ChatMessage[];
  roundNumber: number;
  dealerIndex: number;
  lastResult: RoundResultView | null;
  createdAt: number;
  /** Pending computer move, if any. */
  computerTimer: ReturnType<typeof setTimeout> | null;
  /** When the UNO breather after the last play or turn change ends (epoch ms; 0 for none). */
  turnHoldUntil: number;
  /** Re-sends the table when the breather ends, so clients see their actions open again. */
  holdTimer: ReturnType<typeof setTimeout> | null;
  /** Hand-sharing requests this round. Cleared when a round is dealt. */
  handShares: HandShare[];
}
