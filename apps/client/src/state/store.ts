import { useSyncExternalStore } from 'react';
import type { GameStateView, RoomView, SessionInfo } from '@nomercy/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface Notice {
  id: number;
  kind: 'error' | 'info';
  text: string;
}

export interface AppState {
  connection: ConnectionStatus;
  session: SessionInfo | null;
  room: RoomView | null;
  game: GameStateView | null;
  /** True while trying to restore a seat after a refresh or network drop. */
  restoring: boolean;
  notices: Notice[];
}

/** Client-side view cache. The server stays authoritative; this only mirrors what it sent. */
let state: AppState = {
  connection: 'connecting',
  session: null,
  room: null,
  game: null,
  restoring: false,
  notices: [],
};
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

let noticeId = 0;
export function pushNotice(kind: Notice['kind'], text: string, durationMs = 4000): void {
  const id = ++noticeId;
  setState((s) => ({ notices: [...s.notices.slice(-3), { id, kind, text }] }));
  window.setTimeout(() => dismissNotice(id), durationMs);
}

export function dismissNotice(id: number): void {
  setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
}
