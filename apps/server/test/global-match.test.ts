import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  AVATAR_VARIANTS,
  playerNameSchema,
  type Ack,
  type ClientToServerEvents,
  type GameStateView,
  type MatchSearchView,
  type RoomView,
  type ServerToClientEvents,
  type SessionInfo,
} from '@nomercy/shared';
import { createHttpApp } from '../src/http/app.js';
import { createSocketServer } from '../src/net/socket-server.js';
import { seededRng } from '../src/engine/index.js';
import { chooseComputerMove } from '../src/rooms/computer-player.js';
import { requestHand } from '../src/rooms/hand-share.js';
import { humanizeMoves, pickAvatar, screenNames, thinkingTimeMs } from '../src/rooms/human-like.js';
import { Matchmaker } from '../src/rooms/matchmaker.js';
import { toGameView, toRoomView } from '../src/rooms/projections.js';
import { RoomError, RoomManager, type GlobalSeat } from '../src/rooms/room-manager.js';
import type { Room } from '../src/rooms/room.types.js';
import { buildState, cardId, filler, n, PLAYER_IDS } from './helpers.js';

const SEARCH_MS = 90_000;
const WINDOW_MS = 25_000;
const PAUSE_MS = 1_500;

function newManager(seed = 7, onRoomUpdated: (room: Room) => void = () => {}) {
  return new RoomManager({
    rng: seededRng(seed),
    reconnectGraceMs: 60_000,
    checkInvariants: true,
    turnHoldMs: 0,
    dealHold: false,
    humanPaceScale: 0.01,
    onRoomUpdated,
    onRoomClosed: () => {},
  });
}

function newMatchmaker(manager = newManager()) {
  const ready: GlobalSeat[][] = [];
  const updates: number[] = [];
  const matchmaker = new Matchmaker({
    rng: seededRng(11),
    searchMs: SEARCH_MS,
    botWindowMs: WINDOW_MS,
    foundPauseMs: PAUSE_MS,
    computerSeats: (count, seated) => manager.globalComputerSeats(count, seated),
    onMatchUpdated: (match) => updates.push(match.seats.length),
    onMatchReady: (seats) => ready.push(seats),
  });
  return { matchmaker, ready, updates };
}

const people = (seats: readonly GlobalSeat[]) => seats.filter((s) => s.socketId !== null);

