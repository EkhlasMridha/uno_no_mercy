import { Bot, Crown, Hand, Skull, WifiOff } from 'lucide-react';
import type { PublicPlayerView } from '@nomercy/shared';
import { seatPosition } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';

export type SeatScale = 'lg' | 'md' | 'sm';

interface TableSeatProps {
  player: PublicPlayerView;
  angle: number;
  scale: SeatScale;
  isCurrent: boolean;
  canCatch: boolean;
  onCatch: () => void;
}

const SCALE: Record<SeatScale, { avatar: string; name: string; fan: number; fanGap: number }> = {
  lg: {
    avatar: 'h-11 w-11 text-xl sm:h-12 sm:w-12',
    name: 'text-sm max-w-[7.5rem]',
    fan: 5,
    fanGap: 60,
  },
  md: {
    avatar: 'h-9 w-9 text-lg sm:h-10 sm:w-10',
    name: 'text-xs max-w-[5.5rem]',
    fan: 3,
    fanGap: 50,
  },
  sm: { avatar: 'h-8 w-8 text-base', name: 'text-[10px] max-w-[4.25rem]', fan: 0, fanGap: 0 },
};

/** A player sitting on the rail: their held cards face the middle of the table. */
export function TableSeat({ player, angle, scale, isCurrent, canCatch, onCatch }: TableSeatProps) {
  const s = SCALE[scale];
  const out = player.status === 'eliminated';
  const danger = player.handCount >= 20 && !out;
  const fan = out ? 0 : Math.min(player.handCount, s.fan);
  const rad = (angle * Math.PI) / 180;

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={seatPosition(angle)}
      aria-label={`${player.name}${player.isComputer ? ', computer' : ''}, ${player.handCount} cards${isCurrent ? ', playing now' : ''}${out ? ', out' : ''}`}
    >
      {fan > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 max-sm:hidden"
          style={{
            transform: `translate(-50%, -50%) translate(${-Math.cos(rad) * s.fanGap}px, ${-Math.sin(rad) * s.fanGap}px) rotate(${angle - 90}deg)`,
          }}
        >
          <div className="flex">
            {Array.from({ length: fan }).map((_, i) => (
              <CardBack
                key={i}
                size="xs"
                className={i > 0 ? '-ml-6' : ''}
                style={{
                  transform: `rotate(${(i - (fan - 1) / 2) * 9}deg)`,
                  transformOrigin: '50% 120%',
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div
        className={`relative flex flex-col items-center gap-1 ${out ? 'opacity-55 grayscale' : ''}`}
      >
        {player.uno === 'declared' && (
          <span className="absolute -top-4 z-10 rounded-sm bg-brass px-1.5 font-display text-xs leading-5 text-room shadow">
            UNO!
          </span>
        )}
        <div
          className={[
            'relative flex shrink-0 items-center justify-center rounded-full bg-leather font-display text-chalk ring-2 shadow-seat',
            s.avatar,
            isCurrent ? 'anim-turn ring-brass' : 'ring-walnut-light/70',
          ].join(' ')}
        >
          {out ? (
            <Skull size={18} aria-hidden />
          ) : player.isComputer ? (
            <Bot size={18} aria-hidden />
          ) : (
            player.name.slice(0, 1).toUpperCase()
          )}
          <span
            key={player.handCount}
            className={[
              'anim-bump absolute -bottom-1 -right-2 min-w-[1.4rem] rounded-full px-1 text-center font-sans text-[11px] font-bold leading-[1.15rem] tabular-nums ring-2 ring-walnut',
              danger ? 'bg-rose-500 text-white' : 'bg-chalk text-room',
            ].join(' ')}
          >
            {player.handCount}
          </span>
        </div>
        <span
          className={[
            'flex items-center gap-1 rounded-sm px-1.5 py-px font-semibold leading-tight shadow',
            s.name,
            isCurrent ? 'bg-brass text-room' : 'bg-room/85 text-chalk',
          ].join(' ')}
        >
          {player.isHost && <Crown size={10} className="shrink-0" aria-label="Host" />}
          <span className="truncate">{player.name}</span>
          {!player.connected && (
            <WifiOff size={10} className="shrink-0 text-rose-300" aria-label="Disconnected" />
          )}
        </span>
        {out && (
          <span className="text-[10px] text-rose-200">
            {player.eliminationReason === 'mercy' ? 'Knocked out' : 'Left'}
          </span>
        )}
        {danger && scale !== 'sm' && (
          <span className="text-[10px] font-semibold text-rose-200">
            {25 - player.handCount} to knockout
          </span>
        )}
      </div>

      {canCatch && (
        <button
          type="button"
          onClick={onCatch}
          className="absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-lg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <Hand size={12} /> Catch
        </button>
      )}
    </div>
  );
}
