import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Loader2, X } from 'lucide-react';
import {
  GLOBAL_SEARCH_MS,
  MATCH_EMOTE_COOLDOWN_MS,
  MATCH_EMOTES,
  type MatchEmote,
  type MatchSeatView,
} from '@nomercy/shared';
import { PlayerAvatar, avatarGlow } from '../components/PlayerAvatar';
import { ColorSnap } from '../components/search/ColorSnap';
import { avatarsForTable } from '../lib/avatar';
import { cancelSearch, sendEmote } from '../net/actions';
import { useAppState, type SearchEmote, type SearchState } from '../state/store';

/** How long an emote bubble stays over a seat (matches `.anim-emote`). */
const EMOTE_SHOW_MS = 2600;

const EMOTE_NAME: Record<MatchEmote, string> = {
  '👋': 'Wave',
  '😂': 'Laugh',
  '🔥': 'Fire',
  '😎': 'Cool',
  '😬': 'Nervous',
  '🍀': 'Good luck',
};

/** Short rules reminders shown one at a time while the table fills (docs/RULES.md §5). */
const TIPS = [
  'Reach 25 cards and you are out. That is the Mercy Rule.',
  'Draw cards stack: answer a +4 with a +4 or bigger and the total moves on.',
  'Play a 7 and swap hands with any player you choose.',
  'Play a 0 and every hand passes one seat along.',
  'Discard All lets you drop every card of its color in one go.',
  'Color Roulette makes the next player draw until they turn up the color they name.',
  'Skip Everyone skips the whole table, so you play again straight away.',
  'Down to one card? Call UNO before someone catches you.',
  'A +10 can only be answered with another +10.',
];
const TIP_MS = 7000;

/** m:ss for the countdown. */
function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Ticks a few times a second while the page needs it, so the countdown and bubbles stay current. */
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

/** The newest emote from each seat that is still on show. */
function liveEmotes(emotes: SearchEmote[], now: number): Map<string, SearchEmote> {
  const live = new Map<string, SearchEmote>();
  for (const e of emotes) if (now - e.at < EMOTE_SHOW_MS) live.set(e.seatId, e);
  return live;
}

/** The countdown on the felt, inside a ring that empties as the search runs. */
function CountdownRing({ left, found, status }: { left: number; found: boolean; status: string }) {
  const share = found ? 1 : Math.min(1, left / GLOBAL_SEARCH_MS);
  const length = 2 * Math.PI * 46;
  return (
    <div className="relative grid h-32 w-32 place-items-center sm:h-44 sm:w-44 short:h-36 short:w-36 shortest:h-[4.75rem] shortest:w-[4.75rem]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(10,12,26,0.55)" strokeWidth="5" />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="#ffc22e"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
          style={{ filter: 'drop-shadow(0 0 6px rgba(255,194,46,0.55))' }}
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <p className="text-xs text-chalk/75 sm:text-sm shortest:text-[9px]">{status}</p>
        {found ? (
          <Loader2
            size={40}
            className="my-1 animate-spin text-brass shortest:h-6 shortest:w-6"
            aria-hidden
          />
        ) : (
          <p className="font-display text-4xl leading-none tabular-nums sm:text-6xl shortest:text-2xl">
            {clock(left)}
          </p>
        )}
      </div>
    </div>
  );
}

/** Emotes everyone in the match sees over the sender's seat. */
function EmoteBar({ disabled }: { disabled: boolean }) {
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setTimeout(() => setCooling(false), MATCH_EMOTE_COOLDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [cooling]);
  const send = (emote: MatchEmote) => {
    if (cooling) return;
    setCooling(true);
    void sendEmote(emote);
  };
  return (
    <div
      role="group"
      aria-label="Send an emote to the table"
      className="flex items-center gap-1 rounded-full bg-felt-950/70 p-1.5 ring-1 ring-white/10 backdrop-blur"
    >
      {MATCH_EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          disabled={disabled || cooling}
          onClick={() => send(emote)}
          aria-label={`Send ${EMOTE_NAME[emote]}`}
          title={EMOTE_NAME[emote]}
          className="grid h-11 w-11 place-items-center rounded-full text-2xl transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/10 active:scale-90 disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass shortest:h-9 shortest:w-9 shortest:text-xl"
        >
          <span aria-hidden>{emote}</span>
        </button>
      ))}
    </div>
  );
}

/** One rules reminder at a time, changing every few seconds. */
function TipLine() {
  const [at, setAt] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const timer = window.setInterval(() => setAt((i) => (i + 1) % TIPS.length), TIP_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="min-h-[2.5rem] max-w-md text-center text-sm text-chalk/70 shortest:hidden">
      <span key={at} className="anim-toast block">
        <span className="font-semibold text-brass">Tip:</span> {TIPS[at]}
      </span>
    </p>
  );
}

