import type { EndReason } from '@nomercy/shared';
import type { EventSink, GameState } from './game.types.js';
import { activePlayers, playerAt } from './turn-manager.js';

export function isFinished(state: GameState): boolean {
  return state.phase.type === 'finished';
}

export function finishGame(
  state: GameState,
  winnerId: string | null,
  reason: EndReason | null,
  events: EventSink,
): void {
  if (isFinished(state)) return;
  state.phase = { type: 'finished', winnerId, reason };
  state.pendingDraw = null;
  if (winnerId && reason && reason !== 'peopleOut') {
    events.push({ type: 'gameWon', playerId: winnerId, reason });
  }
}

/** Win condition 1: the player emptied their hand. Checked before any card effect resolves. */
export function checkEmptyHandWin(state: GameState, index: number, events: EventSink): boolean {
  const player = playerAt(state, index);
  if (player.status === 'active' && player.hand.length === 0) {
    finishGame(state, player.id, 'emptyHand', events);
    return true;
  }
  return false;
}

/** Win condition 2: every other player has been eliminated. Also ends a computer table once its people are out. */
export function checkLastStanding(state: GameState, events: EventSink): boolean {
  if (isFinished(state)) return true;
  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    finishGame(state, (remaining[0] as { id: string }).id, 'lastStanding', events);
    return true;
  }
  if (remaining.length === 0) {
    finishGame(state, null, null, events);
    return true;
  }
  // A table with computers stops once its people are out; nobody watches the computers play on.
  const out = new Set(state.players.filter((p) => p.status !== 'active').map((p) => p.id));
  if (state.endWhenOut.length > 0 && state.endWhenOut.every((id) => out.has(id))) {
    finishGame(state, null, 'peopleOut', events);
    return true;
  }
  return false;
}
