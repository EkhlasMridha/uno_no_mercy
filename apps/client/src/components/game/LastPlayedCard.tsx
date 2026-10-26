import type { LastPlay } from '../../hooks/useLastPlay';
import { PlayingCard } from '../card/PlayingCard';

/**
 * The card a player just played, tucked against their avatar until the next player has moved. `side`
 * is the side away from the felt, so it never covers the cards a seat holds toward the middle.
 */
export function LastPlayedCard({
  play,
  side = 'left',
}: {
  play: LastPlay;
  side?: 'left' | 'right';
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -top-5 z-20 drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)] ${
        side === 'left' ? '-left-6 -rotate-12' : '-right-6 rotate-12'
      }`}
    >
      <PlayingCard card={play.card} size="xs" activeColor={play.chosenColor} />
    </span>
  );
}
