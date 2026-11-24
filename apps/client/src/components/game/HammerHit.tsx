import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GameLogEntry } from '@nomercy/shared';
import { HAMMER_IMPACT_S, HAMMER_TOTAL_S } from '../../lib/sound';
import { seatPoint } from '../../lib/table-geometry';
import type { SeatScale } from './TableSeat';

/** Opponents are hit on their avatar; you are hit over your fan, where your tally goes too. */
const REACH = 1;
const MY_REACH = 0.72;
/** Gap from the seat's centre to the top of the avatar, per scale. */
const HEAD_OFFSET: Record<SeatScale, number> = { lg: 34, md: 24, sm: 16 };
/** The mallet's length in pixels, per scale. */
const SIZE: Record<SeatScale, number> = { lg: 76, md: 58, sm: 44 };
/** Where the head's centre sits along the mallet, as a share of its length. */
const HEAD_X = 0.18;
/** The mallet's height as a share of its length, from its viewBox. */
const ASPECT = 40 / 72;
/** A card played in the same update lands first, as the sound waits for it in `useGameSounds`. */
const AFTER_PLAY_MS = 300;

interface Bonk {
  seq: number;
  playerId: string;
  delayMs: number;
}

interface HammerHitProps {
  log: GameLogEntry[];
  meId: string;
  angleOf: (playerId: string) => number | null;
  scale: SeatScale;
}

/**
 * A cartoon mallet bonking the head of whoever takes penalty cards (a stacked penalty or a missed
 * UNO): one slow wind-up, a single blow in time with the hammer sound, and stars round their head.
 * Cosmetic only; the cards are already in the hand.
 */
export function HammerHit({ log, meId, angleOf, scale }: HammerHitProps) {
  const bonks = useNewPenalties(log);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {bonks.map((bonk) => {
        const angle = angleOf(bonk.playerId);
        if (angle === null) return null;
        const mine = bonk.playerId === meId;
        const point = seatPoint(angle, mine ? MY_REACH : REACH);
        return (
          <SeatAnchor
            key={bonk.seq}
            x={point.x}
            y={point.y}
            // Seats on the right swing in from the left, so the mallet stays on the stage.
            flip={point.x > 60}
            headOffset={mine ? 0 : HEAD_OFFSET[scale]}
            size={SIZE[scale]}
            delayMs={bonk.delayMs}
          />
        );
      })}
    </div>
  );
}

/** The width of the measuring box, to read how much the table is scaled down on small phones. */
const PROBE_PX = 100;

/**
 * Marks the seat on the table, then draws the mallet there in a portal on top of the page, so a
 * swing over a top seat is never cut off by the top bar or anything else stacked over the table.
 */
function SeatAnchor({
  x,
  y,
  flip,
  headOffset,
  size,
  delayMs,
}: {
  x: number;
  y: number;
  flip: boolean;
  headOffset: number;
  size: number;
  delayMs: number;
}) {
  const probe = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number; zoom: number } | null>(null);

  useLayoutEffect(() => {
    const rect = probe.current?.getBoundingClientRect();
    if (rect) setSpot({ left: rect.left, top: rect.top, zoom: rect.width / PROBE_PX || 1 });
  }, [x, y]);

  return (
    <>
      <div
        ref={probe}
        className="invisible absolute h-0"
        style={{ left: `${x}%`, top: `${y}%`, width: PROBE_PX }}
      />
      {spot &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[55]"
            style={{
              left: spot.left,
              top: spot.top,
              transformOrigin: '0 0',
              // Centres the mallet's head over the seat, its striking face on top of the avatar.
              transform: `scale(${spot.zoom}) translate(${-size * (flip ? 1 - HEAD_X : HEAD_X)}px, -${headOffset + size * ASPECT}px) scaleX(${flip ? -1 : 1})`,
            }}
          >
            <Mallet size={size} delayMs={delayMs} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Every penalty taken since the last update, each kept for one showing; the opening log is ignored. */
function useNewPenalties(log: GameLogEntry[]): Bonk[] {
  const lastSeq = useRef<number | null>(null);
  const [bonks, setBonks] = useState<Bonk[]>([]);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
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
    const fresh = log.filter((e) => e.seq > since);
    const delayMs = fresh.some((e) => e.event.type === 'cardPlayed') ? AFTER_PLAY_MS : 0;
    // The sound plays one hammer per update, so one bonk per update too, on whoever was hit first.
    const hit = fresh.find(
      (e) =>
        e.event.type === 'cardsDrawn' &&
        (e.event.reason === 'penalty' || e.event.reason === 'unoPenalty'),
    );
    if (hit?.event.type !== 'cardsDrawn') return;
    const bonk: Bonk = { seq: hit.seq, playerId: hit.event.playerId, delayMs };
    setBonks((current) => [...current, bonk]);
    const done = window.setTimeout(
      () => {
        timers.current.delete(done);
        setBonks((current) => current.filter((b) => b.seq !== bonk.seq));
      },
      delayMs + HAMMER_TOTAL_S * 1000 + 100,
    );
    timers.current.add(done);
  }, [log]);

  return bonks;
}

