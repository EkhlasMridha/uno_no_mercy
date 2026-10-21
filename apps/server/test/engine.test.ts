import { describe, expect, it } from 'vitest';
import { DECK_SIZE, MERCY_HAND_LIMIT } from '@nomercy/shared';
import {
  assertCardConservation,
  buildDeckFaces,
  createGame,
  createShuffledDeck,
  getValidActions,
  seededRng,
} from '../src/engine/index.js';
import { matchesTop } from '../src/engine/game.validation.js';
import {
  act,
  buildState,
  card,
  cardId,
  filler,
  handOf,
  n,
  PLAYER_IDS,
  reject,
  run,
  wild,
} from './helpers.js';

describe('deck', () => {
  it('has exactly 168 cards with the verified composition', () => {
    const faces = buildDeckFaces();
    expect(faces).toHaveLength(DECK_SIZE);
    const count = (pred: (f: (typeof faces)[number]) => boolean) => faces.filter(pred).length;
    expect(count((f) => f.kind === 'number')).toBe(80);
    expect(count((f) => f.kind === 'number' && f.value === 0)).toBe(8);
    expect(count((f) => f.kind === 'skip')).toBe(12);
    expect(count((f) => f.kind === 'reverse')).toBe(12);
    expect(count((f) => f.kind === 'draw2')).toBe(12);
    expect(count((f) => f.kind === 'draw4')).toBe(8);
    expect(count((f) => f.kind === 'discardAll')).toBe(12);
    expect(count((f) => f.kind === 'skipEveryone')).toBe(8);
    expect(count((f) => f.kind === 'wildReverseDraw4')).toBe(8);
    expect(count((f) => f.kind === 'wildDraw6')).toBe(4);
    expect(count((f) => f.kind === 'wildDraw10')).toBe(4);
    expect(count((f) => f.kind === 'wildColorRoulette')).toBe(8);
  });

  it('gives every physical card a unique id', () => {
    const deck = createShuffledDeck(seededRng(1));
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
  });
});

describe('setup', () => {
  it('deals 7 cards each, flips a number card, and starts left of the dealer', () => {
    const players = PLAYER_IDS.slice(0, 4).map((id, i) => ({ id, name: `P${i}` }));
    const { state } = createGame({ players, dealerIndex: 2, rng: seededRng(7) });
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
    const top = state.discardPile[state.discardPile.length - 1];
    expect(top?.kind).toBe('number');
    expect(state.currentIndex).toBe(3);
    expect(state.direction).toBe(1);
    assertCardConservation(state);
  });

  it('ignores action cards flipped as the first discard', () => {
    const players = PLAYER_IDS.slice(0, 2).map((id, i) => ({ id, name: `P${i}` }));
    const deck = createShuffledDeck(seededRng(3)).filter((c) => c.kind !== 'number');
    const numberCard = createShuffledDeck(seededRng(4)).find((c) => c.kind === 'number');
    // Top of pile is the end: after dealing 14, the next two flips are wilds/actions, then the number.
    const stacked = [numberCard!, ...deck.slice(0, 16)];
    const { state, events } = createGame({
      players,
      dealerIndex: 0,
      rng: seededRng(1),
      deck: stacked,
    });
    expect(state.discardPile[state.discardPile.length - 1]?.kind).toBe('number');
    expect(events[0]).toMatchObject({ type: 'gameStarted', ignoredInitialCards: 2 });
  });
});

describe('matching', () => {
  it('matches color, number or symbol; wilds always', () => {
    const top = card(n('red', 5));
    expect(matchesTop(card(n('red', 1)), top, 'red')).toBe(true);
    expect(matchesTop(card(n('blue', 5)), top, 'red')).toBe(true);
    expect(matchesTop(card(n('blue', 6)), top, 'red')).toBe(false);
    expect(matchesTop(card(act('skip', 'blue')), card(act('skip', 'red')), 'red')).toBe(true);
    expect(matchesTop(card(act('draw4', 'blue')), card(act('draw2', 'red')), 'red')).toBe(false);
    expect(matchesTop(card(wild('wildDraw10')), top, 'red')).toBe(true);
    // After a wild, only the chosen color (or another wild) matches.
    expect(matchesTop(card(n('green', 2)), card(wild('wildDraw6')), 'green')).toBe(true);
    expect(matchesTop(card(n('red', 2)), card(wild('wildDraw6')), 'green')).toBe(false);
  });
});

