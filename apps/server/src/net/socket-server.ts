import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { Server } from 'socket.io';
import { createRequestGuard } from '../http/request-guard.js';
import { Matchmaker } from '../rooms/matchmaker.js';
import { RoomError, RoomManager } from '../rooms/room-manager.js';
import type { Rng } from '../engine/index.js';
import { Broadcaster } from './broadcaster.js';
import { registerGameHandlers } from './game-handlers.js';
import { registerMatchHandlers } from './match-handlers.js';
import { RateLimiter } from './rate-limiter.js';
import { registerRoomHandlers } from './room-handlers.js';
import type { GameServer } from './socket-types.js';

export interface SocketServerOptions {
  rng: Rng;
  reconnectGraceMs: number;
  checkInvariants: boolean;
  computerMoveDelayMs?: number;
  /** Length of the UNO breather after each play or turn change. Defaults to `TURN_HOLD_MS`. */
  turnHoldMs?: number;
  /** Whether a new round waits out the opening deal before anyone acts. Default on. */
  dealHold?: boolean;
  /** Play global countdown. Defaults to `GLOBAL_SEARCH_MS`. */
  globalSearchMs?: number;
  /** Pause between a match filling and its deal. Defaults to `MATCH_FOUND_PAUSE_MS`. */
  matchFoundPauseMs?: number;
  /** Scales how long computers at global tables think. Defaults to 1. */
  humanPaceScale?: number;
  /** Allowed browser origins for cross-origin dev setups. Same-origin needs nothing. */
  corsOrigins?: string[];
  /** Extra hostnames accepted in the Host header, besides IPs, localhost and this machine. */
  allowedHosts?: string[];
  /** Open game sockets one address may hold, so one device can't exhaust rooms or memory. */
  maxConnectionsPerIp?: number;
  /** Behind a reverse proxy: read the public host and player address from X-Forwarded-*. */
  trustProxy?: boolean;
  /** Told why a handshake was refused. */
  onRefused?: (reason: string) => void;
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
      const open = openPerIp.get(guard.addressOf(req)) ?? 0;
      if (open >= maxPerIp) return callback('Too many connections from this device', false);
      callback(null, true);
    },
    ...(options.corsOrigins ? { cors: { origin: options.corsOrigins } } : {}),
  });

  io.engine.on('connection', (raw: EngineConnection) => {
    const address = guard.addressOf(raw.request);
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
    turnHoldMs: options.turnHoldMs,
    dealHold: options.dealHold,
    humanPaceScale: options.humanPaceScale,
    onRoomUpdated: (room) => broadcaster.room(room),
    onChatMessage: (room, message) => broadcaster.chatMessage(room, message),
    onRoomClosed: (room, reason) => {
      console.info(`[room ${room.code}] closed: ${reason}`);
      broadcaster.closed(room, reason);
    },
  });

  const matchmaker = new Matchmaker({
    rng: options.rng,
    searchMs: options.globalSearchMs,
    foundPauseMs: options.matchFoundPauseMs,
    computerSeats: (count, seated) => manager.globalComputerSeats(count, seated),
    onMatchUpdated: (match) => {
      for (const seat of match.seats) {
        if (seat.socketId)
          io.to(seat.socketId).emit('match:state', matchmaker.viewFor(match, seat.id));
      }
    },
    onEmote: (match, seatId, emote) => {
      for (const seat of match.seats) {
        if (seat.socketId) io.to(seat.socketId).emit('match:emote', { seatId, emote });
      }
    },
    onMatchReady: (seats) => {
      const people = seats.filter((s) => s.socketId !== null);
      try {
        const { room, people: seated } = manager.createGlobalRoom(seats);
        for (const player of seated) {
          const socket = player.socketId ? io.sockets.sockets.get(player.socketId) : undefined;
          if (!socket) continue;
          socket.data.session = { roomCode: room.code, playerId: player.id };
          socket.emit('match:found', {
            roomCode: room.code,
            playerId: player.id,
            reconnectToken: player.reconnectToken,
          });
        }
        console.info(`[room ${room.code}] global match dealt (${people.length} searching)`);
        broadcaster.room(room);
      } catch (error) {
        if (!(error instanceof RoomError)) console.error('global match failed to start', error);
        const reason = error instanceof RoomError ? error.message : 'The match could not start';
        for (const seat of people) {
          if (seat.socketId) io.to(seat.socketId).emit('match:closed', { reason });
        }
      }
    },
  });

  io.on('connection', (socket) => {
    socket.data.session = null;
    const limiter = new RateLimiter(30, 15);
    const deps = { io, socket, manager, matchmaker, broadcaster, limiter };
    registerRoomHandlers(deps);
    registerGameHandlers(deps);
    registerMatchHandlers(deps);

    socket.on('disconnect', () => {
      matchmaker.cancel(socket.id);
      const session = socket.data.session;
      if (!session) return;
      const room = manager.handleDisconnect(session.roomCode, session.playerId, socket.id);
      if (room) broadcaster.room(room);
    });
  });

  /** Host shutdown: ends every search, then closes every room. */
  const closeAll = (reason: string) => {
    for (const match of matchmaker.closeAll()) {
      for (const seat of match.seats) {
        if (seat.socketId) io.to(seat.socketId).emit('match:closed', { reason });
      }
    }
    manager.closeAll(reason);
  };

  return { io, manager, matchmaker, closeAll };
}
