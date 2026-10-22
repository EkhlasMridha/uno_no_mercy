import type { SessionInfo } from '@nomercy/shared';
import type { SoundPrefs } from '../lib/sound';

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

const SOUND_KEY = 'nomercy.sound.v1';
const DEFAULT_SOUND: SoundPrefs = {
  cardPlay: true,
  turnReminder: true,
  handExchange: true,
  win: true,
  muted: false,
};
export function loadSoundPrefs(): SoundPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) ?? '{}') as Partial<SoundPrefs>;
    return { ...DEFAULT_SOUND, ...saved };
  } catch {
    return DEFAULT_SOUND;
  }
}
export function saveSoundPrefs(prefs: SoundPrefs): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
