import { useEffect, useMemo, useRef } from 'react';
import type { Card } from '@nomercy/shared';
import type { IdleNudge } from '../../hooks/useGameSounds';
import { sortHand } from '../../lib/cards';
import { PlayingCard } from '../card/PlayingCard';

interface PlayerHandProps {
  hand: Card[];
  playableIds: ReadonlySet<string>;
  isMyTurn: boolean;
  onCardClick: (card: Card) => void;
  /** The idle turn reminder's nudge: each new count replays the cards' hop while it's active. */
  nudge: IdleNudge;
}

/** Your cards held in a fan over the table edge. */
export function PlayerHand({ hand, playableIds, isMyTurn, onCardClick, nudge }: PlayerHandProps) {
  const sorted = useMemo(() => sortHand(hand), [hand]);
  const previous = useRef<Set<string> | null>(null);
  const prevIds = previous.current;
  useEffect(() => {
    previous.current = new Set(hand.map((c) => c.id));
  }, [hand]);

  const overlap =
    sorted.length > 16
      ? '-ml-10 sm:-ml-12 short:-ml-10'
      : sorted.length > 9
        ? '-ml-7 sm:-ml-9 short:-ml-7'
        : '-ml-4 sm:-ml-5 short:-ml-4';

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-chalk/50">No cards in hand</p>;
  }

  // The fan opens wider with more cards, up to a comfortable grip.
  const spread = Math.min(sorted.length * 4, 44);
  const step = sorted.length > 1 ? spread / (sorted.length - 1) : 0;
  // The outermost cards sit lowest in the arc and tip a corner further down as they tilt on their
  // foot (half the widest card, 40px). Lift the fan by that much, plus room for the shadow, so the
  // scroller never clips a corner.
  // const edge = spread / 2;
  // const overhang = Math.ceil((edge * edge) / 28 + 40 * Math.sin((edge * Math.PI) / 180)) + 8;

  return (
    <div className="scroll-none overflow-x-auto overflow-y-hidden px-4 pb-3 pt-6 short:pb-2 short:pt-4">
      <ul
        className="mx-auto flex w-max items-end px-6"
        aria-label={`Your hand, ${sorted.length} cards`}
      >
        {sorted.map((card, i) => {
          const playable = isMyTurn && playableIds.has(card.id);
          const tilt = sorted.length > 1 ? -spread / 2 + i * step : 0;
          // Cards further from the middle sit lower, tracing the arc of the fan.
          const drop = (tilt * tilt) / 28;
          return (
            <li
              key={card.id}
              className={i > 0 ? overlap : ''}
              style={{
                zIndex: i,
                transform: `translateY(${drop}px) rotate(${tilt}deg)`,
                transformOrigin: '50% 100%',
              }}
            >
              {/* Re-keyed on each reminder so the hop replays, rippling across the fan. */}
              <div
                key={nudge.count}
                className={nudge.active ? 'anim-nudge' : undefined}
                style={nudge.active ? { animationDelay: `${Math.min(i * 18, 220)}ms` } : undefined}
              >
                <PlayingCard
                  card={card}
                  size="md"
                  playable={playable}
                  dimmed={isMyTurn && !playable}
                  onClick={() => onCardClick(card)}
                  animate={prevIds && !prevIds.has(card.id) ? 'draw' : null}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
