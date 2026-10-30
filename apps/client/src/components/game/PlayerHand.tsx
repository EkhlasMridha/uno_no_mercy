import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorOf, type Card } from '@nomercy/shared';
import type { IdleNudge } from '../../hooks/useGameSounds';
import { sortHand } from '../../lib/cards';
import { PlayingCard } from '../card/PlayingCard';

interface PlayerHandProps {
  hand: Card[];
  playableIds: ReadonlySet<string>;
  isMyTurn: boolean;
  onCardClick: (card: Card) => void;
  /** The card just clicked, while the host confirms it: shown lifted and fading. */
  sendingId?: string | null;
  /** The idle turn reminder's nudge: each new count replays the cards' hop while it's active. */
  nudge: IdleNudge;
  /** Privacy mode: cards show their backs until you point at one (screens with a mouse only). */
  concealed: boolean;
}

interface HandLayout {
  /**
   * One row, or two tiers when one row would hide the corner indices: the back tier first.
   * A phone always gets one row, which scrolls sideways when it doesn't fit.
   */
  rows: Card[][];
  /** Distance from one card's left edge to the next, in px. */
  step: number;
  /** Extra space where a new color starts, in px. */
  gap: number;
}

// Room left for the scroller's padding (px-4) and each row's (px-6), which holds the tilted corners.
const EDGE_ROOM = 80;
// A phone, upright or sideways, has no room for a second tier: one row you swipe through is better.
const PHONE_QUERY = '(max-width: 639px), (max-height: 500px)';

function startsColor(row: readonly Card[], i: number): boolean {
  const prev = row[i - 1];
  const card = row[i];
  return prev !== undefined && card !== undefined && colorOf(prev) !== colorOf(card);
}

/** Splits the hand in two tiers, at the color change nearest the middle when one is close. */
function splitTiers(cards: Card[]): Card[][] {
  const half = Math.ceil(cards.length / 2);
  let cut = half;
  for (let i = 1; i < cards.length; i++) {
    if (startsColor(cards, i) && Math.abs(i - half) < Math.abs(cut - half)) cut = i;
  }
  // A lopsided color split reads worse than one color carried over to the second tier.
  if (Math.abs(cut - half) > cards.length / 5) cut = half;
  return [cards.slice(0, cut), cards.slice(cut)];
}

/**
 * Spaces the hand to fit the width, so every card's corner index stays in view without scrolling.
 * On a phone each card keeps at least half its width to tap, and a hand too big for that scrolls.
 */
function layoutHand(cards: Card[], width: number, cardWidth: number, phone: boolean): HandLayout {
  const avail = width - EDGE_ROOM;
  const roomy = cardWidth - 14;
  const readable = phone ? cardWidth * 0.5 : Math.max(26, cardWidth * 0.4);
  const groupGap = Math.round(cardWidth * 0.2);
  const stepFor = (row: Card[], gap: number) => {
    if (row.length < 2) return roomy;
    const starts = row.filter((_, i) => startsColor(row, i)).length;
    return (avail - cardWidth - starts * gap) / (row.length - 1);
  };
  const tiers = !phone && cards.length >= 8 ? splitTiers(cards) : null;
  const options: [Card[][] | null, number, number][] = [
    [[cards], groupGap, readable],
    [[cards], 4, readable],
    [tiers, groupGap, readable],
    [tiers, 4, 22],
  ];
  for (const [rows, gap, min] of options) {
    if (!rows) continue;
    const step = Math.min(...rows.map((row) => stepFor(row, gap)));
    if (step >= min) return { rows, step: Math.min(step, roomy), gap };
  }
  // Even two tight tiers, or a phone's one row, don't fit: keep the corners readable and let it scroll.
  return { rows: tiers ?? [cards], step: tiers ? 22 : readable, gap: tiers ? 4 : groupGap };
}

