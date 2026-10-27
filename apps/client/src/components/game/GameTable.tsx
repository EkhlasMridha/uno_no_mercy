import { useEffect, useRef, useState, type RefObject } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { PublicGameView } from '@nomercy/shared';
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
  const DirectionIcon = clockwise ? RotateCw : RotateCcw;
  const pileRef = useRef<HTMLButtonElement>(null);

  return (
    // `isolate` keeps every z-index on the table below page-level popups.
    <div className="relative isolate h-full w-full">
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

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-[13%] max-sm:scale-[0.82] short:gap-1.5 short:pb-10">
            <div className="flex flex-col items-center gap-1 landscape:flex-row landscape:gap-6">
              <DrawPile
                pileRef={pileRef}
                count={view.drawCount}
                canDraw={canDraw}
                onDraw={onDraw}
              />
              <DiscardHeap
                view={view}
                name={name}
                angleOf={(id) => angles.get(id) ?? null}
                onShowPlayed={onShowPlayed}
              />
            </div>

            <div className="pill flex-wrap justify-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-sm text-chalk/90">
              <span className="flex items-center gap-2">
                <span
                  className={`h-3.5 w-3.5 rounded-full ring-2 ring-white/70 ${COLOR_BG[view.currentColor]}`}
                  style={{ boxShadow: `0 0 10px 1px ${COLOR_STROKE[view.currentColor]}` }}
                />
                {COLOR_LABEL[view.currentColor]}
              </span>
              <span aria-hidden className="h-4 w-px bg-white/15" />
              <span className="flex items-center gap-1.5">
                <DirectionIcon size={15} />
                {clockwise ? 'Clockwise' : 'Counterclockwise'}
              </span>
              {view.setAsideCount > 0 && (
                <span className="text-chalk/55">{view.setAsideCount} cards set aside</span>
              )}
            </div>

            {view.pendingDraw && (
              <div
                role="status"
                className="anim-toast flex items-center gap-3 rounded-xl bg-rose-700 px-3 py-1.5 shadow-[0_0_28px_-4px_rgba(229,56,59,0.8)] ring-2 ring-rose-300/80"
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

function DrawPile({
  pileRef,
  count,
  canDraw,
  onDraw,
}: {
  pileRef: RefObject<HTMLButtonElement>;
  count: number;
  canDraw: boolean;
  onDraw: () => void;
}) {
  // A thicker deck looks thicker: up to four offset backs underneath.
  const depth = Math.min(4, Math.ceil(count / 25));
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        ref={pileRef}
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={canDraw ? `Draw a card, ${count} left` : `Draw pile, ${count} cards`}
        className={`relative rounded-2xl transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
          canDraw ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'
        }`}
      >
        {Array.from({ length: depth }).map((_, i) => (
          <CardBack
            key={i}
            size="lg"
            className="absolute left-0 top-0"
            style={{ transform: `translate(${(depth - i) * 1.5}px, ${(depth - i) * 2}px)` }}
          />
        ))}
        <CardBack size="lg" className={canDraw ? 'shadow-glow' : ''} />
      </button>
      <span className="pill px-2.5 py-0.5 text-xs tabular-nums text-chalk/80">
        {count === 0 ? 'Empty' : `${count} left`}
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
