import { colorOf, MERCY_HAND_LIMIT, type Card } from '@nomercy/shared';
import { COLOR_BG, sortHand } from '../../lib/cards';

// The last notches before a knockout, tinted as a warning while they're still empty.
const DANGER_FROM = MERCY_HAND_LIMIT - 5;

/** Your hand against the Mercy Rule: one notch per card, in hand order, up to the knockout. */
export function MercyGauge({ hand }: { hand: Card[] }) {
  const sorted = sortHand(hand);
  const label = `${hand.length} of ${MERCY_HAND_LIMIT} cards. The Mercy Rule knocks you out at ${MERCY_HAND_LIMIT}.`;
  return (
    <div role="img" aria-label={label} title={label} className="flex h-2 w-40 gap-px sm:w-44">
      {Array.from({ length: MERCY_HAND_LIMIT }, (_, i) => {
        const card = sorted[i];
        const color = card ? colorOf(card) : null;
        const fill = !card
          ? i >= DANGER_FROM
            ? 'bg-rose-400/30'
            : 'bg-chalk/15'
          : color
            ? COLOR_BG[color]
            : 'bg-[linear-gradient(90deg,#e5383b,#f4c20d,#22a559,#2f6fe0)]';
        return (
          <span
            key={i}
            className={`flex-1 transition-colors duration-300 first:rounded-l-full last:rounded-r-full ${fill}`}
          />
        );
      })}
    </div>
  );
}
