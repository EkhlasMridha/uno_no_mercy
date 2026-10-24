import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

  // The felt's width and one card's, measured so the fan can open to fill the space it has.
  const scroller = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, card: 0 });
  const empty = sorted.length === 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setRoom({
        // Less the scroller's px-4 and the list's px-6, which hold the outer cards' tilted corners.
        width: el.clientWidth - 80,
        card: el.querySelector('li')?.offsetWidth ?? 0,
      });
    measure();
    // Card size follows width and height breakpoints; both resize the scroller too.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [empty]);

  if (empty) {
    return <p className="py-8 text-center text-chalk/50">No cards in hand</p>;
  }

  // Each card bares a strip under the next: as wide as the felt allows, up to three quarters of a
  // card. A big hand may pack tighter, down to a strip that still shows the corner index, then scrolls.
  const cardWidth = room.card;
  const tightest = sorted.length > 16 ? 0.4 : sorted.length > 9 ? 0.55 : 0.75;
  const fit = sorted.length > 1 ? (room.width - cardWidth) / (sorted.length - 1) : cardWidth;
  const strip = Math.max(cardWidth * tightest, Math.min(cardWidth * 0.75, fit));

  // The fan opens wider with more cards, up to a comfortable grip.
  const spread = Math.min(sorted.length * 4, 44);
  const step = sorted.length > 1 ? spread / (sorted.length - 1) : 0;
  // The outermost cards sit lowest in the arc and tip a corner further down as they tilt on their
  // foot. Room for that, plus the shadow, goes under the list so the scroller never clips a corner;
  // the scroller gives it back with a negative margin so the seat below doesn't move.
  const edge = spread / 2;
  const overhang =
    Math.ceil((edge * edge) / 28 + (cardWidth / 2) * Math.sin((edge * Math.PI) / 180)) + 8;

  return (
    <div
      ref={scroller}
      className="scroll-none overflow-x-auto overflow-y-hidden px-4 pb-3 pt-6 short:pb-2 short:pt-4"
      style={{ marginBottom: -overhang }}
    >
      <ul
        className="mx-auto flex w-max items-end px-6"
        style={{ paddingBottom: overhang }}
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
              style={{
                marginLeft: i > 0 ? strip - cardWidth : 0,
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
