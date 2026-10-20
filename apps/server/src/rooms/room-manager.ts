import {
  MATCH_TARGET_POINTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ErrorCode,
  type RoomSettingsPayload,
} from '@nomercy/shared';
import { applyCommand, createGame, type GameCommand, type Rng } from '../engine/index.js';
import { CommandCache } from '../net/command-cache.js';
import { scoreRound } from './match-scoring.js';
import type { Room, RoomPlayer } from './room.types.js';
import { generatePlayerId, generateReconnectToken, tokensMatch } from './session.js';

export class RoomError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

export interface RoomManagerOptions {
  rng: Rng;
  /** How long a disconnected player keeps their seat. */
  reconnectGraceMs: number;
  checkInvariants: boolean;
  maxRooms?: number;
  now?: () => number;
  /** Called when a room changes outside a client request (e.g. a reconnect window expired). */
  onRoomUpdated: (room: Room) => void;
  onRoomClosed: (room: Room, reason: string) => void;
}

export interface JoinResult {
  room: Room;
  player: RoomPlayer;
}

/** In-memory room registry and lobby/game lifecycle. Transport-agnostic. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly now: () => number;

  constructor(private readonly options: RoomManagerOptions) {
    this.now = options.now ?? Date.now;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  requireRoom(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'That room no longer exists');
    return room;
  }

  requireMember(room: Room, playerId: string): RoomPlayer {
    const player = room.players.find((p) => p.id === playerId && !p.departed);
    if (!player) throw new RoomError('NOT_IN_ROOM', 'You are not in this room');
    return player;
  }

  createRoom(name: string, socketId: string, maxPlayers: number): JoinResult {
    if (this.rooms.size >= (this.options.maxRooms ?? 50)) {
      throw new RoomError('ROOM_FULL', 'The server has reached its room limit');
    }
    const player = this.newPlayer(name, socketId);
    const room: Room = {
      code: this.generateRoomCode(),
      hostId: player.id,
      status: 'lobby',
      players: [player],
      settings: { scoringEnabled: false, maxPlayers },
      game: null,
      roundNumber: 0,
      dealerIndex: this.options.rng(MAX_PLAYERS),
      lastResult: null,
      createdAt: this.now(),
    };
    player.ready = true;
    this.rooms.set(room.code, room);
    return { room, player };
  }

  joinRoom(code: string, name: string, socketId: string): JoinResult {
    const room = this.requireRoom(code);
    if (room.status !== 'lobby') {
      throw new RoomError('GAME_IN_PROGRESS', 'This game has already started. Wait for the lobby.');
    }
    const members = room.players.filter((p) => !p.departed);
    if (members.length >= room.settings.maxPlayers)
      throw new RoomError('ROOM_FULL', 'This room is full');
    if (members.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new RoomError('NAME_TAKEN', 'Someone in this room already uses that name');
    }
    const player = this.newPlayer(name, socketId);
    room.players.push(player);
    return { room, player };
  }

  /** Restores a seat from a room-scoped token. Returns the previous socket id so it can be closed. */
  reconnect(
    code: string,
    token: string,
    socketId: string,
  ): JoinResult & { previousSocketId: string | null } {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => !p.departed && tokensMatch(p.reconnectToken, token));
    if (!room || !player) {
      throw new RoomError('INVALID_TOKEN', 'Your session has expired or the room no longer exists');
    }
    const previousSocketId = player.socketId !== socketId ? player.socketId : null;
    this.clearExpiry(player);
    player.socketId = socketId;
    player.disconnectedAt = null;
    return { room, player, previousSocketId };
  }

  leaveRoom(code: string, playerId: string): void {
    const room = this.requireRoom(code);
    const player = this.requireMember(room, playerId);
    this.removePlayer(room, player);
  }

  setReady(code: string, playerId: string, ready: boolean): Room {
    const room = this.requireRoom(code);
    const player = this.requireMember(room, playerId);
    if (room.status !== 'lobby')
      throw new RoomError('INVALID_PHASE', 'The game has already started');
    player.ready = ready;
    return room;
  }

  updateSettings(code: string, playerId: string, settings: RoomSettingsPayload): Room {
    const room = this.requireHost(code, playerId);
    if (room.status !== 'lobby') {
      throw new RoomError('INVALID_PHASE', 'Settings can only change in the lobby');
    }
    const members = room.players.filter((p) => !p.departed).length;
    if (settings.maxPlayers !== undefined && settings.maxPlayers < members) {
      throw new RoomError('ROOM_FULL', `There are already ${members} players in the room`);
    }
    room.settings = {
      scoringEnabled: settings.scoringEnabled ?? room.settings.scoringEnabled,
      maxPlayers: settings.maxPlayers ?? room.settings.maxPlayers,
    };
    return room;
  }

  startGame(code: string, playerId: string): Room {
    const room = this.requireHost(code, playerId);
    if (room.status !== 'lobby')
      throw new RoomError('INVALID_PHASE', 'The game has already started');
    const members = room.players.filter((p) => !p.departed);
    if (members.length < MIN_PLAYERS) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS} players are needed`);
    }
    const notReady = members.filter((p) => p.id !== room.hostId && (!p.ready || !p.socketId));
    if (notReady.length > 0) {
      throw new RoomError(
        'PLAYERS_NOT_READY',
        `Waiting for ${notReady.map((p) => p.name).join(', ')} to be ready`,
      );
    }
    for (const p of members) p.score = 0;
    this.beginRound(room);
    return room;
  }

  /** Host starts another round (or a fresh match once someone reached the target). */
  nextRound(code: string, playerId: string): Room {
    const room = this.requireHost(code, playerId);
    if (room.status !== 'roundOver') throw new RoomError('INVALID_PHASE', 'The round is not over');
    room.players = room.players.filter((p) => !p.departed);
    const connected = room.players.filter((p) => p.socketId);
    if (connected.length < MIN_PLAYERS) {
      throw new RoomError(
        'NOT_ENOUGH_PLAYERS',
        `At least ${MIN_PLAYERS} connected players are needed`,
      );
    }
    if (room.lastResult?.matchWinnerId) for (const p of room.players) p.score = 0;
    this.beginRound(room);
    return room;
  }

  returnToLobby(code: string, playerId: string): Room {
    const room = this.requireHost(code, playerId);
    if (room.status !== 'roundOver') throw new RoomError('INVALID_PHASE', 'The round is not over');
    room.status = 'lobby';
    room.game = null;
    room.lastResult = null;
    room.roundNumber = 0;
    room.players = room.players.filter((p) => !p.departed);
    for (const p of room.players) {
      p.ready = p.id === room.hostId;
      p.score = 0;
    }
    return room;
  }

  /** Runs one game command through the authoritative engine. */
  executeGameCommand(
    code: string,
    playerId: string,
    command: GameCommand,
    expectedVersion: number | null,
  ): { room: Room; version: number } {
    const room = this.requireRoom(code);
    this.requireMember(room, playerId);
    if (room.status !== 'inGame' || !room.game) {
      throw new RoomError('GAME_NOT_ACTIVE', 'There is no game in progress');
    }
    if (expectedVersion !== null && expectedVersion !== room.game.version) {
      throw new RoomError(
        'STALE_STATE',
        'The game moved on before your action arrived. Try again.',
      );
    }
    const outcome = applyCommand(room.game, playerId, command, this.options.rng, {
      checkInvariants: this.options.checkInvariants,
    });
    if (!outcome.ok) throw new RoomError(outcome.error.code, outcome.error.message);
    room.game = outcome.state;
    if (room.game.phase.type === 'finished') this.finishRound(room);
    return { room, version: room.game.version };
  }

  handleDisconnect(code: string, playerId: string, socketId: string): Room | null {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.socketId !== socketId) return null;
    player.socketId = null;
    player.disconnectedAt = this.now();
    this.clearExpiry(player);
    player.expiryTimer = setTimeout(
      () => this.expireSeat(room, player),
      this.options.reconnectGraceMs,
    );
    player.expiryTimer.unref?.();
    this.ensureConnectedHost(room);
    return room;
  }

  /** Closes all rooms (host shutdown). */
  closeAll(reason: string): void {
    for (const room of [...this.rooms.values()]) this.closeRoom(room, reason);
  }

  // ---- internals ----

  private beginRound(room: Room): void {
    const members = room.players.filter((p) => !p.departed);
    room.roundNumber += 1;
    room.dealerIndex = (room.dealerIndex + 1) % members.length;
    const { state } = createGame({
      players: members.map((p) => ({ id: p.id, name: p.name })),
      dealerIndex: room.dealerIndex,
      rng: this.options.rng,
    });
    room.game = state;
    room.status = 'inGame';
    room.lastResult = null;
  }

  private finishRound(room: Room): void {
    const game = room.game;
    if (!game || game.phase.type !== 'finished') return;
    room.status = 'roundOver';
    const { winnerId, reason } = game.phase;
    const winner = winnerId ? room.players.find((p) => p.id === winnerId) : undefined;
    let pointsAwarded = 0;
    let cardPoints = 0;
    let knockoutBonus = 0;
    let matchWinnerId: string | null = null;
    if (room.settings.scoringEnabled && winner) {
      const score = scoreRound(game);
      if (score) {
        pointsAwarded = score.total;
        cardPoints = score.cardPoints;
        knockoutBonus = score.knockoutBonus;
        winner.score += score.total;
        if (winner.score >= MATCH_TARGET_POINTS) matchWinnerId = winner.id;
      }
    }
    room.lastResult = {
      winnerId,
      winnerName: winner?.name ?? game.players.find((p) => p.id === winnerId)?.name ?? null,
      reason,
      pointsAwarded,
      cardPoints,
      knockoutBonus,
      matchWinnerId,
    };
  }

  private expireSeat(room: Room, player: RoomPlayer): void {
    player.expiryTimer = null;
    if (player.socketId || !this.rooms.has(room.code)) return;
    this.removePlayer(room, player);
    if (this.rooms.has(room.code)) this.options.onRoomUpdated(room);
  }

  /** Lobby: the seat is freed. In/after a game: the player forfeits and is marked departed. */
  private removePlayer(room: Room, player: RoomPlayer): void {
    this.clearExpiry(player);
    player.socketId = null;
    player.reconnectToken = '';
    if (room.status === 'lobby') {
      room.players = room.players.filter((p) => p.id !== player.id);
    } else {
      player.departed = true;
      player.ready = false;
      const seat = room.game?.players.find((p) => p.id === player.id);
      if (room.status === 'inGame' && room.game && seat?.status === 'active') {
        const outcome = applyCommand(room.game, player.id, { type: 'forfeit' }, this.options.rng, {
          checkInvariants: this.options.checkInvariants,
        });
        if (outcome.ok) {
          room.game = outcome.state;
          if (room.game.phase.type === 'finished') this.finishRound(room);
        }
      }
    }
    const remaining = room.players.filter((p) => !p.departed);
    if (remaining.length === 0 || remaining.every((p) => !p.socketId && !p.expiryTimer)) {
      this.closeRoom(room, 'Everyone left the room');
      return;
    }
    if (room.hostId === player.id) this.ensureConnectedHost(room, true);
  }

  private ensureConnectedHost(room: Room, force = false): void {
    const host = room.players.find((p) => p.id === room.hostId && !p.departed);
    if (!force && host?.socketId) return;
    const candidate =
      room.players.find((p) => !p.departed && p.socketId) ?? room.players.find((p) => !p.departed);
    if (candidate && (force || !host?.socketId)) {
      room.hostId = candidate.id;
      candidate.ready = true;
    }
  }

  private closeRoom(room: Room, reason: string): void {
    for (const p of room.players) this.clearExpiry(p);
    this.rooms.delete(room.code);
    this.options.onRoomClosed(room, reason);
  }

  private requireHost(code: string, playerId: string): Room {
    const room = this.requireRoom(code);
    this.requireMember(room, playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Only the host can do that');
    return room;
  }

  private clearExpiry(player: RoomPlayer): void {
    if (player.expiryTimer) clearTimeout(player.expiryTimer);
    player.expiryTimer = null;
  }

  private newPlayer(name: string, socketId: string): RoomPlayer {
    return {
      id: generatePlayerId(),
      name,
      reconnectToken: generateReconnectToken(),
      ready: false,
      socketId,
      disconnectedAt: null,
      departed: false,
      score: 0,
      commandCache: new CommandCache(),
      expiryTimer: null,
    };
  }

  private generateRoomCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[this.options.rng(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
