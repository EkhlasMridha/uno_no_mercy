import { useEffect, useRef, useState, type RefObject } from 'react';
import { STARTING_HAND_SIZE, type PublicGameView } from '@nomercy/shared';
import { playIfOn } from '../../hooks/useGameSounds';
import { seatPoint } from '../../lib/table-geometry';
import { useAppState } from '../../state/store';
import { CardBack } from '../card/PlayingCard';
import type { SeatScale } from './TableSeat';

/** How long after the game starts the table may still begin dealing, while the first state arrives. */
const START_WINDOW_MS = 4000;
/** The whole deal takes about this long, however many players there are. */
const DEAL_MS = 2400;
/** The gap between two cards, kept quick for a big table and unhurried for two players. */
const MIN_GAP_MS = 30;
const MAX_GAP_MS = 110;
/** How long one card takes from the deck to its player. */
const TRAVEL_MS = 420;
/** Below this gap a flick per card turns into a buzz, so only every other card is heard. */
const SOUND_GAP_MS = 55;
/** Opponents' cards land on their avatar; yours land on the fan over the near edge. */
const REACH = 1;
const MY_REACH = 0.92;

interface DealAnimationProps {
  view: PublicGameView;
  meId: string;
  angleOf: (playerId: string) => number | null;
  /** The draw pile on the felt, where every card comes from. */
  pileRef: RefObject<HTMLElement>;
  scale: SeatScale;
}

/**
 * The opening deal: seven cards each, face down, one at a time round the table starting left of
 * the dealer (docs/RULES.md), each with a flick. Only when this page saw the game start; a reload or
 * a late join skips it. Cosmetic only; every hand is already dealt.
 */
export function DealAnimation({ view, meId, angleOf, pileRef, scale }: DealAnimationProps) {
  const dealtAt = useAppState((s) => s.dealtAt);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const dealerId = view.log.find((e) => e.event.type === 'gameStarted')?.event;
  const dealer = dealerId?.type === 'gameStarted' ? dealerId.dealerId : null;
  const ids = view.players.map((p) => p.id);
  const dealerIndex = Math.max(dealer ? ids.indexOf(dealer) : 0, 0);
  // Round by round, starting with the player after the dealer.
  const order = Array.from(
    { length: STARTING_HAND_SIZE * ids.length },
    (_, k) => ids[(dealerIndex + 1 + (k % ids.length)) % ids.length] as string,
  );
  const orderKey = order.join(',');
  const gap = Math.max(MIN_GAP_MS, Math.min(MAX_GAP_MS, DEAL_MS / order.length));
  const dealMs = order.length * gap + TRAVEL_MS;

  // Which start is being dealt. Held for the whole deal, so a state that arrives late in the start
  // window still gets the full deal rather than being cut off when the window closes.
  const [dealing, setDealing] = useState<number | null>(null);
  const dealLength = useRef(dealMs);
  dealLength.current = dealMs;
  useEffect(() => {
    if (dealtAt === null || performance.now() - dealtAt > START_WINDOW_MS) return;
    setDealing(dealtAt);
    const done = window.setTimeout(() => setDealing(null), dealLength.current + 100);
    return () => window.clearTimeout(done);
  }, [dealtAt]);

  useEffect(() => {
    if (dealing === null) return;
    const targets = orderKey.split(',');
    const soundEvery = gap < SOUND_GAP_MS ? 2 : 1;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Timed with the cards rather than scheduled ahead, so leaving the table stops the patter too.
    let dealt = 0;
    const flicks = window.setInterval(() => {
      if (dealt % soundEvery === 0) playIfOn('deal');
      dealt += 1;
      if (dealt >= targets.length) window.clearInterval(flicks);
    }, gap);

    const box = stage.current?.getBoundingClientRect();
    const pile = pileRef.current?.getBoundingClientRect();
    const from =
      box && pile && box.width > 0 && box.height > 0
        ? {
            x: ((pile.left + pile.width / 2 - box.left) / box.width) * 100,
            y: ((pile.top + pile.height / 2 - box.top) / box.height) * 100,
          }
        : { x: 50, y: 45 };
    const animations = reduced
      ? []
      : targets.map((playerId, i) => {
          const angle = angleOf(playerId);
          const el = cards.current[i];
          if (angle === null || !el) return null;
          const to = seatPoint(angle, playerId === meId ? MY_REACH : REACH);
          // Each card spins a little on its way, the way a dealt card does.
          const spin = (to.x - from.x) * 1.2 + (i % 2 === 0 ? 40 : -40);
          return el.animate(
            [
              {
                left: `${from.x}%`,
                top: `${from.y}%`,
                transform: 'translate(-50%, -50%) scale(1) rotate(0deg)',
                opacity: 0,
              },
              { opacity: 1, offset: 0.1 },
              {
                left: `${to.x}%`,
                top: `${to.y}%`,
                transform: `translate(-50%, -50%) scale(0.6) rotate(${spin}deg)`,
                opacity: 1,
                offset: 0.85,
              },
              {
                left: `${to.x}%`,
                top: `${to.y}%`,
                transform: `translate(-50%, -50%) scale(0.5) rotate(${spin}deg)`,
                opacity: 0,
              },
            ],
            {
              duration: TRAVEL_MS,
              delay: i * gap,
              easing: 'cubic-bezier(0.25, 0.7, 0.3, 1)',
              fill: 'both',
            },
          );
        });
    return () => {
      window.clearInterval(flicks);
      animations.forEach((a) => a?.cancel());
    };
    // `angleOf` is rebuilt every render; the seats it points at only change with `orderKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealing, gap, orderKey, meId, pileRef]);

  if (dealing === null) return null;
  return (
    <div ref={stage} aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {order.map((playerId, i) => (
        <div
          key={`${dealing}-${i}-${playerId}`}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="absolute"
          style={{ opacity: 0 }}
        >
          <CardBack size={scale === 'sm' ? 'xs' : 'sm'} className="shadow-lifted" />
        </div>
      ))}
    </div>
  );
}
