import { DECK_SIZE } from '@nomercy/shared';
import {
  CARD_COLORS,
  NUMBER_VALUES,
  type Card,
  type CardFace,
  type ColoredActionKind,
  type WildKind,
} from './card.types.js';
import { shuffle, type Rng } from './rng.js';

/**
 * Verified 168-card base deck composition (see docs/RULES.md §2).
 * Per color: two of each number 0–9 (20) + 16 colored action cards = 36; ×4 = 144.
 * Plus 24 wild cards. 144 + 24 = 168.
 */
export const DECK_COMPOSITION = {
  numberCopiesPerColor: 2,
  coloredActionsPerColor: {
    skip: 3,
    reverse: 3,
    draw2: 3,
    draw4: 2,
    discardAll: 3,
    skipEveryone: 2,
  } satisfies Record<ColoredActionKind, number>,
  wilds: {
    wildReverseDraw4: 8,
    wildDraw6: 4,
    wildDraw10: 4,
    wildColorRoulette: 8,
  } satisfies Record<WildKind, number>,
} as const;

export function buildDeckFaces(): CardFace[] {
  const faces: CardFace[] = [];
  for (const color of CARD_COLORS) {
    for (const value of NUMBER_VALUES) {
      for (let i = 0; i < DECK_COMPOSITION.numberCopiesPerColor; i++) {
        faces.push({ kind: 'number', color, value });
      }
    }
    for (const [kind, count] of Object.entries(DECK_COMPOSITION.coloredActionsPerColor)) {
      for (let i = 0; i < count; i++) {
        faces.push({ kind: kind as ColoredActionKind, color });
      }
    }
  }
  for (const [kind, count] of Object.entries(DECK_COMPOSITION.wilds)) {
    for (let i = 0; i < count; i++) {
      faces.push({ kind: kind as WildKind });
    }
  }
  if (faces.length !== DECK_SIZE) {
    throw new Error(`Deck composition produced ${faces.length} cards, expected ${DECK_SIZE}`);
  }
  return faces;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Card ids are random per game so that an id never reveals a card's face or deck position.
 */
function generateCardIds(count: number, rng: Rng): string[] {
  const ids = new Set<string>();
  while (ids.size < count) {
    let id = 'c';
    for (let i = 0; i < 8; i++) id += ID_ALPHABET[rng(ID_ALPHABET.length)];
    ids.add(id);
  }
  return [...ids];
}

/** Creates the 168 unique physical cards, shuffled. */
export function createShuffledDeck(rng: Rng): Card[] {
  const faces = buildDeckFaces();
  const ids = generateCardIds(faces.length, rng);
  const cards = faces.map((face, i) => ({ ...face, id: ids[i] as string }) as Card);
  return shuffle(cards, rng);
}
