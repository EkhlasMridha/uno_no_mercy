import { CARD_COLORS, colorOf, isWildCard, type Card, type CardColor } from '@nomercy/shared';
import { getValidActions, type GameCommand, type GameState, type Rng } from '../engine/index.js';
import { shuffle } from '../engine/rng.js';

/** Enough distinct names for a full table of computers, with spares for a clash. */
const COMPUTER_NAMES = [
  'Lucky Lou',
  'Shuffle Sue',
  'Wild Willa',
  'Dealer Dee',
  'Bluff Barry',
  'Stacker Stan',
  'Ace Avery',
  'Joker Joe',
  'Skip Skye',
  'Draw Drew',
  'Mercy Max',
  'Chip Charlie',
  'Reverse Rita',
  'Card Shark Cass',
  'Pocket Pete',
  'Royal Rae',
  'High Roller Hal',
  'Cutthroat Kat',
  'Trick Tess',
  'Big Blind Bo',
  'Felt Freddie',
  'Rail Rosa',
  'Lady Luck Lena',
  'Spade Sam',
];

/** Distinct auto-generated names for computer opponents, never the human's own name. */
export function computerNames(count: number, takenName: string, rng: Rng): string[] {
  const taken = takenName.toLocaleLowerCase();
  return shuffle(COMPUTER_NAMES, rng)
    .filter((name) => name.toLocaleLowerCase() !== taken)
    .slice(0, count);
}

/** The color the computer holds most of, so the table stays on a color it can follow. */
function favoriteColor(hand: readonly Card[], rng: Rng): CardColor {
  const counts = CARD_COLORS.map((color) => hand.filter((c) => colorOf(c) === color).length);
  const best = Math.max(...counts);
  return CARD_COLORS[best > 0 ? counts.indexOf(best) : rng(CARD_COLORS.length)] as CardColor;
}

/**
 * A legal move for a computer seat, picked only from the server's valid actions.
 * Returns null when this seat has nothing to do right now.
 */
export function chooseComputerMove(
  state: GameState,
  playerId: string,
  rng: Rng,
): GameCommand | null {
  const actions = getValidActions(state, playerId);
  if (actions.canCallUno) return { type: 'callUno' };
  const catchable = actions.catchablePlayerIds[0];
  if (catchable) return { type: 'catchUno', targetId: catchable };
  if (actions.canChooseRouletteColor) {
    return { type: 'chooseRouletteColor', color: favoriteColor([], rng) };
  }

  const hand = state.players.find((p) => p.id === playerId)?.hand ?? [];
  const playable = hand.filter((c) => actions.playableCardIds.includes(c.id));
  // Hold wilds back until nothing else fits.
  const card = playable.find((c) => !isWildCard(c)) ?? playable[0];
  if (card) {
    const swapTarget = state.players
      .filter((p) => actions.swapTargetIds.includes(p.id))
      .sort((a, b) => a.hand.length - b.hand.length)[0];
    return {
      type: 'playCard',
      cardId: card.id,
      color: isWildCard(card)
        ? favoriteColor(
            hand.filter((c) => c.id !== card.id),
            rng,
          )
        : undefined,
      swapTargetId: card.kind === 'number' && card.value === 7 ? swapTarget?.id : undefined,
      declareUno: actions.canDeclareWithPlay,
    };
  }
  if (actions.canAcceptPenalty) return { type: 'acceptPenalty' };
  if (actions.canDraw) return { type: 'draw' };
  return null;
}
