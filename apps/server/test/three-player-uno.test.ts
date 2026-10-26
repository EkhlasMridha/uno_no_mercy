import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { STARTING_HAND_SIZE, UNO_PENALTY_CARDS } from '@nomercy/shared';
import type {
  Ack,
  Card,
  ClientToServerEvents,
  CommandResult,
  GameEventType,
  GameStateView,
  RoomView,
  ServerToClientEvents,
  SessionInfo,
} from '@nomercy/shared';
import { createHttpApp } from '../src/http/app.js';
import { createSocketServer } from '../src/net/socket-server.js';
import { seededRng } from '../src/engine/index.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** How a player handles UNO: arm it with the second-to-last card, press it on one card, or forget. */
type UnoHabit = 'arm' | 'call' | 'forget';
const HABITS: UnoHabit[] = ['arm', 'call', 'forget'];

interface Player {
  name: string;
  habit: UnoHabit;
  id: string;
  /** When this socket last sent an event, for pacing. */
  sentAt: number;
  socket: ClientSocket;
  room: RoomView | null;
  game: GameStateView | null;
}

let httpServer: HttpServer;
let url: string;
let closeServer: () => void;
const players: Player[] = [];

beforeAll(async () => {
  httpServer = createServer(createHttpApp(null));
  const { io } = createSocketServer(httpServer, {
    rng: seededRng(3),
    reconnectGraceMs: 60_000,
    checkInvariants: true,
    turnHoldMs: 0,
  });
  closeServer = () => io.close();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  for (const p of players) p.socket.disconnect();
  closeServer();
  httpServer.close();
});

async function newPlayer(name: string): Promise<Player> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
  const player: Player = { name, habit: 'call', id: '', sentAt: 0, socket, room: null, game: null };
  socket.on('room:state', (room) => (player.room = room));
  socket.on('game:state', (game) => (player.game = game));
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  players.push(player);
  return player;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmit = (event: string, payload: unknown) => Promise<any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ponytail: a fixed gap between one socket's events keeps it under the server's 15/s rate limit
// (socket-server.ts); shorten it only if that limit is raised.
async function emit<T>(
  player: Player,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  await sleep(player.sentAt + 70 - Date.now());
  player.sentAt = Date.now();
  return (player.socket.timeout(3000).emitWithAck as unknown as AnyEmit)(event, payload);
}

const until = async (check: () => boolean, label: string) => {
  for (let i = 0; i < 150 && !check(); i++) await sleep(20);
  expect(check(), label).toBe(true);
};

let commandSeq = 0;
const commandId = () => `cmd_uno3_${++commandSeq}_xxxxxx`;

const view = (p: Player) => p.game!;
const seat = (game: GameStateView, id: string) => game.public.players.find((s) => s.id === id)!;
const lastSeq = (game: GameStateView) => game.public.log.at(-1)?.seq ?? 0;
const logged = (game: GameStateView, type: GameEventType, playerId: string, afterSeq: number) =>
  game.public.log.some(
    (e) =>
      e.seq > afterSeq &&
      e.event.type === type &&
      'playerId' in e.event &&
      e.event.playerId === playerId,
  );

/** Sends a game command and waits until every player's view includes it. */
async function command(player: Player, event: keyof ClientToServerEvents, payload: object) {
  const ack = await emit<CommandResult>(player, event, { commandId: commandId(), ...payload });
  expect(ack.ok, `${player.name} ${event}: ${JSON.stringify(ack)}`).toBe(true);
  const { version } = (ack as { data: CommandResult }).data;
  await until(() => players.every((p) => view(p).version >= version), `everyone at v${version}`);
}

/** The current player's turn action, taken only from the server's valid actions. */
async function takeTurn(player: Player) {
  const { me, version } = view(player);
  const actions = me.validActions;
  // Shed numbers first and wilds last, so draw stacks stay small and hands can run down to one card.
  const rank = (c: Card) => (c.kind === 'number' ? 0 : 'color' in c ? 1 : 2);
  const card = me.hand
    .filter((c) => actions.playableCardIds.includes(c.id))
    .sort((a, b) => rank(a) - rank(b))[0];
  if (card) {
    await command(player, 'game:play-card', {
      version,
      cardId: card.id,
      ...('color' in card ? {} : { color: 'red' }),
      ...(card.kind === 'number' && card.value === 7
        ? { swapTargetId: actions.swapTargetIds[0] }
        : {}),
      ...(player.habit === 'arm' && actions.canDeclareWithPlay ? { declareUno: true } : {}),
    });
  } else if (actions.canAcceptPenalty) {
    await command(player, 'game:accept-penalty', { version });
  } else if (actions.canDraw) {
    await command(player, 'game:draw', { version });
  } else {
    throw new Error(`${player.name} has the turn but nothing to do`);
  }
}

