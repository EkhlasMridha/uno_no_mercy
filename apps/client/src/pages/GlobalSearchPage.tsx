import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Loader2, X } from 'lucide-react';
import type { MatchSeatView } from '@nomercy/shared';
import { PlayerAvatar, avatarGlow } from '../components/PlayerAvatar';
import { avatarsForTable } from '../lib/avatar';
import { cancelSearch } from '../net/actions';
import type { SearchState } from '../state/store';

/** m:ss for the countdown. */
function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Ticks a few times a second while the countdown runs, so it reads smoothly. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * Where seat `i` of `size` sits round the oval, as percentages: you at the bottom, the others
 * clockwise in order of arrival, like the table they are about to sit at.
 */
function seatSpot(i: number, size: number): { left: string; top: string } {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / size;
  return { left: `${50 + 50 * Math.cos(angle)}%`, top: `${50 + 50 * Math.sin(angle)}%` };
}

/**
 * The Play global search (docs/RULES.md §5.19): a table whose seats fill as players are found,
 * with the countdown on the felt. The server deals the table when it is full; this page only shows
 * what it was sent.
 */
export function GlobalSearchPage({ search }: { search: SearchState }) {
  const { view, endsAt } = search;
  const now = useNow(!view.found);
  const left = Math.max(0, endsAt - now);

  // You first, then everyone else in the order they arrived.
  const seats = useMemo(() => {
    const me = view.players.find((p) => p.id === view.meId);
    const others = view.players.filter((p) => p.id !== view.meId);
    const filled: (MatchSeatView | null)[] = me ? [me, ...others] : others;
    while (filled.length < view.tableSize) filled.push(null);
    return filled;
  }, [view]);
  const avatarOf = useMemo(
    () =>
      avatarsForTable(
        view.players.map((p, seat) => ({ ...p, seat, isComputer: false, avatar: p.avatar })),
      ),
    [view.players],
  );

  // Announce each arrival and departure once, for screen readers.
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<MatchSeatView[]>(view.players);
  useEffect(() => {
    const before = previous.current;
    previous.current = view.players;
    const count = `${view.players.length} of ${view.tableSize} players.`;
    if (view.found) {
      setAnnouncement(`Match found. ${count} Dealing the cards.`);
      return;
    }
    const arrived = view.players.filter((p) => !before.some((b) => b.id === p.id));
    const leftSearch = before.filter((b) => !view.players.some((p) => p.id === b.id));
    const names = [
      ...arrived.filter((p) => p.id !== view.meId).map((p) => `${p.name} joined.`),
      ...leftSearch.map((p) => `${p.name} left.`),
    ];
    if (names.length > 0) setAnnouncement(`${names.join(' ')} ${count}`);
  }, [view]);

  const status = view.found
    ? 'Match found!'
    : left > 0
      ? 'Searching for players'
      : 'Starting the match…';

  return (
    <div className="lounge-room flex min-h-[100dvh] flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-felt-950/55 px-4 py-3 backdrop-blur shortest:py-1.5">
        <div className="flex items-center gap-2">
          <Globe size={20} className="text-brass" aria-hidden />
          <h1 className="font-display text-2xl leading-none">Play global</h1>
        </div>
        <button
          type="button"
          className="btn-secondary px-3 py-2 text-sm"
          onClick={() => void cancelSearch()}
          disabled={view.found}
        >
          <X size={16} aria-hidden /> Cancel
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-20 px-12 py-14 sm:px-16 shortest:gap-4 shortest:py-8">
        <div className="table-rail relative aspect-[3/4] w-full max-w-[20rem] rounded-[50%] p-3 sm:aspect-[16/10] sm:w-[min(36rem,calc((100dvh-15rem)*1.6))] sm:max-w-none sm:p-4 shortest:w-[min(36rem,calc((100dvh-8rem)*1.6))] shortest:p-2.5">
          <div className="table-felt relative flex h-full w-full flex-col items-center justify-center rounded-[50%] text-center">
            <p className="text-sm text-chalk/75 sm:text-base">{status}</p>
            <p
              className={`font-display text-6xl leading-none tabular-nums sm:text-7xl shortest:text-5xl ${
                view.found ? 'text-brass' : 'text-chalk'
              }`}
              aria-hidden={view.found}
            >
              {view.found ? (
                <Loader2 size={56} className="mx-auto animate-spin text-brass" aria-hidden />
              ) : (
                clock(left)
              )}
            </p>
            <p className="mt-2 text-sm text-chalk/70">
              {view.players.length} of {view.tableSize} players
            </p>
          </div>

          {/* The seats, on the rail round the felt. */}
          <ul aria-label="Players found">
            {seats.map((player, i) => (
              <li
                key={player?.id ?? `empty-${i}`}
                className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 sm:w-28"
                style={seatSpot(i, view.tableSize)}
              >
                {player ? (
                  <>
                    <span
                      className="anim-card-in block rounded-full"
                      style={avatarGlow(avatarOf(player.id))}
                    >
                      <PlayerAvatar
                        traits={avatarOf(player.id)}
                        className="h-16 w-16 rounded-full shadow-seat sm:h-20 sm:w-20 shortest:h-12 shortest:w-12"
                      />
                    </span>
                    <span className="pill max-w-full px-2.5 py-0.5 text-xs sm:text-sm">
                      <span className="truncate font-semibold">{player.name}</span>
                      {player.id === view.meId && (
                        <span className="shrink-0 text-chalk/60">(you)</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      aria-hidden
                      className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-white/25 bg-felt-950/60 sm:h-20 sm:w-20 shortest:h-12 shortest:w-12"
                    >
                      <span className="h-3 w-3 animate-pulse rounded-full bg-brass/70" />
                    </span>
                    <span className="pill px-2.5 py-0.5 text-xs text-chalk/60 sm:text-sm">
                      Searching…
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        <p className="max-w-md text-center text-sm text-chalk/65 shortest:hidden">
          {view.found
            ? 'Everyone is here. Dealing the cards…'
            : 'The table is dealt as soon as every seat is taken. Keep this page open.'}
        </p>
      </main>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
