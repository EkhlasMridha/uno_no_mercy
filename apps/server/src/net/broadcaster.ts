import type { ChatMessage } from '@nomercy/shared';
import { toGameView, toRoomView } from '../rooms/projections.js';
import type { Room } from '../rooms/room.types.js';
import type { GameServer } from './socket-types.js';

/** Sends every connected member the shared room view and their own private game projection. */
export class Broadcaster {
  constructor(private readonly io: GameServer) {}

  room(room: Room): void {
    const roomView = toRoomView(room);
    for (const player of room.players) {
      if (!player.socketId) continue;
      const target = this.io.to(player.socketId);
      target.emit('room:state', roomView);
      const gameView = toGameView(room, player.id);
      if (gameView) target.emit('game:state', gameView);
    }
  }

  /** Sends state to a single socket (e.g. after a reconnect or a stale-state rejection). */
  toPlayer(room: Room, playerId: string): void {
    const player = room.players.find((p) => p.id === playerId);
    if (!player?.socketId) return;
    const target = this.io.to(player.socketId);
    target.emit('room:state', toRoomView(room));
    const gameView = toGameView(room, playerId);
    if (gameView) target.emit('game:state', gameView);
    target.emit('chat:history', room.chat);
  }

  /** Delivers a chat message to the sockets seated in this room and nobody else. */
  chatMessage(room: Room, message: ChatMessage): void {
    for (const player of room.players) {
      if (player.socketId && !player.departed) {
        this.io.to(player.socketId).emit('chat:message', message);
      }
    }
  }

  /** Re-sends a message whose reactions changed, to this room only. */
  chatUpdate(room: Room, message: ChatMessage): void {
    for (const player of room.players) {
      if (player.socketId && !player.departed) {
        this.io.to(player.socketId).emit('chat:update', message);
      }
    }
  }

  /** Replays the room's recent chat to one player who just joined or reconnected. */
  chatHistory(room: Room, playerId: string): void {
    const player = room.players.find((p) => p.id === playerId);
    if (player?.socketId) this.io.to(player.socketId).emit('chat:history', room.chat);
  }

  /** Tells one socket it no longer has a seat, and unbinds it so it can join another room. */
  removed(socketId: string, reason: string): void {
    this.io.to(socketId).emit('room:closed', { reason });
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) socket.data.session = null;
  }

  closed(room: Room, reason: string): void {
    for (const player of room.players) {
      if (!player.socketId) continue;
      this.io.to(player.socketId).emit('room:closed', { reason });
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (socket) socket.data.session = null;
    }
  }
}
