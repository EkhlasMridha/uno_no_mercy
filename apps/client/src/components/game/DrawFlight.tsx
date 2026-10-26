import { useEffect, useRef, useState, type RefObject } from 'react';
import { Layers } from 'lucide-react';
import type { GameLogEntry } from '@nomercy/shared';
import { latestPlaySeq } from '../../lib/event-text';
import { seatPoint } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';
import type { SeatScale } from './TableSeat';

/** How long one card takes from the draw pile to its seat, and the gap between cards of a penalty. */
const TRAVEL_MS = 950;
const STAGGER_MS = 120;
/** A big penalty sends a short volley rather than burying the felt; the tally tells the full count. */
const MAX_CARDS = 6;
/** Opponents' cards land on their avatar; yours land on the fan over the near edge. */
const REACH = 1;
const MY_REACH = 0.92;
/** Your tally sits above your fan, which overlaps the near edge of the table. */
const MY_TALLY_REACH = 0.72;
/** How long a tally stays up after the last draw it counts, and how long it takes to fade. */
const TALLY_MS = 1900;
const TALLY_FADE_MS = 220;
/** Gap from the seat's centre to the avatar's top (or the name's bottom when flipped), per scale. */
const TALLY_OFFSET: Record<SeatScale, number> = { lg: 40, md: 34, sm: 28 };

interface Flight {
  seq: number;
  playerId: string;
  count: number;
}

/**
 * Cards a player has drawn in quick succession, or shed with a Discard All, shown in the popup over
 * their seat.
 */
interface Tally {
  /** Positive for cards drawn; negative for cards a Discard All took out of the hand. */
  count: number;
  /** The newest draw it counts. */
  seq: number;
  leaving: boolean;
}

interface DrawFlightProps {
  log: GameLogEntry[];
  meId: string;
  angleOf: (playerId: string) => number | null;
  /** The draw pile on the felt, where every flight starts. */
  pileRef: RefObject<HTMLElement>;
  scale: SeatScale;
}

/**
 * Cards sliding face down from the draw pile to whoever drew them (a single draw, a stacked
 * penalty, a missed UNO or a roulette haul) and a red tally over their seat saying how many. A
 * Discard All puts the same tally up with the cards it shed, as a negative count. Cosmetic only; the
 * cards are already in the hand.
 */
export function DrawFlight({ log, meId, angleOf, pileRef, scale }: DrawFlightProps) {
  const stage = useRef<HTMLDivElement>(null);
  const { flights, tallies } = useNewDraws(log);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  return (
    <div ref={stage} aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {!reduced &&
        flights.map((flight) => {
          const angle = angleOf(flight.playerId);
          if (angle === null) return null;
          return (
            <Volley
              key={flight.seq}
              flight={flight}
              angle={angle}
              reach={flight.playerId === meId ? MY_REACH : REACH}
              stage={stage}
              pileRef={pileRef}
              small={scale === 'sm'}
            />
          );
        })}
      {Object.entries(tallies).map(([playerId, tally]) => {
        const angle = angleOf(playerId);
        if (angle === null) return null;
        const mine = playerId === meId;
        return (
          <DrawTally
            key={playerId}
            tally={tally}
            point={seatPoint(angle, mine ? MY_TALLY_REACH : REACH)}
            offset={mine ? 0 : TALLY_OFFSET[scale]}
          />
        );
      })}
    </div>
  );
}