describe('manual drawing', () => {
  it('once drawing, only the last drawn card may be played, and drawing may continue', () => {
    let s = buildState({
      hands: [[n('red', 3), n('green', 8)], [n('yellow', 1)]],
      top: n('red', 5),
      drawPile: [n('blue', 1), n('red', 7), n('green', 2), n('red', 9)],
    });
    const red3 = cardId(s, 0, 0);
    // Red 3 is playable, but the player chooses to draw instead: blue 1 is no match.
    s = run(s, 0, { type: 'draw' });
    expect(s.phase).toEqual({ type: 'drawing', playableCardId: null });
    expect(s.currentIndex).toBe(0);
    expect(getValidActions(s, pid(0))).toMatchObject({ playableCardIds: [], canDraw: true });
    expect(reject(s, 0, { type: 'playCard', cardId: red3 })).toBe('INVALID_MOVE');

    // Red 7 is playable, yet the player may still draw more.
    s = run(s, 0, { type: 'draw' });
    const red7 = handOf(s, 0).at(-1)!;
    expect(s.phase).toEqual({ type: 'drawing', playableCardId: red7.id });
    expect(getValidActions(s, pid(0))).toMatchObject({
      playableCardIds: [red7.id],
      drawnPlayableCardId: red7.id,
      canDraw: true,
    });

    // Drawing past it locks red 7: only the newest card counts.
    s = run(s, 0, { type: 'draw' });
    expect(s.phase).toEqual({ type: 'drawing', playableCardId: null });
    expect(reject(s, 0, { type: 'playCard', cardId: red7.id })).toBe('INVALID_MOVE');
    s = run(s, 0, { type: 'draw' });
    const red9 = handOf(s, 0).at(-1)!;
    expect(reject(s, 0, { type: 'playCard', cardId: red3 })).toBe('INVALID_MOVE');
    s = run(s, 0, { type: 'playCard', cardId: red9.id });
    expect(s.phase.type).toBe('turn');
    expect(s.currentIndex).toBe(1);
  });

  it('a playable first draw can be played, or the player can keep drawing', () => {
    const s = run(
      buildState({
        hands: [[n('red', 1)], [n('red', 2)]],
        top: n('red', 5),
        drawPile: [n('red', 7), ...deckFill()],
      }),
      0,
      { type: 'draw' },
    );
    const red7 = handOf(s, 0).at(-1)!;
    expect(s.currentIndex).toBe(0);
    expect(s.phase).toEqual({ type: 'drawing', playableCardId: red7.id });
    expect(getValidActions(s, pid(0)).canDraw).toBe(true);
    expect(handOf(run(s, 0, { type: 'draw' }), 0)).toHaveLength(3);
  });

  it('knocks the player out when a manual draw reaches the Mercy limit', () => {
    const s = run(
      buildState({
        hands: [filler(24), filler(3), filler(3)],
        top: n('red', 5),
        drawPile: deckFill(),
      }),
      0,
      { type: 'draw' },
    );
    expect(s.players[0]?.status).toBe('eliminated');
    expect(s.currentIndex).toBe(1);
  });

  it('recycles the discard pile but keeps the top card, and passes the turn if nothing is left', () => {
    let s = buildState({
      hands: [[n('green', 1)], [n('yellow', 2)]],
      top: n('blue', 5),
      discardBelow: [n('red', 9)],
      drawPile: [],
    });
    const top = s.discardPile[s.discardPile.length - 1];
    s = run(s, 0, { type: 'draw' });
    expect(s.currentIndex).toBe(0);
    s = run(s, 0, { type: 'draw' });
    expect(handOf(s, 0)).toHaveLength(2);
    expect(s.discardPile).toEqual([top]);
    expect(s.currentIndex).toBe(1);
    expect(s.log.some((e) => e.event.type === 'drawPileExhausted')).toBe(true);
  });
});

