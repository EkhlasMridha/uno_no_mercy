import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { Toasts } from './components/Toasts';
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
  return (
    <>
      <Screen />
      <ConnectionOverlay />
      <Toasts />
    </>
  );
}
