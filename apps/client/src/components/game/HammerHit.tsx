import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@nomercy/shared';
import { HAMMER_BLOW_S, HAMMER_BLOWS } from '../../lib/sound';
import { seatPoint } from '../../lib/table-geometry';
import type { SeatScale } from './TableSeat';

/** Opponents are hit on their avatar; you are hit over your fan, where your tally goes too. */
const REACH = 1;
const MY_REACH = 0.72;
/** Gap from the seat's centre to the top of the avatar, per scale. */
const HEAD_OFFSET: Record<SeatScale, number> = { lg: 34, md: 24, sm: 16 };
/** The mallet's length in pixels, per scale. */
const SIZE: Record<SeatScale, number> = { lg: 64, md: 50, sm: 38 };
/** Where the head's centre sits along the mallet, as a share of its length. */
const HEAD_X = 0.17;
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
 * A mallet bonking the head of whoever takes penalty cards (a stacked penalty or a missed UNO),
 * once per blow of the hammer sound. Cosmetic only; the cards are already in the hand.
 */
export function HammerHit({ log, meId, angleOf, scale }: HammerHitProps) {
  const bonks = useNewPenalties(log);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {bonks.map((bonk) => {
        const angle = angleOf(bonk.playerId);
        if (angle === null) return null;
        const mine = bonk.playerId === meId;
        const point = seatPoint(angle, mine ? MY_REACH : REACH);
        // Seats on the right swing in from the left, so the mallet stays on the stage.
        const flip = point.x > 60;
        const size = SIZE[scale];
        return (
          <div
            key={bonk.seq}
            className="absolute"
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              // Centres the mallet's head over the seat, its striking face on top of the avatar.
              transform: `translate(${-size * (flip ? 1 - HEAD_X : HEAD_X)}px, -${(mine ? 0 : HEAD_OFFSET[scale]) + size * 0.55}px) scaleX(${flip ? -1 : 1})`,
            }}
          >
            <Mallet size={size} delayMs={bonk.delayMs} />
          </div>
        );
      })}
    </div>
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
      delayMs + HAMMER_BLOWS * HAMMER_BLOW_S * 1000 + 250,
    );
    timers.current.add(done);
  }, [log]);

  return bonks;
}

/**
 * A cartoon mallet pivoting on the end of its handle, to the right of the head it hits, with a
 * gold burst at each blow. The swing repeats once per blow of the sound.
 */
function Mallet({ size, delayMs }: { size: number; delayMs: number }) {
  const blow = `${HAMMER_BLOW_S * 1000}ms`;
  const timing = { animationDuration: blow, animationDelay: `${delayMs}ms` };
  return (
    <div
      className="anim-hammer-life relative"
      style={{
        width: size,
        height: size * 0.55,
        animationDelay: `${delayMs}ms`,
        animationDuration: `${HAMMER_BLOWS * HAMMER_BLOW_S * 1000 + 200}ms`,
      }}
    >
      <svg
        viewBox="0 0 64 36"
        className="anim-hammer-swing absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_3px_3px_rgba(0,0,0,0.55)]"
        style={{ ...timing, transformOrigin: '96% 50%', animationIterationCount: HAMMER_BLOWS }}
      >
        {/* The handle runs from the pivot on the right to the head on the left. */}
        <rect x="16" y="15" width="47" height="6" rx="3" className="fill-walnut" />
        <rect x="16" y="15" width="47" height="2" rx="1" className="fill-chalk/25" />
        {/* The head: a chunky block, its striking face pointing down. */}
        <rect
          x="1"
          y="2"
          width="20"
          height="32"
          rx="4"
          className="fill-felt-700 stroke-chalk/80"
          strokeWidth="1.5"
        />
        <rect x="1" y="29" width="20" height="5" rx="2" className="fill-chalk/70" />
        <rect x="4" y="5" width="4" height="22" rx="2" className="fill-chalk/30" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="anim-hammer-star absolute"
        style={{
          ...timing,
          animationIterationCount: HAMMER_BLOWS,
          width: size * 0.5,
          height: size * 0.5,
          left: -size * 0.07,
          top: size * 0.42,
        }}
      >
        <path
          d="M12 1l2.4 6.6L21 5l-3.6 5.4L23 12l-5.6 1.6L21 19l-6.6-2.6L12 23l-2.4-6.6L3 19l3.6-5.4L1 12l5.6-1.6L3 5l6.6 2.6z"
          className="fill-brass stroke-room"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