type Face = ReturnType<typeof n>;
type Spec = Parameters<typeof buildState>[0];
type State = ReturnType<typeof buildState>;
const deckFill = () => filler(60, 'yellow', 1);
const threePlayers = (h0: Face[], extra: Partial<Spec> = {}) =>
  buildState({
    hands: [h0, filler(3), filler(3)],
    top: n('red', 5),
    drawPile: deckFill(),
    ...extra,
  });
const twoPlayers = (h0: Face[], extra: Partial<Spec> = {}) =>
  buildState({ hands: [h0, filler(3)], top: n('red', 5), drawPile: deckFill(), ...extra });
const play = (s: State, i: number, pos = 0, more = {}) =>
  run(s, i, { type: 'playCard', cardId: cardId(s, i, pos), ...more });
const pid = (i: number) => PLAYER_IDS[i] as string;

describe('action cards', () => {
  it('Skip skips the next player (and returns to the player with two players)', () => {
    expect(play(threePlayers([act('skip', 'red'), n('red', 1)]), 0).currentIndex).toBe(2);
    expect(play(twoPlayers([act('skip', 'red'), n('red', 1)]), 0).currentIndex).toBe(0);
  });

  it('Reverse flips direction; with two players it acts as a Skip', () => {
    const s3 = play(threePlayers([act('reverse', 'red'), n('red', 1)]), 0);
    expect(s3.direction).toBe(-1);
    expect(s3.currentIndex).toBe(2);
    const s2 = play(twoPlayers([act('reverse', 'red'), n('red', 1)]), 0);
    expect(s2.direction).toBe(-1);
    expect(s2.currentIndex).toBe(0);
  });

  it('Skip Everyone gives the same player another turn', () => {
    expect(play(threePlayers([act('skipEveryone', 'red'), n('red', 1)]), 0).currentIndex).toBe(0);
  });

  it('Discard All discards every other card of its color underneath it', () => {
    const s = play(
      threePlayers([act('discardAll', 'red'), n('red', 2), n('blue', 3), n('red', 7)]),
      0,
    );
    expect(handOf(s, 0).map((c) => c.kind === 'number' && c.value)).toEqual([3]);
    expect(s.discardPile.slice(-3).map((c) => c.kind)).toEqual(['number', 'number', 'discardAll']);
    // The public history records the starting card, then each discarded card with its player.
    expect(s.playHistory.map((e) => [e.playerId, e.card.kind])).toEqual([
      [null, 'number'],
      [pid(0), 'number'],
      [pid(0), 'number'],
      [pid(0), 'discardAll'],
    ]);
    expect(s.currentIndex).toBe(1);
  });

  it('Discard All lets the player keep some cards of its color', () => {
    const s0 = threePlayers([act('discardAll', 'red'), n('red', 2), n('blue', 3), n('red', 7)]);
    const keep = cardId(s0, 0, 3);
    const s = play(s0, 0, 0, { discardIds: [cardId(s0, 0, 1)] });
    expect(handOf(s, 0).map((c) => c.id)).toEqual([cardId(s0, 0, 2), keep]);
    expect(s.discardPile.slice(-2).map((c) => c.kind)).toEqual(['number', 'discardAll']);
    expect(handOf(play(s0, 0, 0, { discardIds: [] }), 0)).toHaveLength(3);
  });

  it('Discard All rejects discarding cards of another color or itself', () => {
    const s = threePlayers([act('discardAll', 'red'), n('red', 2), n('blue', 3)]);
    const playWith = (ids: string[]) =>
      reject(s, 0, { type: 'playCard', cardId: cardId(s, 0), discardIds: ids });
    expect(playWith([cardId(s, 0, 2)])).toBe('INVALID_MOVE');
    expect(playWith([cardId(s, 0, 0)])).toBe('INVALID_MOVE');
    expect(playWith([cardId(s, 0, 1), cardId(s, 0, 1)])).toBe('INVALID_MOVE');
  });

  it('Draw Two puts a pending penalty on the next player', () => {
    const s = play(threePlayers([act('draw2', 'red'), n('red', 1)]), 0);
    expect(s.pendingDraw).toEqual({ total: 2, lastValue: 2 });
    expect(s.currentIndex).toBe(1);
  });

  it('wild cards require a color choice (except Color Roulette)', () => {
    const s = threePlayers([wild('wildDraw6'), n('red', 1)]);
    expect(reject(s, 0, { type: 'playCard', cardId: cardId(s, 0) })).toBe('INVALID_MOVE');
    const after = play(s, 0, 0, { color: 'green' });
    expect(after.currentColor).toBe('green');
    expect(after.pendingDraw).toEqual({ total: 6, lastValue: 6 });
  });
});

