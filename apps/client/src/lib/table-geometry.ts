/** Seat placement around the oval table. Angles are in degrees, screen coordinates (y down). */

/** Your own seat is always at the bottom edge of the table. */
export const MY_SEAT_ANGLE = 90;

/** Seat ring as a percentage of the stage: where the rail sits. */
export const SEAT_RADIUS = { x: 44.5, y: 41 };

/**
 * Angle of the seat `offset` places after yours, going clockwise, for `count` seated players.
 * Turn order with direction 1 runs clockwise around the table.
 */
export function seatAngle(offset: number, count: number): number {
  return MY_SEAT_ANGLE + (offset * 360) / Math.max(count, 1);
}

export function seatPosition(angle: number): { left: string; top: string } {
  const rad = (angle * Math.PI) / 180;
  return {
    left: `${50 + SEAT_RADIUS.x * Math.cos(rad)}%`,
    top: `${50 + SEAT_RADIUS.y * Math.sin(rad)}%`,
  };
}

/** Stable 0..1 value for a given seed, so a card keeps its spot on the table across renders. */
export function scatter(seed: number, salt: number): number {
  let x = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
