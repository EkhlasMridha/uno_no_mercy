import { colorOf, drawValueOf, type Card, type CardColor } from './card.types.js';
import type { EventSink, GameCommand, GameState, PlayerState } from './game.types.js';
import { enforceMercy, reachesMercyLimit } from './mercy-rule.js';
import { drawOne } from './pile.js';
import type { Rng } from './rng.js';
import { RULES_CONFIG } from './rules-config.js';
import { pushDrawPenalty } from './stacking.js';
import {
  activePlayerCount,
  advanceTurn,
  indexOfPlayer,
  isActive,
  nextActiveIndex,
  playerAt,
} from './turn-manager.js';

export interface EffectContext {
  state: GameState;
  rng: Rng;
  events: EventSink;
}

type PlayCommand = Extract<GameCommand, { type: 'playCard' }>;

export function removeFromHand(player: PlayerState, cardId: string): Card {
  const index = player.hand.findIndex((c) => c.id === cardId);
  const [card] = player.hand.splice(index, 1);
  if (!card) throw new Error('Card not in hand');
  return card;
}

/**
 * Discard All: removes the other cards of the same color from the hand. With `chosenIds`
 * the player discards only those (already validated); otherwise every matching card.
 */
export function takeDiscardAllExtras(
  player: PlayerState,
  color: CardColor,
  chosenIds?: readonly string[],
): Card[] {
  const chosen = chosenIds ? new Set(chosenIds) : null;
  const isExtra = (c: Card) => colorOf(c) === color && (!chosen || chosen.has(c.id));
  const extras = player.hand.filter(isExtra);
  player.hand = player.hand.filter((c) => !isExtra(c));
  return extras;
}

/** 7's Swap: atomic exchange of two complete hands. */
export function swapHands(state: GameState, a: number, b: number, events: EventSink): void {
  const pa = playerAt(state, a);
  const pb = playerAt(state, b);
  const handA = pa.hand;
  pa.hand = pb.hand;
  pb.hand = handA;
  pa.uno = 'none';
  pb.uno = 'none';
  events.push({ type: 'handsSwapped', playerId: pa.id, targetId: pb.id });
}

/** 0's Pass: every active hand moves to the next active player in the current direction, simultaneously. */
export function passHands(state: GameState, events: EventSink): void {
  const snapshot = state.players.map((p) => p.hand);
  const nextHands = state.players.map((p) => p.hand);
  const passes: { fromId: string; toId: string }[] = [];
  state.players.forEach((player, index) => {
    if (!isActive(player)) return;
    const receiver = nextActiveIndex(state, index);
    nextHands[receiver] = snapshot[index] as Card[];
    passes.push({ fromId: player.id, toId: playerAt(state, receiver).id });
  });
  state.players.forEach((player, index) => {
    if (!isActive(player)) return;
    player.hand = nextHands[index] as Card[];
    player.uno = 'none';
  });
  events.push({ type: 'handsPassed', direction: state.direction, passes });
}

function reverseDirection(state: GameState, events: EventSink): void {
  state.direction = state.direction === 1 ? -1 : 1;
  events.push({ type: 'directionReversed', direction: state.direction });
}

/**
 * Applies the effect of a card that has already been moved to the discard pile, after the
 * empty-hand win check. Sets the next current player / phase.
 */
