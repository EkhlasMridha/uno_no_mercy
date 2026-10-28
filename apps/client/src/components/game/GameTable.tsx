import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CardColor, PublicGameView } from '@nomercy/shared';
import { COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import type { TableAvatars } from '../../lib/avatar';
import type { NameLookup } from '../../lib/event-text';
import { seatAngle } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';
import { DiscardHeap } from './DiscardHeap';
import { DrawFlight } from './DrawFlight';
import { HandExchange } from './HandExchange';
import { RouletteReveal } from './RouletteReveal';
import { TableSeat, type SeatScale } from './TableSeat';
import type { LastPlay } from '../../hooks/useLastPlay';

interface GameTableProps {
  view: PublicGameView;
  meId: string;
  name: NameLookup;
  avatarOf: TableAvatars;
  canDraw: boolean;
  catchableIds: readonly string[];
  targetName: string | null;
  onDraw: () => void;
  onCatch: (playerId: string) => void;
  onShowPlayed: () => void;
  /** The last play, shown on its player's seat until the next player finishes their move. */
  lastPlay: LastPlay | null;
}

const COLOR_STROKE = {
  red: '#e5383b',
  yellow: '#f4c20d',
  green: '#22a559',
  blue: '#2f6fe0',
} as const;

/** The whole table seen from above: walnut rail, felt, everyone seated around it. */
export function GameTable({
  view,
  meId,
  name,
  avatarOf,
  canDraw,
  catchableIds,
  targetName,
  onDraw,
  onCatch,
  onShowPlayed,
  lastPlay,
}: GameTableProps) {
  const count = view.players.length;
  const myIndex = Math.max(
    view.players.findIndex((p) => p.id === meId),
    0,
  );
  const angles = new Map(
    view.players.map((p, i) => [p.id, seatAngle((i - myIndex + count) % count, count)]),
  );
  const opponents = view.players.filter((p) => p.id !== meId);
  const scale: SeatScale = count <= 6 ? 'lg' : count <= 10 ? 'md' : 'sm';
  const clockwise = view.direction === 1;
  const pileRef = useRef<HTMLButtonElement>(null);

  return (
    // `isolate` keeps every z-index on the table below page-level popups.
    // The seat insets match the widest seat tags and the tallest avatars, so no seat leaves the screen.
    <div className="relative isolate h-full w-full [--seat-inset-top:2.75rem] [--seat-inset:2.6rem] sm:[--seat-inset-top:3.5rem] sm:[--seat-inset:3.5rem] shortest:[--seat-inset-top:2rem] short:[--seat-low-reach:0.8] max-sm:[@media(max-height:720px)]:[--seat-low-reach:0.85] shortest:[--seat-low-reach:0.7]">
      {/* rail */}
      <div className="table-rail absolute inset-x-[5%] inset-y-[9%] rounded-[50%] p-[clamp(12px,2.2vmin,22px)]">
        {/* felt */}
        <div className="table-felt relative h-full w-full overflow-hidden rounded-[50%]">
          {/* the house mark pressed into the felt */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex -rotate-6 select-none items-center justify-center whitespace-nowrap font-display text-[clamp(3rem,11vmin,8.5rem)] text-white/[0.035]"
          >
            No Mercy
          </span>
          <DirectionTrack clockwise={clockwise} />
          <RouletteReveal view={view} meId={meId} name={name} canDraw={canDraw} onDraw={onDraw} />

          <div className="absolute inset-0 flex flex-col items-center justify-center pb-[13%] max-sm:scale-[0.82] max-sm:[@media(max-height:720px)]:scale-[0.72] short:pb-10 shortest:pb-3">
            {/* Only the piles take part in the layout: the penalty floats under them, so a stack
                building up never pushes the heap into the seats above. */}
            <div className="relative flex flex-col items-center gap-1 landscape:flex-row landscape:gap-6">
              <div className="flex items-end gap-4 short:gap-3 shortest:gap-2">
                <ColorInPlay color={view.currentColor} clockwise={clockwise} />
                <DrawPile
                  pileRef={pileRef}
                  log={view.log}
                  count={view.drawCount}
                  refillable={view.discardCount > 1 || view.setAsideCount > 0}
                  setAside={view.setAsideCount}
                  canDraw={canDraw}
                  onDraw={onDraw}
                />
              </div>
              <DiscardHeap
                view={view}
                name={name}
                angleOf={(id) => angles.get(id) ?? null}
                onShowPlayed={onShowPlayed}
              />

              {view.pendingDraw && (
                <div
                  role="status"
                  className="anim-toast absolute inset-x-0 top-full z-20 mx-auto mt-1 flex w-max items-center gap-3 rounded-xl bg-rose-700 px-3 py-1.5 shadow-[0_0_28px_-4px_rgba(229,56,59,0.8)] ring-2 ring-rose-300/80"
                >
                  <span className="font-display text-3xl leading-none text-chalk">
                    +{view.pendingDraw.total}
                  </span>
                  {targetName && (
                    <span className="max-w-[13rem] text-xs leading-snug text-chalk/90">
                      {targetName === 'You' ? 'You must' : `${targetName} must`} stack +
                      {view.pendingDraw.lastValue} or higher, or take them
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {opponents.map((p) => (
        <TableSeat
          key={p.id}
          player={p}
          avatar={avatarOf(p.id)}
          angle={angles.get(p.id) ?? 270}
          scale={scale}
          isCurrent={p.id === view.currentPlayerId}
          canCatch={catchableIds.includes(p.id)}
          onCatch={() => onCatch(p.id)}
          lastPlayed={lastPlay?.playerId === p.id ? lastPlay : null}
        />
      ))}

      <DrawFlight
        log={view.log}
        meId={meId}
        angleOf={(id) => angles.get(id) ?? null}
        pileRef={pileRef}
        scale={scale}
      />

      <HandExchange
        log={view.log}
        meId={meId}
        name={name}
        angleOf={(id) => angles.get(id) ?? null}
      />
    </div>
  );
}

/**
 * The seq of a reshuffle that happened while this table was open, or null. One already in the log
 * when the table mounts (a reload or reconnect) doesn't count, so it isn't replayed.
 */
function useFreshReshuffle(log: PublicGameView['log']): number | null {
  const latest = [...log].reverse().find((e) => e.event.type === 'drawPileReshuffled')?.seq ?? null;
  const [onMount] = useState(latest);
  return latest !== null && latest !== onMount ? latest : null;
}

function DrawPile({
  pileRef,
  log,
  count,
  refillable,
  setAside,
  canDraw,
  onDraw,
}: {
  pileRef: RefObject<HTMLButtonElement>;
  log: PublicGameView['log'];
  count: number;
  /** Whether a reshuffle would find cards: discards under the top card, or set-aside hands. */
  refillable: boolean;
  /** Cards out of play for the rest of the round, mentioned beside the pile's count. */
  setAside: number;
  canDraw: boolean;
  onDraw: () => void;
}) {
  // A thicker deck looks thicker: up to four offset backs underneath.
  const depth = Math.min(4, Math.ceil(count / 25));
  const reshuffle = useFreshReshuffle(log);
  const drawRefills = count === 0 && canDraw && refillable;
  return (
    <div className="flex flex-col items-center gap-3 shortest:gap-1">
      <button
        ref={pileRef}
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={
          count === 0
            ? `Draw pile is empty${drawRefills ? '. Draw to reshuffle the discards into a new pile' : ''}`
            : canDraw
              ? `Draw a card, ${count} left`
              : `Draw pile, ${count} cards`
        }
        className={`relative rounded-2xl transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
          canDraw ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'
        }`}
      >
        {count === 0 ? (
          // The spot where the deck sat, until a draw gathers the discards into a new one.
          <span className="relative block">
            <CardBack size="lg" className="invisible" />
            <span
              aria-hidden
              className={`absolute inset-0 rounded-2xl border-2 border-dashed short:rounded-xl ${
                drawRefills ? 'border-brass/80 shadow-glow' : 'border-chalk/30'
              }`}
            />
          </span>
        ) : (
          // Keyed by the reshuffle, so each new deck riffles once as it lands.
          <span key={reshuffle ?? 'deck'} className={`block ${reshuffle ? 'anim-riffle' : ''}`}>
            {Array.from({ length: depth }).map((_, i) => (
              <CardBack
                key={i}
                size="lg"
                className="absolute left-0 top-0"
                style={{ transform: `translate(${(depth - i) * 1.5}px, ${(depth - i) * 2}px)` }}
              />
            ))}
            <CardBack size="lg" className={canDraw ? 'shadow-glow' : ''} />
          </span>
        )}
      </button>
      <span className="pill px-2.5 py-0.5 text-xs tabular-nums text-chalk/80">
        {count === 0 ? (drawRefills ? 'Empty: draw to reshuffle' : 'Empty') : `${count} left`}
        {setAside > 0 && `, ${setAside} set aside`}
      </span>
    </div>
  );
}

/** The color play continues in, as a chip lying beside the deck. Direction shows on the felt's arrows. */
function ColorInPlay({ color, clockwise }: { color: CardColor; clockwise: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 shortest:gap-1">
      <span
        aria-hidden
        className={`relative h-16 w-16 rounded-full ring-4 ring-white/85 transition-colors duration-500 short:h-12 short:w-12 shorter:h-11 shorter:w-11 shortest:h-10 shortest:w-10 ${COLOR_BG[color]}`}
        style={{
          boxShadow: `0 0 22px 4px ${COLOR_STROKE[color]}, 0 6px 10px -2px rgba(0,0,0,0.6)`,
        }}
      >
        {/* the chip's inlaid edge */}
        <span className="absolute inset-[18%] rounded-full border-2 border-dashed border-white/70" />
      </span>
      <span role="status" className="pill px-2.5 py-0.5 text-xs text-chalk/90">
        {COLOR_LABEL[color]}
        <span className="sr-only">
          {' '}
          is in play, going {clockwise ? 'clockwise' : 'counterclockwise'}
        </span>
      </span>
    </div>
  );
}

// A violet a few shades up from the felt, so the arrows read as part of the cloth.
const TRACK = '#b49cff';
// One arrow per corner of the felt, centered on the diagonals (screen angles, y pointing down).
const ARROW_CENTERS = [-135, -45, 45, 135];
const ARROW_SPAN = 18;

/** Four curved arrows round the felt, pointing the way play goes. */
function DirectionTrack({ clockwise }: { clockwise: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Drawn in real pixels, not a stretched viewBox, so the heads keep their shape on any felt.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const arrows = (() => {
    if (!size || size.w === 0) return [];
    const { w, h } = size;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.45;
    const ry = h * 0.44;
    const head = Math.max(6, Math.min(12, w / 80));
    const at = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t), t };
    };
    return ARROW_CENTERS.map((center) => {
      const from = at(center - (clockwise ? ARROW_SPAN : -ARROW_SPAN));
      const to = at(center + (clockwise ? ARROW_SPAN : -ARROW_SPAN));
      // Tangent at the tip, in the direction of travel.
      const sign = clockwise ? 1 : -1;
      const dx = -rx * Math.sin(to.t) * sign;
      const dy = ry * Math.cos(to.t) * sign;
      const len = Math.hypot(dx, dy);
      const back = Math.atan2(-dy / len, -dx / len);
      const wing = (a: number) =>
        `${to.x + head * Math.cos(back + a)} ${to.y + head * Math.sin(back + a)}`;
      return {
        key: center,
        arc: `M${from.x} ${from.y}A${rx} ${ry} 0 0 ${clockwise ? 1 : 0} ${to.x} ${to.y}`,
        tip: `M${wing(0.5)}L${to.x} ${to.y}L${wing(-0.5)}`,
      };
    });
  })();

  return (
    <div ref={boxRef} aria-hidden className="pointer-events-none absolute inset-0">
      {size && (
        <svg
          width={size.w}
          height={size.h}
          className="absolute inset-0 drop-shadow-[0_0_5px_rgba(150,110,255,0.65)]"
          fill="none"
          stroke={TRACK}
          strokeOpacity="0.7"
          strokeWidth={Math.max(1.5, Math.min(3, size.w / 400))}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {arrows.map((a) => (
            <g key={a.key}>
              <path d={a.arc} />
              <path d={a.tip} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
