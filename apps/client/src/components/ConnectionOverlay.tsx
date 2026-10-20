import { Loader2, WifiOff } from 'lucide-react';
import { useAppState } from '../state/store';
import { forgetSession } from '../net/socket';

/** Full-screen state while the seat is being restored or the host is unreachable. */
export function ConnectionOverlay() {
  const connection = useAppState((s) => s.connection);
  const session = useAppState((s) => s.session);
  const restoring = useAppState((s) => s.restoring);

  if (!session) return null;
  if (connection === 'connected' && !restoring) return null;

  const lost = connection !== 'connected';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-felt-950/85 p-6 backdrop-blur">
      <div className="panel flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        {lost ? <WifiOff size={36} className="text-rose-300" /> : null}
        <Loader2 size={28} className="animate-spin text-white/70" />
        <h2 className="font-display text-2xl">
          {lost ? 'Connection lost' : 'Restoring your seat…'}
        </h2>
        <p className="text-sm text-white/70">
          {lost
            ? 'Trying to reach the host again. Your seat and cards are held for a couple of minutes.'
            : `Rejoining room ${session.roomCode}.`}
        </p>
        {lost && (
          <button type="button" className="btn-ghost text-sm" onClick={() => forgetSession()}>
            Give up and return home
          </button>
        )}
      </div>
    </div>
  );
}
