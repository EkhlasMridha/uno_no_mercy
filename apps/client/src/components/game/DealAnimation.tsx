import { useEffect, useRef, type RefObject } from 'react';
import { playIfOn } from '../../hooks/useGameSounds';
import type { Deal } from '../../hooks/useDeal';
import { seatPoint } from '../../lib/table-geometry';
import { CardBack } from '../card/PlayingCard';
import type { SeatScale } from './TableSeat';

/** Below this gap a flick per card turns into a buzz, so only every other card is heard. */
const SOUND_GAP_MS = 70;
/** Opponents' cards slide into the fan in front of them; yours come right up to the near edge. */
const REACH = 0.88;
const MY_REACH = 0.95;

interface DealAnimationProps {
  deal: Deal | null;
  meId: string;
  angleOf: (playerId: string) => number | null;
  /** The draw pile on the felt, where every card comes from. */
  pileRef: RefObject<HTMLElement>;
  scale: SeatScale;
}

/**
 * The opening deal: seven cards each, face down, one at a time round the table starting left of
 * the dealer (docs/RULES.md §5.18). Each card is flicked off the deck and slides across the felt to
 * its player, turning to face them, and joins their hand as it lands: the seats count up and your
 * fan fills one card at a time. Timed by the server's deal, so a page that arrives mid-deal joins
 * in where the table is. Cosmetic only: every hand is already dealt on the server.
 */
export function DealAnimation({ deal, meId, angleOf, pileRef, scale }: DealAnimationProps) {
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const startedAt = deal?.startedAt ?? null;
  const count = deal?.timing.cards ?? 0;
  const order = deal?.order ?? [];
  const orderKey = order.join(',');
  const gap = deal?.timing.gapMs ?? 0;
  const travel = deal?.timing.travelMs ?? 0;

  useEffect(() => {
    if (startedAt === null) return;
    const targets = orderKey.split(',');
    const elapsed = performance.now() - startedAt;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // One flick as each card leaves the deck, for the cards still to come.
    const soundEvery = gap < SOUND_GAP_MS ? 2 : 1;
    const flicks: number[] = [];
    for (let i = 0; i < count; i += soundEvery) {
      const at = i * gap - elapsed;
      if (at >= 0) flicks.push(window.setTimeout(() => playIfOn('deal'), at));
    }

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
      : Array.from({ length: count }, (_, i) => {
          const playerId = targets[i % targets.length] as string;
          const angle = angleOf(playerId);
          const el = cards.current[i];
          if (angle === null || !el) return null;
          const mine = playerId === meId;
          const to = seatPoint(angle, mine ? MY_REACH : REACH);
          // A dealt card ends turned toward its player, never quite square, the way a hand throws it.
          const jitter = ((i * 37) % 17) - 8;
          const turn = angle - 90 + jitter;
          // Cards to the near seats skid a little past and settle back, as on real felt.
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          return el.animate(
            [
              {
                left: `${from.x}%`,
                top: `${from.y}%`,
                transform: 'translate(-50%, -50%) translateY(0px) scale(1) rotate(0deg)',
                opacity: 0,
                easing: 'cubic-bezier(0.3, 0.9, 0.4, 1)',
              },
              {
                left: `${from.x + dx * 0.12}%`,
                top: `${from.y + dy * 0.12}%`,
                // Lifted off the top of the deck before it slides away.
                transform: `translate(-50%, -50%) translateY(-6px) scale(1.04) rotate(${turn * 0.25}deg)`,
                offset: 0.12,
                opacity: 1,
                easing: 'cubic-bezier(0.15, 0.6, 0.2, 1)',
              },
              {
                left: `${from.x + dx * 1.03}%`,
                top: `${from.y + dy * 1.03}%`,
                transform: `translate(-50%, -50%) translateY(0px) scale(${mine ? 0.95 : 0.7}) rotate(${turn + 4}deg)`,
                offset: 0.78,
                easing: 'ease-out',
              },
              {
                left: `${to.x}%`,
                top: `${to.y}%`,
                transform: `translate(-50%, -50%) translateY(0px) scale(${mine ? 0.95 : 0.7}) rotate(${turn}deg)`,
                opacity: 1,
                offset: 0.94,
              },
              {
                left: `${to.x}%`,
                top: `${to.y}%`,
                transform: `translate(-50%, -50%) translateY(0px) scale(${mine ? 0.95 : 0.7}) rotate(${turn}deg)`,
                // It has joined the hand: the seat's fan or your own cards take its place.
                opacity: 0,
              },
            ],
            {
              duration: travel,
              delay: i * gap - elapsed,
              fill: 'both',
            },
          );
        });
    return () => {
      flicks.forEach((t) => window.clearTimeout(t));
      animations.forEach((a) => a?.cancel());
    };
    // `angleOf` is rebuilt every render; the seats it points at only change with `orderKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, count, gap, travel, orderKey, meId, pileRef]);

  if (startedAt === null) return null;
  return (
    <div ref={stage} aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`${startedAt}-${i}`}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="absolute"
          // Waiting cards sit hidden on top of the deck until their turn to leave it.
          style={{ opacity: 0 }}
        >
          <CardBack size={scale === 'sm' ? 'xs' : 'sm'} className="shadow-lifted" />
        </div>
      ))}
    </div>
  );
}
