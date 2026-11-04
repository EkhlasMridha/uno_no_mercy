import { useState } from 'react';
import { cardName } from '../../lib/cards';
import { PlayingCard } from '../card/PlayingCard';
import { CARD_RULES } from '../modals/RulesPanel';

/**
 * Every action card with what it does. On wide screens, picking a row deals that card large on the
 * felt beside the list; phones have no felt, so their rows are plain reading.
 */
export function CardGallery() {
  const [picked, setPicked] = useState(CARD_RULES.length - 2);
  const featured = CARD_RULES[picked]!;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,19rem)_1fr] lg:gap-10">
      <div className="table-rail sticky top-24 hidden rounded-[2.5rem] p-3 lg:block">
        <div className="table-felt flex flex-col items-center gap-5 rounded-[1.75rem] px-6 py-10">
          <PlayingCard key={featured.card.id} card={featured.card} size="lg" animate="in" />
          <p className="font-display text-2xl text-chalk">{cardName(featured.card)}</p>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {CARD_RULES.map(({ card, text }, i) => {
          const active = i === picked;
          const name = cardName(card);
          return (
            <li
              key={card.id}
              className={`relative flex h-full items-center gap-3 rounded-2xl bg-felt-900/85 p-3 ring-1 ring-white/[0.08] lg:transition ${
                active ? 'lg:bg-brass/10 lg:ring-2 lg:ring-brass' : 'lg:hover:bg-felt-800'
              }`}
            >
              <PlayingCard card={card} size="sm" />
              <div>
                <h3 className="font-display text-lg leading-tight text-chalk">{name}</h3>
                <p className="mt-1 text-sm leading-snug text-chalk/75">{text}</p>
              </div>
              {/* the whole row picks the card, where there is a felt to show it on */}
              <button
                type="button"
                onClick={() => setPicked(i)}
                aria-current={active ? 'true' : undefined}
                aria-label={`Show ${name} on the table`}
                className="absolute inset-0 hidden rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white lg:block"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
