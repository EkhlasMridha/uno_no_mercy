import type { SessionInfo } from '@nomercy/shared';

/**
 * The reconnect token is kept in sessionStorage (per tab, survives refresh) so a refresh
 * restores the same seat instead of creating a second player. It is a credential, not game
 * state, and never appears in URLs.
 */
const KEY = 'nomercy.session.v1';

export function loadSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionInfo>;
    if (parsed.roomCode && parsed.playerId && parsed.reconnectToken) return parsed as SessionInfo;
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveSession(session: SessionInfo): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: refresh will not restore the seat */
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const NAME_KEY = 'nomercy.name';
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
