import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from '../rooms/room-manager.js';
import type { Rng } from '../engine/index.js';
import { Broadcaster } from './broadcaster.js';
import { registerGameHandlers } from './game-handlers.js';
import { RateLimiter } from './rate-limiter.js';
import { registerRoomHandlers } from './room-handlers.js';
import type { GameServer } from './socket-types.js';

export interface SocketServerOptions {
  rng: Rng;
  reconnectGraceMs: number;
  checkInvariants: boolean;
  computerMoveDelayMs?: number;
  /** Allowed browser origins for cross-origin dev setups. Same-origin needs nothing. */
  corsOrigins?: string[];
}

/**
 * Concurrency: every handler runs synchronously from validation to broadcast, and Node.js
 * processes socket events one at a time, so mutations of a room are naturally serialized.
 */
export function createSocketServer(httpServer: HttpServer, options: SocketServerOptions) {
  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    serveClient: false,
    ...(options.corsOrigins ? { cors: { origin: options.corsOrigins } } : {}),
  });
  const broadcaster = new Broadcaster(io);
  const manager = new RoomManager({
    rng: options.rng,
    reconnectGraceMs: options.reconnectGraceMs,
    checkInvariants: options.checkInvariants,
    computerMoveDelayMs: options.computerMoveDelayMs,
    onRoomUpdated: (room) => broadcaster.room(room),
    onRoomClosed: (room, reason) => {
      console.info(`[room ${room.code}] closed: ${reason}`);
      broadcaster.closed(room, reason);
    },
  });

  io.on('connection', (socket) => {
    socket.data.session = null;
    const limiter = new RateLimiter(30, 15);
    const deps = { io, socket, manager, broadcaster, limiter };
    registerRoomHandlers(deps);
    registerGameHandlers(deps);

    socket.on('disconnect', () => {
      const session = socket.data.session;
      if (!session) return;
      const room = manager.handleDisconnect(session.roomCode, session.playerId, socket.id);
      if (room) broadcaster.room(room);
    });
  });

  return { io, manager };
}
