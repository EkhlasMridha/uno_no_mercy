import { useEffect, useMemo, useRef } from 'react';
import type { Card } from '@nomercy/shared';
import { sortHand } from '../../lib/cards';
import { PlayingCard } from '../card/PlayingCard';

interface PlayerHandProps {
  hand: Card[];
  playableIds: ReadonlySet<string>;
  isMyTurn: boolean;
  onCardClick: (card: Card) => void;
}

/** Your cards held in a fan over the table edge. */
export function PlayerHand({ hand, playableIds, isMyTurn, onCardClick }: PlayerHandProps) {
  const sorted = useMemo(() => sortHand(hand), [hand]);
  const previous = useRef<Set<string> | null>(null);
  const prevIds = previous.current;
  useEffect(() => {
    previous.current = new Set(hand.map((c) => c.id));
  }, [hand]);

  const overlap =
    sorted.length > 16
      ? '-ml-10 sm:-ml-12'
      : sorted.length > 9
        ? '-ml-7 sm:-ml-9'
        : '-ml-4 sm:-ml-5';

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-chalk/50">No cards in hand</p>;
  }

  // The fan opens wider with more cards, up to a comfortable grip.
  const spread = Math.min(sorted.length * 4, 44);
  const step = sorted.length > 1 ? spread / (sorted.length - 1) : 0;

  return (
    <div className="scroll-thin overflow-x-auto px-4 pb-3 pt-6">
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
              <PlayingCard
                card={card}
                size="md"
                playable={playable}
                dimmed={isMyTurn && !playable}
                onClick={() => onCardClick(card)}
                animate={prevIds && !prevIds.has(card.id) ? 'draw' : null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
