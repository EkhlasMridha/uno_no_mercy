/**
 * A rough region for Play global matchmaking (docs/RULES.md §5.19), read from the searcher's time
 * zone: no IP lookup and no outside service. It stays on the server and is never shown to anyone.
 */
export interface SeatRegion {
  /** The IANA time zone, e.g. `Asia/Dhaka`. */
  timeZone: string;
  /** Its area, the part before the first slash: `Asia`, `Europe`, `America`… */
  area: string;
  /** Its offset from UTC in minutes at the moment of the search. */
  offsetMinutes: number;
}

/** How far apart, in hours, two searchers count when either region is unknown. */
export const UNKNOWN_REGION_DISTANCE = 6;
/** Added when two time zones are in different areas, so a neighbour in the same area comes first. */
const OTHER_AREA_PENALTY = 1;

/** Reads a time zone into a region, or null when it is not one this server knows. */
export function regionOf(timeZone: string | undefined, at: Date = new Date()): SeatRegion | null {
  if (!timeZone) return null;
  try {
    const label =
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
    // "GMT+06:00", "GMT-03:30", or plain "GMT" at UTC.
    const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(label);
    if (!match) return null;
    const [, sign, hours, minutes] = match;
    const offsetMinutes = sign
      ? (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes))
      : 0;
    return { timeZone, area: timeZone.split('/')[0] ?? timeZone, offsetMinutes };
  } catch {
    // An unknown zone: Intl throws a RangeError.
    return null;
  }
}

/**
 * How far apart two searchers are, in hours: 0 in the same time zone, otherwise the gap between
 * their clocks (the shorter way round the globe) plus a little when they are in different areas.
 */
export function regionDistance(a: SeatRegion | null, b: SeatRegion | null): number {
  if (!a || !b) return UNKNOWN_REGION_DISTANCE;
  if (a.timeZone === b.timeZone) return 0;
  const gap = Math.abs(a.offsetMinutes - b.offsetMinutes) / 60;
  const aroundTheGlobe = Math.min(gap, 24 - gap);
  return aroundTheGlobe + (a.area === b.area ? 0 : OTHER_AREA_PENALTY);
}
