import { AVATAR_VARIANTS, type GameEvent, type Gender } from '@nomercy/shared';
import { getValidActions, type GameCommand, type GameState, type Rng } from '../engine/index.js';
import { shuffle } from '../engine/rng.js';
import { chooseComputerMove } from './computer-player.js';

/**
 * How computers behave at a Play global table (docs/RULES.md §5.19): ordinary names and faces,
 * human time to think, and the odd slip. Only timing and which legal move to skip change here; every
 * move still comes from `getValidActions`.
 */

/** Screen names as people type them, each with the avatar set that person would pick. */
const SCREEN_NAMES: readonly { name: string; gender: Gender }[] = [
  { name: 'rafi_07', gender: 'male' },
  { name: 'Tanvir', gender: 'male' },
  { name: 'sakib.75', gender: 'male' },
  { name: 'Arif', gender: 'male' },
  { name: 'imran_k', gender: 'male' },
  { name: 'Nayeem', gender: 'male' },
  { name: 'joy99', gender: 'male' },
  { name: 'Fahim', gender: 'male' },
  { name: 'shuvo', gender: 'male' },
  { name: 'Rakib Hasan', gender: 'male' },
  { name: 'mahin.x', gender: 'male' },
  { name: 'Zayan', gender: 'male' },
  { name: 'adnan_', gender: 'male' },
  { name: 'Sami', gender: 'male' },
  { name: 'tahsin21', gender: 'male' },
  { name: 'Omar', gender: 'male' },
  { name: 'Leo', gender: 'male' },
  { name: 'danny.b', gender: 'male' },
  { name: 'Nusrat', gender: 'female' },
  { name: 'mim_22', gender: 'female' },
  { name: 'Sumaiya', gender: 'female' },
  { name: 'tasnim.r', gender: 'female' },
  { name: 'Anika', gender: 'female' },
  { name: 'raisa', gender: 'female' },
  { name: 'Lamia', gender: 'female' },
  { name: 'jui_09', gender: 'female' },
  { name: 'Zara', gender: 'female' },
  { name: 'priya.s', gender: 'female' },
  { name: 'Mehjabin', gender: 'female' },
  { name: 'nabila', gender: 'female' },
  { name: 'Tisha', gender: 'female' },
  { name: 'ishrat_', gender: 'female' },
  { name: 'Mia', gender: 'female' },
  { name: 'sara.k', gender: 'female' },
];

/** Distinct people-like profiles for the computers at a global table, never a name already taken. */
export function screenNames(
  count: number,
  takenNames: readonly string[],
  rng: Rng,
): { name: string; gender: Gender }[] {
  const taken = new Set(takenNames.map((n) => n.toLocaleLowerCase()));
  return shuffle(SCREEN_NAMES, rng)
    .filter((p) => !taken.has(p.name.toLocaleLowerCase()))
    .slice(0, count);
}

/**
 * A random face from the gender's set that no one at the table has: a character nobody of that
 * gender has, on a backdrop nobody has, while there are any left (`avatarsForTable` reads it as
 * `backdrop * 4 + character`).
 */
export function pickAvatar(
  gender: Gender,
  seated: readonly { gender: Gender | null; avatar: number | null }[],
  rng: Rng,
): number {
  const characters = 4;
  const backdrops = AVATAR_VARIANTS / characters;
  const faces = seated.filter((s) => s.avatar !== null) as { gender: Gender; avatar: number }[];
  const usedBackdrops = new Set(faces.map((s) => Math.floor(s.avatar / characters)));
  const usedCharacters = new Set(
    faces.filter((s) => s.gender === gender).map((s) => s.avatar % characters),
  );
  const fresh = <T>(all: T[], used: Set<T>) => {
    const left = all.filter((x) => !used.has(x));
    const from = left.length > 0 ? left : all;
    return from[rng(from.length)] as T;
  };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  return (
    fresh(range(backdrops), usedBackdrops) * characters + fresh(range(characters), usedCharacters)
  );
}

/** True with the given probability. */
function chance(rng: Rng, probability: number): boolean {
  return rng(1000) < probability * 1000;
}

/** A whole number of milliseconds in [min, max]. */
export function between(rng: Rng, min: number, max: number): number {
  return min + rng(max - min + 1);
}

/**
 * Decides once and then remembers: a person who chose not to bother with a chance doesn't change
 * their mind every time they look at the table.
 */
function decideOnce(
  intents: Map<string, boolean>,
  key: string,
  probability: number,
  rng: Rng,
): boolean {
  const known = intents.get(key);
  if (known !== undefined) return known;
  const decided = chance(rng, probability);
  intents.set(key, decided);
  return decided;
}

/** How often a person at a global table remembers to call UNO, and bothers to catch someone. */
const CALLS_UNO = 0.85;
const DECLARES_WITH_PLAY = 0.7;
const CATCHES = 0.45;

