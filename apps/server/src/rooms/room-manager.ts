import {
  CHAT_HISTORY_LIMIT,
  MATCH_TARGET_POINTS,
  MAX_COMPUTERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TURN_HOLD_MS,
  WAIT_FOR_REJOIN_MS,
  type ChatMessage,
  type ErrorCode,
  type GameEvent,
  type Gender,
  type RoomSettingsPayload,
} from '@nomercy/shared';
import {
  applyCommand,
  createGame,
  type GameCommand,
  type GameState,
  type Rng,
} from '../engine/index.js';
import { CommandCache } from '../net/command-cache.js';
import {
  chooseComputerMove,
  computerMoves,
  computerNames,
  fallbackComputerMove,
} from './computer-player.js';
import { scoreRound } from './match-scoring.js';
import { waitDeciderId } from './rejoin.js';
import type { Room, RoomPlayer } from './room.types.js';
import { generatePlayerId, generateReconnectToken, tokensMatch } from './session.js';

/** Commands that wait out the UNO breather. Calling UNO and leaving never wait. */
const HELD_COMMANDS: ReadonlySet<GameCommand['type']> = new Set([
  'playCard',
  'draw',
  'acceptPenalty',
  'chooseRouletteColor',
  'catchUno',
]);

/**
 * Whether a command starts the UNO breather (docs/RULES.md §5.9): the turn passed to someone else, or
 * a card was played. A play that hands the turn straight back to its player (Skip Everyone, or a Skip
 * or Reverse with two players) goes on at once, unless it left someone open to an UNO catch: they
 * still get the 2 seconds to call it.
 */
