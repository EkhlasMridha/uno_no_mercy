import { colorOf, isWildCard, type Card, type CardColor } from './card.types.js';
import { fail } from './errors.js';
import type { GameCommand, GameState, PlayerState } from './game.types.js';
import { topCard } from './pile.js';
import { canStackOnto } from './stacking.js';
import { isActive, playerAt } from './turn-manager.js';

/** Normal matching: color, number, or symbol. Wild cards are always playable. */
export function matchesTop(card: Card, top: Card, currentColor: CardColor): boolean {
  if (isWildCard(card)) return true;
  if (colorOf(card) === currentColor) return true;
  if (card.kind === 'number') return top.kind === 'number' && top.value === card.value;
  return card.kind === top.kind;
}

/** Whether `card` may be played by the player at `index` in the current state. */
export function isCardPlayable(state: GameState, index: number, card: Card): boolean {
  if (index !== state.currentIndex) return false;
  const phase = state.phase;
  if (phase.type === 'drawing') return card.id === phase.playableCardId;
  if (phase.type !== 'turn') return false;
  if (state.pendingDraw) return canStackOnto(card, state.pendingDraw);
  return matchesTop(card, topCard(state), state.currentColor);
}

export function playableCards(state: GameState, index: number): Card[] {
  const player = playerAt(state, index);
  if (!isActive(player)) return [];
  return player.hand.filter((card) => isCardPlayable(state, index, card));
}

export function requireActive(player: PlayerState): void {
  if (!isActive(player)) fail('INVALID_MOVE', 'You have been eliminated from this game');
}

export function requireTurn(state: GameState, index: number): void {
  if (state.currentIndex !== index) fail('NOT_YOUR_TURN', 'It is not your turn');
}

type PlayCommand = Extract<GameCommand, { type: 'playCard' }>;

/** Validates a play and returns the card being played. Throws RuleViolation on failure. */
export function validatePlay(state: GameState, index: number, cmd: PlayCommand): Card {
  const player = playerAt(state, index);
  requireActive(player);
  requireTurn(state, index);
  if (state.phase.type !== 'turn' && state.phase.type !== 'drawing') {
    fail('INVALID_PHASE', 'You cannot play a card right now');
  }
  const card = player.hand.find((c) => c.id === cmd.cardId);
  if (!card) fail('CARD_NOT_IN_HAND', 'That card is not in your hand');

  if (state.phase.type === 'drawing' && card.id !== state.phase.playableCardId) {
    fail('INVALID_MOVE', 'Once you start drawing, you can only play the last card you drew');
  }
  if (!isCardPlayable(state, index, card)) {
    if (state.pendingDraw) {
      fail(
        'INVALID_MOVE',
        `A +${state.pendingDraw.total} penalty is pending: stack a Draw card of +${state.pendingDraw.lastValue} or higher, or take the cards`,
      );
    }
    fail(
      'INVALID_MOVE',
      'That card does not match the color, number or symbol on the discard pile',
    );
  }

  if (isWildCard(card) && card.kind !== 'wildColorRoulette' && !cmd.color) {
    fail('INVALID_MOVE', 'Choose a color for your wild card');
  }

  if (cmd.discardIds) validateDiscardChoice(player, card, cmd.discardIds);

  const cardsLeftAfterPlay = player.hand.length - 1;
  if (card.kind === 'number' && card.value === 7 && cardsLeftAfterPlay > 0) {
    if (!cmd.swapTargetId) fail('INVALID_TARGET', 'Choose a player to swap hands with');
    const target = state.players.find((p) => p.id === cmd.swapTargetId);
    if (!target || target.id === player.id || !isActive(target)) {
      fail('INVALID_TARGET', 'You must swap with another active player');
    }
  }
  return card;
}

/** Discard All: the chosen extras must be distinct other cards of its color in the hand. */
function validateDiscardChoice(player: PlayerState, card: Card, ids: readonly string[]): void {
  if (card.kind !== 'discardAll') {
    if (ids.length > 0) fail('INVALID_MOVE', 'Only Discard All lets you discard extra cards');
    return;
  }
  if (new Set(ids).size !== ids.length) fail('INVALID_MOVE', 'A card was chosen twice');
  for (const id of ids) {
    const extra = player.hand.find((c) => c.id === id);
    if (!extra || extra.id === card.id || colorOf(extra) !== card.color) {
      fail('INVALID_MOVE', 'You can only discard other cards of the Discard All color');
    }
  }
}