/**
 * The computers' moves with a person's lapses: sometimes UNO is called after the play rather than
 * with it, sometimes not at all, and an open catch is often missed. Each lapse is keyed to the card
 * involved, so it stands until the situation changes. Turn moves (play, draw, take) are never
 * dropped, so the table can't stall on a computer.
 */
export function humanizeMoves(
  state: GameState,
  moves: readonly { playerId: string; command: GameCommand }[],
  intents: Map<string, boolean>,
  rng: Rng,
): { playerId: string; command: GameCommand }[] {
  const lastCard = (id: string) => state.players.find((p) => p.id === id)?.hand[0]?.id ?? '';
  const out: { playerId: string; command: GameCommand }[] = [];
  // A skipped reflex leaves the seat its turn move, if it has one.
  const passOver = (playerId: string) => {
    const turnMove = chooseComputerMove(state, playerId, rng, false);
    if (turnMove) out.push({ playerId, command: turnMove });
  };
  for (const move of moves) {
    const { playerId, command } = move;
    if (command.type === 'callUno') {
      if (decideOnce(intents, `uno:${playerId}:${lastCard(playerId)}`, CALLS_UNO, rng)) {
        out.push(move);
      } else passOver(playerId);
    } else if (command.type === 'catchUno') {
      const key = `catch:${playerId}:${command.targetId}:${lastCard(command.targetId)}`;
      if (decideOnce(intents, key, CATCHES, rng)) out.push(move);
      else passOver(playerId);
    } else if (command.type === 'playCard' && command.declareUno) {
      const declare = decideOnce(
        intents,
        `declare:${playerId}:${command.cardId}`,
        DECLARES_WITH_PLAY,
        rng,
      );
      out.push(declare ? move : { playerId, command: { ...command, declareUno: false } });
    } else {
      out.push(move);
    }
  }
  return out;
}

/**
 * How long a person would take over this move. Reflexes (calling UNO, a catch) are quick; a turn
 * takes a second or two, longer with more cards to weigh up or a color or swap target to choose, and
 * now and then much longer. Drawing card after card goes quicker once a run of draws is under way.
 */
export function thinkingTimeMs(
  state: GameState,
  playerId: string,
  command: GameCommand,
  rng: Rng,
): number {
  const drawing = state.phase.type === 'drawing';
  switch (command.type) {
    case 'callUno':
      return between(rng, 450, 1600);
    case 'catchUno':
      return between(rng, 350, 1400);
    case 'chooseRouletteColor':
      return between(rng, 1300, 2900);
    case 'acceptPenalty':
      return between(rng, 1300, 2700);
    case 'draw':
      return drawing ? between(rng, 550, 1100) : between(rng, 1100, 2400);
    case 'playCard': {
      if (drawing) return between(rng, 700, 1500);
      const options = getValidActions(state, playerId).playableCardIds.length;
      const card = state.players
        .find((p) => p.id === playerId)
        ?.hand.find((c) => c.id === command.cardId);
      let ms = between(rng, 1000, 2400) + Math.min(5, Math.max(0, options - 1)) * 170;
      if (command.color) ms += between(rng, 400, 1000);
      if (card?.kind === 'number' && card.value === 7) ms += between(rng, 500, 1200);
      if (chance(rng, 0.1)) ms += between(rng, 1500, 4500);
      return ms;
    }
    case 'forfeit':
      return 0;
  }
}

const AFTER_ROUND = ['gg', 'gg', 'gg wp', 'ggs', 'gg 😅', 'wp', 'good game'];
const AFTER_BIG_HIT = ['noooo', 'bruh', 'why me 😭', 'seriously?', '💀', 'wow ok', 'not again'];
const AFTER_WIN = ['gg', 'gg ez 😎', 'yesss', 'gg all', '🔥'];

/** A line a person might type after a moment like this, or null for nothing. */
export function banterFor(
  event: GameEvent,
  playerId: string,
  rng: Rng,
): { text: string; delayMs: number } | null {
  const say = (lines: readonly string[], probability: number, minMs: number, maxMs: number) =>
    chance(rng, probability)
      ? { text: lines[rng(lines.length)] as string, delayMs: between(rng, minMs, maxMs) }
      : null;
  switch (event.type) {
    case 'penaltyAccepted':
      return event.playerId === playerId && event.drawn >= 6
        ? say(AFTER_BIG_HIT, 0.3, 1500, 4000)
        : null;
    case 'gameWon':
      return event.playerId === playerId
        ? say(AFTER_WIN, 0.5, 1200, 3500)
        : say(AFTER_ROUND, 0.35, 2000, 6000);
    default:
      return null;
  }
}

/** Whether a person would show their hand to a knocked-out player who asked, and how soon. */
export function handRequestAnswer(rng: Rng): { allow: boolean; delayMs: number } {
  return { allow: chance(rng, 0.7), delayMs: between(rng, 2500, 7000) };
}
