import { useId, useState } from 'react';
import { MERCY_HAND_LIMIT, MERCY_WARNING_AT, STARTING_HAND_SIZE } from '@nomercy/shared';
import { CardBack } from '../card/PlayingCard';

const BAND_MESSAGE = {
  safe: 'Still safe.',
  danger: `In danger: the knockout comes at ${MERCY_HAND_LIMIT} cards.`,
  out: 'Knocked out by the Mercy Rule.',
} as const;

/** Drag a hand from the deal up to the Mercy Rule's limit and watch the knockout arrive. */
export function MercyMeter() {
  const [cards, setCards] = useState(STARTING_HAND_SIZE);
  const id = useId();
  const out = cards >= MERCY_HAND_LIMIT;
  const left = MERCY_HAND_LIMIT - cards;
  const danger = cards >= MERCY_WARNING_AT;
  const band = out ? 'out' : danger ? 'danger' : 'safe';

  const message = out
    ? `${cards} cards. Knocked out. Your hand is set aside until the next reshuffle.`
    : danger
      ? `${cards} cards. ${left === 1 ? 'One more' : `${left} more`} and you're out.`
      : `${cards} cards. Still safe.`;

  return (
    <div className="panel p-4 sm:p-6">
      <div className="relative mx-auto flex h-24 max-w-md items-end justify-center" aria-hidden>
        {Array.from({ length: cards }, (_, i) => {
          // Narrow enough that a full 25-card hand stays inside the panel on a 360px phone.
          const spread = Math.min(16, 220 / cards);
          const x = (i - (cards - 1) / 2) * spread;
          const angle = (i - (cards - 1) / 2) * Math.min(4, 90 / cards);
          return (
            <CardBack
              key={i}
              size="sm"
              className={`absolute bottom-0 transition-[filter] ${out ? 'grayscale' : ''}`}
              style={{
                transform: `translateX(${x}px) rotate(${angle}deg)`,
                transformOrigin: '50% 120%',
              }}
            />
          );
        })}
        {out && (
          <span className="anim-card-in absolute -top-2 z-10 rounded-full bg-card-red px-4 py-1 font-display text-xl text-white shadow-lifted">
            Knocked out
          </span>
        )}
      </div>

      <label htmlFor={id} className="mt-6 block text-sm font-semibold text-chalk/75">
        Cards in your hand
      </label>
      <input
        id={id}
        type="range"
        min={STARTING_HAND_SIZE}
        max={MERCY_HAND_LIMIT}
        value={cards}
        onChange={(e) => setCards(Number(e.target.value))}
        className={`mt-1 h-11 w-full cursor-pointer ${out ? 'accent-card-red' : danger ? 'accent-orange-400' : 'accent-brass'}`}
        aria-valuetext={`${cards} cards`}
      />
      <p
        className={`mt-2 text-center ${out ? 'text-rose-300' : danger ? 'text-orange-200' : 'text-chalk/80'}`}
      >
        {message}
      </p>
      {/* Spoken only when the hand crosses into danger or out, not on every step of the slider. */}
      <p role="status" aria-live="polite" className="sr-only">
        {band === 'safe' ? '' : BAND_MESSAGE[band]}
      </p>
    </div>
  );
}
