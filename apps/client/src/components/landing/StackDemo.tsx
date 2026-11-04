import { useRef, useState } from 'react';
import { MERCY_HAND_LIMIT, type Card, type CardFace } from '@nomercy/shared';
import { PlayingCard } from '../card/PlayingCard';

interface Penalty {
  value: number;
  card: CardFace;
}

const PENALTIES: Penalty[] = [
  { value: 2, card: { kind: 'draw2', color: 'green' } },
  { value: 4, card: { kind: 'draw4', color: 'blue' } },
  { value: 6, card: { kind: 'wildDraw6' } },
  { value: 10, card: { kind: 'wildDraw10' } },
];

/**
 * A toy version of stacking for the landing page, not the game's rules: those live on the server
 * (docs/RULES.md §5.10). Each answer must be equal or higher, and only +10 answers +10.
 */
export function StackDemo() {
  const [stack, setStack] = useState<Penalty[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  // The stack the last player took, so the demo shows what taking it cost them.
  const [taken, setTaken] = useState<number | null>(null);
  const firstCardRef = useRef<HTMLButtonElement>(null);
  const top = stack[stack.length - 1];
  const total = stack.reduce((sum, p) => sum + p.value, 0);

  const play = (p: Penalty) => {
    if (top && p.value < top.value) {
      setRefusal(`A +${p.value} can't answer a +${top.value}. Play +${top.value} or higher.`);
      setShakeKey((k) => k + 1);
      return;
    }
    setRefusal(null);
    setTaken(null);
    setStack((s) => [...s, p]);
  };

  const take = () => {
    setTaken(total);
    setStack([]);
    setRefusal(null);
    // The Take button goes away with the stack, so focus moves to the cards rather than the page.
    firstCardRef.current?.focus();
  };

  const status =
    total === 0
      ? taken === null
        ? 'Throw a Draw card to start a stack.'
        : taken >= MERCY_HAND_LIMIT
          ? `They took +${taken} and hit ${MERCY_HAND_LIMIT} cards: knocked out. Throw a card to go again.`
          : `They drew ${taken} cards and lost their turn. Throw a card to go again.`
      : total >= MERCY_HAND_LIMIT
        ? `+${total} waiting. Whoever takes this is knocked out by the Mercy Rule.`
        : `+${total} waiting for the next player. Stack again, or take it.`;

  return (
    <div className="panel p-4 sm:p-6">
      <div className="flex min-h-[9.5rem] items-center justify-center sm:min-h-[11rem]">
        {stack.length === 0 ? (
          <div className="flex aspect-[5/7] w-24 items-center justify-center rounded-2xl border-2 border-dashed border-white/20 text-center text-xs text-white/45 sm:w-28">
            The pile
          </div>
        ) : (
          <div className="relative h-[8.5rem] w-24 sm:h-[10rem] sm:w-28" aria-hidden>
            {stack.slice(-6).map((p, i) => (
              <div
                key={stack.length - Math.min(stack.length, 6) + i}
                className="absolute inset-0"
                style={{ transform: `rotate(${((i * 37) % 24) - 12}deg)` }}
              >
                <PlayingCard
                  card={{ ...p.card, id: `cstack${i}` } as Card}
                  size="lg"
                  animate="in"
                  className="!w-24 sm:!w-28"
                />
              </div>
            ))}
          </div>
        )}
        <p
          className={`ml-6 font-display text-5xl tabular-nums sm:text-6xl ${
            total >= MERCY_HAND_LIMIT ? 'text-card-red' : 'text-brass'
          }`}
          aria-hidden
        >
          +{total}
        </p>
      </div>

      <p role="status" aria-live="polite" className="mt-3 min-h-[3rem] text-center text-chalk/85">
        {status}
        {refusal && (
          <span key={shakeKey} className="anim-shake mt-1 block text-sm text-rose-300">
            {refusal}
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-center gap-3">
        {PENALTIES.map((p, i) => {
          const blocked = Boolean(top && p.value < top.value);
          return (
            <button
              key={p.value}
              ref={i === 0 ? firstCardRef : undefined}
              type="button"
              onClick={() => play(p)}
              aria-label={`Stack a +${p.value}${blocked ? ' (too low)' : ''}`}
              className={`rounded-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
                blocked ? 'opacity-45 saturate-50' : 'hoverable:hover:-translate-y-2'
              }`}
            >
              <PlayingCard card={{ ...p.card, id: `cpick${p.value}` } as Card} size="sm" />
            </button>
          );
        })}
        {total > 0 && (
          <button type="button" className="btn-secondary ml-1" onClick={take}>
            Take +{total}
          </button>
        )}
      </div>
    </div>
  );
}