function needsTurnHold(game: GameState, turnBefore: number, events: GameEvent[]): boolean {
  if (game.currentIndex !== turnBefore) return true;
  if (!events.some((e) => e.type === 'cardPlayed')) return false;
  return game.players.some((p) => p.uno === 'vulnerable');
}

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
  /** Pause before a computer player moves, so people can follow the table. */
  computerMoveDelayMs?: number;
  /** Length of the UNO breather after each play or turn change. Defaults to `TURN_HOLD_MS`. */
  turnHoldMs?: number;
  /** How long a seat stays held once the table agrees to wait. Defaults to `WAIT_FOR_REJOIN_MS`. */
  waitForRejoinMs?: number;
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

  /** With `computers`, seats that many computer opponents and deals the first round at once. */
  createRoom(
    name: string,
    gender: Gender,
    socketId: string,
    maxPlayers: number,
    computers = 0,
  ): JoinResult {
    if (this.rooms.size >= (this.options.maxRooms ?? 50)) {
      throw new RoomError('ROOM_FULL', 'The server has reached its room limit');
    }
    const player = this.newPlayer(name, gender, socketId);
    const room: Room = {
      code: this.generateRoomCode(),
      hostId: player.id,
      status: 'lobby',
      players: [player],
      settings: { scoringEnabled: false, maxPlayers: computers > 0 ? computers + 1 : maxPlayers },
      game: null,
      chat: [],
      roundNumber: 0,
      dealerIndex: this.options.rng(MAX_PLAYERS),
      lastResult: null,
      createdAt: this.now(),
      computerTimer: null,
      turnHoldUntil: 0,
      holdTimer: null,
    };
    player.ready = true;
    this.addComputers(room, computers);
    this.rooms.set(room.code, room);
    if (computers > 0) this.beginRound(room);
    return { room, player };
  }

  joinRoom(code: string, name: string, gender: Gender, socketId: string): JoinResult {
    const room = this.requireRoom(code);
    if (room.status !== 'lobby') return this.rejoinHeldSeat(room, name, socketId);
    const members = room.players.filter((p) => !p.departed);
    if (members.length >= room.settings.maxPlayers)
      throw new RoomError('ROOM_FULL', 'This room is full');
    if (members.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new RoomError('NAME_TAKEN', 'Someone in this room already uses that name');
    }
    const player = this.newPlayer(name, gender, socketId);
    room.players.push(player);
    return { room, player };
  }

  /**
   * Restores a seat from a room-scoped token. Returns the previous socket id so it can be closed.
   * `boundPlayerId` is the seat this socket already holds, if any: it may only reconnect that seat.
   */
  reconnect(
    code: string,
    token: string,
    socketId: string,
    boundPlayerId: string | null = null,
  ): JoinResult & { previousSocketId: string | null } {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => !p.departed && tokensMatch(p.reconnectToken, token));
    if (!room || !player) {
      throw new RoomError('INVALID_TOKEN', 'Your session has expired or the room no longer exists');
    }
    // Moving a socket to another seat would leave its old seat pointing at it forever: that seat
    // would never time out, and the room could never close.
    if (boundPlayerId && boundPlayerId !== player.id) {
      throw new RoomError('ALREADY_IN_ROOM', 'Leave your current seat first');
    }
    const previousSocketId = player.socketId !== socketId ? player.socketId : null;
    this.clearExpiry(player);
    player.socketId = socketId;
    player.disconnectedAt = null;
    player.seatHeld = false;
    return { room, player, previousSocketId };
  }

  /**
   * The decider's answer for a dropped player (docs/RULES.md §5.16). Waiting holds the seat so they
   * can rejoin with the room code; not waiting, or no longer waiting, makes them forfeit now.
   */
  waitForPlayer(code: string, deciderId: string, playerId: string, wait: boolean): Room {
    const room = this.requireRoom(code);
    this.requireMember(room, deciderId);
    const player = room.players.find((p) => p.id === playerId && !p.departed);
    const decider = player ? waitDeciderId(room, player) : null;
    if (!player || !decider) {
      throw new RoomError('INVALID_TARGET', 'That player is back or no longer in the game');
    }
    if (decider !== deciderId) {
      const name = room.players.find((p) => p.id === decider)?.name ?? 'the next player';
      throw new RoomError('NOT_YOUR_TURN', `${name} decides whether to wait for ${player.name}`);
    }
    if (!wait) {
      this.removePlayer(room, player);
      return room;
    }
    if (!player.seatHeld) {
      player.seatHeld = true;
      this.clearExpiry(player);
      player.expiryTimer = setTimeout(
        () => this.expireSeat(room, player),
        this.options.waitForRejoinMs ?? WAIT_FOR_REJOIN_MS,
      );
      player.expiryTimer.unref?.();
    }
    return room;
  }

  leaveRoom(code: string, playerId: string): void {
    const room = this.requireRoom(code);
    const player = this.requireMember(room, playerId);
    this.removePlayer(room, player);
  }

  /** A lobby player renames themselves or switches avatar set. Names stay unique in the room. */
  updateProfile(
    code: string,
    playerId: string,
    profile: { name?: string | undefined; gender?: Gender | undefined },
  ): Room {
    const room = this.requireRoom(code);
    const player = this.requireMember(room, playerId);
    if (room.status !== 'lobby') {
      throw new RoomError('INVALID_PHASE', 'You can only change your name in the lobby');
    }
    const { name, gender } = profile;
    if (
      name !== undefined &&
      room.players.some(
        (p) =>
          p.id !== player.id &&
          !p.departed &&
          p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new RoomError('NAME_TAKEN', 'Someone in this room already uses that name');
    }
    if (name !== undefined) player.name = name;
    if (gender !== undefined) player.gender = gender;
    return room;
  }

  /** The host removes another player from the lobby. Returns the socket that player was using. */
  kickPlayer(
    code: string,
    hostId: string,
    targetId: string,
  ): { room: Room; kickedSocketId: string | null } {
    const room = this.requireHost(code, hostId);
    if (room.status !== 'lobby') {
      throw new RoomError('INVALID_PHASE', 'You can only remove players in the lobby');
    }
    if (targetId === hostId) {
      throw new RoomError('INVALID_TARGET', 'Use Leave to leave the room yourself');
    }
    const target = room.players.find((p) => p.id === targetId && !p.departed);
    if (!target) throw new RoomError('INVALID_TARGET', 'That player has already left');
    const kickedSocketId = target.socketId;
    this.removePlayer(room, target);
    return { room, kickedSocketId };
  }

  /** The host hands the room to another connected player in the lobby and becomes a guest. */
  transferHost(code: string, hostId: string, targetId: string): Room {
    const room = this.requireHost(code, hostId);
    if (room.status !== 'lobby') {
      throw new RoomError('INVALID_PHASE', 'You can only hand over the room in the lobby');
    }
    if (targetId === hostId) throw new RoomError('INVALID_TARGET', 'You are already the host');
    const target = room.players.find((p) => p.id === targetId && !p.departed);
    if (!target || target.isComputer) {
      throw new RoomError('INVALID_TARGET', 'That player has already left');
    }
    if (!target.socketId) {
      throw new RoomError('INVALID_TARGET', `${target.name} is disconnected. Wait for them first.`);
    }
    room.hostId = target.id;
    // The host is always ready; the old host stays ready rather than holding up the start.
    target.ready = true;
    return room;
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

  /** With `fillWithComputers`, computers take the open seats (up to MAX_COMPUTERS) before dealing. */
  startGame(code: string, playerId: string, fillWithComputers = false): Room {
    const room = this.requireHost(code, playerId);
    if (room.status !== 'lobby')
      throw new RoomError('INVALID_PHASE', 'The game has already started');
    const notReady = room.players.filter(
      (p) => !p.departed && p.id !== room.hostId && (!p.ready || (!p.socketId && !p.isComputer)),
    );
    if (notReady.length > 0) {
      throw new RoomError(
        'PLAYERS_NOT_READY',
        `Waiting for ${notReady.map((p) => p.name).join(', ')} to be ready`,
      );
    }
    if (fillWithComputers) {
      const seated = room.players.filter((p) => !p.departed);
      const computers = seated.filter((p) => p.isComputer).length;
      const open = room.settings.maxPlayers - seated.length;
      this.addComputers(room, Math.max(0, Math.min(open, MAX_COMPUTERS - computers)));
    }
    const members = room.players.filter((p) => !p.departed);
    if (members.length < MIN_PLAYERS) {
      throw new RoomError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS} players are needed`);
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
    const connected = room.players.filter((p) => p.socketId || p.isComputer);
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
    // Computers leave with the round, so the open seats are free for people again.
    room.players = room.players.filter((p) => !p.departed && !p.isComputer);
    for (const p of room.players) {
      p.ready = p.id === room.hostId;
      p.score = 0;
    }
    return room;
  }

  /** Adds a chat line from a seated player, in the lobby or mid-game. */
  postChat(code: string, playerId: string, text: string): { room: Room; message: ChatMessage } {
    const room = this.requireRoom(code);
    const sender = this.requireMember(room, playerId);
    const message: ChatMessage = {
      id: (room.chat.at(-1)?.id ?? 0) + 1,
      senderId: sender.id,
      senderName: sender.name,
      text,
      sentAt: this.now(),
      reactions: {},
    };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY_LIMIT) {
      room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
    }
    return { room, message };
  }

  /** Adds the player's reaction to a chat message, or takes it back if it is already there. */
  reactToChat(
    code: string,
    playerId: string,
    messageId: number,
    emoji: string,
  ): { room: Room; message: ChatMessage } {
    const room = this.requireRoom(code);
    this.requireMember(room, playerId);
    const message = room.chat.find((m) => m.id === messageId);
    if (!message) throw new RoomError('INVALID_TARGET', 'That message is no longer in the chat');
    const reacted = (message.reactions[emoji] ?? []).filter((id) => id !== playerId);
    if (reacted.length === (message.reactions[emoji]?.length ?? 0)) reacted.push(playerId);
    if (reacted.length > 0) message.reactions[emoji] = reacted;
    else delete message.reactions[emoji];
    return { room, message };
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
    if (HELD_COMMANDS.has(command.type) && this.now() < room.turnHoldUntil) {
      throw new RoomError(
        'TURN_HOLD',
        'Hold on a moment: everyone gets 2 seconds to call UNO after a play.',
      );
    }
    const turnBefore = room.game.currentIndex;
    const outcome = applyCommand(room.game, playerId, command, this.options.rng, {
      checkInvariants: this.options.checkInvariants,
    });
    if (!outcome.ok) throw new RoomError(outcome.error.code, outcome.error.message);
    room.game = outcome.state;
    if (room.game.phase.type === 'finished') this.finishRound(room);
    else if (needsTurnHold(room.game, turnBefore, outcome.events)) this.startTurnHold(room);
    this.scheduleComputers(room);
    return { room, version: room.game.version };
  }

  handleDisconnect(code: string, playerId: string, socketId: string): Room | null {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.socketId !== socketId) return null;
    player.socketId = null;
    player.disconnectedAt = this.now();
    player.seatHeld = false;
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

  /**
   * Joining a running game by code: only a seat the table agreed to hold (docs/RULES.md §5.16), taken
   * back under the same name. The lost session's token is replaced so it can't reclaim the seat.
   */
  private rejoinHeldSeat(room: Room, name: string, socketId: string): JoinResult {
    const seat = room.players.find(
      (p) =>
        !p.departed && !p.isComputer && p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!seat || seat.socketId) {
      throw new RoomError('GAME_IN_PROGRESS', 'This game has already started. Wait for the lobby.');
    }
    if (!seat.seatHeld) {
      const decider = room.players.find((p) => p.id === waitDeciderId(room, seat));
      throw new RoomError(
        'GAME_IN_PROGRESS',
        decider
          ? `${decider.name} needs to agree to wait for you first. Ask them to press Wait.`
          : "Nobody has agreed to wait for you, so you can't rejoin this game.",
      );
    }
    this.clearExpiry(seat);
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    seat.seatHeld = false;
    seat.reconnectToken = generateReconnectToken();
    return { room, player: seat };
  }

  private beginRound(room: Room): void {
    const members = room.players.filter((p) => !p.departed);
    room.roundNumber += 1;
    room.dealerIndex = (room.dealerIndex + 1) % members.length;
    const { state } = createGame({
      players: members.map((p) => ({ id: p.id, name: p.name })),
      dealerIndex: room.dealerIndex,
      rng: this.options.rng,
      // With computers at the table, the round ends once its people are all out.
      endWhenOut: members.some((p) => p.isComputer)
        ? members.filter((p) => !p.isComputer).map((p) => p.id)
        : [],
    });
    room.game = state;
    room.status = 'inGame';
    room.lastResult = null;
    room.turnHoldUntil = 0;
    this.scheduleComputers(room);
  }

  private addComputers(room: Room, count: number): void {
    const taken = room.players.filter((p) => !p.departed).map((p) => p.name);
    for (const name of computerNames(count, taken, this.options.rng)) {
      room.players.push({ ...this.newPlayer(name, null, null), isComputer: true, ready: true });
    }
  }

  private computerIds(room: Room): string[] {
    return room.players.filter((p) => p.isComputer && !p.departed).map((p) => p.id);
  }

  /** Queues the next computer move, only when a computer has one. Each move reschedules. */
  private scheduleComputers(room: Room): void {
    const game = room.game;
    if (room.computerTimer || room.status !== 'inGame' || !game) return;
    const computers = this.computerIds(room);
    // A fixed rng is enough here: only whether any move exists matters.
    if (!computers.some((id) => chooseComputerMove(game, id, () => 0))) return;
    // Fuller tables move faster so a lap doesn't keep the human waiting; draw streaks faster still.
    const crowd = Math.max(0.35, Math.min(1, 6 / computers.length));
    const streak = game.phase.type === 'drawing' || game.phase.type === 'rouletteReveal' ? 0.5 : 1;
    const thinking = (this.options.computerMoveDelayMs ?? 900) * crowd * streak;
    room.computerTimer = setTimeout(
      () => {
        room.computerTimer = null;
        this.runComputerMove(room);
      },
      // Computers wait out the UNO breather like everyone else.
      Math.max(thinking, room.turnHoldUntil - this.now() + 10),
    );
    room.computerTimer.unref?.();
  }

  /** Starts the UNO breather (docs/RULES.md §5.9) and re-sends the table when it ends. */
  private startTurnHold(room: Room): void {
    const holdMs = this.options.turnHoldMs ?? TURN_HOLD_MS;
    if (holdMs <= 0) return;
    room.turnHoldUntil = this.now() + holdMs;
    if (room.holdTimer) clearTimeout(room.holdTimer);
    room.holdTimer = setTimeout(() => {
      room.holdTimer = null;
      if (this.rooms.has(room.code) && room.status === 'inGame') this.options.onRoomUpdated(room);
    }, holdMs);
    room.holdTimer.unref?.();
  }

  private runComputerMove(room: Room): void {
    const game = room.game;
    if (!this.rooms.has(room.code) || room.status !== 'inGame' || !game) return;
    for (const { playerId, command } of computerMoves(
      game,
      this.computerIds(room),
      this.options.rng,
    )) {
      for (const attempt of [command, fallbackComputerMove(game, playerId)]) {
        if (!attempt) continue;
        if (HELD_COMMANDS.has(attempt.type) && this.now() < room.turnHoldUntil) continue;
        try {
          this.executeGameCommand(room.code, playerId, attempt, null);
          this.options.onRoomUpdated(room);
          return;
        } catch (error) {
          // Logged, not thrown: a throw inside a timer would take the whole server down.
          console.error(`[room ${room.code}] computer ${attempt.type} refused`, error);
        }
      }
    }
    // Every move was refused: try again shortly rather than leave the table waiting on a computer.
    this.scheduleComputers(room);
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
    player.seatHeld = false;
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
          const turnBefore = room.game.currentIndex;
          room.game = outcome.state;
          if (room.game.phase.type === 'finished') this.finishRound(room);
          else if (room.game.currentIndex !== turnBefore) this.startTurnHold(room);
          this.scheduleComputers(room);
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
      room.players.find((p) => !p.departed && p.socketId) ??
      room.players.find((p) => !p.departed && !p.isComputer);
    if (candidate && (force || !host?.socketId)) {
      room.hostId = candidate.id;
      candidate.ready = true;
    }
  }

  private closeRoom(room: Room, reason: string): void {
    for (const p of room.players) this.clearExpiry(p);
    if (room.computerTimer) clearTimeout(room.computerTimer);
    room.computerTimer = null;
    if (room.holdTimer) clearTimeout(room.holdTimer);
    room.holdTimer = null;
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

  private newPlayer(name: string, gender: Gender | null, socketId: string | null): RoomPlayer {
    return {
      id: generatePlayerId(),
      name,
      gender,
      reconnectToken: generateReconnectToken(),
      ready: false,
      socketId,
      disconnectedAt: null,
      departed: false,
      score: 0,
      isComputer: false,
      commandCache: new CommandCache(),
      expiryTimer: null,
      seatHeld: false,
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
