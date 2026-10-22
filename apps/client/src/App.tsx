import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { Toasts } from './components/Toasts';
import { unlockAudio } from './lib/sound';
import { startConnection } from './net/socket';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { useAppState } from './state/store';

function Screen() {
  const session = useAppState((s) => s.session);
  const room = useAppState((s) => s.room);
  const game = useAppState((s) => s.game);

  if (!session) return <HomePage />;
  if (!room || room.code !== session.roomCode) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/60">
        <Loader2 className="mr-2 animate-spin" /> Joining room…
      </div>
    );
  }
  if (room.status === 'lobby') return <LobbyPage room={room} meId={session.playerId} />;
  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/60">
        <Loader2 className="mr-2 animate-spin" /> Loading table…
      </div>
    );
  }
  return <GamePage room={room} game={game} />;
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
  return (
    <>
      <Screen />
      <ConnectionOverlay />
      <Toasts />
    </>
  );
}
