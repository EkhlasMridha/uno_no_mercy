import {
  MATCH_TARGET_POINTS,
  MIN_PLAYERS,
  type GameStateView,
  type RoomView,
} from '@nomercy/shared';
import { getValidActions, toPublicGameView } from '../engine/index.js';
import type { Room } from './room.types.js';

/** Public lobby projection: identical for every member, contains no secrets. */
export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId,
      isComputer: p.isComputer,
      gender: p.gender,
      ready: p.ready,
      connected: p.socketId !== null || p.isComputer,
      departed: p.departed,
      score: p.score,
    })),
    settings: { ...room.settings },
    minPlayers: MIN_PLAYERS,
    maxPlayers: room.settings.maxPlayers,
    roundNumber: room.roundNumber,
    lastResult: room.lastResult ? { ...room.lastResult } : null,
    matchTarget: MATCH_TARGET_POINTS,
  };
}

/**
 * Per-player game projection. Only the requesting player's hand is included; opponents are
 * represented by hand counts. Card objects are copied so no shared references leak.
 */
export function toGameView(room: Room, playerId: string): GameStateView | null {
  const game = room.game;
  if (!game) return null;
  const seat = game.players.find((p) => p.id === playerId);
  if (!seat) return null;
  const connectedIds = new Set(
    room.players.filter((p) => p.socketId || p.isComputer).map((p) => p.id),
  );
  const computerIds = new Set(room.players.filter((p) => p.isComputer).map((p) => p.id));
  const genders = new Map(room.players.map((p) => [p.id, p.gender]));
  return {
    roomCode: room.code,
    version: game.version,
    public: toPublicGameView(game, {
      connected: (id) => connectedIds.has(id),
      isComputer: (id) => computerIds.has(id),
      gender: (id) => genders.get(id) ?? null,
      hostId: room.hostId,
    }),
    me: {
      playerId,
      hand: seat.hand.map((card) => ({ ...card })),
      validActions: getValidActions(game, playerId),
    },
  };
}
