import type { Card, CardColor, CardFace, Direction } from '@nomercy/shared';
import { applyCommand, seededRng, type GameCommand, type GameState } from '../src/engine/index.js';
import type { PendingDraw } from '../src/engine/game.types.js';

let counter = 0;
export function card(face: CardFace): Card {
  counter++;
  return { ...face, id: `ct${counter.toString().padStart(6, '0')}` } as Card;
}

export const n = (color: CardColor, value: number): CardFace =>
  ({ kind: 'number', color, value }) as CardFace;
export const act = (
  kind: 'skip' | 'reverse' | 'draw2' | 'draw4' | 'discardAll' | 'skipEveryone',
  color: CardColor,
): CardFace => ({ kind, color });
export const wild = (
  kind: 'wildReverseDraw4' | 'wildDraw6' | 'wildDraw10' | 'wildColorRoulette',
): CardFace => ({ kind });

export interface StateSpec {
  hands: CardFace[][];
  top: CardFace;
  /** Listed top-first: drawPile[0] is drawn first. */
  drawPile?: CardFace[];
  discardBelow?: CardFace[];
  current?: number;
  direction?: Direction;
  pendingDraw?: PendingDraw | null;
  currentColor?: CardColor;
}

export const PLAYER_IDS = [
  'p_aaaaaaaa',
  'p_bbbbbbbb',
  'p_cccccccc',
  'p_dddddddd',
  'p_eeeeeeee',
  'p_ffffffff',
];

/** Builds a hand-crafted state (not 168 cards; do not enable invariant checks on it). */
export function buildState(spec: StateSpec): GameState {
  const top = card(spec.top);
  return {
    version: 1,
    players: spec.hands.map((hand, i) => ({
      id: PLAYER_IDS[i] as string,
      name: `P${i}`,
      hand: hand.map(card),
      status: 'active',
      eliminationReason: null,
      uno: 'none',
    })),
    drawPile: (spec.drawPile ?? []).map(card).reverse(),
    discardPile: [...(spec.discardBelow ?? []).map(card), top],
    setAside: [],
    currentColor: spec.currentColor ?? ('color' in top ? top.color : 'red'),
    direction: spec.direction ?? 1,
    currentIndex: spec.current ?? 0,
    dealerIndex: 0,
    phase: { type: 'turn' },
    pendingDraw: spec.pendingDraw ?? null,
    log: [],
    logSeq: 0,
    playHistory: [{ playerId: null, card: top, chosenColor: null }],
    endWhenOut: [],
  };
}

export const rng = seededRng(42);

export function run(state: GameState, playerIndex: number, command: GameCommand): GameState {
  const outcome = applyCommand(state, PLAYER_IDS[playerIndex] as string, command, rng);
  if (!outcome.ok) throw new Error(`${outcome.error.code}: ${outcome.error.message}`);
  return outcome.state;
}

export function reject(state: GameState, playerIndex: number, command: GameCommand): string {
  const outcome = applyCommand(state, PLAYER_IDS[playerIndex] as string, command, rng);
  if (outcome.ok) throw new Error('Expected the command to be rejected');
  return outcome.error.code;
}

export function handOf(state: GameState, index: number): Card[] {
  return (state.players[index] as GameState['players'][number]).hand;
}

export function cardId(state: GameState, index: number, position = 0): string {
  return (handOf(state, index)[position] as Card).id;
}

export function filler(count: number, color: CardColor = 'green', value = 5): CardFace[] {
  return Array.from({ length: count }, () => n(color, value));
}
