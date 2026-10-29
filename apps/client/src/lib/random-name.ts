const ADJECTIVES = [
  'Lucky',
  'Sneaky',
  'Brave',
  'Wild',
  'Sly',
  'Jolly',
  'Swift',
  'Bold',
  'Cosmic',
  'Fuzzy',
  'Grumpy',
  'Mighty',
  'Sleepy',
  'Zesty',
  'Shiny',
  'Cheeky',
];

const ANIMALS = [
  'Otter',
  'Panda',
  'Falcon',
  'Badger',
  'Gecko',
  'Walrus',
  'Lynx',
  'Moose',
  'Penguin',
  'Koala',
  'Tiger',
  'Raccoon',
  'Llama',
  'Hedgehog',
  'Yak',
  'Narwhal',
];

const pick = (words: readonly string[]) => words[Math.floor(Math.random() * words.length)]!;

/**
 * A friendly stand-in name, like "Lucky Otter", for a player who joins from an invite link before
 * this browser knows their name. Always fits `playerNameSchema`.
 */
export function randomPlayerName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
