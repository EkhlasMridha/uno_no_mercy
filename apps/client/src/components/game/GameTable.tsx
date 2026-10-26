import { useRef, type RefObject } from 'react';
import { ChevronRight, RotateCcw, RotateCw } from 'lucide-react';
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
          <DirectionTrack color={COLOR_STROKE[view.currentColor]} clockwise={clockwise} />
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

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-chalk/80">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-3 w-3 rounded-full ring-2 ring-chalk/80 ${COLOR_BG[view.currentColor]}`}
                />
                {COLOR_LABEL[view.currentColor]}
              </span>
              <span className="flex items-center gap-1.5">
                <DirectionIcon size={14} />
                {clockwise ? 'Clockwise' : 'Counterclockwise'}
              </span>
              {view.setAsideCount > 0 && (
                <span className="text-chalk/55">{view.setAsideCount} cards set aside</span>
              )}
            </div>

            {view.pendingDraw && (
              <div
                role="status"
                className="anim-toast flex items-center gap-3 rounded-md bg-rose-700 px-3 py-1.5 shadow-lifted ring-2 ring-brass"
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
      <span className="text-xs tabular-nums text-chalk/60">
        {count === 0 ? 'Empty' : `${count} left`}
      </span>
    </div>
  );
}

/** A stitched line on the felt in the active color, flowing in the direction of play. */
function DirectionTrack({ color, clockwise }: { color: string; clockwise: boolean }) {
  const chevrons = [
    { left: '50%', top: '7%', rotate: 0 },
    { left: '94%', top: '50%', rotate: 90 },
    { left: '50%', top: '93%', rotate: 180 },
    { left: '6%', top: '50%', rotate: 270 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <ellipse
          cx="50"
          cy="50"
          rx="44"
          ry="43"
          fill="none"
          stroke={color}
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength={100}
          strokeDasharray="0.6 1.4"
          className="anim-track transition-[stroke] duration-500"
          style={clockwise ? undefined : { animationDirection: 'reverse' }}
        />
      </svg>
      {chevrons.map((c) => (
        <ChevronRight
          key={c.rotate}
          size={18}
          strokeWidth={3}
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-colors duration-500"
          style={{
            left: c.left,
            top: c.top,
            color,
            opacity: 0.7,
            transform: `translate(-50%, -50%) rotate(${c.rotate + (clockwise ? 0 : 180)}deg)`,
          }}
        />
      ))}
    </div>
  );
}