describe('Play global matchmaking (docs/RULES.md §5.19)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('seats searchers together and gives a later arrival only the time left', () => {
    const { matchmaker } = newMatchmaker();
    const first = matchmaker.search('s1', 'Ekhlas', 'male');
    vi.advanceTimersByTime(30_000);
    const second = matchmaker.search('s2', 'Nadia', 'female');
    expect(second.match).toBe(first.match);
    const view = matchmaker.viewFor(second.match, second.seat.id);
    expect(view.players.map((p) => p.name)).toEqual(['Ekhlas', 'Nadia']);
    expect(view.remainingMs).toBe(SEARCH_MS - 30_000);
    expect(view.meId).toBe(second.seat.id);
  });

  it('deals a full table of people at once, with no computers', () => {
    const { matchmaker, ready } = newMatchmaker();
    ['A', 'B', 'C', 'D'].forEach((name, i) => matchmaker.search(`s${i}`, name, 'male'));
    expect(matchmaker.viewFor(matchmaker.matchOf('s0')!, 'x').found).toBe(true);
    expect(ready).toHaveLength(0);
    vi.advanceTimersByTime(PAUSE_MS);
    expect(ready).toHaveLength(1);
    expect(people(ready[0]!)).toHaveLength(4);
    // The next searcher starts a new match.
    expect(matchmaker.isSearching('s0')).toBe(false);
  });

  it('fills a lone search with computers one at a time near the end, full by the deadline', () => {
    const { matchmaker, ready } = newMatchmaker();
    const { match } = matchmaker.search('s1', 'Solo', 'female');
    vi.advanceTimersByTime(SEARCH_MS - WINDOW_MS - 1);
    expect(match.seats).toHaveLength(1);

    const seen: number[] = [];
    for (let t = 0; t <= WINDOW_MS && !match.found; t += 100) {
      vi.advanceTimersByTime(100);
      seen.push(match.seats.length);
    }
    expect(match.found).toBe(true);
    // They arrived one by one, not all at once.
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
    vi.advanceTimersByTime(PAUSE_MS);
    expect(ready).toHaveLength(1);
    const seats = ready[0]!;
    expect(seats).toHaveLength(4);
    expect(people(seats).map((s) => s.name)).toEqual(['Solo']);
    for (const s of seats) {
      expect(playerNameSchema.safeParse(s.name).success).toBe(true);
      expect(s.avatar).toBeGreaterThanOrEqual(0);
      expect(s.avatar).toBeLessThan(AVATAR_VARIANTS);
    }
    expect(new Set(seats.map((s) => s.name.toLowerCase())).size).toBe(4);
  });

  it('lets a person take a free seat while computers are arriving', () => {
    const { matchmaker } = newMatchmaker();
    const { match } = matchmaker.search('s1', 'Early', 'male');
    vi.advanceTimersByTime(SEARCH_MS - 8_000);
    const computers = match.seats.length - 1;
    expect(match.found).toBe(false);
    const late = matchmaker.search('s2', 'Late', 'female');
    expect(late.match).toBe(match);
    expect(match.seats).toHaveLength(computers + 2);
  });

  it('never waits past the countdown', () => {
    const { matchmaker, ready } = newMatchmaker();
    matchmaker.search('s1', 'Solo', 'male');
    vi.advanceTimersByTime(SEARCH_MS + PAUSE_MS);
    expect(ready).toHaveLength(1);
  });

  it('closes a match whose people have all left, computers and all', () => {
    const { matchmaker, ready } = newMatchmaker();
    matchmaker.search('s1', 'Solo', 'male');
    vi.advanceTimersByTime(SEARCH_MS - 5_000);
    expect(matchmaker.cancel('s1')).toBe(true);
    vi.advanceTimersByTime(SEARCH_MS);
    expect(ready).toHaveLength(0);
    expect(matchmaker.cancel('s1')).toBe(false);
  });

  it('gives a seat left during the pause to a computer, and deals nothing if all people left', () => {
    const { matchmaker, ready } = newMatchmaker();
    ['A', 'B', 'C', 'D'].forEach((name, i) => matchmaker.search(`s${i}`, name, 'male'));
    matchmaker.cancel('s3');
    vi.advanceTimersByTime(PAUSE_MS);
    expect(ready[0]).toHaveLength(4);
    expect(people(ready[0]!)).toHaveLength(3);

    ['E', 'F', 'G', 'H'].forEach((name, i) => matchmaker.search(`t${i}`, name, 'male'));
    ['t0', 't1', 't2', 't3'].forEach((id) => matchmaker.cancel(id));
    vi.advanceTimersByTime(PAUSE_MS);
    expect(ready).toHaveLength(1);
  });

  it('keeps two people with the same name apart, and refuses a second search', () => {
    const { matchmaker } = newMatchmaker();
    const a = matchmaker.search('s1', 'Sam', 'male');
    const b = matchmaker.search('s2', 'sam', 'female');
    expect(b.match).not.toBe(a.match);
    expect(() => matchmaker.search('s1', 'Other', 'male')).toThrow(RoomError);
  });
});