describe('a 3-player game over Socket.IO', () => {
  it('plays to a winner while UNO calls save players and forgotten ones get caught', async () => {
    const alpha = await newPlayer('Alpha');
    const bravo = await newPlayer('Bravo');
    const cara = await newPlayer('Cara');

    const created = await emit<SessionInfo>(alpha, 'room:create', {
      name: alpha.name,
      gender: 'male',
      maxPlayers: 3,
    });
    expect(created.ok).toBe(true);
    const { roomCode, playerId } = (created as { data: SessionInfo }).data;
    alpha.id = playerId;
    for (const guest of [bravo, cara]) {
      const joined = await emit<SessionInfo>(guest, 'room:join', {
        code: roomCode,
        name: guest.name,
        gender: 'female',
      });
      expect(joined.ok).toBe(true);
      guest.id = (joined as { data: SessionInfo }).data.playerId;
      expect((await emit(guest, 'room:ready', { ready: true })).ok).toBe(true);
    }
    expect((await emit(alpha, 'game:start', {})).ok).toBe(true);

    const seen: Record<UnoHabit, number> = { arm: 0, call: 0, forget: 0 };
    let rounds = 0;
    const dealt = () =>
      players.every(
        (p) =>
          p.game?.public.phase.type === 'turn' &&
          p.game.public.players.length === 3 &&
          p.game.public.players.every((s) => s.handCount === STARTING_HAND_SIZE),
      );
    await until(dealt, 'all three players dealt a starting hand');

    for (let step = 0; step < 4000; step++) {
      const { phase } = view(alpha).public;
      if (phase.type === 'finished') {
        rounds++;
        expect(players.map((p) => p.id)).toContain(phase.winnerId);
        if (seen.arm && seen.call && seen.forget) break;
        expect(rounds, `every UNO path within 10 rounds: ${JSON.stringify(seen)}`).toBeLessThan(10);
        await until(() => alpha.room?.status === 'roundOver', 'round over');
        expect((await emit(alpha, 'game:restart', {})).ok).toBe(true);
        await until(dealt, 'next round dealt');
        continue;
      }

      // 1. A player on one card who remembers presses UNO, and can no longer be caught.
      const caller = players.find((p) => p.habit === 'call' && view(p).me.validActions.canCallUno);
      if (caller) {
        const since = lastSeq(view(caller));
        await command(caller, 'game:call-uno', {});
        for (const p of players) {
          expect(seat(view(p), caller.id).uno).toBe('declared');
          expect(logged(view(p), 'unoCalled', caller.id, since)).toBe(true);
        }
        const other = players.find((p) => p !== caller && seat(view(p), p.id).status === 'active');
        if (other) {
          const late = await emit(other, 'game:catch-uno', {
            commandId: commandId(),
            targetId: caller.id,
          });
          expect(late).toMatchObject({ ok: false, error: { code: 'INVALID_TARGET' } });
        }
        seen.call++;
        continue;
      }

      // 2. Anyone left on one card without UNO is caught and draws the penalty.
      const catcher = players.find((p) => view(p).me.validActions.catchablePlayerIds.length > 0);
      if (catcher) {
        const targetId = view(catcher).me.validActions.catchablePlayerIds[0]!;
        const before = seat(view(catcher), targetId).handCount;
        const since = lastSeq(view(catcher));
        await command(catcher, 'game:catch-uno', { targetId });
        for (const p of players) {
          expect(seat(view(p), targetId).handCount).toBe(before + UNO_PENALTY_CARDS);
          expect(logged(view(p), 'unoCaught', targetId, since)).toBe(true);
        }
        seen.forget++;
        continue;
      }

      // 3. Otherwise the game moves on: the roulette victim names a color, or the current player acts.
      const victim = players.find((p) => view(p).me.validActions.canChooseRouletteColor);
      if (victim) {
        await command(victim, 'game:choose-roulette-color', {
          version: view(victim).version,
          color: 'red',
        });
        continue;
      }
      const current = players.find((p) => p.id === view(alpha).public.currentPlayerId)!;
      const armed = view(current).me.validActions.canDeclareWithPlay;
      // Down to two cards: try whichever UNO path has come up least so far.
      if (armed) current.habit = HABITS.reduce((a, b) => (seen[b] < seen[a] ? b : a));
      const since = lastSeq(view(current));
      await takeTurn(current);
      // Arming UNO declares it with the play, so the last card is safe straight away.
      if (armed && current.habit === 'arm' && view(current).me.hand.length === 1) {
        for (const p of players) {
          expect(seat(view(p), current.id).uno).toBe('declared');
          expect(logged(view(p), 'unoCalled', current.id, since)).toBe(true);
        }
        seen.arm++;
      }
    }

    expect(rounds).toBeGreaterThan(0);
    expect(seen.arm, 'UNO armed with the second-to-last card').toBeGreaterThan(0);
    expect(seen.call, 'UNO pressed with one card left').toBeGreaterThan(0);
    expect(seen.forget, 'a player caught without UNO').toBeGreaterThan(0);
  }, 120_000);
});
