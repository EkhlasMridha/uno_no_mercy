import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { Shuffle } from 'lucide-react';
import type { Card, CardFace } from '@nomercy/shared';
import { CardBack, PlayingCard } from '../card/PlayingCard';

const face = (card: CardFace, i: number): Card => ({ ...card, id: `cland${i}` }) as Card;

/** The faces the fan can land on: heavy on the No Mercy cards, so every deal shows some. */
const POOL: Card[] = [
  { kind: 'wildDraw10' },
  { kind: 'wildDraw6' },
  { kind: 'wildColorRoulette' },
  { kind: 'wildReverseDraw4' },
  { kind: 'skipEveryone', color: 'red' },
  { kind: 'discardAll', color: 'blue' },
  { kind: 'draw4', color: 'yellow' },
  { kind: 'draw2', color: 'green' },
  { kind: 'number', color: 'blue', value: 7 },
  { kind: 'number', color: 'red', value: 0 },
  { kind: 'skip', color: 'yellow' },
  { kind: 'reverse', color: 'green' },
  { kind: 'number', color: 'green', value: 3 },
  { kind: 'number', color: 'yellow', value: 9 },
  { kind: 'skipEveryone', color: 'blue' },
  { kind: 'draw2', color: 'red' },
  { kind: 'discardAll', color: 'yellow' },
  { kind: 'number', color: 'red', value: 5 },
].map((c, i) => face(c as CardFace, i));

const CARDS = 9;
const FAN_RADIUS = 340;

type Phase = 'deck' | 'split' | 'riffle' | 'fan';

/** One shuffle: two riffles, then the deal fans out face up. Durations in ms. */
const SEQUENCE: Array<[Phase, number]> = [
  ['deck', 700],
  ['split', 620],
  ['riffle', 620],
  ['split', 620],
  ['riffle', 720],
  ['fan', 3600],
];

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const dealFaces = () => shuffled(POOL).slice(0, CARDS);

function transformFor(phase: Phase, slot: number, card: number, fanStep: number): string {
  const base = 'translate(-50%, -50%)';
  switch (phase) {
    case 'deck':
    case 'riffle':
      return `${base} translate(${slot * -0.7}px, ${slot * -1.4}px) rotate(${((card % 3) - 1) * 1.6}deg)`;
    case 'split': {
      const left = card % 2 === 0;
      return `${base} translate(${left ? -78 : 78}px, ${-slot * 1.2 - 10}px) rotate(${left ? -12 : 12}deg)`;
    }
    case 'fan': {
      // Rotate about a point far below the deck, so the fan curves like a hand of cards.
      const angle = (slot - (CARDS - 1) / 2) * fanStep;
      return `${base} translateY(${FAN_RADIUS}px) rotate(${angle}deg) translateY(${-20 - FAN_RADIUS}px)`;
    }
  }
}

/** Whether a media query matches, kept up to date when the setting or the window changes. */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Deals shown before the deck rests on its fan, so the motion doesn't run on forever. */
const DEALS = 2;

/**
 * The hero: a deck that riffles twice and deals a fan of No Mercy cards, twice while it is on
 * screen, then rests. Purely cosmetic. Under reduced motion it shows a still fan and only
 * re-deals on request.
 */
export function ShuffleDeck() {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  // A phone's fan spreads less, so its outer cards stay on screen.
  const wide = useMedia('(min-width: 640px)');
  const [step, setStep] = useState(0);
  const [dealsLeft, setDealsLeft] = useState(DEALS);
  const [faces, setFaces] = useState(dealFaces);
  // Which slot in the pile each card sits in; a riffle reorders it.
  const [order, setOrder] = useState(() => Array.from({ length: CARDS }, (_, i) => i));
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const phase: Phase = reduced ? 'fan' : SEQUENCE[step]![0];
  const resting = reduced || (phase === 'fan' && dealsLeft <= 1);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (resting || !visible) return;
    const timer = window.setTimeout(() => {
      const next = (step + 1) % SEQUENCE.length;
      const nextPhase = SEQUENCE[next]![0];
      if (next === 0) setDealsLeft((d) => d - 1);
      if (nextPhase === 'riffle') setOrder((o) => shuffled(o));
      // The faces change while every card shows its back, so the swap is never seen.
      if (nextPhase === 'split' && step === 0) setFaces(dealFaces());
      setStep(next);
    }, SEQUENCE[step]![1]);
    return () => window.clearTimeout(timer);
  }, [step, visible, resting]);

  const reshuffle = useCallback(() => {
    if (reduced) {
      setFaces(dealFaces());
      return;
    }
    setDealsLeft(1);
    setStep(0);
  }, [reduced]);

  const fanned = phase === 'fan';

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      <div
        className="relative h-[13rem] w-full max-w-[26rem] sm:h-[20rem] [perspective:1200px]"
        aria-hidden
      >
        {/* the felt light the deck sits in */}
        <div className="absolute left-1/2 top-[58%] h-40 w-[22rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(122,70,210,0.45),transparent_70%)] blur-xl" />
        {faces.map((card, i) => {
          const slot = order[i]!;
          const style: CSSProperties = {
            transform: transformFor(phase, slot, i, wide ? 8 : 5),
            zIndex: slot + 1,
            transitionDelay:
              phase === 'riffle' ? `${slot * 38}ms` : phase === 'fan' ? `${slot * 55}ms` : '0ms',
          };
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 transition-transform duration-500 ease-[cubic-bezier(0.25,0.8,0.3,1)]"
              style={style}
            >
              <div
                className="relative transition-transform duration-500 [transform-style:preserve-3d]"
                style={{
                  transform: fanned ? 'rotateY(0deg)' : 'rotateY(180deg)',
                  transitionDelay: fanned ? `${120 + slot * 55}ms` : '0ms',
                }}
              >
                <div className="[backface-visibility:hidden]">
                  <PlayingCard card={card} size="lg" className="!shadow-lifted" />
                </div>
                <CardBack
                  size="lg"
                  className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Only once the deck rests, so it never sits beside the page's actions mid-shuffle. */}
      <button
        type="button"
        className={`btn-ghost btn-nav mt-1 ${resting ? '' : 'invisible'}`}
        tabIndex={resting ? undefined : -1}
        aria-hidden={!resting}
        onClick={reshuffle}
      >
        <Shuffle size={16} aria-hidden /> Shuffle again
      </button>
    </div>
  );
}
