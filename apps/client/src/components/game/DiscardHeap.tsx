import type { CSSProperties } from 'react';
import type { CardColor, PlayedCardEntry, PublicGameView } from '@nomercy/shared';
import { cardName, COLOR_BG } from '../../lib/cards';
import type { NameLookup } from '../../lib/event-text';
import { scatter } from '../../lib/table-geometry';
import { PlayingCard } from '../card/PlayingCard';

/** How many of the most recent plays stay visible on the felt. */
export const HEAP_SIZE = 10;

// The top card burns in the color play continues in, so a wild shows the color it was given.
const TOP_GLOW: Record<CardColor, string> = {
  red: '!shadow-[0_0_0_3px_rgba(255,138,122,0.9),0_0_30px_6px_rgba(229,56,59,0.7)]',
  yellow: '!shadow-[0_0_0_3px_rgba(255,229,138,0.9),0_0_30px_6px_rgba(244,194,13,0.65)]',
  green: '!shadow-[0_0_0_3px_rgba(127,232,156,0.9),0_0_30px_6px_rgba(34,165,89,0.7)]',
  blue: '!shadow-[0_0_0_3px_rgba(140,184,255,0.9),0_0_30px_6px_rgba(47,111,224,0.7)]',
};

interface DiscardHeapProps {
  view: PublicGameView;
  name: NameLookup;
  /** Seat angle of a player, used to lean each card toward whoever threw it. */
  angleOf: (playerId: string) => number | null;
  onShowPlayed: () => void;
}

interface Placement {
  entry: PlayedCardEntry;
  index: number;
  style: CSSProperties;
  toss: CSSProperties | null;
}

function place(
  entry: PlayedCardEntry,
  index: number,
  /** Position within the visible heap (0 = oldest shown), used as its stacking order. */
  depth: number,
  isTop: boolean,
  angle: number | null,
): Placement {
  const rot = (scatter(index, 1) - 0.5) * (isTop ? 16 : 110);
  const jx = (scatter(index, 2) - 0.5) * (isTop ? 6 : 120);
  const jy = (scatter(index, 3) - 0.5) * (isTop ? 6 : 60);
  const rad = angle === null ? 0 : (angle * Math.PI) / 180;
  const pull = angle === null || isTop ? 0 : 22;
  const x = jx + Math.cos(rad) * pull;
  const y = jy + Math.sin(rad) * pull;

  let toss: CSSProperties | null = null;
  if (isTop) {
    // Fly in from the thrower's seat (or straight down for the starting card), expressed in the
    // card's own rotated frame so it lands on its final spot.
    const from = angle === null ? -90 : angle;
    const fr = (from * Math.PI) / 180;
    const dist = 240;
    const vx = Math.cos(fr) * dist;
    const vy = Math.sin(fr) * dist;
    const r = (-rot * Math.PI) / 180;
    toss = {
      '--tx': `calc(${vx * Math.cos(r) - vy * Math.sin(r)} * var(--heap-px))`,
      '--ty': `calc(${vx * Math.sin(r) + vy * Math.cos(r)} * var(--heap-px))`,
      '--tr': `${scatter(index, 4) > 0.5 ? '' : '-'}${Math.round(40 + scatter(index, 5) * 50)}deg`,
    } as CSSProperties;
  }

  return {
    entry,
    index,
    style: {
      transform: `translate(-50%, -50%) translate(calc(${x} * var(--heap-px)), calc(${y} * var(--heap-px))) rotate(${rot}deg)`,
      zIndex: depth,
    },
    toss,
  };
}

/** The last few cards played, lying on the felt the way they landed. */
export function DiscardHeap({ view, name, angleOf, onShowPlayed }: DiscardHeapProps) {
  const history: PlayedCardEntry[] =
    view.playHistory.length > 0
      ? view.playHistory
      : [{ playerId: null, card: view.topCard, chosenColor: null }];
  const start = Math.max(0, history.length - HEAP_SIZE);
  const last = history.length - 1;
  const placements = history
    .slice(start)
    .map((entry, i) =>
      place(
        entry,
        start + i,
        i,
        start + i === last,
        entry.playerId ? angleOf(entry.playerId) : null,
      ),
    );
  const top = history[last];
  const thrower = top.playerId ? name(top.playerId) : null;

  return (
    <button
      type="button"
      onClick={onShowPlayed}
      aria-live="polite"
      aria-label={`Top card: ${cardName(top.card)}${thrower ? `, played by ${thrower}` : ''}. Show all played cards`}
      // --heap-px scales the scatter with the cards, so short screens get a tighter heap.
      className="group relative isolate h-48 w-56 rounded-[40%] [--heap-px:1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-chalk/70 sm:h-60 sm:w-72 short:h-40 short:w-52 short:[--heap-px:0.7px] shorter:h-32 shorter:w-44 shorter:[--heap-px:0.55px] shortest:h-24 shortest:w-36 shortest:[--heap-px:0.42px]"
    >
      <ColorGlow color={view.currentColor} />
      {placements.map((p) => (
        <div
          // Cards can return after a reshuffle, so the history position is the stable key.
          key={p.index}
          className="absolute left-1/2 top-1/2"
          style={p.style}
        >
          <div className={p.toss ? 'anim-toss' : ''} style={p.toss ?? undefined}>
            <PlayingCard
              card={p.entry.card}
              size="lg"
              activeColor={p.entry.chosenColor}
              className={p.toss ? TOP_GLOW[view.currentColor] : ''}
            />
          </div>
        </div>
      ))}
    </button>
  );
}

function ColorGlow({ color }: { color: CardColor }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-2 rounded-full opacity-35 blur-2xl transition-colors duration-500 ${COLOR_BG[color]}`}
    />
  );
}
