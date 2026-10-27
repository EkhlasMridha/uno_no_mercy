import type { ApiError, GameEvent } from '@nomercy/shared';
import { isWildCard } from './card.types.js';
import {
  applyCardEffect,
  removeFromHand,
  revealRouletteCard,
  startRouletteReveal,
  takeDiscardAllExtras,
  type EffectContext,
} from './card-effects.js';
import { assertCardConservation } from './conservation.js';
import { fail, RuleViolation } from './errors.js';
import type { GameCommand, GameState } from './game.types.js';
import {
  matchesTop,
  playableCards,
  requireActive,
  requireTurn,
  validatePlay,
} from './game.validation.js';
import { eliminatePlayer, enforceMercy, reachesMercyLimit } from './mercy-rule.js';
import { canSupplyCard, drawCardsInto, topCard } from './pile.js';
import type { Rng } from './rng.js';
import { RULES_CONFIG } from './rules-config.js';
import { acceptPendingPenalty } from './stacking.js';
import { advanceTurn, currentPlayer, playerAt, requirePlayer } from './turn-manager.js';
import { callUno, catchUno, closeCatchWindows, syncUnoStatus } from './uno-manager.js';
import { checkEmptyHandWin, checkLastStanding, isFinished } from './win-condition.js';

export interface ApplyOptions {
  /** Verify 168-card conservation after every transition (development). */
  checkInvariants?: boolean;
}

export type CommandOutcome =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ApiError };

/**
 * The single authoritative state-transition pathway. Works on a clone so a rejected
 * command can never leave a half-applied state behind.
 */