export function applyCardEffect(
  ctx: EffectContext,
  actorIndex: number,
  card: Card,
  cmd: PlayCommand,
): void {
  const { state, events } = ctx;
  const actor = playerAt(state, actorIndex);

  switch (card.kind) {
    case 'number': {
      if (card.value === 7 && cmd.swapTargetId) {
        swapHands(state, actorIndex, indexOfPlayer(state, cmd.swapTargetId), events);
      } else if (card.value === 0) {
        passHands(state, events);
      }
      advanceTurn(state, actorIndex);
      return;
    }
    case 'skip': {
      const skipped = nextActiveIndex(state, actorIndex);
      events.push({ type: 'turnSkipped', playerId: playerAt(state, skipped).id });
      advanceTurn(state, actorIndex, 1);
      return;
    }
    case 'reverse': {
      reverseDirection(state, events);
      if (activePlayerCount(state) === 2) {
        // Two players: Reverse acts as a Skip and the player goes again.
        const other = nextActiveIndex(state, actorIndex);
        events.push({ type: 'turnSkipped', playerId: playerAt(state, other).id });
        state.currentIndex = actorIndex;
      } else {
        advanceTurn(state, actorIndex);
      }
      return;
    }
    case 'skipEveryone': {
      events.push({ type: 'everyoneSkipped', playerId: actor.id });
      state.currentIndex = actorIndex;
      return;
    }
    case 'discardAll': {
      advanceTurn(state, actorIndex);
      return;
    }
    case 'draw2':
    case 'draw4':
    case 'wildDraw6':
    case 'wildDraw10': {
      const target = nextActiveIndex(state, actorIndex);
      pushDrawPenalty(state, actor.id, drawValueOf(card) ?? 0, target, events);
      state.currentIndex = target;
      return;
    }
    case 'wildReverseDraw4': {
      reverseDirection(state, events);
      let target: number;
      if (activePlayerCount(state) === 2 && RULES_CONFIG.twoPlayerWildReverseDraw4HitsPlayer) {
        // Official two-player rule: the other player is skipped and YOU draw 4 (may stack back).
        const other = nextActiveIndex(state, actorIndex);
        events.push({ type: 'turnSkipped', playerId: playerAt(state, other).id });
        target = actorIndex;
      } else {
        target = nextActiveIndex(state, actorIndex);
      }
      pushDrawPenalty(state, actor.id, 4, target, events);
      state.currentIndex = target;
      return;
    }
    case 'wildColorRoulette': {
      const victim = nextActiveIndex(state, actorIndex);
      const victimId = playerAt(state, victim).id;
      events.push({ type: 'rouletteStarted', playerId: actor.id, victimId });
      state.phase = { type: 'rouletteColor', victimId };
      state.currentIndex = victim;
      return;
    }
  }
}

/**
 * Wild Color Roulette, step 1: the victim's named color becomes the active color and the
 * face-up reveal begins. Nothing is drawn until the victim draws.
 */
export function startRouletteReveal(
  ctx: EffectContext,
  victimIndex: number,
  color: CardColor,
): void {
  const { state, events } = ctx;
  const victim = playerAt(state, victimIndex);
  state.currentColor = color;
  state.phase = { type: 'rouletteReveal', victimId: victim.id, color, revealedIds: [] };
  events.push({ type: 'rouletteColorNamed', victimId: victim.id, color });
}

/**
 * Wild Color Roulette, step 2 (one per draw command): reveal one card into the victim's hand.
 * The reveal ends on a card of the named color (wilds never match), on a Mercy knockout, or
 * when no card can be supplied at all. It always ends because every reveal uses up a card.
 */
export function revealRouletteCard(ctx: EffectContext, victimIndex: number): void {
  const { state, rng, events } = ctx;
  const phase = state.phase;
  if (phase.type !== 'rouletteReveal') throw new Error('Not revealing Color Roulette cards');
  const victim = playerAt(state, victimIndex);
  const card = drawOne(state, rng, events);
  if (!card) return finishRoulette(ctx, victimIndex, false, true);
  victim.hand.push(card);
  phase.revealedIds.push(card.id);
  events.push({ type: 'rouletteCardRevealed', victimId: victim.id, card });
  if (colorOf(card) === phase.color) return finishRoulette(ctx, victimIndex, true, false);
  if (reachesMercyLimit(victim.hand.length)) finishRoulette(ctx, victimIndex, false, false);
}

function finishRoulette(
  ctx: EffectContext,
  victimIndex: number,
  matched: boolean,
  exhausted: boolean,
): void {
  const { state, events } = ctx;
  const phase = state.phase;
  if (phase.type !== 'rouletteReveal') return;
  const victim = playerAt(state, victimIndex);
  const ids = new Set(phase.revealedIds);
  const cards = victim.hand.filter((c) => ids.has(c.id));
  if (cards.length > 0) {
    events.push({
      type: 'cardsDrawn',
      playerId: victim.id,
      count: cards.length,
      reason: 'roulette',
    });
  }
  if (exhausted) events.push({ type: 'drawPileExhausted', playerId: victim.id });
  events.push({
    type: 'rouletteResolved',
    victimId: victim.id,
    color: phase.color,
    revealed: cards.length,
    matched,
    cards,
  });
  enforceMercy(state, victimIndex, events);
  state.phase = { type: 'turn' };
  advanceTurn(state, victimIndex);
}
