import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { WAIT_FOR_REJOIN_MS, type RoomView } from '@nomercy/shared';
import { waitForPlayer } from '../../net/actions';

const WAIT_MINUTES = Math.round(WAIT_FOR_REJOIN_MS / 60_000);

/**
 * A dropped player mid-game (docs/RULES.md §5.16): the next player decides whether the table waits,
 * everyone else sees who is deciding, and while the seat is held everyone sees how to rejoin.
 */
export function RejoinPrompt({ room, meId }: { room: RoomView; meId: string }) {
  const [busy, setBusy] = useState(false);
  const absent = room.players.find((p) => p.waitDeciderId !== null);
  if (!absent) return null;
  const decider = room.players.find((p) => p.id === absent.waitDeciderId);
  const deciding = absent.waitDeciderId === meId;

  const answer = async (wait: boolean) => {
    setBusy(true);
    await waitForPlayer(absent.id, wait);
    setBusy(false);
  };

  const rejoinHow = (lead: string) => (
    <>
      {lead} rejoin with room code{' '}
      <span className="font-display tracking-widest text-chalk">{room.code}</span> and the same
      name, for up to {WAIT_MINUTES} minutes.
    </>
  );

  return (
    <div className="relative z-20 px-3 pt-2 sm:px-4">
      <div className="panel mx-auto flex max-w-3xl flex-col gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
        <WifiOff size={18} aria-hidden className="hidden shrink-0 text-rose-300 sm:block" />
        <div role="status" aria-live="polite" className="min-w-0 flex-1 leading-snug">
          {absent.seatHeld ? (
            <p>
              <span className="font-semibold">Waiting for {absent.name} to rejoin.</span>{' '}
              <span className="text-chalk/70">{rejoinHow('They can')}</span>
            </p>
          ) : deciding ? (
            <p>
              <span className="font-semibold">{absent.name} dropped out. Wait for them?</span>{' '}
              <span className="text-chalk/70">{rejoinHow('If you wait, they can')}</span>
            </p>
          ) : (
            <p>
              <span className="font-semibold">{absent.name} dropped out.</span>{' '}
              <span className="text-chalk/70">
                {decider?.name ?? 'The next player'} is deciding whether to wait for them.
              </span>
            </p>
          )}
        </div>
        {deciding && (
          <div className="flex shrink-0 gap-2">
            {absent.seatHeld ? (
              <button
                type="button"
                className="btn-danger px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void answer(false)}
              >
                Stop waiting
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary px-4 py-1.5 text-sm"
                  disabled={busy}
                  onClick={() => void answer(true)}
                >
                  Wait
                </button>
                <button
                  type="button"
                  className="btn-danger px-3 py-1.5 text-sm"
                  disabled={busy}
                  onClick={() => void answer(false)}
                >
                  Don&apos;t wait
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
