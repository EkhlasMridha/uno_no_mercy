import type { Ack, CardColor, CommandResult, Gender } from '@nomercy/shared';
import { randomPlayerName } from '../lib/random-name';
import { getState, pushNotice } from '../state/store';
import { adoptSession, forgetSession, request } from './socket';

function newCommandId(): string {
  // crypto.getRandomValues works on plain-http LAN origins (randomUUID needs a secure context).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function report<T>(result: Ack<T>): Ack<T> {
  if (!result.ok && result.error.code !== 'STALE_STATE') pushNotice('error', result.error.message);
  if (!result.ok && result.error.code === 'STALE_STATE') {
    pushNotice('info', 'The table changed — your view has been refreshed.');
  }
  return result;
}

// ---- room ----

/** With `computers`, the server seats computer opponents and deals straight away. */
export async function createRoom(
  name: string,
  gender: Gender,
  maxPlayers: number,
  computers?: number,
) {
  const result = await request('room:create', { name, gender, maxPlayers, computers });
  if (result.ok) adoptSession(result.data);
  return report(result);
}

export async function joinRoom(code: string, name: string, gender: Gender) {
  const result = await request('room:join', { code, name, gender });
  if (result.ok) adoptSession(result.data);
  return report(result);
}

/**
 * Joins from an invite link without asking anything: under `savedName` when there is one, otherwise
 * (or when someone at the table already has it) under a random name the player can change in the lobby.
 */
export async function joinFromInvite(code: string, savedName: string | null) {
  const join = (name: string) => request('room:join', { code, name, gender: 'male' });
  let result = await join(savedName ?? randomPlayerName());
  for (let retry = 0; retry < 3 && !result.ok && result.error.code === 'NAME_TAKEN'; retry++) {
    result = await join(randomPlayerName());
  }
  if (result.ok) adoptSession(result.data);
  return report(result);
}

/** Renames this player, or switches their avatar set, while in the lobby. */
export const updateProfile = async (profile: { name?: string; gender?: Gender }) =>
  report(await request('room:profile', profile));

/** Host only: removes another player from the lobby. */
export const kickPlayer = async (playerId: string) =>
  report(await request('room:kick', { playerId }));

/** Host only: hands the room to another player, who becomes the host instead. */
export const transferHost = async (playerId: string) =>
  report(await request('room:transfer-host', { playerId }));

export async function leaveRoom() {
  const result = await request('room:leave', {});
  forgetSession();
  return result;
}

export const setReady = async (ready: boolean) => report(await request('room:ready', { ready }));
export const setScoring = async (scoringEnabled: boolean) =>
  report(await request('room:settings', { scoringEnabled }));
export const setMaxPlayers = async (maxPlayers: number) =>
  report(await request('room:settings', { maxPlayers }));
/** With `fillWithComputers`, computers take the open seats before the deal. */
export const startGame = async (fillWithComputers?: boolean) =>
  report(await request('game:start', fillWithComputers ? { fillWithComputers } : {}));
export const nextRound = async () => report(await request('game:restart', {}));
export const returnToLobby = async () => report(await request('room:return-lobby', {}));
/** The decider's answer for a dropped player: hold their seat, or let them forfeit. */
export const waitForPlayer = async (playerId: string, wait: boolean) =>
  report(await request('room:wait-for-player', { playerId, wait }));

// ---- game ----

function version(): number {
  return getState().game?.version ?? 0;
}

export async function playCard(
  cardId: string,
  options: {
    color?: CardColor;
    swapTargetId?: string;
    declareUno?: boolean;
    discardIds?: string[];
  } = {},
): Promise<Ack<CommandResult>> {
  return report(
    await request('game:play-card', {
      commandId: newCommandId(),
      version: version(),
      cardId,
      ...options,
    }),
  );
}

export const drawCards = async () =>
  report(await request('game:draw', { commandId: newCommandId(), version: version() }));

export const acceptPenalty = async () =>
  report(await request('game:accept-penalty', { commandId: newCommandId(), version: version() }));

export const chooseRouletteColor = async (color: CardColor) =>
  report(
    await request('game:choose-roulette-color', {
      commandId: newCommandId(),
      version: version(),
      color,
    }),
  );

export const callUno = async () =>
  report(await request('game:call-uno', { commandId: newCommandId() }));

export const catchUno = async (targetId: string) =>
  report(await request('game:catch-uno', { commandId: newCommandId(), targetId }));
