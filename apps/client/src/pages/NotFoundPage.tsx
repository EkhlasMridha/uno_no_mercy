import { Home } from 'lucide-react';
import type { Card } from '@nomercy/shared';
import { PlayingCard } from '../components/card/PlayingCard';

// "404" spelled in cards: the Skip's crossed circle stands in for the zero.
const DIGITS: Array<{ card: Card; tilt: string }> = [
  {
    card: { id: 'nf-4a', kind: 'number', color: 'red', value: 4 },
    tilt: '-rotate-12 translate-y-2',
  },
  { card: { id: 'nf-skip', kind: 'skip', color: 'yellow' }, tilt: '' },
  {
    card: { id: 'nf-4b', kind: 'number', color: 'blue', value: 4 },
    tilt: 'rotate-12 translate-y-2',
  },
];

/** Shown for any address that isn't the game. The server answers these with a 404 status. */
export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex items-end gap-3 sm:gap-5" aria-hidden>
        {DIGITS.map(({ card, tilt }) => (
          <PlayingCard key={card.id} card={card} size="lg" className={tilt} />
        ))}
      </div>
      <div>
        <h1 className="font-display text-[clamp(2.25rem,7vw,3.5rem)] leading-[0.95] text-chalk">
          This page got skipped
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-chalk/75">
          There&apos;s nothing at this address. The game is on the home page.
        </p>
      </div>
      <a href="/" className="btn-primary btn-lg">
        <Home size={20} aria-hidden /> Back to the game
      </a>
    </main>
  );
}
