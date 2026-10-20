/**
 * Card model shared by server and client.
 * Cards are physical instances: every card has a unique id, even when faces repeat.
 */

export const CARD_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type NumberValue = (typeof NUMBER_VALUES)[number];

export const COLORED_ACTION_KINDS = [
  'skip',
  'reverse',
  'draw2',
  'draw4',
  'discardAll',
  'skipEveryone',
] as const;
export type ColoredActionKind = (typeof COLORED_ACTION_KINDS)[number];

export const WILD_KINDS = [
  'wildReverseDraw4',
  'wildDraw6',
  'wildDraw10',
  'wildColorRoulette',
] as const;
export type WildKind = (typeof WILD_KINDS)[number];

export interface NumberCard {
  readonly id: string;
  readonly kind: 'number';
  readonly color: CardColor;
  readonly value: NumberValue;
}

export interface ColoredActionCard {
  readonly id: string;
  readonly kind: ColoredActionKind;
  readonly color: CardColor;
}

export interface WildCard {
  readonly id: string;
  readonly kind: WildKind;
}

export type Card = NumberCard | ColoredActionCard | WildCard;
export type CardKind = Card['kind'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A card face without its physical identity. */
export type CardFace = DistributiveOmit<Card, 'id'>;

const WILD_KIND_SET: ReadonlySet<string> = new Set(WILD_KINDS);

export function isWildCard(card: CardFace): card is DistributiveOmit<WildCard, 'id'> {
  return WILD_KIND_SET.has(card.kind);
}

export function isNumberCard(card: CardFace): card is Omit<NumberCard, 'id'> {
  return card.kind === 'number';
}

export function colorOf(card: CardFace): CardColor | null {
  return 'color' in card ? card.color : null;
}

/** Printed draw value of each Draw Card. Used for stacking. */
export const DRAW_CARD_VALUES: Readonly<Partial<Record<CardKind, number>>> = {
  draw2: 2,
  draw4: 4,
  wildReverseDraw4: 4,
  wildDraw6: 6,
  wildDraw10: 10,
};

export function drawValueOf(card: CardFace): number | null {
  return DRAW_CARD_VALUES[card.kind] ?? null;
}
