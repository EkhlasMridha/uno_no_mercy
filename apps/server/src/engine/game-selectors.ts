import type {
  GamePhaseView,
  PublicGameView,
  PublicPlayerView,
  ValidActions,
} from '@nomercy/shared';
import type { Card } from './card.types.js';
import type { GameState } from './game.types.js';
import { playableCards } from './game.validation.js';
import { canSupplyCard, topCard } from './pile.js';
import { RULES_CONFIG } from './rules-config.js';
import { isActive, playerAt } from './turn-manager.js';

export interface SeatPresence {
  connected: (playerId: string) => boolean;
  hostId: string;
}

const NO_ACTIONS: ValidActions = {
  playableCardIds: [],
  drawnPlayableCardId: null,
  canDraw: false,
  canAcceptPenalty: false,
  canChooseRouletteColor: false,
  canCallUno: false,
  canDeclareWithPlay: false,
  catchablePlayerIds: [],
  swapTargetIds: [],
};

export function phaseView(state: GameState): GamePhaseView {
  const phase = state.phase;
  switch (phase.type) {
    case 'turn':
      return { type: 'turn' };
    case 'drawing':
      return { type: 'drawing', playerId: playerAt(state, state.currentIndex).id };
    case 'rouletteColor':
      return { type: 'rouletteColor', victimId: phase.victimId };
    case 'rouletteReveal': {
      const victim = state.players.find((p) => p.id === phase.victimId);
      return {
        type: 'rouletteReveal',
        victimId: phase.victimId,
        color: phase.color,
        // Order follows the reveal; a card is dropped if it left the hand (e.g. knockout).
        revealed: phase.revealedIds
          .map((id) => victim?.hand.find((c) => c.id === id))
          .filter((c): c is Card => c !== undefined),
      };
    }
    case 'finished':
      return { type: 'finished', winnerId: phase.winnerId, reason: phase.reason };
  }
}

/** Everything the given player may legally do. The client only renders this; it never re-derives rules. */
export function getValidActions(state: GameState, playerId: string): ValidActions {
  const index = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[index];
  if (!player || !isActive(player) || state.phase.type === 'finished') return NO_ACTIONS;

  const isTurn = index === state.currentIndex;
  const phase = state.phase;
  const playable = playableCards(state, index).map((c) => c.id);
  const others = state.players.filter((p) => p.id !== playerId && isActive(p));

  return {
    playableCardIds: playable,
    drawnPlayableCardId: isTurn && phase.type === 'drawing' ? phase.playableCardId : null,
    canDraw:
      (isTurn && phase.type === 'rouletteReveal') ||
      (isTurn && phase.type === 'drawing' && (playable.length === 0 || canSupplyCard(state))) ||
      (isTurn &&
        phase.type === 'turn' &&
        !state.pendingDraw &&
        (RULES_CONFIG.allowVoluntaryDraw || playable.length === 0) &&
        (playable.length === 0 || canSupplyCard(state))),
    canAcceptPenalty: isTurn && phase.type === 'turn' && state.pendingDraw !== null,
    canChooseRouletteColor: phase.type === 'rouletteColor' && phase.victimId === playerId,
    canCallUno: player.hand.length === 1 && player.uno !== 'declared',
    canDeclareWithPlay: isTurn && player.hand.length === 2 && playable.length > 0,
    catchablePlayerIds: others.filter((p) => p.uno === 'vulnerable').map((p) => p.id),
    swapTargetIds: others.map((p) => p.id),
  };
}

export function toPublicGameView(state: GameState, presence: SeatPresence): PublicGameView {
  const players: PublicPlayerView[] = state.players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    seat,
    handCount: p.hand.length,
    status: p.status,
    eliminationReason: p.eliminationReason,
    connected: presence.connected(p.id),
    uno: p.uno,
    isHost: p.id === presence.hostId,
  }));
  return {
    players,
    currentPlayerId:
      state.phase.type === 'finished' ? null : playerAt(state, state.currentIndex).id,
    direction: state.direction,
    currentColor: state.currentColor,
    topCard: topCard(state),
    discardCount: state.discardPile.length,
    drawCount: state.drawPile.length,
    setAsideCount: state.setAside.length,
    pendingDraw: state.pendingDraw ? { ...state.pendingDraw } : null,
    phase: phaseView(state),
    log: state.log.slice(-40),
    playHistory: state.playHistory.slice(),
  };
}