/** Every draw since the last update, each kept for one showing; the opening log is ignored. */
function useNewDraws(log: GameLogEntry[]): { flights: Flight[]; tallies: Record<string, Tally> } {
  const lastSeq = useRef<number | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const tallyTimers = useRef(new Map<string, number[]>());

  useEffect(() => {
    const timers = tallyTimers.current;
    return () => timers.forEach((ids) => ids.forEach((id) => window.clearTimeout(id)));
  }, []);

  useEffect(() => {
    const newest = log[log.length - 1]?.seq ?? 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    // A new round restarts the log while the table stays mounted, so a lower seq means "from the top".
    const since = newest < lastSeq.current ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const fresh: Flight[] = [];
    const discards: Flight[] = [];
    for (const { seq, event } of log) {
      if (seq > since && event.type === 'cardsDrawn') {
        fresh.push({ seq, playerId: event.playerId, count: event.count });
      }
      // The extras plus the Discard All itself: every card that just left the hand.
      if (seq > since && event.type === 'discardedAll') {
        discards.push({ seq, playerId: event.playerId, count: event.count + 1 });
      }
    }
    // The next play takes down every tally from before it.
    const playSeq = latestPlaySeq(log.filter((e) => e.seq > since));
    if (playSeq > 0) {
      setTallies((current) =>
        Object.fromEntries(Object.entries(current).filter(([, t]) => t.seq > playSeq)),
      );
    }
    discards.forEach((d) => showTally(d.playerId, { count: -d.count, seq: d.seq, leaving: false }));
    if (fresh.length === 0) return;

    setFlights((current) => [...current, ...fresh]);
    const longest = Math.max(...fresh.map((f) => Math.min(f.count, MAX_CARDS)));
    const done = new Set(fresh.map((f) => f.seq));
    window.setTimeout(
      () => setFlights((current) => current.filter((f) => !done.has(f.seq))),
      TRAVEL_MS + STAGGER_MS * longest + 100,
    );

    // Draws close together add up, so drawing until something plays reads +1, +2, +3.
    const added = new Map<string, Flight>();
    for (const f of fresh) {
      const counted = f.seq > playSeq ? f.count : 0;
      added.set(f.playerId, { ...f, count: (added.get(f.playerId)?.count ?? 0) + counted });
    }
    added.forEach((f, playerId) => {
      if (f.count === 0) added.delete(playerId);
    });
    added.forEach(({ count, seq }, playerId) =>
      // A draw adds to a draw tally still showing; a discard tally is a different story, so it restarts.
      showTally(playerId, { count, seq, leaving: false }, (prior) =>
        prior.count > 0 ? prior.count : 0,
      ),
    );
  }, [log]);

  /** Puts a tally up over a seat, or updates it, and takes it down after a while. */
  function showTally(playerId: string, tally: Tally, carried: (prior: Tally) => number = () => 0) {
    setTallies((current) => {
      const prior = current[playerId];
      const base = prior && !prior.leaving ? carried(prior) : 0;
      return { ...current, [playerId]: { ...tally, count: base + tally.count } };
    });
    tallyTimers.current.get(playerId)?.forEach((id) => window.clearTimeout(id));
    tallyTimers.current.set(playerId, [
      window.setTimeout(
        () =>
          setTallies((current) =>
            current[playerId]
              ? { ...current, [playerId]: { ...current[playerId], leaving: true } }
              : current,
          ),
        TALLY_MS,
      ),
      window.setTimeout(() => {
        tallyTimers.current.delete(playerId);
        setTallies((current) => {
          const rest = { ...current };
          delete rest[playerId];
          return rest;
        });
      }, TALLY_MS + TALLY_FADE_MS),
    ]);
  }

  return { flights, tallies };
}

interface DrawTallyProps {
  tally: Tally;
  point: { x: number; y: number };
  /** Pixels between the seat's centre and the popup's tail. */
  offset: number;
}

/**
 * A tag pinned over the player's avatar, its tail pointing at them: red "+N cards" with two card
 * backs for cards drawn, green "−N cards" with the Discard All mark for cards shed.
 */
