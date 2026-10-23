import type { EndReason } from './game-view.js';

export type RoomStatus = 'lobby' | 'inGame' | 'roundOver';

/** Which set of cartoon avatars a person is drawn from, chosen when they create or join a room. */
export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export interface RoomSettings {
  /** Optional official cumulative scoring: first to 1000 points wins the match. */
  scoringEnabled: boolean;
  /** Most players allowed in this room, chosen by the host when creating it. */
  maxPlayers: number;
}

export interface LobbyPlayerView {
  id: string;
  name: string;
  isHost: boolean;
  /** A computer player run by the host server. */
  isComputer: boolean;
  /** Picks the player's avatar. Null for computer players, who are drawn as robots. */
  gender: Gender | null;
  ready: boolean;
  connected: boolean;
  /** Player left or timed out during a running game; kept until the room returns to the lobby. */
  departed: boolean;
  score: number;
}

export interface RoundResultView {
  winnerId: string | null;
  winnerName: string | null;
  reason: EndReason | null;
  /** Points awarded this round (scoring mode only). */
  pointsAwarded: number;
  cardPoints: number;
  knockoutBonus: number;
  /** Set when a player reached the match target (scoring mode only). */
  matchWinnerId: string | null;
}

export interface RoomView {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: LobbyPlayerView[];
  settings: RoomSettings;
  minPlayers: number;
  maxPlayers: number;
  roundNumber: number;
  lastResult: RoundResultView | null;
  matchTarget: number;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  /** Private, room-scoped reconnect token. Never shared with other players. */
  reconnectToken: string;
}