/**
 * The Play global search (docs/RULES.md §5.19): a table whose seats fill as players are found,
 * with the countdown on the felt, emotes for everyone in the match, and a quick game to pass the
 * time. The server deals the table when it is full; this page only shows what it was sent.
 */
export function GlobalSearchPage({ search }: { search: SearchState }) {
  const { view, endsAt } = search;
  const emotes = useAppState((s) => s.searchEmotes);
  const now = useNow(true);
  const left = Math.max(0, endsAt - now);
  const live = liveEmotes(emotes, now);

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

  // Announce each arrival, departure and emote once, for screen readers.
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
  const lastEmote = emotes.at(-1);
  useEffect(() => {
    if (!lastEmote || lastEmote.seatId === view.meId) return;
    const sender = view.players.find((p) => p.id === lastEmote.seatId);
    if (sender) setAnnouncement(`${sender.name}: ${EMOTE_NAME[lastEmote.emote]}`);
  }, [lastEmote, view.meId, view.players]);

  const status = view.found ? 'Match found!' : left > 0 ? 'Finding players' : 'Starting…';
  const waiting = view.tableSize - view.players.length;

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

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-3 py-4 sm:gap-8 sm:px-4 sm:py-8 md:flex-row md:items-center md:gap-12 md:px-8 md:py-4 shortest:flex-row shortest:gap-4 shortest:py-1">
        <div className="flex flex-col items-center gap-3 sm:gap-6 shortest:gap-2">
          {/* The table, with the seats on its rail. Padding keeps the seats inside the page. */}
          <div className="px-10 py-11 sm:px-14 sm:py-14 shortest:px-9 shortest:py-8">
            <div className="table-rail relative aspect-[4/5] w-[min(14.5rem,calc(100vw-7rem))] rounded-[50%] p-3 sm:aspect-[16/10] sm:w-[min(32rem,calc(100vw-9rem),calc((100dvh-19rem)*1.6))] md:w-[min(32rem,calc(100vw-33rem),calc((100dvh-18rem)*1.6))] sm:p-4 shortest:w-[min(26rem,calc(100vw-23rem),calc((100dvh-9.5rem)*1.6))] shortest:p-2.5">
              <div className="table-felt relative flex h-full w-full flex-col items-center justify-center rounded-[50%] text-center">
                <CountdownRing left={left} found={view.found} status={status} />
                <p className="mt-1 text-sm text-chalk/70 shortest:hidden">
                  {view.players.length} of {view.tableSize} players
                </p>
              </div>

              <ul aria-label="Players found">
                {seats.map((player, i) => {
                  const bubble = player ? live.get(player.id) : undefined;
                  return (
                    <li
                      key={player?.id ?? `empty-${i}`}
                      className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 sm:w-28"
                      style={seatSpot(i, view.tableSize)}
                    >
                      {player ? (
                        <>
                          <span className="relative">
                            <span
                              className="anim-card-in block rounded-full"
                              style={avatarGlow(avatarOf(player.id))}
                            >
                              <PlayerAvatar
                                traits={avatarOf(player.id)}
                                className="h-16 w-16 rounded-full shadow-seat sm:h-20 sm:w-20 shortest:h-12 shortest:w-12"
                              />
                            </span>
                            {bubble && (
                              <span
                                key={bubble.id}
                                aria-hidden
                                className="anim-emote pointer-events-none absolute -top-9 left-1/2 z-10 grid h-12 w-12 place-items-center rounded-full bg-chalk text-3xl shadow-card ring-2 ring-brass shortest:-top-7 shortest:h-10 shortest:w-10 shortest:text-2xl"
                              >
                                {bubble.emote}
                              </span>
                            )}
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
                            className="relative grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-white/25 bg-felt-950/60 sm:h-20 sm:w-20 shortest:h-12 shortest:w-12"
                          >
                            <span className="absolute inset-1 animate-[spin_3s_linear_infinite] rounded-full border-2 border-transparent border-t-brass/70" />
                            <span className="text-xl text-chalk/35">?</span>
                          </span>
                          <span className="pill px-2.5 py-0.5 text-xs text-chalk/60 sm:text-sm">
                            Open seat
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <EmoteBar disabled={view.found} />
        </div>

        <div className="flex w-full max-w-[20rem] flex-col items-center gap-4 md:shrink-0 shortest:w-[15.5rem] shortest:shrink-0 shortest:gap-2">
          <ColorSnap frozen={view.found} />
          <p className="text-center text-sm text-chalk/65 shortest:text-xs">
            {view.found
              ? 'Everyone is here. Dealing the cards…'
              : waiting === 1
                ? 'One seat left. The cards are dealt when it fills.'
                : `${waiting} seats left. The cards are dealt when they fill.`}
          </p>
          <TipLine />
        </div>
      </main>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
