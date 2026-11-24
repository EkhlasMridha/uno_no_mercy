import { io, type Socket } from 'socket.io-client';
import {
  CHAT_HISTORY_LIMIT,
  type Ack,
  type ClientToServerEvents,
  type MatchSearchView,
  type ServerToClientEvents,
  type SessionInfo,
} from '@nomercy/shared';
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
  // A proxy that drops the WebSocket upgrade still works over long-polling.
  tryAllTransports: true,
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
  setState({ session: null, room: null, game: null, chat: [], restoring: false });
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

/** A search view with its countdown pinned to this device's clock. */
export function searchState(view: MatchSearchView) {
  return { view, endsAt: Date.now() + view.remainingMs };
}

let started = false;
export function startConnection(): void {
  if (started) return;
  started = true;

  socket.on('connect', () => {
    setState({ connection: 'connected' });
    void restoreSeat();
  });
  socket.on('disconnect', () => {
    // The server drops a search with its socket, so there is nothing to resume.
    if (getState().search) pushNotice('info', 'Lost the connection, so the search stopped.', 6000);
    setState({ connection: 'disconnected', search: null });
  });
  socket.io.on('reconnect_attempt', () => setState({ connection: 'connecting' }));
  socket.on('connect_error', () => setState({ connection: 'disconnected' }));

  socket.on('room:state', (room) => {
    setState((s) => ({ room, game: room.status === 'lobby' ? null : s.game }));
  });
  socket.on('game:state', (game) => setState({ game }));
  socket.on('chat:history', (chat) => setState({ chat }));
  socket.on('chat:message', (message) =>
    setState((s) =>
      s.chat.some((m) => m.id >= message.id)
        ? {}
        : { chat: [...s.chat, message].slice(-CHAT_HISTORY_LIMIT) },
    ),
  );
  socket.on('chat:update', (message) =>
    setState((s) => ({ chat: s.chat.map((m) => (m.id === message.id ? message : m)) })),
  );
  socket.on('room:closed', ({ reason }) => forgetSession(reason));
  socket.on('match:state', (view) => {
    if (getState().search) setState({ search: searchState(view) });
  });
  socket.on('match:found', (session) => {
    adoptSession(session);
    setState({ search: null });
  });
  socket.on('match:closed', ({ reason }) => {
    setState({ search: null });
    pushNotice('info', reason, 6000);
  });

  socket.connect();
}
