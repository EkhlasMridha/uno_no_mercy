import { CARD_COLORS, colorOf, type Card, type CardColor, type CardFace } from '@nomercy/shared';

/** Presentation helpers only: labels, colors and display ordering. No rule logic. */

export const COLOR_LABEL: Record<CardColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
};

export const COLOR_BG: Record<CardColor, string> = {
  red: 'bg-card-red',
  yellow: 'bg-card-yellow',
  green: 'bg-card-green',
  blue: 'bg-card-blue',
};

export const COLOR_INK: Record<CardColor, string> = {
  red: 'text-ink-red',
  yellow: 'text-ink-yellow',
  green: 'text-ink-green',
  blue: 'text-ink-blue',
};

export const COLOR_RING: Record<CardColor, string> = {
  red: 'ring-card-red',
  yellow: 'ring-card-yellow',
  green: 'ring-card-green',
  blue: 'ring-card-blue',
};

export function cardName(card: CardFace): string {
  const color = colorOf(card);
  const prefix = color ? `${COLOR_LABEL[color]} ` : '';
  switch (card.kind) {
    case 'number':
      return `${prefix}${card.value}`;
    case 'skip':
      return `${prefix}Skip`;
    case 'reverse':
      return `${prefix}Reverse`;
    case 'draw2':
      return `${prefix}Draw Two`;
    case 'draw4':
      return `${prefix}Draw Four`;
    case 'discardAll':
      return `${prefix}Discard All`;
    case 'skipEveryone':
      return `${prefix}Skip Everyone`;
    case 'wildReverseDraw4':
      return 'Wild Reverse Draw 4';
    case 'wildDraw6':
      return 'Wild Draw 6';
    case 'wildDraw10':
      return 'Wild Draw 10';
    case 'wildColorRoulette':
      return 'Wild Color Roulette';
  }
}

const KIND_ORDER: Record<Card['kind'], number> = {
  number: 0,
  skip: 1,
  reverse: 2,
  discardAll: 3,
  skipEveryone: 4,
  draw2: 5,
  draw4: 6,
  wildReverseDraw4: 7,
  wildDraw6: 8,
  wildDraw10: 9,
  wildColorRoulette: 10,
};

/** Groups the hand by color then type, for readability. */
export function sortHand(hand: readonly Card[]): Card[] {
  const colorRank = (c: Card) => {
    const color = colorOf(c);
    return color ? CARD_COLORS.indexOf(color) : CARD_COLORS.length;
  };
  return [...hand].sort(
    (a, b) =>
      colorRank(a) - colorRank(b) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.kind === 'number' && b.kind === 'number' ? a.value - b.value : 0) ||
      a.id.localeCompare(b.id),
  );
}
