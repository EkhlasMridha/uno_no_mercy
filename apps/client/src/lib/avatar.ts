// Cartoon portraits for seats. Purely cosmetic: faces are dealt from a seed made of the players
// at the table, so they hold for the whole game and every browser draws the same ones.

import { GENDERS, type Gender } from '@nomercy/shared';

export type HairStyle =
  | 'crop'
  | 'swoop'
  | 'long'
  | 'bun'
  | 'curls'
  | 'mohawk'
  | 'bald'
  | 'beanie'
  | 'bob'
  | 'spikes'
  | 'ponytail'
  | 'pigtails';
export type EyeStyle = 'dots' | 'happy' | 'wink' | 'wide';
export type MouthStyle = 'smile' | 'grin' | 'open' | 'smirk';
export type RobotEyes = 'round' | 'bars' | 'happy';

export interface PersonAvatar {
  kind: 'person';
  gender: Gender;
  chip: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  hat: string;
  eyes: EyeStyle;
  mouth: MouthStyle;
  glasses: boolean;
  beard: boolean;
  earrings: boolean;
  freckles: boolean;
  blush: boolean;
}

export interface RobotAvatar {
  kind: 'robot';
  chip: string;
  plating: string;
  glow: string;
  eyes: RobotEyes;
}

export type AvatarTraits = PersonAvatar | RobotAvatar;

// Ten chip colors, one per seat for the largest table we deal for.
// Chip faces use the table's own darks, card inks and card colors: no new accent colors.
const CHIP = [
  '#7a1a22',
  '#1b46a0',
  '#11663a',
  '#8a6a00',
  '#4b2347',
  '#5b3722',
  '#2f6fe0',
  '#e5383b',
  '#22a559',
  '#17151f',
];
const HAIR_STYLES: Record<Gender, HairStyle[]> = {
  male: ['crop', 'swoop', 'mohawk', 'bald', 'spikes', 'beanie', 'curls'],
  female: ['long', 'bun', 'bob', 'ponytail', 'pigtails', 'beanie', 'curls'],
};
const SKIN = ['#f6d3b3', '#eab98f', '#d39a6a', '#b07448', '#8a5532', '#5e3920'];
const HAIR = ['#1f1612', '#3b2417', '#6b3e1f', '#a0522d', '#d9a441', '#e2dbd0', '#7a1a22'];
const SHIRT = ['#e5383b', '#f4c20d', '#22a559', '#2f6fe0', '#f2e8da', '#17151f'];
const PLATING = ['#d9d4cc', '#b9c2c9', '#e7c886', '#c9a58a'];
const GLOW = ['#e7c886', '#f4c20d', '#22a559', '#2f6fe0', '#e5383b'];
const ROBOT_EYES: RobotEyes[] = ['round', 'bars', 'happy'];
const ROBOT_FACES = GLOW.flatMap((glow) => ROBOT_EYES.map((eyes) => ({ glow, eyes })));

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
  const chance = (p: number) => next() < p;
  const shuffle = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { pick, chance, shuffle };
}

const at = <T>(list: readonly T[], i: number): T => list[i % list.length] as T;

/**
 * Deals a face to every seat. The deal is seeded from the players at the table, so every browser
 * draws the same faces. Chip colors go round without repeats, so up to ten players never share
 * one, and each gender's hairstyles go round the same way among the people who chose it.
 */
export function avatarsForTable(
  players: readonly { id: string; seat: number; isComputer: boolean; gender: Gender | null }[],
): TableAvatars {
  const seated = [...players].sort((a, b) => a.seat - b.seat);
  const deck = stream(seated.map((p) => p.id).join('|'));
  const chips = deck.shuffle(CHIP);
  const styles = { male: deck.shuffle(HAIR_STYLES.male), female: deck.shuffle(HAIR_STYLES.female) };
  const skins = deck.shuffle(SKIN);
  const hairs = deck.shuffle(HAIR);
  const shirts = deck.shuffle(SHIRT);
  const robotFaces = deck.shuffle(ROBOT_FACES);

  const faces = new Map<string, AvatarTraits>();
  const dealt = { robot: 0, male: 0, female: 0 };
  seated.forEach((player, i) => {
    const { pick, chance } = stream(player.id);
    const chip = at(chips, i);
    if (player.isComputer) {
      faces.set(player.id, {
        kind: 'robot',
        chip,
        plating: pick(PLATING),
        ...at(robotFaces, dealt.robot++),
      });
      return;
    }
    const gender = player.gender ?? pick(GENDERS);
    const hairStyle = at(styles[gender], dealt[gender]++);
    const mouth = pick<MouthStyle>(['smile', 'grin', 'open', 'smirk']);
    const beard = gender === 'male' && chance(0.35);
    faces.set(player.id, {
      kind: 'person',
      gender,
      chip,
      skin: at(skins, i),
      hair: at(hairs, i),
      hairStyle,
      shirt: at(shirts, i),
      hat: pick(SHIRT),
      eyes: pick<EyeStyle>(['dots', 'dots', 'happy', 'wink', 'wide']),
      // A beard hides a big grin, so bearded faces keep to a closed smile.
      mouth: beard && mouth === 'grin' ? 'smile' : mouth,
      glasses: chance(0.25),
      beard,
      earrings: gender === 'female' && chance(0.5),
      freckles: chance(0.2),
      blush: chance(0.5),
    });
  });
  // Someone not at the table (never expected) still gets a face of their own.
  return (id) =>
    faces.get(id) ?? avatarsForTable([{ id, seat: 0, isComputer: false, gender: null }])(id);
}
