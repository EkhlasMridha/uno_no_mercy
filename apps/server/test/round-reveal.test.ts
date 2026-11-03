import { describe, expect, it } from 'vitest';
import { toGameView } from '../src/rooms/projections.js';
import type { Room } from '../src/rooms/room.types.js';
import type { GameState } from '../src/engine/index.js';
import { buildState, cardId, filler, handOf, n, PLAYER_IDS, run } from './helpers.js';

/** Just the fields `toGameView` reads. */
function roomFor(game: GameState): Room {
  return {
    code: 'ABCD',
    hostId: PLAYER_IDS[0],
    game,
    turnHoldUntil: 0,
    status: game.phase.type === 'finished' ? 'roundOver' : 'inGame',
    handShares: [],
    players: game.players.map((p) => ({
      id: p.id,
      socketId: 's',
      isComputer: false,
      gender: null,
    })),
  } as unknown as Room;
}

describe('round reveal', () => {
  const start = () =>
    buildState({
      hands: [[n('red', 3)], [n('blue', 1), n('blue', 2)], filler(2)],
      top: n('red', 9),
      drawPile: [n('green', 1), n('green', 2), n('green', 3)],
      discardBelow: [n('yellow', 4)],
    });

  it('sends nothing extra while the round is on', () => {
    const s = start();
    const view = toGameView(roomFor(s), PLAYER_IDS[0] as string);
    expect(view?.reveal).toBeNull();
    const text = JSON.stringify(view);
    for (const id of [...handOf(s, 1), ...handOf(s, 2), ...s.drawPile].map((c) => c.id)) {
      expect(text).not.toContain(id);
    }
  });

  it('lays every hand and both piles open once the round is finished', () => {
    const s = start();
    const next = s.drawPile[s.drawPile.length - 1];
    const done = run(s, 0, { type: 'playCard', cardId: cardId(s, 0) });
    expect(done.phase.type).toBe('finished');

    // Any player gets the same table, not only the winner.
    const view = toGameView(roomFor(done), PLAYER_IDS[2] as string);
    const reveal = view?.reveal;
    expect(reveal?.hands.map((h) => h.playerId)).toEqual(done.players.map((p) => p.id));
    expect(reveal?.hands[1]?.cards.map((c) => c.id)).toEqual(handOf(done, 1).map((c) => c.id));
    // Draw order: the first card listed is the one the next draw would take.
    expect(reveal?.drawPile[0]?.id).toBe(next?.id);
    expect(reveal?.drawPile).toHaveLength(3);
    // Play order: oldest first, the winning card on top.
    expect(reveal?.discardPile.at(-1)?.id).toBe(done.discardPile.at(-1)?.id);
    expect(reveal?.discardPile).toHaveLength(done.discardPile.length);
  });
});
