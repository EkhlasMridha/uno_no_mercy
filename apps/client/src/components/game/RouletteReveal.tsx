import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { colorOf, type Card, type CardColor, type PublicGameView } from '@nomercy/shared';
import { COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import type { NameLookup } from '../../lib/event-text';
import { PlayingCard } from '../card/PlayingCard';

/** How long the finished reveal stays on the table before the cards go to the hand. */
const LINGER_MS = 2600;

interface RevealShown {
  victimId: string;
  color: CardColor;
  cards: Card[];
  /** null while still drawing. */
  outcome: { matched: boolean } | null;
}

interface RouletteRevealProps {
  view: PublicGameView;
  meId: string;
  name: NameLookup;
  canDraw: boolean;
  onDraw: () => void;
}

/** Face-up Color Roulette cards, shown to everyone as the victim turns them over. */
export function RouletteReveal({ view, meId, name, canDraw, onDraw }: RouletteRevealProps) {
  const finished = useFinishedReveal(view);
  const live: RevealShown | null =
    view.phase.type === 'rouletteReveal'
      ? {
          victimId: view.phase.victimId,
          color: view.phase.color,
          cards: view.phase.revealed,
          outcome: null,
        }
      : null;
  const shown = live ?? finished;
  if (!shown) return null;

  const isMe = shown.victimId === meId;
  const who = name(shown.victimId);
  const colorName = COLOR_LABEL[shown.color];
  const tight = shown.cards.length > 8 ? '-ml-12' : shown.cards.length > 4 ? '-ml-8' : 'ml-2';

  let message: string;
  if (!shown.outcome) {
    message = isMe
      ? shown.cards.length === 0
        ? `Draw cards until you hit ${colorName}.`
        : `No ${colorName} yet. Draw again.`
      : `${who} is drawing until ${colorName} shows up.`;
  } else if (shown.outcome.matched) {
    message = `${isMe ? 'You' : who} hit ${colorName}. ${shown.cards.length === 1 ? 'That card goes' : `All ${shown.cards.length} cards go`} to ${isMe ? 'your' : 'their'} hand.`;
  } else {
    message = `${isMe ? 'You keep' : `${who} keeps`} ${shown.cards.length === 1 ? 'the card' : `all ${shown.cards.length} cards`} drawn.`;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-[8%]">
      <div
        role="status"
        aria-live="polite"
        className="anim-toast pointer-events-auto flex max-w-full flex-col items-center gap-3 rounded-xl bg-room/90 px-4 py-3 shadow-lifted ring-2 ring-brass backdrop-blur-sm"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-chalk">
          <span
            className={`h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-chalk ${COLOR_BG[shown.color]}`}
          />
          Color Roulette: {colorName}
        </p>

        <ol
          className="flex min-h-[7.5rem] max-w-full items-center overflow-x-auto px-2 pb-1 pt-1 scroll-thin"
          aria-label={`${shown.cards.length} cards revealed`}
        >
          {shown.cards.length === 0 && (
            <li className="text-sm text-chalk/55">No cards turned over yet</li>
          )}
          {shown.cards.map((card, i) => {
            const hit = colorOf(card) === shown.color;
            return (
              <li key={card.id} className={i > 0 ? tight : ''} style={{ zIndex: i }}>
                <PlayingCard
                  card={card}
                  size="md"
                  animate="draw"
                  className={hit ? 'ring-4 ring-brass' : ''}
                />
              </li>
            );
          })}
        </ol>

        <p className="max-w-[22rem] text-center text-sm text-chalk/85 sm:text-base">{message}</p>

        {isMe && !shown.outcome && (
          <button type="button" className="btn-primary" onClick={onDraw} disabled={!canDraw}>
            <Download size={18} /> Draw
          </button>
        )}
      </div>
    </div>
  );
}

/** The most recent roulette result, held on screen briefly after it lands in the log. */
function useFinishedReveal(view: PublicGameView): RevealShown | null {
  const seen = useRef<number | null>(null);
  const [shown, setShown] = useState<RevealShown | null>(null);

  useEffect(() => {
    const latest = [...view.log].reverse().find((e) => e.event.type === 'rouletteResolved');
    const seq = latest?.seq ?? 0;
    // Results from before this screen opened are history, not news.
    if (seen.current === null) {
      seen.current = seq;
      return;
    }
    if (!latest || seq <= seen.current || latest.event.type !== 'rouletteResolved') return;
    seen.current = seq;
    const { victimId, color, cards, matched } = latest.event;
    setShown({ victimId, color, cards, outcome: { matched } });
  }, [view.log]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  return shown;
}
