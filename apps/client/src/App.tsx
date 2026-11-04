import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { Toasts } from './components/Toasts';
import { unlockAudio } from './lib/sound';
import { startConnection } from './net/socket';
import { HomePage } from './pages/HomePage';
import { useAppState } from './state/store';

// The lobby and the table load in their own chunks, so a first visit to the landing page doesn't
// download the whole game before it can show anything.
const loadLobby = () => import('./pages/LobbyPage');
const loadGame = () => import('./pages/GamePage');
const LobbyPage = lazy(() => loadLobby().then((m) => ({ default: m.LobbyPage })));
const GamePage = lazy(() => loadGame().then((m) => ({ default: m.GamePage })));

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-white/60">
      <Loader2 className="mr-2 animate-spin" /> {label}
    </div>
  );
}

function Screen() {
  const session = useAppState((s) => s.session);
  const room = useAppState((s) => s.room);
  const game = useAppState((s) => s.game);

  if (!session) return <HomePage />;
  if (!room || room.code !== session.roomCode) return <Waiting label="Joining room…" />;
  if (room.status === 'lobby') {
    return (
      <Suspense fallback={<Waiting label="Opening the lobby…" />}>
        <LobbyPage room={room} meId={session.playerId} />
      </Suspense>
    );
  }
  if (!game) return <Waiting label="Loading table…" />;
  return (
    <Suspense fallback={<Waiting label="Loading table…" />}>
      <GamePage room={room} game={game} />
    </Suspense>
  );
}

/**
 * Fetches the lobby and table chunks once the landing page has settled, so pressing Play rarely
 * waits on a download. Browsers without idle callbacks get a short timeout instead.
 */
function usePrefetchGame() {
  useEffect(() => {
    const prefetch = () => {
      void loadLobby();
      void loadGame();
    };
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 2000);
    return () => clearTimeout(timer);
  }, []);
}

export function App() {
  useEffect(() => startConnection(), []);
  useEffect(() => {
    // A touch only allows audio once the finger lifts, so listen for the release as well as the press.
    // These stay attached: unlockAudio returns at once while audio runs, and the next tap resumes a
    // context the OS suspended.
    const events = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, unlockAudio));
    return () => events.forEach((e) => window.removeEventListener(e, unlockAudio));
  }, []);
  usePrefetchGame();
  return (
    <>
      <Screen />
      <ConnectionOverlay />
      <Toasts />
    </>
  );
}
