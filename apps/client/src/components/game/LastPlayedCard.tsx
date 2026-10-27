import type { LastPlay } from '../../hooks/useLastPlay';
import { PlayingCard } from '../card/PlayingCard';

const SIDE = {
  left: '-left-6 -rotate-12',
  right: '-right-6 rotate-12',
  // Phones hide the seat fans, so a side seat's card can turn toward the felt instead of off-screen.
  inwardOnPhone: {
    left: '-left-6 -rotate-12 max-sm:left-auto max-sm:-right-6 max-sm:rotate-12',
    right: '-right-6 rotate-12 max-sm:right-auto max-sm:-left-6 max-sm:-rotate-12',
  },
} as const;

/**
 * The card a player just played, tucked against their avatar until the next player has moved. `side`
 * is the side away from the felt, so it never covers the cards a seat holds toward the middle.
 * `inwardOnPhone` flips it toward the middle on a phone, for seats at the screen's edge.
 */
export function LastPlayedCard({
  play,
  side = 'left',
  inwardOnPhone = false,
}: {
  play: LastPlay;
  side?: 'left' | 'right';
  inwardOnPhone?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -top-5 z-20 drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)] ${
        inwardOnPhone ? SIDE.inwardOnPhone[side] : SIDE[side]
      }`}
    >
      <PlayingCard card={play.card} size="xs" activeColor={play.chosenColor} />
    </span>
  );
}
