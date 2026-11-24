import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_COLORS, type Card, type CardColor, type NumberValue } from '@nomercy/shared';
import { PlayingCard } from '../card/PlayingCard';
import { cardName, COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import { playIfOn } from '../../hooks/useGameSounds';

/**
 * Color snap: a quick toy for the Play global wait. A card turns up; tap its color before the bar
 * runs out. A wild draw card is a trap: let it pass. Each snap makes the next card a little faster.
 * It is played on this device only, never sent anywhere and never touches the game.
 */

const KEYS: Record<string, CardColor> = {
  '1': 'red',
  '2': 'yellow',
  '3': 'green',
  '4': 'blue',
  r: 'red',
  y: 'yellow',
  g: 'green',
  b: 'blue',
};
const KEY_HINT: Record<CardColor, string> = { red: '1', yellow: '2', green: '3', blue: '4' };

const FIRST_MS = 2400;
const FASTEST_MS = 850;
/** The pause between one card going and the next turning up. */
const GAP_MS = 380;

type Verdict = { good: boolean; text: string; id: number } | null;

let nextCardId = 0;

/** A card the player might snap: mostly colored cards, a wild draw now and then once warmed up. */
function dealCard(streak: number): Card {
  const id = `snap-${nextCardId++}`;
  if (streak >= 2 && Math.random() < 0.2) {
    const kinds = ['wildDraw6', 'wildDraw10', 'wildReverseDraw4'] as const;
    return { id, kind: kinds[Math.floor(Math.random() * kinds.length)]! };
  }
  const color = CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]!;
  if (Math.random() < 0.7) {
    return { id, kind: 'number', color, value: Math.floor(Math.random() * 10) as NumberValue };
  }
  const kinds = ['skip', 'reverse', 'draw2', 'draw4', 'discardAll', 'skipEveryone'] as const;
  return { id, kind: kinds[Math.floor(Math.random() * kinds.length)]!, color };
}

const isTrap = (card: Card) => !('color' in card);
const timeFor = (streak: number) => Math.max(FASTEST_MS, Math.round(FIRST_MS * 0.93 ** streak));

export function ColorSnap({ frozen }: { frozen: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [dealtAt, setDealtAt] = useState(0);
  const [duration, setDuration] = useState(FIRST_MS);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [now, setNow] = useState(() => Date.now());
  const streakRef = useRef(0);
  const nextTimer = useRef<number | null>(null);

  const deal = useCallback(() => {
    const s = streakRef.current;
    setCard(dealCard(s));
    setDuration(timeFor(s));
    setDealtAt(Date.now());
    setNow(Date.now());
  }, []);

  const settle = useCallback(
    (good: boolean, text: string) => {
      setCard(null);
      setVerdict((v) => ({ good, text, id: (v?.id ?? 0) + 1 }));
      const s = good ? streakRef.current + 1 : 0;
      streakRef.current = s;
      setStreak(s);
      if (good) {
        setBest((b) => Math.max(b, s));
        playIfOn(s > 0 && s % 5 === 0 ? 'rouletteHit' : 'cardPlay');
      }
      nextTimer.current = window.setTimeout(deal, good ? GAP_MS : GAP_MS * 2.5);
    },
    [deal],
  );

  const start = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
    setVerdict(null);
    setPlaying(true);
    deal();
  }, [deal]);

  const snap = useCallback(
    (color: CardColor) => {
      if (!playing || frozen) return;
      if (!card) return;
      if (isTrap(card)) return settle(false, 'Ouch, that was a trap. Let wild draws pass.');
      if ('color' in card && card.color === color) return settle(true, 'Snap!');
      return settle(false, `That one was ${'color' in card ? COLOR_LABEL[card.color] : ''}.`);
    },
    [card, frozen, playing, settle],
  );

  // The bar: ticks while a card is up, and lets a card run out.
  useEffect(() => {
    if (!card || frozen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [card, frozen]);
  useEffect(() => {
    if (!card || frozen || now - dealtAt < duration) return;
    if (isTrap(card)) settle(true, 'Dodged it!');
    else settle(false, 'Too slow. Tap the color sooner.');
  }, [card, dealtAt, duration, frozen, now, settle]);

  useEffect(
    () => () => {
      if (nextTimer.current) window.clearTimeout(nextTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (frozen && nextTimer.current) window.clearTimeout(nextTimer.current);
  }, [frozen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const color = KEYS[e.key.toLowerCase()];
      if (color && playing) {
        e.preventDefault();
        snap(color);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, snap]);

  const left = card ? Math.max(0, 1 - (now - dealtAt) / duration) : 0;

  return (
    <section
      aria-labelledby="color-snap-title"
      className="table-rail w-full rounded-[2rem] p-2.5 shortest:rounded-3xl shortest:p-2"
    >
      <div className="table-felt flex flex-col items-center gap-3 rounded-[1.6rem] px-4 py-3 text-center sm:py-4 shortest:gap-2 shortest:rounded-[1.2rem] shortest:py-2.5">
        <div className="flex w-full items-baseline justify-between gap-2">
          <h2
            id="color-snap-title"
            className="whitespace-nowrap font-display text-xl leading-none shortest:text-base"
          >
            Color snap
          </h2>
          <p className="whitespace-nowrap text-sm text-chalk/70 tabular-nums shortest:text-xs">
            Streak <span className="font-semibold text-brass">{streak}</span>
            <span className="text-chalk/40">, </span>
            best <span className="font-semibold text-chalk">{best}</span>
          </p>
        </div>

        {/* The card spot. */}
        <div className="grid min-h-28 w-full place-items-center sm:min-h-36 short:min-h-32 shortest:min-h-[4.75rem]">
          {card ? (
            <div key={card.id} className="anim-flip-in">
              <PlayingCard card={card} size="md" />
            </div>
          ) : playing ? (
            <p
              key={verdict?.id}
              className={`anim-bump max-w-[15rem] font-semibold ${
                verdict?.good ? 'font-display text-3xl text-brass' : 'text-sm text-chalk/80'
              }`}
            >
              {verdict?.text}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 shortest:gap-1.5">
              <p className="max-w-[16rem] text-sm text-chalk/75 shortest:text-xs">
                Tap the color of each card before the bar runs out. A wild draw is a trap: let it
                pass.
              </p>
              <button type="button" className="btn-primary px-5 py-2" onClick={start}>
                Play while you wait
              </button>
            </div>
          )}
        </div>

        {/* Time left on this card. */}
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-felt-950/70"
          role="progressbar"
          aria-label="Time left on this card"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(left * 100)}
        >
          <div
            className={`h-full rounded-full ${left < 0.3 ? 'bg-card-red' : 'bg-brass'}`}
            style={{ width: `${left * 100}%` }}
          />
        </div>

        <div className="grid w-full grid-cols-4 gap-2">
          {CARD_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={!playing || frozen}
              onClick={() => snap(color)}
              aria-label={`${COLOR_LABEL[color]} (key ${KEY_HINT[color]})`}
              className={`${COLOR_BG[color]} relative h-12 rounded-xl border-[3px] border-white/85 shadow-card transition active:scale-95 enabled:hover:-translate-y-0.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white shortest:h-9`}
            >
              <span
                aria-hidden
                className={`absolute bottom-1 right-1.5 text-[10px] font-bold ${
                  color === 'yellow' ? 'text-felt-950/60' : 'text-white/70'
                } max-sm:hidden`}
              >
                {KEY_HINT[color]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {card ? `${cardName(card)}${isTrap(card) ? ', a trap' : ''}.` : (verdict?.text ?? '')}
      </p>
    </section>
  );
}
