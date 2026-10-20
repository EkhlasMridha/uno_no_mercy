import { randomInt } from 'node:crypto';

/** Returns a uniformly distributed integer in [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

/** Cryptographically secure RNG used in real games. */
export const cryptoRng: Rng = (maxExclusive) => randomInt(maxExclusive);

/** Deterministic RNG (mulberry32) for tests and reproducible simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  };
}

/** Unbiased Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}
