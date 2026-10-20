import type { ClientToServerEvents, ServerToClientEvents } from '@nomercy/shared';
import type { Server, Socket } from 'socket.io';

export interface SocketSession {
  roomCode: string;
  playerId: string;
}

export interface SocketData {
  session: SocketSession | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type InterServerEvents = {};

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
