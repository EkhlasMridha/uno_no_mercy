/**
 * Stress test: how many rooms one server runs at once while every room stays playable. Bots fill
 * each room, play legal moves until the round ends and restart it, and rooms are added in steps
 * until a cap refuses one, a room stalls, or ROOMS is reached. Exits 0 only when all ROOMS rooms
 * opened and kept playing.
 *
 * Needs a production build (`npm run build`), then `node scripts/stress-rooms.mjs`.
 * Env: ROOMS (50, the server's default room limit), PLAYERS_PER_ROOM (4), STEP (10 rooms),
 *      STEP_SECONDS (20), MAX_ROOMS (defaults to ROOMS), SERVER_URL (target a running server
 *      instead of starting one; it needs a MAX_CONNECTIONS_PER_IP high enough for every bot).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { io as connect } from 'socket.io-client';
import { CARD_COLORS } from '@nomercy/shared';

const env = process.env;
const ROOMS = Number(env.ROOMS ?? 50);
const PLAYERS = Number(env.PLAYERS_PER_ROOM ?? 4);
const STEP = Number(env.STEP ?? 10);
const STEP_SECONDS = Number(env.STEP_SECONDS ?? 20);
const MAX_ROOMS = env.MAX_ROOMS ?? String(ROOMS);
/** A room whose game hasn't moved for this long is not playable. */
const STALL_MS = 10_000;
/** Refusals that are part of normal play: the UNO breather, and a move racing a newer state. */
const EXPECTED = new Set(['TURN_HOLD', 'STALE_STATE']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const percentile = (sorted, p) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;

let server = null;
let url = env.SERVER_URL;
if (!url) {
  const entry = fileURLToPath(new URL('../apps/server/dist/index.js', import.meta.url));
  if (!existsSync(entry)) throw new Error('No server build: run `npm run build` first');
  // Production mode: --dev's card-conservation check on every move would skew the numbers.
  server = spawn(process.execPath, [entry, '--port', '4100'], {
    env: { ...env, NODE_ENV: 'production', MAX_ROOMS, MAX_CONNECTIONS_PER_IP: '100000' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  url = 'http://127.0.0.1:4100';
  for (let i = 0; ; i++) {
    if (
      await fetch(`${url}/api/health`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    if (i === 50) throw new Error('The server did not start');
    await sleep(100);
  }
}

const sockets = [];
const rooms = [];
let stats = { latencies: [], moves: 0, unexpected: {} };
let commandSeq = 0;
let stopping = false;

const unexpected = (what) => (stats.unexpected[what] = (stats.unexpected[what] ?? 0) + 1);
const ack = (socket, event, payload) => socket.timeout(10_000).emitWithAck(event, payload);

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => {
      sockets.push(socket);
      socket.on('disconnect', (reason) => stopping || unexpected(`disconnect: ${reason}`));
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      socket.close();
      reject(new Error(`connection refused after ${sockets.length} sockets: ${error.message}`));
    });
  });
}

/** The move a bot makes from its own view, or null when it has nothing to do right now. */
function nextMove({ me, public: table }) {
  const actions = me.validActions;
  if (actions.canChooseRouletteColor) {
    return ['game:choose-roulette-color', { color: pick(CARD_COLORS) }];
  }
  if (table.currentPlayerId !== me.playerId) return null;
  const cardId =
    table.phase.type === 'drawing' ? actions.drawnPlayableCardId : pick(actions.playableCardIds);
  const card = me.hand.find((c) => c.id === cardId);
  if (card) {
    return [
      'game:play-card',
      {
        cardId,
        ...('color' in card ? {} : { color: pick(CARD_COLORS) }),
        ...(card.kind === 'number' && card.value === 7
          ? { swapTargetId: pick(actions.swapTargetIds) }
          : {}),
        ...(actions.canDeclareWithPlay ? { declareUno: true } : {}),
      },
    ];
  }
  if (actions.canAcceptPenalty) return ['game:accept-penalty', {}];
  if (actions.canDraw) return ['game:draw', {}];
  return null;
}

/** Acts on the newest state it has, one command in flight at a time. */
async function play(bot) {
  if (bot.busy || !bot.fresh || stopping) return;
  bot.fresh = false;
  const move = nextMove(bot.game);
  if (!move) return;
  const [event, payload] = move;
  bot.busy = true;
  const started = performance.now();
  try {
    const result = await ack(bot.socket, event, {
      ...payload,
      commandId: `cmd_stress_${++commandSeq}`,
      version: bot.game.version,
    });
    stats.latencies.push(performance.now() - started);
    if (result.ok) stats.moves++;
    else if (!EXPECTED.has(result.error.code)) unexpected(`${event} ${result.error.code}`);
  } catch {
    unexpected(`${event} ack timeout`);
  }
  bot.busy = false;
  play(bot);
}

async function openRoom() {
  const bots = await Promise.all(
    Array.from({ length: PLAYERS }, () =>
      openSocket().then((socket) => ({ socket, game: null, fresh: false, busy: false })),
    ),
  );
  const room = { code: null, version: -1, round: 0, lastProgress: Date.now(), phase: null };
  const [host] = bots;
  for (const bot of bots) {
    bot.socket.on('game:state', (game) => {
      bot.game = game;
      bot.fresh = true;
      if (game.version !== room.version) {
        room.version = game.version;
        room.lastProgress = Date.now();
      }
      room.phase = `${game.public.phase.type}, turn of ${game.public.currentPlayerId}`;
      play(bot);
    });
  }
  host.socket.on('room:state', (view) => {
    if (view.status !== 'roundOver' || view.roundNumber === room.round) return;
    // Keep the table busy: the host deals the next round as soon as one ends.
    room.round = view.roundNumber;
    room.lastProgress = Date.now();
    ack(host.socket, 'game:restart', {}).then(
      (r) => r.ok || unexpected(`game:restart ${r.error.code}`),
      () => unexpected('game:restart ack timeout'),
    );
  });

  const created = await ack(host.socket, 'room:create', {
    name: 'Bot1',
    gender: 'male',
    maxPlayers: PLAYERS,
  });
  if (!created.ok) throw new Error(`room ${rooms.length + 1} refused: ${created.error.code}`);
  room.code = created.data.roomCode;
  for (const [i, bot] of bots.slice(1).entries()) {
    const joined = await ack(bot.socket, 'room:join', {
      code: room.code,
      name: `Bot${i + 2}`,
      gender: 'female',
    });
    if (!joined.ok) throw new Error(`join ${room.code} refused: ${joined.error.code}`);
    await ack(bot.socket, 'room:ready', { ready: true });
  }
  const started = await ack(host.socket, 'game:start', {});
  if (!started.ok) throw new Error(`start ${room.code} refused: ${started.error.code}`);
  rooms.push(room);
}

const rows = [];
let stopReason = `reached ROOMS=${ROOMS}`;
let failed = false;
console.log(
  `Stress: up to ${ROOMS} rooms × ${PLAYERS} players on ${url}, +${STEP} every ${STEP_SECONDS}s`,
);
try {
  while (rooms.length < ROOMS) {
    let capHit = null;
    const target = Math.min(ROOMS, rooms.length + STEP);
    try {
      while (rooms.length < target) await openRoom();
    } catch (error) {
      capHit = error.message;
    }
    stats = { latencies: [], moves: 0, unexpected: {} };
    await sleep(STEP_SECONDS * 1000);

    const sorted = stats.latencies.sort((a, b) => a - b);
    const stalled = rooms.filter((r) => Date.now() - r.lastProgress > STALL_MS);
    const errors = Object.entries(stats.unexpected);
    const row = {
      rooms: rooms.length,
      sockets: sockets.length,
      'moves/s': Math.round(stats.moves / STEP_SECONDS),
      'p50 ms': Math.round(percentile(sorted, 0.5)),
      'p95 ms': Math.round(percentile(sorted, 0.95)),
      'max ms': Math.round(sorted.at(-1) ?? 0),
      stalled: stalled.length,
      errors: errors.reduce((sum, [, n]) => sum + n, 0),
      ...(server && {
        'rss MB': Math.round(
          Number(execFileSync('ps', ['-o', 'rss=', '-p', `${server.pid}`])) / 1024,
        ),
      }),
    };
    rows.push(row);
    console.log(
      Object.entries(row)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · '),
    );
    if (stalled.length > 0 || errors.length > 0) {
      failed = true;
      stopReason = `not playable at ${rooms.length} rooms`;
      if (stalled.length) console.log(`  stalled ${stalled[0].code}: ${stalled[0].phase}`);
      for (const [what, n] of errors) console.log(`  ${n}× ${what}`);
      break;
    }
    if (capHit) {
      stopReason = capHit;
      break;
    }
  }
} finally {
  stopping = true;
  for (const socket of sockets) socket.close();
  server?.kill();
}

console.table(rows);
const playable = failed ? (rows.at(-2)?.rooms ?? 0) : rooms.length;
console.log(`Stopped: ${stopReason}. Playable at once: ${playable} rooms × ${PLAYERS} players.`);
process.exitCode = playable === ROOMS ? 0 : 1;
