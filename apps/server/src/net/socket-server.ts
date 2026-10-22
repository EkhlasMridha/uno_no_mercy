import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { Server } from 'socket.io';
import { clientAddress, createRequestGuard } from '../http/request-guard.js';
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
  /** Extra hostnames accepted in the Host header, besides IPs, localhost and this machine. */
  allowedHosts?: string[];
  /** Open game sockets one address may hold, so one device can't exhaust rooms or memory. */
  maxConnectionsPerIp?: number;
}

/** The parts of a raw Engine.IO connection used to count sockets per address. */
interface EngineConnection {
  request: IncomingMessage;
  once(event: 'close', listener: () => void): unknown;
}

/**
 * Concurrency: every handler runs synchronously from validation to broadcast, and Node.js
 * processes socket events one at a time, so mutations of a room are naturally serialized.
 */
export function createSocketServer(httpServer: HttpServer, options: SocketServerOptions) {
  const guard = createRequestGuard(options);
  const maxPerIp = options.maxConnectionsPerIp ?? 32;
  const openPerIp = new Map<string, number>();

  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    serveClient: false,
    // Called once per new connection handshake, before any game handler sees the socket.
    allowRequest: (req, callback) => {
      if (!guard.allows(req)) return callback('Forbidden origin', false);
      const open = openPerIp.get(clientAddress(req.socket.remoteAddress)) ?? 0;
      if (open >= maxPerIp) return callback('Too many connections from this device', false);
      callback(null, true);
    },
    ...(options.corsOrigins ? { cors: { origin: options.corsOrigins } } : {}),
  });

  io.engine.on('connection', (raw: EngineConnection) => {
    const address = clientAddress(raw.request.socket.remoteAddress);
    openPerIp.set(address, (openPerIp.get(address) ?? 0) + 1);
    raw.once('close', () => {
      const left = (openPerIp.get(address) ?? 1) - 1;
      if (left > 0) openPerIp.set(address, left);
      else openPerIp.delete(address);
    });
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
