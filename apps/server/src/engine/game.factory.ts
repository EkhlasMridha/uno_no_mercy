import { MAX_PLAYERS, MIN_PLAYERS, STARTING_HAND_SIZE } from '@nomercy/shared';
import type { Card, NumberCard } from './card.types.js';
import { createShuffledDeck } from './deck.js';
import type { EventSink, GameState, PlayerState } from './game.types.js';
import type { Rng } from './rng.js';

export interface NewPlayer {
  id: string;
  name: string;
}

export interface CreateGameOptions {
  players: readonly NewPlayer[];
  dealerIndex: number;
  rng: Rng;
  /** Optional pre-built deck (top of draw pile = last element). Used by tests. */
  deck?: Card[];
  /** Players whose knockout ends the round with no winner (the people at a table with computers). */
  endWhenOut?: string[];
}

/**
 * Setup per the official sheet: shuffle, deal 7 each, flip the first discard (action/wild
 * cards are ignored and the next card is flipped), player left of the dealer starts, clockwise.
 */
export function createGame(options: CreateGameOptions): { state: GameState; events: EventSink } {
  const { players, rng } = options;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const n = players.length;
  const dealerIndex = ((options.dealerIndex % n) + n) % n;
  const drawPile = options.deck ? options.deck.slice() : createShuffledDeck(rng);

  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: [],
    status: 'active',
    eliminationReason: null,
    uno: 'none',
  }));

  for (let round = 0; round < STARTING_HAND_SIZE; round++) {
    for (let offset = 1; offset <= n; offset++) {
      const card = drawPile.pop();
      if (!card) throw new Error('Deck ran out while dealing');
      (playerStates[(dealerIndex + offset) % n] as PlayerState).hand.push(card);
    }
  }

  const ignored: Card[] = [];
  let first: NumberCard | null = null;
  while (!first) {
    const card = drawPile.pop();
    if (!card) throw new Error('No number card available for the first discard');
    if (card.kind === 'number') first = card;
    else ignored.push(card);
  }

  const firstIndex = (dealerIndex + 1) % n;
  const state: GameState = {
    version: 1,
    players: playerStates,
    drawPile,
    discardPile: [...ignored, first],
    setAside: [],
    currentColor: first.color,
    direction: 1,
    currentIndex: firstIndex,
    dealerIndex,
    phase: { type: 'turn' },
    pendingDraw: null,
    log: [],
    logSeq: 0,
    playHistory: [{ playerId: null, card: first, chosenColor: null }],
    playHistoryStart: 0,
    endWhenOut: options.endWhenOut ?? [],
  };
  const events: EventSink = [
    {
      type: 'gameStarted',
      dealerId: (playerStates[dealerIndex] as PlayerState).id,
      firstPlayerId: (playerStates[firstIndex] as PlayerState).id,
      topCard: first,
      ignoredInitialCards: ignored.length,
    },
  ];
  state.log = events.map((event) => ({ seq: ++state.logSeq, event }));
  return { state, events };
}