function DrawTally({ tally, point, offset }: DrawTallyProps) {
  // Seats along the top edge would push the tag off the stage, so it hangs below them instead.
  const below = point.y < 25;
  const shed = tally.count < 0;
  return (
    <div
      className="absolute"
      style={{
        left: `${point.x}%`,
        top: `${point.y}%`,
        transform: below
          ? `translate(-50%, ${offset + 6}px)`
          : `translate(-50%, calc(-100% - ${offset + 6}px))`,
      }}
    >
      <div
        className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg ${shed ? 'bg-ink-green' : 'bg-rose-700'} py-1 pl-1.5 pr-2.5 text-chalk shadow-lifted ring-2 ring-brass ${
          tally.leaving ? 'anim-tally-out' : 'anim-tally-in'
        }`}
        style={{
          transformOrigin: below ? '50% 0%' : '50% 100%',
          // A draw tag waits for the flying cards to land; nothing flies for a discard.
          animationDelay: shed && !tally.leaving ? '0ms' : undefined,
        }}
      >
        {shed ? (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] bg-chalk text-ink-green">
            <Layers size={14} strokeWidth={2.75} aria-hidden />
          </span>
        ) : (
          <CardPair />
        )}
        <span key={tally.count} className="anim-bump font-display text-xl leading-none">
          {shed ? '−' : '+'}
          {Math.abs(tally.count)}
        </span>
        <span className="text-[11px] font-semibold leading-none text-chalk/85">
          {Math.abs(tally.count) === 1 ? 'card' : 'cards'}
        </span>
        <span
          className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 ${shed ? 'bg-ink-green' : 'bg-rose-700'} ${
            below
              ? '-top-[6px] border-l-2 border-t-2 border-brass'
              : '-bottom-[6px] border-b-2 border-r-2 border-brass'
          }`}
        />
      </div>
    </div>
  );
}

/** Two face-down backs, so the tag reads as cards taken rather than points scored. */
function CardPair() {
  return (
    <span className="relative h-5 w-5 shrink-0">
      <span className="absolute left-0 top-0.5 h-4 w-3 -rotate-12 rounded-[3px] border-[1.5px] border-chalk bg-oxblood" />
      <span className="absolute left-2 top-0 h-4 w-3 rotate-12 rounded-[3px] border-[1.5px] border-chalk bg-oxblood" />
    </span>
  );
}

interface VolleyProps {
  flight: Flight;
  angle: number;
  reach: number;
  stage: RefObject<HTMLDivElement>;
  pileRef: RefObject<HTMLElement>;
  small: boolean;
}

function Volley({ flight, angle, reach, stage, pileRef, small }: VolleyProps) {
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const shown = Math.min(flight.count, MAX_CARDS);

  useEffect(() => {
    const box = stage.current?.getBoundingClientRect();
    const pile = pileRef.current?.getBoundingClientRect();
    const from =
      box && pile && box.width > 0 && box.height > 0
        ? {
            x: ((pile.left + pile.width / 2 - box.left) / box.width) * 100,
            y: ((pile.top + pile.height / 2 - box.top) / box.height) * 100,
          }
        : { x: 50, y: 45 };
    const to = seatPoint(angle, reach);
    // A gentle lean toward the seat, as if the card were slid across the felt.
    const tilt = Math.max(-25, Math.min(25, (to.x - from.x) * 0.6));

    const animations = cards.current.map((el, i) =>
      el?.animate(
        [
          {
            left: `${from.x}%`,
            top: `${from.y}%`,
            transform: 'translate(-50%, -50%) scale(1.15) rotate(0deg)',
            opacity: 0,
          },
          { opacity: 1, offset: 0.12 },
          {
            left: `${to.x}%`,
            top: `${to.y}%`,
            transform: `translate(-50%, -50%) scale(0.55) rotate(${tilt}deg)`,
            opacity: 0.9,
            offset: 0.88,
          },
          {
            left: `${to.x}%`,
            top: `${to.y}%`,
            transform: `translate(-50%, -50%) scale(0.4) rotate(${tilt}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: TRAVEL_MS,
          delay: i * STAGGER_MS,
          easing: 'cubic-bezier(0.3, 0.6, 0.25, 1)',
          fill: 'both',
        },
      ),
    );
    return () => animations.forEach((a) => a?.cancel());
  }, [angle, reach, stage, pileRef]);

  return (
    <>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="absolute"
          style={{ opacity: 0 }}
        >
          <CardBack size={small ? 'xs' : 'sm'} className="shadow-lifted" />
        </div>
      ))}
    </>
  );
}
