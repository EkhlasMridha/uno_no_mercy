import type { CSSProperties, ReactNode } from 'react';
import { ArrowRightLeft, Ban, Dices, Layers, MoveHorizontal, RefreshCw, Users } from 'lucide-react';
import { colorOf, type Card, type CardColor } from '@nomercy/shared';
import { cardName, COLOR_BG, COLOR_INK, COLOR_RING } from '../../lib/cards';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<
  CardSize,
  { box: string; center: string; corner: string; icon: number; cornerIcon: number }
> = {
  xs: {
    box: 'w-8 rounded-md border-2',
    center: 'text-base',
    corner: 'text-[7px]',
    icon: 12,
    cornerIcon: 6,
  },
  sm: {
    box: 'w-12 rounded-lg border-[3px]',
    center: 'text-2xl',
    corner: 'text-[9px]',
    icon: 18,
    cornerIcon: 8,
  },
  md: {
    box: 'w-[4.5rem] sm:w-20 rounded-xl border-4',
    center: 'text-4xl',
    corner: 'text-xs',
    icon: 28,
    cornerIcon: 10,
  },
  lg: {
    box: 'w-24 sm:w-28 rounded-2xl border-[5px]',
    center: 'text-5xl',
    corner: 'text-sm',
    icon: 40,
    cornerIcon: 12,
  },
};

function Symbol({
  card,
  size,
  corner,
}: {
  card: Card;
  size: CardSize;
  corner?: boolean;
}): ReactNode {
  const s = SIZE[size];
  const iconSize = corner ? s.cornerIcon : s.icon;
  const stroke = corner ? 3 : 2.75;
  switch (card.kind) {
    case 'number': {
      // Printed corner hint for the hand-moving numbers: 0 passes hands, 7 swaps them.
      if (!corner || (card.value !== 0 && card.value !== 7)) return card.value;
      const Hint = card.value === 0 ? RefreshCw : MoveHorizontal;
      return (
        <span className="flex flex-col items-center gap-px">
          {card.value}
          <Hint size={iconSize} strokeWidth={stroke} aria-hidden />
        </span>
      );
    }
    case 'skip':
      return <Ban size={iconSize} strokeWidth={stroke} aria-hidden />;
    case 'reverse':
      return <ArrowRightLeft size={iconSize} strokeWidth={stroke} aria-hidden />;
    case 'discardAll':
      return <Layers size={iconSize} strokeWidth={stroke} aria-hidden />;
    case 'skipEveryone':
      return <Users size={iconSize} strokeWidth={stroke} aria-hidden />;
    case 'draw2':
      return '+2';
    case 'draw4':
      return '+4';
    case 'wildDraw6':
      return '+6';
    case 'wildDraw10':
      return '+10';
    case 'wildReverseDraw4':
      return corner ? (
        '⇄4'
      ) : (
        <span className="flex flex-col items-center leading-none">
          <ArrowRightLeft size={iconSize * 0.7} strokeWidth={stroke} aria-hidden />
          <span>+4</span>
        </span>
      );
    case 'wildColorRoulette':
      return <Dices size={iconSize} strokeWidth={stroke} aria-hidden />;
  }
}

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  /** Highlight as a legal move. */
  playable?: boolean;
  /** Visually de-emphasize (not playable on your turn). */
  dimmed?: boolean;
  /** For wilds on the discard pile: the color chosen for it. */
  activeColor?: CardColor | null;
  onClick?: () => void;
  className?: string;
  animate?: 'in' | 'draw' | null;
}

/** Original card artwork drawn with CSS: colored face, tilted oval, corner indices. */
export function PlayingCard({
  card,
  size = 'md',
  playable = false,
  dimmed = false,
  activeColor = null,
  onClick,
  className = '',
  animate = null,
}: PlayingCardProps) {
  const s = SIZE[size];
  const color = colorOf(card);
  const isWild = color === null;
  const face = color ? COLOR_BG[color] : 'bg-card-wild';
  const ink = color ? COLOR_INK[color] : 'text-white';
  const textOnFace = color === 'yellow' ? 'text-felt-950' : 'text-white';
  const label = cardName(card);
  const isNumber = card.kind === 'number';
  const centerText = isNumber || ['draw2', 'draw4', 'wildDraw6', 'wildDraw10'].includes(card.kind);

  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={label + (playable ? ' (playable)' : '')}
      title={label}
      className={[
        'relative aspect-[5/7] shrink-0 select-none border-white shadow-card transition duration-150',
        s.box,
        face,
        playable
          ? 'ring-4 ring-amber-300 -translate-y-2 sm:-translate-y-3 hover:-translate-y-4'
          : '',
        dimmed ? 'brightness-[0.55] saturate-50' : '',
        interactive
          ? 'cursor-pointer focus-visible:outline focus-visible:outline-4 focus-visible:outline-white'
          : '',
        activeColor && isWild ? `ring-4 ${COLOR_RING[activeColor]}` : '',
        animate === 'in' ? 'anim-card-in' : animate === 'draw' ? 'anim-draw-in' : '',
        className,
      ].join(' ')}
    >
      {/* tilted oval */}
      <span
        aria-hidden
        className={[
          'absolute inset-[12%] rotate-[28deg] rounded-[50%]',
          isWild
            ? 'bg-[conic-gradient(#e5383b_0_25%,#2f6fe0_0_50%,#f4c20d_0_75%,#22a559_0)]'
            : 'bg-white',
        ].join(' ')}
      />
      {/* center symbol */}
      <span
        aria-hidden
        className={[
          'absolute inset-0 flex items-center justify-center font-display',
          s.center,
          isWild ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]' : ink,
          centerText ? 'card-symbol-text' : '',
          isNumber && (card.value === 6 || card.value === 9)
            ? 'underline decoration-2 underline-offset-2'
            : '',
        ].join(' ')}
      >
        <Symbol card={card} size={size} />
      </span>
      {/* corner indices */}
      {size !== 'xs' && (
        <>
          <span
            aria-hidden
            className={`absolute left-1 top-0.5 font-display leading-none ${s.corner} ${textOnFace}`}
          >
            <Symbol card={card} size={size} corner />
          </span>
          <span
            aria-hidden
            className={`absolute bottom-0.5 right-1 rotate-180 font-display leading-none ${s.corner} ${textOnFace}`}
          >
            <Symbol card={card} size={size} corner />
          </span>
        </>
      )}
    </Tag>
  );
}

export function CardBack({
  size = 'md',
  className = '',
  style,
}: {
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  return (
    <div
      aria-hidden
      style={style}
      className={`${className.includes('absolute') ? '' : 'relative'} aspect-[5/7] shrink-0 border-chalk bg-oxblood shadow-card ${s.box} ${className}`}
    >
      <span className="absolute inset-[12%] rotate-[28deg] rounded-[50%] bg-room ring-1 ring-brass/70" />
      <span
        className={`absolute inset-0 flex items-center justify-center font-display text-brass drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] ${
          size === 'xs' ? 'text-[6px]' : size === 'sm' ? 'text-[9px]' : 'text-sm'
        }`}
      >
        {size === 'xs' ? '' : 'NO MERCY'}
      </span>
    </div>
  );
}