describe('computers at a global table', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function globalRoom(manager: RoomManager) {
    const human: GlobalSeat = {
      id: 'p_human000',
      name: 'Me',
      gender: 'male',
      avatar: 3,
      socketId: 's1',
    };
    const seats = [
      human,
      ...manager.globalComputerSeats(3, [human]).map((s, i) => ({ ...s, id: `p_bot0000${i}` })),
    ];
    return { ...manager.createGlobalRoom(seats), human };
  }

  it('are shown to everyone as people, with names, genders and faces', () => {
    const manager = newManager();
    const { room, human } = globalRoom(manager);
    expect(room.players.filter((p) => p.isComputer)).toHaveLength(3);

    const roomView = toRoomView(room);
    const gameView = toGameView(room, human.id)!;
    expect(roomView.mode).toBe('global');
    for (const p of [...roomView.players, ...gameView.public.players]) {
      expect(p.isComputer).toBe(false);
      expect(p.connected).toBe(true);
      expect(p.gender).not.toBeNull();
      expect(p.avatar).not.toBeNull();
    }
    expect(JSON.stringify([roomView, gameView])).not.toContain('"isComputer":true');
    manager.closeAll('done');
  });

  it('play one round to a winner, even once the person is out, and refuse a next round', async () => {
    vi.useFakeTimers();
    const manager = newManager(3);
    const { room, human } = globalRoom(manager);
    expect(room.game!.endWhenOut).toEqual([]);
    const pick = seededRng(5);
    for (let i = 0; i < 20_000 && room.status === 'inGame'; i++) {
      const game = room.game!;
      // The person plays like a computer that never calls UNO, so it can be caught too.
      const move = chooseComputerMove(game, human.id, pick, false);
      if (move) {
        try {
          manager.executeGameCommand(room.code, human.id, move, null);
        } catch (error) {
          if (!(error instanceof RoomError)) throw error;
        }
      }
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(room.status).toBe('roundOver');
    expect(room.lastResult?.reason).not.toBe('peopleOut');
    expect(room.lastResult?.winnerId).not.toBeNull();
    expect(() => manager.nextRound(room.code, human.id)).toThrow(RoomError);
    expect(() => manager.returnToLobby(room.code, human.id)).toThrow(RoomError);
    manager.closeAll('done');
  });

  it('answer a request to see their hand after a moment rather than at once', () => {
    vi.useFakeTimers();
    const updated: Room[] = [];
    const manager = newManager(9, (r) => updated.push(r));
    const { room, human } = globalRoom(manager);
    const bot = room.players.find((p) => p.isComputer)!;
    const game = room.game!;
    game.players.find((p) => p.id === human.id)!.status = 'eliminated';
    game.currentIndex = game.players.findIndex((p) => p.id === bot.id);
    requestHand(room, human.id, bot.id);
    expect(room.handShares[0]?.status).toBe('pending');
    manager.answerHandRequestsLater(room);
    vi.advanceTimersByTime(100);
    expect(room.handShares[0]?.status).not.toBe('pending');
    expect(updated).toContain(room);
    manager.closeAll('done');
  });

  it('skip calling UNO sometimes, but still take their turn', () => {
    const state = buildState({ hands: [filler(3), [n('red', 3)]], top: n('red', 5), current: 1 });
    state.players[1]!.uno = 'vulnerable';
    const bot = PLAYER_IDS[1]!;
    const intents = new Map([[`uno:${bot}:${cardId(state, 1)}`, false]]);
    const moves = humanizeMoves(
      state,
      [{ playerId: bot, command: { type: 'callUno' } }],
      intents,
      seededRng(1),
    );
    expect(moves).toEqual([
      { playerId: bot, command: expect.objectContaining({ type: 'playCard' }) },
    ]);
  });

  it('keep a decision they made about a chance', () => {
    const state = buildState({ hands: [[n('blue', 1)], filler(3)], top: n('red', 5) });
    const bot = PLAYER_IDS[1]!;
    const catchMove = {
      playerId: bot,
      command: { type: 'catchUno' as const, targetId: PLAYER_IDS[0]! },
    };
    const intents = new Map<string, boolean>();
    const rng = seededRng(4);
    const first = humanizeMoves(state, [catchMove], intents, rng);
    for (let i = 0; i < 20; i++) {
      expect(humanizeMoves(state, [catchMove], intents, rng)).toEqual(first);
    }
  });

  it('take human time: quick reflexes, slower turns', () => {
    const state = buildState({ hands: [filler(3), filler(3)], top: n('green', 1) });
    const rng = seededRng(2);
    for (let i = 0; i < 50; i++) {
      expect(thinkingTimeMs(state, PLAYER_IDS[0]!, { type: 'callUno' }, rng)).toBeLessThan(2000);
      const play = { type: 'playCard' as const, cardId: cardId(state, 0) };
      expect(thinkingTimeMs(state, PLAYER_IDS[0]!, play, rng)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('get names nobody at the table has, and faces that differ', () => {
    const names = screenNames(3, ['rafi_07', 'NUSRAT'], seededRng(1));
    expect(names).toHaveLength(3);
    expect(names.map((p) => p.name.toLowerCase())).not.toContain('rafi_07');
    expect(names.map((p) => p.name.toLowerCase())).not.toContain('nusrat');
    const rng = seededRng(8);
    const seated: { gender: 'male' | 'female'; avatar: number }[] = [];
    for (let i = 0; i < 4; i++)
      seated.push({ gender: 'male', avatar: pickAvatar('male', seated, rng) });
    expect(new Set(seated.map((s) => s.avatar % 4)).size).toBe(4);
    expect(new Set(seated.map((s) => Math.floor(s.avatar / 4))).size).toBe(4);
  });
});

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('Play global over Socket.IO', () => {
  let httpServer: HttpServer;
  let url: string;
  let close: () => void;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer(createHttpApp(null));
    const { io, closeAll } = createSocketServer(httpServer, {
      rng: seededRng(21),
      reconnectGraceMs: 60_000,
      checkInvariants: true,
      turnHoldMs: 0,
      dealHold: false,
      globalSearchMs: 400,
      matchFoundPauseMs: 20,
      humanPaceScale: 0.01,
    });
    close = () => {
      closeAll('done');
      io.close();
    };
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    for (const s of sockets) s.disconnect();
    close();
    httpServer.close();
  });

  async function client() {
    const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
    const seen = {
      raw: [] as string[],
      room: null as RoomView | null,
      game: null as GameStateView | null,
    };
    const search: MatchSearchView[] = [];
    let found: SessionInfo | null = null;
    socket.on('match:state', (v) => {
      search.push(v);
      seen.raw.push(JSON.stringify(v));
    });
    socket.on('match:found', (s) => (found = s));
    socket.on('room:state', (r) => {
      seen.room = r;
      seen.raw.push(JSON.stringify(r));
    });
    socket.on('game:state', (g) => {
      seen.game = g;
      seen.raw.push(JSON.stringify(g));
    });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    sockets.push(socket);
    const emit = <T>(event: keyof ClientToServerEvents, payload: unknown) =>
      (socket.timeout(3000).emitWithAck as unknown as (e: string, p: unknown) => Promise<Ack<T>>)(
        event,
        payload,
      );
    return { socket, seen, search, emit, found: () => found };
  }

  const until = async (check: () => boolean) => {
    for (let i = 0; i < 150 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(check()).toBe(true);
  };

  it('matches two searchers, fills the table and deals it without a computer showing', async () => {
    const a = await client();
    const b = await client();
    const bad = await a.emit('match:search', { name: 'Ana', gender: 'female', extra: 1 });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });

    const searched = await a.emit<MatchSearchView>('match:search', {
      name: 'Ana',
      gender: 'female',
    });
    expect(searched).toMatchObject({ ok: true, data: { tableSize: 4, found: false } });
    const twice = await a.emit('match:search', { name: 'Ana', gender: 'female' });
    expect(twice).toMatchObject({ ok: false, error: { code: 'ALREADY_IN_ROOM' } });
    const create = await a.emit('room:create', { name: 'Ana', gender: 'female', maxPlayers: 4 });
    expect(create).toMatchObject({ ok: false, error: { code: 'ALREADY_IN_ROOM' } });

    await b.emit('match:search', { name: 'Bo', gender: 'male' });
    await until(() => a.search.some((v) => v.players.some((p) => p.name === 'Bo')));

    await until(() => a.found() !== null && b.found() !== null && a.seen.game !== null);
    expect(a.found()!.roomCode).toBe(b.found()!.roomCode);
    expect(a.found()!.playerId).toBe(a.search.at(-1)!.meId);
    expect(a.seen.room!.mode).toBe('global');
    expect(a.seen.room!.players).toHaveLength(4);
    expect(
      a.seen.game!.public.players.every((p) => !p.isComputer && p.gender && p.avatar !== null),
    ).toBe(true);
    for (const raw of [...a.seen.raw, ...b.seen.raw])
      expect(raw).not.toContain('"isComputer":true');

    // The seat is bound to the socket like a joined room.
    const state = await a.emit('game:request-state', {});
    expect(state.ok).toBe(true);
  });

  it('stops a search when the searcher cancels or disconnects', async () => {
    const c = await client();
    await c.emit('match:search', { name: 'Cy', gender: 'male' });
    expect(await c.emit('match:cancel', {})).toMatchObject({ ok: true });
    const again = await c.emit('match:search', { name: 'Cy', gender: 'male' });
    expect(again.ok).toBe(true);
    c.socket.disconnect();
    await new Promise((r) => setTimeout(r, 600));
    expect(c.found()).toBeNull();
  });
});
