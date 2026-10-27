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

/** A point on the seat ring in stage percentages; `reach` below 1 pulls it in toward the middle. */
export function seatPoint(angle: number, reach = 1): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: 50 + SEAT_RADIUS.x * reach * Math.cos(rad),
    y: 50 + SEAT_RADIUS.y * reach * Math.sin(rad),
  };
}

/**
 * Where a seat's centre goes, as CSS. The stage can tune it with three custom properties:
 * `--seat-inset` keeps side seats that far from its edges so a narrow phone doesn't clip them,
 * `--seat-inset-top` keeps the top seats' avatars and UNO tags below the top bar, and
 * `--seat-low-reach` pulls the seats below the middle up, clear of your hand on short screens.
 */
export function seatPosition(angle: number): { left: string; top: string } {
  const { x, y } = seatPoint(angle);
  const left = `clamp(var(--seat-inset, 0px), ${x}%, calc(100% - var(--seat-inset, 0px)))`;
  const top =
    y > 50
      ? `calc(50% + ${y - 50}% * var(--seat-low-reach, 1))`
      : `max(var(--seat-inset-top, 0px), ${y}%)`;
  return { left, top };
}

/** Stable 0..1 value for a given seed, so a card keeps its spot on the table across renders. */
export function scatter(seed: number, salt: number): number {
  let x = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
