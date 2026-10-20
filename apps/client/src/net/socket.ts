import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents, SessionInfo } from '@nomercy/shared';
import { getState, pushNotice, setState } from '../state/store';
import { clearSession, loadSession, saveSession } from './session-storage';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ClientToServerEvents;
type PayloadOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends EventName> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/** Same-origin connection: works for the production host and through the Vite dev proxy. */
export const socket: GameSocket = io({
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

interface UntypedAckEmitter {
  emitWithAck(event: string, payload: unknown): Promise<unknown>;
}

export async function request<E extends EventName>(
  event: E,
  payload: PayloadOf<E>,
): Promise<AckOf<E>> {
  if (!socket.connected) {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Not connected to the host' },
    } as AckOf<E>;
  }
  try {
    const emitter = socket.timeout(8000) as unknown as UntypedAckEmitter;
    return (await emitter.emitWithAck(event, payload)) as AckOf<E>;
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'The host did not respond' },
    } as AckOf<E>;
  }
}

export function adoptSession(session: SessionInfo): void {
  saveSession(session);
  setState({ session });
}

export function forgetSession(message?: string): void {
  clearSession();
  setState({ session: null, room: null, game: null, restoring: false });
  if (message) pushNotice('info', message, 6000);
}

async function restoreSeat(): Promise<void> {
  const saved = getState().session ?? loadSession();
  if (!saved) return;
  setState({ restoring: true, session: saved });
  const result: Ack<SessionInfo> = await request('room:reconnect', {
    code: saved.roomCode,
    token: saved.reconnectToken,
  });
  if (result.ok) {
    adoptSession(result.data);
    setState({ restoring: false });
  } else if (result.error.code === 'INVALID_TOKEN' || result.error.code === 'ROOM_NOT_FOUND') {
    forgetSession('That room is no longer available. The host may have restarted the server.');
  } else {
    setState({ restoring: false });
  }
}

let started = false;
export function startConnection(): void {
  if (started) return;
  started = true;

  socket.on('connect', () => {
    setState({ connection: 'connected' });
    void restoreSeat();
  });
  socket.on('disconnect', () => setState({ connection: 'disconnected' }));
  socket.io.on('reconnect_attempt', () => setState({ connection: 'connecting' }));
  socket.on('connect_error', () => setState({ connection: 'disconnected' }));

  socket.on('room:state', (room) => {
    setState((s) => ({ room, game: room.status === 'lobby' ? null : s.game }));
  });
  socket.on('game:state', (game) => setState({ game }));
  socket.on('room:closed', ({ reason }) => forgetSession(reason));

  socket.connect();
}
