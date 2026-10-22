import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { playerNameSchema } from '@nomercy/shared';
import type {
  Ack,
  ClientToServerEvents,
  GameStateView,
  RoomView,
  ServerToClientEvents,
  SessionInfo,
} from '@nomercy/shared';
import { createHttpApp } from '../src/http/app.js';
import { createSocketServer } from '../src/net/socket-server.js';
import { seededRng } from '../src/engine/index.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface TestClient {
  socket: ClientSocket;
  room: RoomView | null;
  game: GameStateView | null;
  raw: string[];
}

let httpServer: HttpServer;
let url: string;
let closeServer: () => void;
const clients: TestClient[] = [];

beforeAll(async () => {
  httpServer = createServer(createHttpApp(null));
  const { io } = createSocketServer(httpServer, {
    rng: seededRng(99),
    reconnectGraceMs: 60_000,
    checkInvariants: true,
    computerMoveDelayMs: 5,
  });
  closeServer = () => io.close();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  for (const c of clients) c.socket.disconnect();
  closeServer();
  httpServer.close();
});

async function newClient(): Promise<TestClient> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
  const client: TestClient = { socket, room: null, game: null, raw: [] };
  socket.on('room:state', (room) => {
    client.room = room;
    client.raw.push(JSON.stringify(room));
  });
  socket.on('game:state', (game) => {
    client.game = game;
    client.raw.push(JSON.stringify(game));
  });
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  clients.push(client);
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmit = (event: string, payload: unknown) => Promise<any>;
async function emit<T>(
  client: TestClient,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  return (client.socket.timeout(3000).emitWithAck as unknown as AnyEmit)(event, payload);
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(check()).toBe(true);
};

let commandSeq = 0;
const commandId = () => `cmd_test_${++commandSeq}_xxxxxx`;