describe('stacking', () => {
  it('accumulates +2 then +4 and the next player draws the total and loses their turn', () => {
    let s = buildState({
      hands: [
        [act('draw2', 'red'), n('red', 1)],
        [act('draw4', 'blue'), n('blue', 1)],
        [act('draw2', 'green'), n('green', 3)],
      ],
      top: n('red', 5),
      drawPile: deckFill(),
    });
    s = play(s, 0);
    s = play(s, 1); // +4 on +2, color irrelevant
    expect(s.pendingDraw).toEqual({ total: 6, lastValue: 4 });
    expect(s.currentIndex).toBe(2);
    expect(reject(s, 2, { type: 'playCard', cardId: cardId(s, 2, 0) })).toBe('INVALID_MOVE');
    expect(reject(s, 2, { type: 'playCard', cardId: cardId(s, 2, 1) })).toBe('INVALID_MOVE');
    expect(reject(s, 2, { type: 'draw' })).toBe('INVALID_MOVE');
    const valid = getValidActions(s, pid(2));
    expect(valid.playableCardIds).toEqual([]);
    expect(valid.canAcceptPenalty).toBe(true);
    s = run(s, 2, { type: 'acceptPenalty' });
    expect(handOf(s, 2)).toHaveLength(8);
    expect(s.pendingDraw).toBeNull();
    expect(s.currentIndex).toBe(0);
  });

  it('+10 can only be answered by +10', () => {
    const s = threePlayers([wild('wildDraw6'), wild('wildDraw10'), act('draw4', 'red')], {
      pendingDraw: { total: 10, lastValue: 10 },
    });
    expect(reject(s, 0, { type: 'playCard', cardId: cardId(s, 0, 0), color: 'red' })).toBe(
      'INVALID_MOVE',
    );
    expect(reject(s, 0, { type: 'playCard', cardId: cardId(s, 0, 2) })).toBe('INVALID_MOVE');
    const after = play(s, 0, 1, { color: 'blue' });
    expect(after.pendingDraw).toEqual({ total: 20, lastValue: 10 });
    expect(after.currentIndex).toBe(1);
  });

  it('Wild Reverse Draw 4 reverses and targets the next player in the new direction', () => {
    const s = play(threePlayers([wild('wildReverseDraw4'), n('red', 1)]), 0, 0, { color: 'blue' });
    expect(s.direction).toBe(-1);
    expect(s.currentIndex).toBe(2);
    expect(s.pendingDraw).toEqual({ total: 4, lastValue: 4 });
  });

  it('Wild Reverse Draw 4 stacked on a +2 sends the penalty back', () => {
    let s = buildState({
      hands: [
        [act('draw2', 'red'), n('red', 1)],
        [wild('wildReverseDraw4'), n('blue', 1)],
        filler(3),
      ],
      top: n('red', 5),
      drawPile: deckFill(),
    });
    s = play(s, 0);
    s = play(s, 1, 0, { color: 'green' });
    expect(s.currentIndex).toBe(0);
    expect(s.pendingDraw).toEqual({ total: 6, lastValue: 4 });
  });

  it('two players: Wild Reverse Draw 4 makes the player who played it draw 4 (stackable back)', () => {
    let s = twoPlayers([wild('wildReverseDraw4'), act('draw4', 'red'), n('red', 1)]);
    s = play(s, 0, 0, { color: 'red' });
    expect(s.currentIndex).toBe(0);
    expect(s.pendingDraw).toEqual({ total: 4, lastValue: 4 });
    const stacked = play(s, 0, 0);
    expect(stacked.currentIndex).toBe(1);
    expect(stacked.pendingDraw).toEqual({ total: 8, lastValue: 4 });
    const taken = run(s, 0, { type: 'acceptPenalty' });
    expect(handOf(taken, 0)).toHaveLength(6);
    expect(taken.currentIndex).toBe(1);
  });
});

