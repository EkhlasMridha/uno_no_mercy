import {
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  profileSchema,
  readySchema,
  reconnectSchema,
  roomSettingsSchema,
  startGameSchema,
  transferHostSchema,
  waitForPlayerSchema,
  type SessionInfo,
} from '@nomercy/shared';
import { z } from 'zod';
import type { RoomPlayer, Room } from '../rooms/room.types.js';
import { RoomError, type RoomManager } from '../rooms/room-manager.js';
import type { Broadcaster } from './broadcaster.js';
import { registerHandler } from './handler-utils.js';
import type { RateLimiter } from './rate-limiter.js';
import type { GameServer, GameSocket, SocketSession } from './socket-types.js';

export interface HandlerDeps {
  io: GameServer;
  socket: GameSocket;
  manager: RoomManager;
  broadcaster: Broadcaster;
  limiter: RateLimiter;
}

const emptySchema = z.object({}).strict();

export function requireSession(socket: GameSocket): SocketSession {
  const session = socket.data.session;
  if (!session) throw new RoomError('NOT_IN_ROOM', 'Join a room first');
  return session;
}

function sessionInfo(room: Room, player: RoomPlayer): SessionInfo {
  return { roomCode: room.code, playerId: player.id, reconnectToken: player.reconnectToken };
}

export function registerRoomHandlers(deps: HandlerDeps): void {
  const { io, socket, manager, broadcaster, limiter } = deps;

  const requireUnbound = () => {
    if (socket.data.session) {
      throw new RoomError('ALREADY_IN_ROOM', 'Leave your current room first');
    }
  };

  registerHandler(socket, limiter, 'room:create', createRoomSchema, (payload) => {
    requireUnbound();
    const { name, gender, maxPlayers, computers } = payload;
    const { room, player } = manager.createRoom(name, gender, socket.id, maxPlayers, computers);
    socket.data.session = { roomCode: room.code, playerId: player.id };
    console.info(`[room ${room.code}] created${computers ? ` with ${computers} computers` : ''}`);
    broadcaster.room(room);
    return { ok: true, data: sessionInfo(room, player) };
  });

  registerHandler(socket, limiter, 'room:join', joinRoomSchema, ({ code, name, gender }) => {
    requireUnbound();
    const { room, player } = manager.joinRoom(code, name, gender, socket.id);
    socket.data.session = { roomCode: room.code, playerId: player.id };
    console.info(
      room.status === 'lobby'
        ? `[room ${room.code}] player joined (${room.players.length} seated)`
        : `[room ${room.code}] player rejoined a held seat`,
    );
    broadcaster.room(room);
    return { ok: true, data: sessionInfo(room, player) };
  });

  registerHandler(socket, limiter, 'room:reconnect', reconnectSchema, ({ code, token }) => {
    const current = socket.data.session;
    if (current && current.roomCode !== code) {
      throw new RoomError('ALREADY_IN_ROOM', 'Leave your current room first');
    }
    const { room, player, previousSocketId } = manager.reconnect(
      code,
      token,
      socket.id,
      current?.playerId ?? null,
    );
    if (previousSocketId) {
      // Same seat opened in another tab/device: the newest connection wins, no duplicate player.
      const previous = io.sockets.sockets.get(previousSocketId);
      if (previous) {
        previous.data.session = null;
        previous.emit('room:closed', { reason: 'This seat was opened in another window.' });
        previous.disconnect(true);
      }
    }
    socket.data.session = { roomCode: room.code, playerId: player.id };
    broadcaster.room(room);
    return { ok: true, data: sessionInfo(room, player) };
  });

  registerHandler(socket, limiter, 'room:leave', emptySchema, () => {
    const session = requireSession(socket);
    manager.leaveRoom(session.roomCode, session.playerId);
    socket.data.session = null;
    const room = manager.getRoom(session.roomCode);
    if (room) broadcaster.room(room);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:profile', profileSchema, (profile) => {
    const session = requireSession(socket);
    broadcaster.room(manager.updateProfile(session.roomCode, session.playerId, profile));
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:kick', kickSchema, ({ playerId }) => {
    const session = requireSession(socket);
    const { room, kickedSocketId } = manager.kickPlayer(
      session.roomCode,
      session.playerId,
      playerId,
    );
    if (kickedSocketId) broadcaster.removed(kickedSocketId, 'The host removed you from the room.');
    console.info(`[room ${room.code}] host removed a player (${room.players.length} seated)`);
    broadcaster.room(room);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:transfer-host', transferHostSchema, ({ playerId }) => {
    const session = requireSession(socket);
    broadcaster.room(manager.transferHost(session.roomCode, session.playerId, playerId));
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:ready', readySchema, ({ ready }) => {
    const session = requireSession(socket);
    broadcaster.room(manager.setReady(session.roomCode, session.playerId, ready));
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:settings', roomSettingsSchema, (settings) => {
    const session = requireSession(socket);
    broadcaster.room(manager.updateSettings(session.roomCode, session.playerId, settings));
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'game:start', startGameSchema, ({ fillWithComputers }) => {
    const session = requireSession(socket);
    const room = manager.startGame(session.roomCode, session.playerId, fillWithComputers);
    console.info(`[room ${room.code}] round ${room.roundNumber} started`);
    broadcaster.room(room);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'game:restart', emptySchema, () => {
    const session = requireSession(socket);
    const room = manager.nextRound(session.roomCode, session.playerId);
    console.info(`[room ${room.code}] round ${room.roundNumber} started`);
    broadcaster.room(room);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:return-lobby', emptySchema, () => {
    const session = requireSession(socket);
    broadcaster.room(manager.returnToLobby(session.roomCode, session.playerId));
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'room:wait-for-player', waitForPlayerSchema, (answer) => {
    const session = requireSession(socket);
    const room = manager.waitForPlayer(
      session.roomCode,
      session.playerId,
      answer.playerId,
      answer.wait,
    );
    // Refusing to wait can end the room (nobody left), so only broadcast a room that still exists.
    if (manager.getRoom(room.code)) broadcaster.room(room);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'game:request-state', emptySchema, () => {
    const session = requireSession(socket);
    const room = manager.requireRoom(session.roomCode);
    manager.requireMember(room, session.playerId);
    broadcaster.toPlayer(room, session.playerId);
    return { ok: true, data: null };
  });
}
