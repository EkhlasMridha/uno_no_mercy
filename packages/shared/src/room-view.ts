import type { EndReason } from './game-view.js';

export type RoomStatus = 'lobby' | 'inGame' | 'roundOver';

/**
 * How the room came about: `friends` is a lobby people are invited to; `global` is a table dealt by
 * Play global matchmaking (docs/RULES.md §5.19), which plays one round and has no lobby.
 */
export type RoomMode = 'friends' | 'global';

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
  /** A face fixed for this player (Play global), below `AVATAR_VARIANTS`; null deals one per table. */
  avatar: number | null;
  ready: boolean;
  connected: boolean;
  /** Player left or timed out during a running game; kept until the room returns to the lobby. */
  departed: boolean;
  /**
   * Dropped out mid-game: who decides whether the table waits for them, and may stop waiting
   * (docs/RULES.md §5.16). Null when there is nothing to decide.
   */
  waitDeciderId: string | null;
  /** The table agreed to hold this dropped player's seat, so they may rejoin with the room code. */
  seatHeld: boolean;
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
  mode: RoomMode;
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

/** One group chat message. Only ever delivered to the players seated in the same room. */
export interface ChatMessage {
  /** Increases by one per message within a room; clients use it to order and de-duplicate. */
  id: number;
  senderId: string;
  /** The sender's name when they wrote it, so the line survives a rename or a departure. */
  senderName: string;
  text: string;
  /** Epoch milliseconds, stamped by the server. */
  sentAt: number;
  /** Who reacted with each emoji. An emoji nobody chose is absent. */
  reactions: Partial<Record<string, string[]>>;
}

/** One player found by a Play global search. */
export interface MatchSeatView {
  id: string;
  name: string;
  gender: Gender;
  avatar: number;
}

/** A Play global search as one searcher sees it (docs/RULES.md §5.19). */
export interface MatchSearchView {
  /** This searcher's player id, kept as their seat id once the match is dealt. */
  meId: string;
  /** Everyone in the match so far, in order of arrival. */
  players: MatchSeatView[];
  tableSize: number;
  /** Time left on the countdown when this view was sent. */
  remainingMs: number;
  /** Every seat is taken: the deal follows in a moment. */
  found: boolean;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  /** Private, room-scoped reconnect token. Never shared with other players. */
  reconnectToken: string;
}