describe('Wild Color Roulette', () => {
  it('the next player names a color and takes cards until it appears (wilds never match)', () => {
    let s = threePlayers([wild('wildColorRoulette'), n('red', 1)], {
      drawPile: [n('red', 1), wild('wildDraw6'), n('green', 4), n('blue', 2)],
    });
    s = play(s, 0);
    expect(s.phase).toEqual({ type: 'rouletteColor', victimId: pid(1) });
    expect(s.currentIndex).toBe(1);
    expect(reject(s, 0, { type: 'chooseRouletteColor', color: 'green' })).toBe('INVALID_PHASE');
    expect(reject(s, 1, { type: 'draw' })).toBe('INVALID_PHASE');
    const before = handOf(s, 1).length;
    s = run(s, 1, { type: 'chooseRouletteColor', color: 'green' });
    expect(s.currentColor).toBe('green');
    expect(s.phase).toMatchObject({ type: 'rouletteReveal', victimId: pid(1), revealedIds: [] });
    expect(handOf(s, 1)).toHaveLength(before);
    expect(getValidActions(s, pid(1)).canDraw).toBe(true);
    expect(reject(s, 0, { type: 'draw' })).toBe('NOT_YOUR_TURN');

    // One face-up card per draw: red 1 and the Wild Draw 6 miss, green 4 matches.
    s = run(s, 1, { type: 'draw' });
    expect(handOf(s, 1)).toHaveLength(before + 1);
    expect(s.phase).toMatchObject({
      type: 'rouletteReveal',
      revealedIds: [handOf(s, 1).at(-1)!.id],
    });
    expect(s.currentIndex).toBe(1);
    s = run(s, 1, { type: 'draw' });
    expect(s.phase.type).toBe('rouletteReveal');
    s = run(s, 1, { type: 'draw' });
    expect(handOf(s, 1)).toHaveLength(before + 3);
    expect(s.phase.type).toBe('turn');
    expect(s.currentIndex).toBe(2);
    expect(s.drawPile).toHaveLength(1);
    const resolved = s.log.map((e) => e.event).find((e) => e.type === 'rouletteResolved');
    expect(resolved).toMatchObject({ matched: true, revealed: 3, color: 'green' });
  });

  it('wild cards revealed during the roulette never count as the named color', () => {
    let s = threePlayers([wild('wildColorRoulette'), n('red', 1)], {
      drawPile: [wild('wildDraw6'), n('green', 4)],
    });
    s = play(s, 0);
    s = run(s, 1, { type: 'chooseRouletteColor', color: 'green' });
    s = run(s, 1, { type: 'draw' });
    expect(s.phase.type).toBe('rouletteReveal');
    s = run(s, 1, { type: 'draw' });
    expect(s.phase.type).toBe('turn');
  });

  it('the victim cannot play any card, wild or not, before revealing', () => {
    const victimHand = [wild('wildDraw6'), wild('wildColorRoulette'), n('red', 9)];
    const s = play(
      buildState({
        hands: [[wild('wildColorRoulette'), n('red', 1)], victimHand, filler(3)],
        top: n('red', 5),
        drawPile: [n('green', 4)],
      }),
      0,
    );
    for (let i = 0; i < 3; i++) {
      expect(reject(s, 1, { type: 'playCard', cardId: cardId(s, 1, i), color: 'red' })).toBe(
        'INVALID_PHASE',
      );
    }
    expect(getValidActions(s, pid(1)).playableCardIds).toEqual([]);
  });

  it('terminates when the deck runs out without a match', () => {
    let s = threePlayers([wild('wildColorRoulette'), n('red', 1)], { drawPile: [n('red', 1)] });
    s = play(s, 0);
    s = run(s, 1, { type: 'chooseRouletteColor', color: 'green' });
    for (let i = 0; i < 5 && s.phase.type === 'rouletteReveal'; i++)
      s = run(s, 1, { type: 'draw' });
    // red 1 from the pile, then the old top card (red 5) recycled by the reshuffle, then nothing.
    expect(handOf(s, 1)).toHaveLength(5);
    expect(s.drawPile).toHaveLength(0);
    expect(s.discardPile).toHaveLength(1);
    expect(s.currentIndex).toBe(2);
    expect(s.phase.type).toBe('turn');
  });
});

