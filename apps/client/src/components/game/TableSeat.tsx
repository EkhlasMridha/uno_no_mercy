import { Crown, Hand, Skull, WifiOff } from 'lucide-react';
import type { PublicPlayerView } from '@nomercy/shared';
import type { LastPlay } from '../../hooks/useLastPlay';
import { cardName } from '../../lib/cards';
import { seatPosition } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';
import type { AvatarTraits } from '../../lib/avatar';
import { avatarGlow, PlayerAvatar } from '../PlayerAvatar';
import { LastPlayedCard } from './LastPlayedCard';

export type SeatScale = 'lg' | 'md' | 'sm';

interface TableSeatProps {
  player: PublicPlayerView;
  avatar: AvatarTraits;
  angle: number;
  scale: SeatScale;
  isCurrent: boolean;
  canCatch: boolean;
  onCatch: () => void;
  /** This player's card, while it is the last play and the next player hasn't finished their move. */
  lastPlayed: LastPlay | null;
}

const SCALE: Record<SeatScale, { avatar: string; name: string; fan: number; fanGap: number }> = {
  lg: {
    avatar:
      'h-12 w-12 sm:h-[4.5rem] sm:w-[4.5rem] short:h-12 short:w-12 shortest:h-10 shortest:w-10',
    name: 'text-sm max-w-[7.5rem]',
    fan: 5,
    fanGap: 74,
  },
  md: {
    avatar: 'h-10 w-10 sm:h-12 sm:w-12 short:h-10 short:w-10 shortest:h-9 shortest:w-9',
    name: 'text-xs max-w-[5.5rem]',
    fan: 3,
    fanGap: 52,
  },
  sm: { avatar: 'h-8 w-8', name: 'text-[10px] max-w-[4.25rem]', fan: 0, fanGap: 0 },
};

/** A player sitting on the rail: their held cards face the middle of the table. */
export function TableSeat({
  player,
  avatar,
  angle,
  scale,
  isCurrent,
  canCatch,
  onCatch,
  lastPlayed,
}: TableSeatProps) {
  const s = SCALE[scale];
  const out = player.status === 'eliminated';
  const danger = player.handCount >= 20 && !out;
  const fan = out ? 0 : Math.min(player.handCount, s.fan);
  const rad = (angle * Math.PI) / 180;

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={seatPosition(angle)}
      aria-label={`${player.name}${player.isComputer ? ', computer' : ''}, ${player.handCount} cards${isCurrent ? ', playing now' : ''}${out ? ', out' : ''}${lastPlayed ? `, played ${cardName(lastPlayed.card)}` : ''}`}
    >
      {fan > 0 && (
        <div
          aria-hidden
          // Short screens pull the fan in so it stays clear of the cards in the middle.
          className="pointer-events-none absolute left-1/2 top-1/2 [--fan-px:1px] max-sm:hidden short:[--fan-px:0.75px] shorter:[--fan-px:0.6px] shortest:[--fan-px:0.5px]"
          style={{
            transform: `translate(-50%, -50%) translate(calc(${-Math.cos(rad) * s.fanGap} * var(--fan-px)), calc(${-Math.sin(rad) * s.fanGap} * var(--fan-px))) rotate(${angle - 90}deg)`,
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
            'relative shrink-0 rounded-full',
            s.avatar,
            isCurrent ? 'anim-turn' : '',
          ].join(' ')}
          // Each seat glows in its avatar's color; on the current turn the gold pulse replaces it.
          style={isCurrent ? undefined : avatarGlow(avatar)}
        >
          {isCurrent && !out && <span aria-hidden className="turn-orbit" />}
          <PlayerAvatar traits={avatar} className="h-full w-full" />
          {lastPlayed && (
            <LastPlayedCard
              key={lastPlayed.seq}
              play={lastPlayed}
              side={Math.cos(rad) < -0.3 ? 'left' : 'right'}
              inwardOnPhone={Math.abs(Math.cos(rad)) > 0.3}
            />
          )}
          {out && (
            <span
              aria-hidden
              className="absolute -left-1.5 -top-1 flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-full bg-chalk text-room ring-2 ring-felt-950"
            >
              <Skull size={11} strokeWidth={2.5} />
            </span>
          )}
          <span
            key={player.handCount}
            className={[
              'anim-bump absolute -bottom-1 -right-2 z-10 min-w-[1.4rem] rounded-full px-1 text-center font-sans text-[11px] font-bold leading-[1.15rem] tabular-nums ring-2',
              danger
                ? 'bg-rose-500 text-white ring-rose-200'
                : 'bg-felt-950 text-chalk ring-chalk/90',
            ].join(' ')}
          >
            {player.handCount}
          </span>
        </div>
        <span
          className={[
            'relative -mt-1.5 flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold leading-tight shadow-lg ring-1',
            s.name,
            isCurrent
              ? 'bg-brass text-room ring-brass-soft'
              : 'bg-felt-950/90 text-chalk ring-white/15',
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
            {player.handCount >= 25 ? 'Last chance' : `${25 - player.handCount} to knockout`}
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