/**
 * A cartoon mallet pivoting on the end of its handle, to the right of the head it hits. It winds
 * up slowly, hangs at the top, comes down hard with its head squashing on the blow, bounces off and
 * settles. A burst marks the blow and dizzy stars circle the victim's head after it.
 */
function Mallet({ size, delayMs }: { size: number; delayMs: number }) {
  const life = { animationDuration: `${HAMMER_TOTAL_S * 1000}ms`, animationDelay: `${delayMs}ms` };
  const impactDelay = `${delayMs + HAMMER_IMPACT_S * 1000}ms`;
  const height = size * ASPECT;
  const burst = size * 0.62;
  const star = Math.round(size * 0.19);
  return (
    <div className="anim-hammer-life relative" style={{ ...life, width: size, height }}>
      <svg
        viewBox="0 0 72 40"
        className="anim-hammer-swing absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_4px_3px_rgba(0,0,0,0.55)]"
        style={{ ...life, transformOrigin: '94.5% 51%' }}
      >
        {/* The handle runs from the knob at the pivot on the right to the head on the left. */}
        <rect
          x="20"
          y="17"
          width="48"
          height="7"
          rx="3.5"
          className="fill-walnut-light stroke-room"
          strokeWidth="2"
        />
        <rect x="23" y="18.5" width="40" height="1.6" rx="0.8" className="fill-chalk/40" />
        <circle
          cx="68"
          cy="20.5"
          r="4.5"
          className="fill-walnut-dark stroke-room"
          strokeWidth="2"
        />
        {/* The head: a barrel in oxblood and brass, its striking face pointing down. */}
        <g className="anim-hammer-squash" style={life}>
          <rect
            x="2"
            y="2"
            width="22"
            height="36"
            rx="7"
            className="fill-oxblood stroke-room"
            strokeWidth="2.5"
          />
          <rect x="2.5" y="7" width="21" height="4" className="fill-brass" />
          <rect x="2.5" y="29" width="21" height="4" className="fill-brass" />
          <rect x="6" y="13" width="3.5" height="13" rx="1.75" className="fill-chalk/35" />
        </g>
      </svg>
      {/* The burst where the face meets the head. */}
      <svg
        viewBox="0 0 40 40"
        className="anim-hammer-burst absolute overflow-visible"
        style={{
          animationDelay: impactDelay,
          width: burst,
          height: burst,
          left: size * HEAD_X - burst / 2,
          top: height - burst / 2,
        }}
      >
        <g className="stroke-chalk" strokeWidth="2.5" strokeLinecap="round">
          <path d="M20 1v5M38 12l-5 2.5M38 28l-5-2.5M2 12l5 2.5M2 28l5-2.5" />
        </g>
        <path
          d="M20 8l3 6.5 7-2.5-2.5 7 6.5 3-6.5 3 2.5 7-7-2.5-3 6.5-3-6.5-7 2.5 2.5-7-6.5-3 6.5-3-2.5-7 7 2.5z"
          className="fill-brass stroke-room"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="22" r="4" className="fill-chalk" />
      </svg>
      {/* Dizzy stars orbiting the victim's head once the blow has landed. */}
      <div
        className="anim-hammer-dizzy absolute"
        style={{ animationDelay: impactDelay, left: size * HEAD_X, top: height + size * 0.06 }}
      >
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="anim-hammer-orbit absolute"
            style={
              {
                width: star,
                height: star,
                margin: -star / 2,
                '--rx': `${size * 0.34}px`,
                '--ry': `${size * 0.09}px`,
                animationDelay: `${(-i * 700) / 3}ms`,
              } as CSSProperties
            }
          >
            <path
              d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z"
              className="fill-brass stroke-room"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}