describe('7 swap and 0 pass', () => {
  it('7 swaps the whole hand with the chosen player', () => {
    const s0 = buildState({
      hands: [[n('red', 7), n('blue', 1), n('blue', 2)], [n('yellow', 3)], filler(4)],
      top: n('red', 5),
    });
    expect(reject(s0, 0, { type: 'playCard', cardId: cardId(s0, 0) })).toBe('INVALID_TARGET');
    expect(reject(s0, 0, { type: 'playCard', cardId: cardId(s0, 0), swapTargetId: pid(0) })).toBe(
      'INVALID_TARGET',
    );
    const s = play(s0, 0, 0, { swapTargetId: pid(1) });
    expect(handOf(s, 0)).toHaveLength(1);
    expect(handOf(s, 1)).toHaveLength(2);
    expect(s.currentIndex).toBe(1);
    expect(s.players[0]?.uno).toBe('vulnerable');
  });

  it('a 7 played as the last card wins without a swap', () => {
    const s = play(buildState({ hands: [[n('red', 7)], filler(3)], top: n('red', 5) }), 0);
    expect(s.phase).toEqual({ type: 'finished', winnerId: pid(0), reason: 'emptyHand' });
    expect(handOf(s, 1)).toHaveLength(3);
  });

  it('0 passes all hands simultaneously in the direction of play', () => {
    const spec: Spec = {
      hands: [[n('red', 0), n('blue', 1)], filler(2), filler(3), filler(4)],
      top: n('red', 5),
    };
    expect(play(buildState(spec), 0).players.map((p) => p.hand.length)).toEqual([4, 1, 2, 3]);
    const ccw = play(buildState({ ...spec, direction: -1 }), 0);
    expect(ccw.players.map((p) => p.hand.length)).toEqual([2, 3, 4, 1]);
  });

  it('0 skips eliminated players when passing', () => {
    const s0 = buildState({
      hands: [[n('red', 0), n('blue', 1)], filler(2), filler(3), filler(4)],
      top: n('red', 5),
    });
    const p1 = s0.players[1]!;
    s0.setAside.push(...p1.hand);
    p1.hand = [];
    p1.status = 'eliminated';
    const s = play(s0, 0);
    expect(s.players.map((p) => p.hand.length)).toEqual([4, 0, 1, 3]);
    expect(s.currentIndex).toBe(2);
    expect(s.log.find((e) => e.event.type === 'handsPassed')?.event).toMatchObject({
      passes: [
        { fromId: pid(0), toId: pid(2) },
        { fromId: pid(2), toId: pid(3) },
        { fromId: pid(3), toId: pid(0) },
      ],
    });
  });
});

