import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { GameEvent, GameLogEntry } from '@nomercy/shared';
import type { NameLookup } from '../../lib/event-text';
import { seatPoint } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';

type Exchange = Extract<GameEvent, { type: 'handsSwapped' | 'handsPassed' }>;

const isExchange = (event: GameEvent): event is Exchange =>
  event.type === 'handsSwapped' || event.type === 'handsPassed';

/** How long a hand takes to reach its new owner, and how long the moment stays on the table. */
const TRAVEL_MS = 1100;
const SHOW_MS = 1700;
/** Hands travel just inside the seats; yours starts and lands clear of the fan over the near edge. */
const REACH = 0.8;
const MY_REACH = 0.55;

interface HandExchangeProps {
  log: GameLogEntry[];
  meId: string;
  name: NameLookup;
  angleOf: (playerId: string) => number | null;
}

/**
 * A 0 or a 7, shown the way it happens at a real table: each hand slides face down to its new
 * owner. Cosmetic only; the new hands are already dealt when this starts.
 */
export function HandExchange({ log, meId, name, angleOf }: HandExchangeProps) {
  const exchange = useLatestExchange(log);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const event = exchange?.event;
  const moves: [string, string][] = !event
    ? []
    : event.type === 'handsSwapped'
      ? [
          [event.playerId, event.targetId],
          [event.targetId, event.playerId],
        ]
      : event.passes.map((p) => [p.fromId, p.toId]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {exchange &&
        !reduced &&
        moves.map(([fromId, toId], i) => {
          const from = angleOf(fromId);
          const to = angleOf(toId);
          if (from === null || to === null) return null;
          return (
            <HandBundle
              key={`${exchange.seq}-${i}`}
              from={from}
              to={to}
              fromReach={fromId === meId ? MY_REACH : REACH}
              toReach={toId === meId ? MY_REACH : REACH}
              route={event?.type === 'handsPassed' ? event.direction : 'across'}
              small={moves.length > 6}
              single={moves.length > 10}
            />
          );
        })}
      <div role="status" aria-live="polite">
        {exchange && <Caption key={exchange.seq} event={exchange.event} meId={meId} name={name} />}
      </div>
    </div>
  );
}

/** Sits just above your hand, which overlaps the near edge of the table (`-mt-20 sm:-mt-28`). */
function Caption({ event, meId, name }: { event: Exchange; meId: string; name: NameLookup }) {
  let text: string;
  let Icon: typeof RotateCw | null = null;
  if (event.type === 'handsSwapped') {
    const [first, second] =
      event.targetId === meId
        ? [name(event.targetId), name(event.playerId)]
        : [name(event.playerId), name(event.targetId)];
    text = `${first} and ${second} swap hands`;
  } else {
    const clockwise = event.direction === 1;
    text = `Everyone passes their hand ${clockwise ? 'clockwise' : 'counterclockwise'}`;
    Icon = clockwise ? RotateCw : RotateCcw;
  }
  return (
    <p className="anim-toast absolute inset-x-0 bottom-16 mx-auto flex w-fit max-w-[80%] items-center gap-2 rounded-md bg-room/90 px-3 py-1.5 text-center font-display text-base leading-tight text-chalk shadow-lifted ring-2 ring-brass sm:bottom-24 sm:text-lg">
      {Icon && <Icon size={16} className="shrink-0 text-brass" aria-hidden />}
      {text}
    </p>
  );
}

/** The newest swap or pass from the log, kept for one showing; the opening log is ignored. */
function useLatestExchange(log: GameLogEntry[]): { seq: number; event: Exchange } | null {
  const lastSeq = useRef<number | null>(null);
  const [current, setCurrent] = useState<{ seq: number; event: Exchange } | null>(null);

  useEffect(() => {
    const newest = log[log.length - 1]?.seq ?? 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    // A new round restarts the log while the table stays mounted, so a lower seq means "from the top".
    const since = newest < lastSeq.current ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const entry = log.filter((e) => e.seq > since && isExchange(e.event)).pop();
    if (entry && isExchange(entry.event)) setCurrent({ seq: entry.seq, event: entry.event });
  }, [log]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [current]);

  return current;
}

interface HandBundleProps {
  from: number;
  to: number;
  fromReach: number;
  toReach: number;
  /** A pass follows the rail in the direction of play; a swap cuts across the felt. */
  route: 1 | -1 | 'across';
  small: boolean;
  /** A crowded pass sends one card back per hand, so the felt isn't buried in movement. */
  single: boolean;
}

function HandBundle({ from, to, fromReach, toReach, route, small, single }: HandBundleProps) {
  const travel = useRef<HTMLDivElement>(null);
  const lift = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const points = routePoints(from, to, fromReach, toReach, route);
    const timing: KeyframeAnimationOptions = {
      duration: TRAVEL_MS,
      easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
      fill: 'forwards',
    };
    const move = travel.current?.animate(
      points.map((p) => ({ left: `${p.x}%`, top: `${p.y}%` })),
      timing,
    );
    // Picked up off the felt, carried, then set down into the new owner's seat.
    const carry = lift.current?.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.82 },
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
      ],
      timing,
    );
    return () => {
      move?.cancel();
      carry?.cancel();
    };
  }, [from, to, fromReach, toReach, route]);

  const start = seatPoint(from, fromReach);
  return (
    <div ref={travel} className="absolute" style={{ left: `${start.x}%`, top: `${start.y}%` }}>
      <div
        ref={lift}
        className="absolute left-0 top-0 flex"
        style={{ transform: 'translate(-50%, -50%)', opacity: 0 }}
      >
        {(single ? [0] : [-14, 0, 14]).map((tilt, i) => (
          <CardBack
            key={tilt}
            size={small ? 'xs' : 'sm'}
            className={`shadow-lifted ${i > 0 ? (small ? '-ml-6' : '-ml-9') : ''}`}
            style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '50% 120%' }}
          />
        ))}
      </div>
    </div>
  );
}

const STEPS = 16;

function routePoints(
  from: number,
  to: number,
  fromReach: number,
  toReach: number,
  route: HandBundleProps['route'],
): { x: number; y: number }[] {
  const steps = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
  if (route !== 'across') {
    // Seat angles grow clockwise, so a clockwise pass sweeps forward round the rail.
    const sweep =
      route === 1 ? (((to - from) % 360) + 360) % 360 : -((((from - to) % 360) + 360) % 360);
    return steps.map((t) => seatPoint(from + sweep * t, fromReach + (toReach - fromReach) * t));
  }
  // Two hands crossing bow out to opposite sides, so they pass each other instead of colliding.
  const a = seatPoint(from, fromReach);
  const b = seatPoint(to, toReach);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const bow = 9;
  const c = {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * bow,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bow,
  };
  return steps.map((t) => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
  }));
}
