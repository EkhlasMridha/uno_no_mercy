import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { createRequestGuard } from '../src/http/request-guard.js';
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
      computers: 20,
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
});

describe('network guard', () => {
  let guarded: HttpServer;
  let guardedUrl: string;
  let closeGuarded: () => void;
  let siteDir: string;

  beforeAll(async () => {
    siteDir = mkdtempSync(path.join(tmpdir(), 'nomercy-site-'));
    writeFileSync(
      path.join(siteDir, 'index.html'),
      '<!doctype html><title>t</title>' +
        '<meta property="og:image" content="/social-card.jpg" />' +
        '<meta property="og:url" content="/" />',
    );
    guarded = createServer(createHttpApp(siteDir));
    const { io } = createSocketServer(guarded, {
      rng: seededRng(7),
      reconnectGraceMs: 60_000,
      checkInvariants: true,
      maxConnectionsPerIp: 2,
    });
    closeGuarded = () => io.close();
    await new Promise<void>((resolve) => guarded.listen(0, '127.0.0.1', resolve));
    guardedUrl = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    closeGuarded();
    guarded.close();
    rmSync(siteDir, { recursive: true, force: true });
  });

  const tryConnect = (headers: Record<string, string> = {}) => tryConnectTo(guardedUrl, headers);
  const get = (pathname: string, host: string, headers: Record<string, string> = {}) =>
    getFrom(guardedUrl, pathname, { ...headers, host });

  it('refuses game sockets opened from another website', async () => {
    const foreign = await tryConnect({ origin: 'http://evil.example' });
    expect(foreign.outcome).not.toBe('connected');
    foreign.socket.close();

    const sameOrigin = await tryConnect({ origin: guardedUrl });
    expect(sameOrigin.outcome).toBe('connected');
    sameOrigin.socket.close();
  });

  it('refuses requests addressed to an unknown hostname (DNS rebinding)', async () => {
    const host = new URL(guardedUrl).host;
    expect((await get('/api/health', host)).status).toBe(200);
    expect((await get('/api/health', 'localhost')).status).toBe(200);
    expect((await get('/api/health', 'rebind.evil.example')).status).toBe(421);
    expect((await get('/', 'rebind.evil.example')).body).not.toContain('<title>');
  });

  it('gives link previews absolute URLs on the host the page was opened from', async () => {
    const host = new URL(guardedUrl).host;
    for (const pathname of ['/', '/index.html', '/room/ABCD']) {
      const page = await get(pathname, host);
      expect(page.status).toBe(200);
      expect(page.body).toContain(`content="http://${host}/social-card.jpg"`);
      expect(page.body).toContain(`content="http://${host}/"`);
    }
  });

  it('answers malformed requests without stack traces or file paths', async () => {
    const res = await get('/%E0%A4%A', new URL(guardedUrl).host);
    expect(res.status).toBe(400);
    expect(res.body).toBe('Bad request');
  });

  it('caps open sockets per device and frees the slot on disconnect', async () => {
    const first = await tryConnect();
    const second = await tryConnect();
    expect([first.outcome, second.outcome]).toEqual(['connected', 'connected']);
    const third = await tryConnect();
    expect(third.outcome).not.toBe('connected');
    third.socket.close();

    first.socket.close();
    await new Promise((r) => setTimeout(r, 100));
    const retry = await tryConnect();
    expect(retry.outcome).toBe('connected');
    retry.socket.close();
    second.socket.close();
  });

  it('ignores forwarded headers unless it is told it sits behind a proxy', async () => {
    const forgedHost = await get('/api/health', 'rebind.evil.example', {
      'x-forwarded-host': 'localhost',
    });
    expect(forgedHost.status).toBe(421);

    await new Promise((r) => setTimeout(r, 100));
    const first = await tryConnect({ 'x-forwarded-for': '10.0.0.1' });
    const second = await tryConnect({ 'x-forwarded-for': '10.0.0.2' });
    const third = await tryConnect({ 'x-forwarded-for': '10.0.0.3' });
    expect(third.outcome).not.toBe('connected');
    for (const s of [first, second, third]) s.socket.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});

describe('behind a reverse proxy', () => {
  let proxied: HttpServer;
  let proxiedUrl: string;
  let closeProxied: () => void;
  const refusals: string[] = [];

  beforeAll(async () => {
    const guard = {
      allowedHosts: ['game.example'],
      trustProxy: true,
      onRefused: (reason: string) => refusals.push(reason),
    };
    proxied = createServer(createHttpApp(null, guard));
    const { io } = createSocketServer(proxied, {
      rng: seededRng(8),
      reconnectGraceMs: 60_000,
      checkInvariants: true,
      maxConnectionsPerIp: 1,
      ...guard,
    });
    closeProxied = () => io.close();
    await new Promise<void>((resolve) => proxied.listen(0, '127.0.0.1', resolve));
    proxiedUrl = `http://127.0.0.1:${(proxied.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    closeProxied();
    proxied.close();
  });

  /** Headers nginx sends for a browser on https://game.example:8443 with the given address. */
  const viaProxy = (playerAddress: string) => ({
    origin: 'https://game.example:8443',
    'x-forwarded-host': 'game.example:8443',
    'x-forwarded-for': playerAddress,
  });

  it('accepts the public host the proxy forwards, not the upstream name', async () => {
    const page = await getFrom(proxiedUrl, '/api/health', {
      host: 'nomercy:3000',
      'x-forwarded-host': 'game.example:8443',
    });
    expect(page.status).toBe(200);

    const player = await tryConnectTo(proxiedUrl, viaProxy('192.168.1.20'));
    expect(player.outcome).toBe('connected');
    player.socket.close();
  });

  it('still refuses unknown hosts and foreign origins, and says why', async () => {
    const rebind = await getFrom(proxiedUrl, '/api/health', {
      'x-forwarded-host': 'rebind.evil.example',
    });
    expect(rebind.status).toBe(421);
    expect(refusals.some((r) => r.includes('"rebind.evil.example"'))).toBe(true);

    const foreign = await tryConnectTo(proxiedUrl, {
      ...viaProxy('192.168.1.21'),
      origin: 'https://evil.example',
    });
    expect(foreign.outcome).not.toBe('connected');
    foreign.socket.close();
    expect(refusals.some((r) => r.includes('"https://evil.example"'))).toBe(true);
  });

  it('builds the public origin from the forwarded host and scheme', () => {
    const behindProxy = createRequestGuard({ trustProxy: true });
    const headers = { host: 'nomercy:3000', 'x-forwarded-host': 'game.example:8443' };
    expect(
      behindProxy.publicOrigin({ headers: { ...headers, 'x-forwarded-proto': 'https' } }),
    ).toBe('https://game.example:8443');
    expect(behindProxy.publicOrigin({ headers })).toBe('http://game.example:8443');
    expect(
      createRequestGuard().publicOrigin({ headers: { ...headers, 'x-forwarded-proto': 'https' } }),
    ).toBe('http://nomercy:3000');
  });

  it('caps sockets per player address, counting only the entry the proxy added', async () => {
    const alice = await tryConnectTo(proxiedUrl, viaProxy('192.168.1.30'));
    const bob = await tryConnectTo(proxiedUrl, viaProxy('192.168.1.31'));
    expect([alice.outcome, bob.outcome]).toEqual(['connected', 'connected']);

    const aliceAgain = await tryConnectTo(proxiedUrl, viaProxy('1.2.3.4, 192.168.1.30'));
    expect(aliceAgain.outcome).not.toBe('connected');
    for (const s of [alice, bob, aliceAgain]) s.socket.close();
  });
});

/** Resolves 'connected' or the refusal message. */
function tryConnectTo(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ outcome: string; socket: ClientSocket }>((resolve) => {
    const socket: ClientSocket = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: headers,
    });
    socket.on('connect', () => resolve({ outcome: 'connected', socket }));
    socket.on('connect_error', (error) => resolve({ outcome: error.message, socket }));
  });
}

function getFrom(url: string, pathname: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(`${url}${pathname}`, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
