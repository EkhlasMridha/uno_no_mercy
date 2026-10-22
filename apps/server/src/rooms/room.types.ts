import type { Ack, RoomSettings, RoomStatus, RoundResultView } from '@nomercy/shared';
import type { GameState } from '../engine/index.js';
import type { CommandCache } from '../net/command-cache.js';

export interface RoomPlayer {
  id: string;
  name: string;
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
}

export interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  settings: RoomSettings;
  game: GameState | null;
  roundNumber: number;
  dealerIndex: number;
  lastResult: RoundResultView | null;
  createdAt: number;
  /** Pending computer move, if any. */
  computerTimer: ReturnType<typeof setTimeout> | null;
}