describe('multiplayer over Socket.IO', () => {
  it('creates, joins, starts and keeps hands private', async () => {
    const host = await newClient();
    const guest = await newClient();

    const created = await emit<SessionInfo>(host, 'room:create', { name: 'Host', maxPlayers: 4 });
    expect(created.ok).toBe(true);
    const session = (created as { data: SessionInfo }).data;

    const badJoin = await emit(guest, 'room:join', { code: '!!', name: 'Guest' });
    expect(badJoin).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });

    const joined = await emit<SessionInfo>(guest, 'room:join', {
      code: session.roomCode,
      name: 'Guest',
    });
    expect(joined.ok).toBe(true);
    const guestSession = (joined as { data: SessionInfo }).data;

    const early = await emit(host, 'game:start', {});
    expect(early).toMatchObject({ ok: false, error: { code: 'PLAYERS_NOT_READY' } });
    const notHost = await emit(guest, 'game:start', {});
    expect(notHost).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });

    await emit(guest, 'room:ready', { ready: true });
    expect((await emit(host, 'game:start', {})).ok).toBe(true);
    await until(() => host.game !== null && guest.game !== null);

    // Privacy: no client ever receives the other player's card ids or token.
    const hostCards = host.game!.me.hand.map((c) => c.id);
    const guestCards = guest.game!.me.hand.map((c) => c.id);
    expect(hostCards).toHaveLength(7);
    for (const id of hostCards) expect(guest.raw.join('')).not.toContain(id);
    for (const id of guestCards) expect(host.raw.join('')).not.toContain(id);
    expect(host.raw.join('')).not.toContain(guestSession.reconnectToken);
    expect(guest.raw.join('')).not.toContain(session.reconnectToken);

    // Late joiners are rejected once the game started.
    const late = await newClient();
    const lateJoin = await emit(late, 'room:join', { code: session.roomCode, name: 'Late' });
    expect(lateJoin).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });

    // Out-of-turn and stale commands are rejected.
    const view = host.game!;
    const currentId = view.public.currentPlayerId;
    const [mover, waiter] = currentId === session.playerId ? [host, guest] : [guest, host];
    const waiterCard = waiter.game!.me.hand[0]!.id;
    const outOfTurn = await emit(waiter, 'game:play-card', {
      commandId: commandId(),
      version: view.version,
      cardId: waiterCard,
    });
    expect(outOfTurn).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    const stale = await emit(mover, 'game:draw', {
      commandId: commandId(),
      version: view.version - 1,
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_STATE' } });

    // A legal move, sent twice with the same command id, executes once.
    const actions = mover.game!.me.validActions;
    const id = commandId();
    let payload: Record<string, unknown>;
    let event: keyof ClientToServerEvents;
    if (actions.playableCardIds.length > 0) {
      const cardIdToPlay = actions.playableCardIds[0]!;
      const card = mover.game!.me.hand.find((c) => c.id === cardIdToPlay)!;
      event = 'game:play-card';
      payload = {
        commandId: id,
        version: view.version,
        cardId: cardIdToPlay,
        ...('color' in card ? {} : { color: 'red' }),
        ...(card.kind === 'number' && card.value === 7
          ? { swapTargetId: waiter === host ? session.playerId : guestSession.playerId }
          : {}),
      };
    } else {
      event = 'game:draw';
      payload = { commandId: id, version: view.version };
    }
    const first = await emit<{ version: number }>(mover, event, payload);
    expect(first.ok).toBe(true);
    const second = await emit<{ version: number }>(mover, event, payload);
    expect(second).toEqual(first);
    await until(() => host.game!.version === view.version + 1);
  });

  it('reconnects with the token without duplicating the player, and rejects bad tokens', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = (await emit<SessionInfo>(a, 'room:create', {
      name: 'Alpha',
      maxPlayers: 2,
    })) as {
      data: SessionInfo;
    };
    await emit(b, 'room:join', { code: created.data.roomCode, name: 'Beta' });

    const bad = await newClient();
    const rejected = await emit(bad, 'room:reconnect', {
      code: created.data.roomCode,
      token: 'x'.repeat(43),
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_TOKEN' } });

    a.socket.disconnect();
    await until(() => b.room!.players.find((p) => p.name === 'Alpha')?.connected === false);

    const again = await newClient();
    const restored = await emit<SessionInfo>(again, 'room:reconnect', {
      code: created.data.roomCode,
      token: created.data.reconnectToken,
    });
    expect(restored.ok).toBe(true);
    await until(() => b.room!.players.find((p) => p.name === 'Alpha')?.connected === true);
    expect(b.room!.players).toHaveLength(2);
  });

  it('lets the host choose how many players the room seats', async () => {
    const host = await newClient();
    const badCreate = await emit(host, 'room:create', { name: 'Hosty', maxPlayers: 1 });
    expect(badCreate).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    const created = (await emit<SessionInfo>(host, 'room:create', {
      name: 'Hosty',
      maxPlayers: 4,
    })) as { data: SessionInfo };
    const code = created.data.roomCode;
    await until(() => host.room?.maxPlayers === 4);

    const tooMany = await emit(host, 'room:settings', { maxPlayers: 21 });
    expect(tooMany).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect((await emit(host, 'room:settings', { maxPlayers: 3 })).ok).toBe(true);
    await until(() => host.room?.maxPlayers === 3);
    expect(host.room!.settings.scoringEnabled).toBe(false);

    const second = await newClient();
    const third = await newClient();
    const fourth = await newClient();
    expect((await emit(second, 'room:join', { code, name: 'Two' })).ok).toBe(true);
    expect((await emit(third, 'room:join', { code, name: 'Three' })).ok).toBe(true);
    const full = await emit(fourth, 'room:join', { code, name: 'Four' });
    expect(full).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });

    const shrink = await emit(host, 'room:settings', { maxPlayers: 2 });
    expect(shrink).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
    const notHost = await emit(second, 'room:settings', { maxPlayers: 6 });
    expect(notHost).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
  });

  it('deals a solo player in against named computer players who take their turns', async () => {
    const solo = await newClient();
    const tooMany = await emit(solo, 'room:create', {
      name: 'Solo',
      maxPlayers: 20,
      computers: 10,
    });
    expect(tooMany).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });

    const created = await emit<SessionInfo>(solo, 'room:create', {
      name: 'Solo',
      maxPlayers: 4,
      computers: 3,
    });
    expect(created.ok).toBe(true);
    await until(() => solo.room?.status === 'inGame' && solo.game !== null);
    const computers = solo.room!.players.filter((p) => p.isComputer);
    expect(computers).toHaveLength(3);
    expect(new Set([...computers.map((p) => p.name), 'Solo']).size).toBe(4);
    expect(computers.every((p) => p.connected && p.ready)).toBe(true);
    expect(computers.every((p) => playerNameSchema.safeParse(p.name).success)).toBe(true);

    const computerIds = new Set(computers.map((p) => p.id));
    const computerMoved = () =>
      solo.game!.public.log.some((e) => 'playerId' in e.event && computerIds.has(e.event.playerId));
    // Take the solo player's turns until a computer has acted on its own.
    for (let i = 0; i < 50 && !computerMoved(); i++) {
      const { me, version, public: table } = solo.game!;
      const actions = me.validActions;
      const card = me.hand.find((c) => c.id === actions.playableCardIds[0]);
      if (card) {
        await emit(solo, 'game:play-card', {
          commandId: commandId(),
          version,
          cardId: card.id,
          ...('color' in card ? {} : { color: 'red' }),
          ...(card.kind === 'number' && card.value === 7
            ? { swapTargetId: actions.swapTargetIds[0] }
            : {}),
        });
      } else if (actions.canAcceptPenalty) {
        await emit(solo, 'game:accept-penalty', { commandId: commandId(), version });
      } else if (actions.canChooseRouletteColor) {
        await emit(solo, 'game:choose-roulette-color', {
          commandId: commandId(),
          version,
          color: 'red',
        });
      } else if (actions.canDraw && table.currentPlayerId === me.playerId) {
        await emit(solo, 'game:draw', { commandId: commandId(), version });
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(computerMoved()).toBe(true);
  });

  it('lets a lone host start by filling the open seats with computers', async () => {
    const host = await newClient();
    await emit(host, 'room:create', { name: 'Loner', maxPlayers: 3 });
    const alone = await emit(host, 'game:start', {});
    expect(alone).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_PLAYERS' } });
    const bad = await emit(host, 'game:start', { fillWithComputers: 'yes' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect((await emit(host, 'game:start', { fillWithComputers: true })).ok).toBe(true);
    await until(() => host.room?.status === 'inGame');
    expect(host.room!.players.filter((p) => p.isComputer)).toHaveLength(2);
  });
});