describe('Mercy Rule', () => {
  it('eliminates at 25 cards mid-penalty; the rest of the stack is void and play continues', () => {
    const s0 = threePlayers(filler(20, 'blue', 3), { pendingDraw: { total: 10, lastValue: 10 } });
    const drawBefore = s0.drawPile.length;
    const s = run(s0, 0, { type: 'acceptPenalty' });
    expect(s.players[0]?.status).toBe('eliminated');
    expect(s.players[0]?.eliminationReason).toBe('mercy');
    expect(s.setAside).toHaveLength(MERCY_HAND_LIMIT);
    expect(drawBefore - s.drawPile.length).toBe(5);
    expect(s.pendingDraw).toBeNull();
    expect(s.currentIndex).toBe(1);
    expect(getValidActions(s, pid(1)).swapTargetIds).toEqual([pid(2)]);
  });

  it('the last remaining player wins', () => {
    const s = run(
      twoPlayers(filler(23, 'blue', 3), { pendingDraw: { total: 2, lastValue: 2 } }),
      0,
      {
        type: 'acceptPenalty',
      },
    );
    expect(s.phase).toEqual({ type: 'finished', winnerId: pid(1), reason: 'lastStanding' });
  });

  it('set-aside hands return to play on the next reshuffle', () => {
    const s0 = buildState({ hands: [[n('green', 1)], filler(3), filler(3)], top: n('blue', 5) });
    s0.setAside.push(card(n('blue', 9)));
    const s = run(s0, 0, { type: 'draw' });
    expect(s.setAside).toHaveLength(0);
    expect(handOf(s, 0)).toHaveLength(2);
  });
});

describe('UNO', () => {
  const unoState = () =>
    buildState({
      hands: [[n('red', 1), n('red', 2)], [n('red', 3), n('red', 4)], filler(3)],
      top: n('red', 5),
      drawPile: deckFill(),
    });

  it('a player who reaches one card can be caught and draws two', () => {
    let s = play(unoState(), 0);
    expect(s.players[0]?.uno).toBe('vulnerable');
    expect(getValidActions(s, pid(2)).catchablePlayerIds).toEqual([pid(0)]);
    expect(reject(s, 0, { type: 'catchUno', targetId: pid(0) })).toBe('INVALID_TARGET');
    s = run(s, 2, { type: 'catchUno', targetId: pid(0) });
    expect(handOf(s, 0)).toHaveLength(3);
    expect(s.players[0]?.uno).toBe('none');
  });

  it('the catch window closes when the next player begins their turn', () => {
    let s = play(unoState(), 0);
    s = play(s, 1);
    expect(s.players[0]?.uno).toBe('safe');
    expect(reject(s, 2, { type: 'catchUno', targetId: pid(0) })).toBe('INVALID_TARGET');
  });

  it('declaring with the play or afterwards protects the player', () => {
    expect(play(unoState(), 0, 0, { declareUno: true }).players[0]?.uno).toBe('declared');
    let s = play(unoState(), 0);
    s = run(s, 0, { type: 'callUno' });
    expect(reject(s, 2, { type: 'catchUno', targetId: pid(0) })).toBe('INVALID_TARGET');
  });
});

describe('turn validation and win precedence', () => {
  it('rejects out-of-turn plays and cards the player does not hold', () => {
    const s = threePlayers([n('red', 1)]);
    expect(reject(s, 1, { type: 'playCard', cardId: cardId(s, 1) })).toBe('NOT_YOUR_TURN');
    expect(reject(s, 0, { type: 'playCard', cardId: cardId(s, 1) })).toBe('CARD_NOT_IN_HAND');
  });

  it('emptying the hand with a Draw card wins immediately; no penalty is applied', () => {
    const s = play(threePlayers([act('draw4', 'red')]), 0);
    expect(s.phase).toMatchObject({ type: 'finished', winnerId: pid(0) });
    expect(s.pendingDraw).toBeNull();
    expect(reject(s, 1, { type: 'draw' })).toBe('GAME_NOT_ACTIVE');
  });

  it('a forfeiting current player voids their pending penalty and play moves on', () => {
    const s0 = threePlayers([n('red', 1)], { pendingDraw: { total: 4, lastValue: 4 }, current: 1 });
    const s = run(s0, 1, { type: 'forfeit' });
    expect(s.pendingDraw).toBeNull();
    expect(s.currentIndex).toBe(2);
    expect(s.players[1]?.eliminationReason).toBe('forfeit');
  });

  it('rejected commands never modify the previous state', () => {
    const s = threePlayers([n('blue', 1)]);
    const snapshot = JSON.stringify(s);
    reject(s, 0, { type: 'playCard', cardId: cardId(s, 0) });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