/** Your cards held in a fan over the table edge, grouped by color and sized to the screen. */
export function PlayerHand({
  hand,
  playableIds,
  isMyTurn,
  onCardClick,
  sendingId = null,
  nudge,
  concealed,
}: PlayerHandProps) {
  const sorted = useMemo(() => sortHand(hand), [hand]);
  const previous = useRef<Set<string> | null>(null);
  const prevIds = previous.current;
  useEffect(() => {
    previous.current = new Set(hand.map((c) => c.id));
  }, [hand]);

  // Card size follows the breakpoints in PlayingCard, so it's measured rather than repeated here.
  const scroller = useRef<HTMLDivElement>(null);
  const hasCards = sorted.length > 0;
  // In privacy mode, pointing at or focusing any card shows the whole hand until you leave it.
  const [revealed, setRevealed] = useState(false);
  const [room, setRoom] = useState<{
    width: number;
    cardWidth: number;
    phone: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const card = el.querySelector('li');
      if (!card) return;
      const next = {
        width: el.clientWidth,
        cardWidth: card.offsetWidth,
        phone: window.matchMedia(PHONE_QUERY).matches,
      };
      setRoom((prev) =>
        prev &&
        prev.width === next.width &&
        prev.cardWidth === next.cardWidth &&
        prev.phone === next.phone
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasCards]);

  // When your turn starts, bring a playable card into view if every one is scrolled off screen.
  // scrollTo, not scrollIntoView, which would also scroll the page's clipped ancestors.
  useEffect(() => {
    const el = scroller.current;
    if (!isMyTurn || !el) return;
    const box = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll<HTMLElement>('li[data-playable]')];
    // A card counts as on screen while its left corner index is: the rest sits under the next card.
    const onScreen = (c: DOMRect) => c.left >= box.left && c.left + c.width / 2 <= box.right;
    const first = cards[0];
    if (!first || cards.some((card) => onScreen(card.getBoundingClientRect()))) return;
    const c = first.getBoundingClientRect();
    el.scrollTo({ left: el.scrollLeft + c.left - box.left - (box.width - c.width) / 2 });
  }, [isMyTurn]);

  if (!hasCards) {
    return <p className="py-8 text-center text-chalk/50">No cards in hand</p>;
  }

  const layout = room
    ? layoutHand(sorted, room.width, room.cardWidth, room.phone)
    : { rows: [sorted], step: 40, gap: 8 };
  const cardWidth = room?.cardWidth ?? 72;
  const tiered = layout.rows.length > 1;
  let index = 0;

  return (
    <div
      ref={scroller}
      className="scroll-none overflow-x-auto overflow-y-hidden motion-safe:scroll-smooth px-4 pb-3 pt-6 short:pb-2 short:pt-4 shortest:pb-1 shortest:pt-3"
      // A plain mouse wheel only scrolls up and down, which the hand can't: turn it sideways.
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.currentTarget.scrollBy({ left: e.deltaY, behavior: 'instant' });
        }
      }}
    >
      <div
        role="group"
        aria-label={`Your hand, ${sorted.length} cards`}
        className="w-max min-w-full"
        onPointerLeave={() => setRevealed(false)}
        onFocus={() => setRevealed(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setRevealed(false);
        }}
      >
        {layout.rows.map((row, r) => {
          // A flatter arc for two tiers, so the back tier's corners stay above the front one.
          const spread = Math.min(row.length * 3.5, tiered ? 18 : 32);
          const tiltStep = row.length > 1 ? spread / (row.length - 1) : 0;
          // The outermost cards sit lowest and tip a corner further down as they tilt on their foot.
          // The front row keeps room for that, so no corner is clipped by the screen edge.
          const edge = spread / 2;
          const overhang =
            r === layout.rows.length - 1
              ? Math.ceil((edge * edge) / 28 + (cardWidth / 2) * Math.sin((edge * Math.PI) / 180))
              : 0;
          return (
            <ul
              key={r}
              className="mx-auto flex w-max items-end px-6"
              style={{
                // The front tier covers the lower half of the back one, leaving its top corners and
                // symbols showing, the way you'd hold a thick hand in two rows.
                marginTop: r > 0 ? -cardWidth * 0.7 : undefined,
                paddingBottom: overhang,
              }}
            >
              {row.map((card, i) => {
                const order = index++;
                const playable = isMyTurn && playableIds.has(card.id);
                const tilt = row.length > 1 ? -spread / 2 + i * tiltStep : 0;
                // Cards further from the middle sit lower, tracing the arc of the fan.
                const drop = (tilt * tilt) / 28;
                const marginLeft =
                  i === 0 ? 0 : layout.step - cardWidth + (startsColor(row, i) ? layout.gap : 0);
                return (
                  <li
                    key={card.id}
                    // Hovering or focusing a card brings it to the front so you can read all of it.
                    className="hover:!z-[300] focus-within:!z-[300]"
                    data-playable={playable || undefined}
                    onPointerEnter={() => setRevealed(true)}
                    style={{
                      marginLeft,
                      zIndex: r * 100 + i,
                      transform: `translateY(${drop}px) rotate(${tilt}deg)`,
                      transformOrigin: '50% 100%',
                    }}
                  >
                    {/* Re-keyed on each reminder so the hop replays, rippling across the fan. */}
                    <div
                      key={nudge.count}
                      className={
                        [
                          nudge.active ? 'anim-nudge' : '',
                          card.id === sendingId
                            ? 'pointer-events-none -translate-y-5 scale-95 opacity-40 transition duration-150'
                            : '',
                        ]
                          .join(' ')
                          .trim() || undefined
                      }
                      style={
                        nudge.active
                          ? { animationDelay: `${Math.min(order * 18, 220)}ms` }
                          : undefined
                      }
                    >
                      <PlayingCard
                        card={card}
                        size="md"
                        playable={playable}
                        dimmed={isMyTurn && !playable}
                        onClick={() => onCardClick(card)}
                        animate={prevIds && !prevIds.has(card.id) ? 'draw' : null}
                        concealed={concealed && !revealed}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
    </div>
  );
}
