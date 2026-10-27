// Cartoon character portraits for seats. Purely cosmetic: characters are dealt from a seed made of
// the players at the table, so they hold for the whole game and every browser draws the same ones.

import { GENDERS, type Gender } from '@nomercy/shared';

/** A character a person can be drawn as. Each gender has its own cast. */
export type Character = 'gamer' | 'fox' | 'panda' | 'monkey' | 'champ' | 'bunny' | 'cat' | 'koala';
export type RobotEyes = 'round' | 'bars' | 'happy';

/** The glowing disc behind a character: a lit centre falling off to a dark edge. */
export interface Backdrop {
  light: string;
  base: string;
  dark: string;
}

export interface PersonAvatar {
  kind: 'person';
  gender: Gender;
  character: Character;
  backdrop: Backdrop;
  hoodie: string;
  /** Only the human characters (gamer, champ) use skin and hair. */
  skin: string;
  hair: string;
}

export interface RobotAvatar {
  kind: 'robot';
  backdrop: Backdrop;
  glow: string;
  eyes: RobotEyes;
}

export type AvatarTraits = PersonAvatar | RobotAvatar;

const CAST: Record<Gender, Character[]> = {
  male: ['gamer', 'fox', 'panda', 'monkey'],
  female: ['champ', 'bunny', 'cat', 'koala'],
};
// Card colors, brass and the baize plum, each lit from the centre. No new accent colors.
const BACKDROPS: Backdrop[] = [
  { light: '#ff8a7a', base: '#e5383b', dark: '#7a1a22' },
  { light: '#ffe58a', base: '#f4c20d', dark: '#8a6a00' },
  { light: '#7fe89c', base: '#22a559', dark: '#11663a' },
  { light: '#8cb8ff', base: '#2f6fe0', dark: '#1b46a0' },
  { light: '#c77cc2', base: '#7b3577', dark: '#2c1430' },
  { light: '#f5d690', base: '#d0a650', dark: '#5b3722' },
];
const HOODIES = ['#e5383b', '#f4c20d', '#22a559', '#2f6fe0', '#7b3577', '#efe7dc', '#26222e'];
const SKIN = ['#f6d3b3', '#eab98f', '#d39a6a', '#b07448', '#8a5532'];
const HAIR = ['#1f1612', '#3b2417', '#6b3e1f', '#a0522d', '#7a1a22'];
const GLOW = ['#8cd8ff', '#e7c886', '#7fe89c', '#ff8a7a'];
const ROBOT_EYES: RobotEyes[] = ['round', 'bars', 'happy'];

/** Looks up a seated player's face by id. */
export type TableAvatars = (playerId: string) => AvatarTraits;

/** FNV-1a: a stable 32-bit hash of the seed string. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32, so one seed yields a repeatable stream of picks. */
function stream(seed: string) {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  const shuffle = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { pick, shuffle };
}

const at = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;

/**
 * Deals a character to every seat. The deal is seeded from the players at the table, so every
 * browser draws the same faces. Backdrops go round without repeats, so six neighbours never share
 * one, and each gender's cast goes round the same way among the people who chose it.
 */
export function avatarsForTable(
  players: readonly { id: string; seat: number; isComputer: boolean; gender: Gender | null }[],
): TableAvatars {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const deck = stream(seated.map((p) => p.id).join('|'));
  const backdrops = deck.shuffle(BACKDROPS);
  const casts = { male: deck.shuffle(CAST.male), female: deck.shuffle(CAST.female) };
  const robotFaces = deck.shuffle(
    GLOW.flatMap((glow) => ROBOT_EYES.map((eyes) => ({ glow, eyes }))),
  );

  const faces = new Map<string, AvatarTraits>();
  const dealt = { robot: 0, male: 0, female: 0 };
  seated.forEach((player, i) => {
    const { pick } = stream(player.id);
    const backdrop = at(backdrops, i);
    if (player.isComputer) {
      faces.set(player.id, { kind: 'robot', backdrop, ...at(robotFaces, dealt.robot++) });
      return;
    }
    const gender = player.gender ?? pick(GENDERS);
    faces.set(player.id, {
      kind: 'person',
      gender,
      character: at(casts[gender], dealt[gender]++),
      backdrop,
      // A hoodie the same color as the disc would melt into it.
      hoodie: pick(HOODIES.filter((h) => h !== backdrop.base)),
      skin: pick(SKIN),
      hair: pick(HAIR),
    });
  });
  // Someone not at the table (never expected) still gets a face of their own.
  return (id) =>
    faces.get(id) ?? avatarsForTable([{ id, seat: 0, isComputer: false, gender: null }])(id);
}