export function applyCommand(
  previous: GameState,
  playerId: string,
  command: GameCommand,
  rng: Rng,
  options: ApplyOptions = {},
): CommandOutcome {
  const state = structuredClone(previous);
  const events: GameEvent[] = [];
  const ctx: EffectContext = { state, rng, events };
  try {
    if (isFinished(state)) fail('GAME_NOT_ACTIVE', 'This game is over');
    const { index } = requirePlayer(state, playerId);
    dispatch(ctx, index, command);
    finalizeTransition(state, events);
    if (options.checkInvariants) assertCardConservation(state);
    return { ok: true, state, events };
  } catch (error) {
    if (error instanceof RuleViolation) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

function dispatch(ctx: EffectContext, index: number, command: GameCommand): void {
  switch (command.type) {
    case 'playCard':
      return handlePlayCard(ctx, index, command);
    case 'draw':
      return handleDraw(ctx, index);
    case 'acceptPenalty':
      return handleAcceptPenalty(ctx, index);
    case 'chooseRouletteColor':
      return handleRouletteColor(ctx, index, command.color);
    case 'callUno':
      return callUno(ctx.state, playerAt(ctx.state, index).id, ctx.events);
    case 'catchUno':
      return catchUno(
        ctx.state,
        playerAt(ctx.state, index).id,
        command.targetId,
        ctx.rng,
        ctx.events,
      );
    case 'forfeit':
      return handleForfeit(ctx, index);
  }
}

function handlePlayCard(
  ctx: EffectContext,
  index: number,
  command: Extract<GameCommand, { type: 'playCard' }>,
): void {
  const { state, events } = ctx;
  const card = validatePlay(state, index, command);
  const player = playerAt(state, index);
  closeCatchWindows(state, player.id);

  removeFromHand(player, card.id);
  const extras =
    card.kind === 'discardAll' ? takeDiscardAllExtras(player, card.color, command.discardIds) : [];
  // Discard All: the extra cards go underneath the played card.
  state.discardPile.push(...extras, card);

  let chosenColor = null;
  if (isWildCard(card)) {
    if (card.kind !== 'wildColorRoulette' && command.color) {
      state.currentColor = command.color;
      chosenColor = command.color;
    }
  } else {
    state.currentColor = card.color;
  }
  state.phase = { type: 'turn' };
  state.playHistory.push(
    ...extras.map((extra) => ({ playerId: player.id, card: extra, chosenColor: null })),
    { playerId: player.id, card, chosenColor },
  );
  events.push({ type: 'cardPlayed', playerId: player.id, card, chosenColor });
  if (card.kind === 'discardAll') {
    events.push({
      type: 'discardedAll',
      playerId: player.id,
      color: card.color,
      count: extras.length,
    });
  }
  if (command.declareUno && player.hand.length === 1) {
    player.uno = 'declared';
    events.push({ type: 'unoCalled', playerId: player.id });
  }

  // Precedence: emptying the hand wins before any card effect (7 swap, 0 pass, penalties).
  if (checkEmptyHandWin(state, index, events)) return;
  applyCardEffect(ctx, index, card, command);
}

/**
 * During a Color Roulette reveal, each draw turns over one card for the victim.
 *
 * Manual draw (no pending penalty): one card per command. A player may start drawing even while
 * holding a playable card. Once they draw, only the card drawn last may be played, and only if it
 * is playable; they may always draw again instead. Nothing else in the hand, including earlier
 * draws, may be played for the rest of the turn.
 */
function handleDraw(ctx: EffectContext, index: number): void {
  const { state, rng, events } = ctx;
  const player = playerAt(state, index);
  requireActive(player);
  requireTurn(state, index);
  if (state.phase.type === 'rouletteReveal') {
    closeCatchWindows(state, player.id);
    return revealRouletteCard(ctx, index);
  }
  if (state.phase.type !== 'turn' && state.phase.type !== 'drawing') {
    fail('INVALID_PHASE', 'You cannot draw right now');
  }
  if (state.pendingDraw) {
    fail('INVALID_MOVE', 'A penalty is pending: stack a Draw card or take the penalty');
  }
  if (state.phase.type === 'drawing' && state.phase.lastChance) {
    fail('INVALID_MOVE', 'You hold 25 cards: play the card you just drew to stay in the game');
  }
  if (!RULES_CONFIG.allowVoluntaryDraw && playableCards(state, index).length > 0) {
    fail('INVALID_MOVE', 'You have a playable card, so you must play instead of drawing');
  }
  if (!canSupplyCard(state) && playableCards(state, index).length > 0) {
    fail('INVALID_MOVE', 'There are no cards left to draw, so play a card');
  }
  closeCatchWindows(state, player.id);

  const { drawn, exhausted } = drawCardsInto(state, index, 1, rng, events, 'noPlayableCard', true);
  const card = drawn[0];
  const playable = card ? matchesTop(card, topCard(state), state.currentColor) : false;
  // Last chance (docs/RULES.md §5.13): a playable 25th card spares you, as long as you play it.
  const lastChance =
    RULES_CONFIG.lastChanceDraw && reachesMercyLimit(player.hand.length) && playable;
  const eliminated = !lastChance && enforceMercy(state, index, events);
  // Mercy knockout, or no card exists to draw (docs/RULES.md §6): the turn passes.
  if (eliminated || exhausted || !card) {
    state.phase = { type: 'turn' };
    advanceTurn(state, index);
    return;
  }
  state.phase = { type: 'drawing', playableCardId: playable ? card.id : null, lastChance };
}

function handleAcceptPenalty(ctx: EffectContext, index: number): void {
  const { state } = ctx;
  const player = playerAt(state, index);
  requireActive(player);
  requireTurn(state, index);
  if (state.phase.type !== 'turn' || !state.pendingDraw) {
    fail('INVALID_PHASE', 'There is no penalty to take');
  }
  closeCatchWindows(state, player.id);
  acceptPendingPenalty(state, ctx.rng, ctx.events);
}

function handleRouletteColor(
  ctx: EffectContext,
  index: number,
  color: Parameters<typeof startRouletteReveal>[2],
): void {
  const { state } = ctx;
  const player = playerAt(state, index);
  requireActive(player);
  if (state.phase.type !== 'rouletteColor' || state.phase.victimId !== player.id) {
    fail('INVALID_PHASE', 'You are not choosing a Color Roulette color');
  }
  closeCatchWindows(state, player.id);
  startRouletteReveal(ctx, index, color);
}

/**
 * Player left or their reconnect window expired. They are eliminated (not a Mercy knockout).
 * If it was their turn, any pending penalty aimed at them is void and play moves on.
 */
function handleForfeit(ctx: EffectContext, index: number): void {
  const { state, events } = ctx;
  const player = playerAt(state, index);
  if (player.status !== 'active') fail('INVALID_MOVE', 'Player is already out of the game');
  const wasCurrent = state.currentIndex === index;
  eliminatePlayer(state, index, 'forfeit', events);
  if (wasCurrent) {
    state.pendingDraw = null;
    state.phase = { type: 'turn' };
    advanceTurn(state, index);
  }
}

/** Step 6 of the pathway: UNO normalization, victory check, turn sanity, version, log. */
function finalizeTransition(state: GameState, events: GameEvent[]): void {
  syncUnoStatus(state);
  checkLastStanding(state, events);
  if (!isFinished(state) && currentPlayer(state).status !== 'active') {
    state.pendingDraw = null;
    state.phase = { type: 'turn' };
    advanceTurn(state, state.currentIndex);
  }
  state.version++;
  for (const event of events) state.log.push({ seq: ++state.logSeq, event });
  if (state.log.length > RULES_CONFIG.logLimit) {
    state.log.splice(0, state.log.length - RULES_CONFIG.logLimit);
  }
}
