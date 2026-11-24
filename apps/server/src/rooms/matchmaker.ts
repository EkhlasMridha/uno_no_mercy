import {
  GLOBAL_BOT_WINDOW_MS,
  GLOBAL_SEARCH_MS,
  GLOBAL_TABLE_SIZE,
  MATCH_EMOTE_COOLDOWN_MS,
  MATCH_FOUND_PAUSE_MS,
  type Gender,
  type MatchEmote,
  type MatchSearchView,
} from '@nomercy/shared';
import type { Rng } from '../engine/index.js';
import { between, pickAvatar } from './human-like.js';
import { regionDistance, regionOf } from './region.js';
import { RoomError, type GlobalSeat } from './room-manager.js';
import { generatePlayerId } from './session.js';

/** A Play global match being formed (docs/RULES.md §5.19). */
export interface Match {
  id: number;
  /** Everyone seated so far, in order of arrival. A seat with no socket is a computer. */
  seats: GlobalSeat[];
  /** When the countdown runs out: any seat still empty goes to a computer then. */
  deadline: number;
  /** Every seat is taken; the table is dealt after `MATCH_FOUND_PAUSE_MS`. */
  found: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  /** Emotes computers are about to send, dropped when the match is dealt or closed. */
  emoteTimers: Set<ReturnType<typeof setTimeout>>;
  /** When each seat last sent an emote, for the cooldown. */
  lastEmoteAt: Map<string, number>;
}

/** What a computer sends back to an emote, as a person might. */
const EMOTE_REPLIES: Record<MatchEmote, readonly MatchEmote[]> = {
  '👋': ['👋', '👋', '😎'],
  '😂': ['😂', '😂', '🔥'],
  '🔥': ['🔥', '😎', '😂'],
  '😎': ['😎', '😂', '🔥'],
  '😬': ['😂', '😬', '🍀'],
  '🍀': ['🍀', '🍀', '👋'],
};
/** What a computer sends unprompted when it arrives or someone else does. */
const GREETINGS: readonly MatchEmote[] = ['👋', '👋', '👋', '😎', '🍀', '🔥'];

export interface MatchmakerOptions {
  rng: Rng;
  now?: () => number;
  tableSize?: number;
  searchMs?: number;
  botWindowMs?: number;
  foundPauseMs?: number;
  /** People-like names and faces for computers taking `count` empty seats. */
  computerSeats: (count: number, seated: readonly GlobalSeat[]) => Omit<GlobalSeat, 'id'>[];
  /** Someone arrived or left: each searcher in the match should get their view again. */
  onMatchUpdated: (match: Match) => void;
  /** Someone in the match sent an emote: everyone searching in it should see it. */
  onEmote?: (match: Match, seatId: string, emote: MatchEmote) => void;
  /** The match is full and the pause is over: deal the table. Has at least one person. */
  onMatchReady: (seats: GlobalSeat[]) => void;
}

/**
 * The one global pool of Play global searches on this server. A searcher takes a free seat in the
 * oldest match that has one, and the countdown belongs to the match, so someone who arrives later
 * waits only for what is left of it. Computers trickle into the seats still empty near the end, so
 * the table is full by the deadline and nobody waits longer than the countdown.
 */
export class Matchmaker {
  private readonly matches: Match[] = [];
  private nextId = 1;
  private readonly now: () => number;

  constructor(private readonly options: MatchmakerOptions) {
    this.now = options.now ?? Date.now;
  }

  private get tableSize() {
    return this.options.tableSize ?? GLOBAL_TABLE_SIZE;
  }

  /** The match this socket is searching in, if any. */
  matchOf(socketId: string): Match | undefined {
    return this.matches.find((m) => m.seats.some((s) => s.socketId === socketId));
  }

  isSearching(socketId: string): boolean {
    return this.matchOf(socketId) !== undefined;
  }

  /**
   * The match's base player: its first person still searching. Searchers nearest to them join
   * this match first. If the base leaves, the next person to have arrived takes over.
   */
  baseOf(match: Match): GlobalSeat | undefined {
    return match.seats.find((s) => s.socketId !== null);
  }

  /**
   * Seats a searcher in the open match whose base player (its first person) is nearest to them, the
   * oldest of those when several are as near, or opens a new match with them as its base.
   */
  search(
    socketId: string,
    name: string,
    gender: Gender,
    timeZone?: string,
  ): { match: Match; seat: GlobalSeat } {
    if (this.isSearching(socketId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'You are already searching for a match');
    }
    const region = regionOf(timeZone, new Date(this.now()));
    const lower = name.toLocaleLowerCase();
    let match: Match | undefined;
    let nearest = Infinity;
    // `matches` is oldest first, and only a strictly nearer base replaces the pick, so ties go to
    // the oldest match.
    for (const m of this.matches) {
      if (m.found || m.seats.length >= this.tableSize) continue;
      if (m.seats.some((s) => s.name.toLocaleLowerCase() === lower)) continue;
      const distance = regionDistance(region, this.baseOf(m)?.region ?? null);
      if (distance < nearest) {
        nearest = distance;
        match = m;
      }
    }
    match ??= this.openMatch();
    const seat: GlobalSeat = {
      id: generatePlayerId(),
      name,
      gender,
      avatar: pickAvatar(gender, match.seats, this.options.rng),
      socketId,
      region,
    };
    match.seats.push(seat);
    // A computer already waiting sometimes waves at the newcomer.
    for (const other of match.seats) {
      if (other.socketId === null && this.chance(0.25)) this.greet(match, other.id);
    }
    this.afterArrival(match);
    return { match, seat };
  }

  /**
   * A searcher sends an emote to their match. One quicker than the cooldown is dropped, quietly, so
   * a held key cannot flood the table. Computers sometimes answer a moment later, as people do.
   */
  emote(socketId: string, emote: MatchEmote): boolean {
    const match = this.matchOf(socketId);
    const seat = match?.seats.find((s) => s.socketId === socketId);
    if (!match || !seat) {
      throw new RoomError('NOT_IN_ROOM', 'You are not searching for a match');
    }
    if (!this.send(match, seat.id, emote)) return false;
    let replies = 0;
    for (const other of match.seats) {
      if (other.socketId !== null || replies >= 2 || !this.chance(0.35)) continue;
      replies++;
      const options = EMOTE_REPLIES[emote];
      const reply = options[this.options.rng(options.length)] ?? emote;
      this.later(match, between(this.options.rng, 900, 3200), () =>
        this.send(match, other.id, reply),
      );
    }
    return true;
  }

  /** Leaves the search. A match with no people left is closed, its computers with it. */
  cancel(socketId: string): boolean {
    const match = this.matchOf(socketId);
    if (!match) return false;
    match.seats = match.seats.filter((s) => s.socketId !== socketId);
    if (!match.seats.some((s) => s.socketId !== null)) {
      this.close(match);
      return true;
    }
    this.options.onMatchUpdated(match);
    return true;
  }

  /** What one searcher sees of their match. */
  viewFor(match: Match, seatId: string): MatchSearchView {
    return {
      meId: seatId,
      players: match.seats.map(({ id, name, gender, avatar }) => ({ id, name, gender, avatar })),
      tableSize: this.tableSize,
      remainingMs: match.found ? 0 : Math.max(0, match.deadline - this.now()),
      found: match.found,
    };
  }

  /** Stops every search (server shutdown). Returns the matches that were open. */
  closeAll(): Match[] {
    const open = [...this.matches];
    for (const match of open) this.close(match);
    return open;
  }

  private openMatch(): Match {
    const searchMs = this.options.searchMs ?? GLOBAL_SEARCH_MS;
    const match: Match = {
      id: this.nextId++,
      seats: [],
      deadline: this.now() + searchMs,
      found: false,
      timer: null,
      deadlineTimer: null,
      emoteTimers: new Set(),
      lastEmoteAt: new Map(),
    };
    this.matches.push(match);
    // Whatever happens before, the countdown ends with a full table.
    match.deadlineTimer = this.timer(searchMs, () => {
      match.deadlineTimer = null;
      this.fill(match, this.tableSize - match.seats.length);
      this.markFound(match);
    });
    const window = Math.min(this.options.botWindowMs ?? GLOBAL_BOT_WINDOW_MS, searchMs);
    const firstAt = searchMs - window + between(this.options.rng, 0, Math.floor(window / 4));
    match.timer = this.timer(firstAt, () => this.computerArrives(match));
    return match;
  }

  /**
   * One computer takes an empty seat, then the next is timed so the rest fit before the deadline:
   * a random share of the time left per seat still empty, so arrivals look like people turning up.
   */
  private computerArrives(match: Match): void {
    match.timer = null;
    if (match.found) return;
    this.fill(match, 1);
    if (match.seats.length >= this.tableSize) {
      this.markFound(match);
      return;
    }
    this.options.onMatchUpdated(match);
    const empty = this.tableSize - match.seats.length;
    const left = Math.max(0, match.deadline - this.now() - 300);
    const gap = Math.floor((left / empty) * (0.35 + this.options.rng(650) / 1000));
    match.timer = this.timer(gap, () => this.computerArrives(match));
  }

  private afterArrival(match: Match): void {
    if (match.seats.length >= this.tableSize) this.markFound(match);
    else this.options.onMatchUpdated(match);
  }

  private fill(match: Match, count: number): void {
    if (count <= 0) return;
    for (const seat of this.options.computerSeats(count, match.seats)) {
      const id = generatePlayerId();
      match.seats.push({ ...seat, id });
      if (this.chance(0.4)) this.greet(match, id);
    }
  }

  /** Sends an emote from a seat if its cooldown allows. */
  private send(match: Match, seatId: string, emote: MatchEmote): boolean {
    if (!this.matches.includes(match) || !match.seats.some((s) => s.id === seatId)) return false;
    const now = this.now();
    const last = match.lastEmoteAt.get(seatId);
    if (last !== undefined && now - last < MATCH_EMOTE_COOLDOWN_MS) return false;
    match.lastEmoteAt.set(seatId, now);
    this.options.onEmote?.(match, seatId, emote);
    return true;
  }

  /** A computer says hello a moment after someone sits down. */
  private greet(match: Match, seatId: string): void {
    const emote = GREETINGS[this.options.rng(GREETINGS.length)] ?? '👋';
    this.later(match, between(this.options.rng, 800, 2600), () => this.send(match, seatId, emote));
  }

  private later(match: Match, delayMs: number, act: () => void): void {
    const timer = this.timer(delayMs, () => {
      match.emoteTimers.delete(timer);
      act();
    });
    match.emoteTimers.add(timer);
  }

  private chance(p: number): boolean {
    return this.options.rng(1000) < p * 1000;
  }

  /** Every seat is taken: show it, then deal after the pause. */
  private markFound(match: Match): void {
    if (match.found) return;
    match.found = true;
    this.clearTimers(match);
    this.options.onMatchUpdated(match);
    match.timer = this.timer(this.options.foundPauseMs ?? MATCH_FOUND_PAUSE_MS, () => {
      match.timer = null;
      this.remove(match);
      if (!match.seats.some((s) => s.socketId !== null)) return;
      // A person who left during the pause leaves an empty seat; a computer takes it.
      this.fill(match, this.tableSize - match.seats.length);
      this.options.onMatchReady(match.seats);
    });
  }

  private close(match: Match): void {
    this.clearTimers(match);
    this.remove(match);
  }

  private remove(match: Match): void {
    for (const timer of match.emoteTimers) clearTimeout(timer);
    match.emoteTimers.clear();
    const at = this.matches.indexOf(match);
    if (at >= 0) this.matches.splice(at, 1);
  }

  private clearTimers(match: Match): void {
    if (match.timer) clearTimeout(match.timer);
    if (match.deadlineTimer) clearTimeout(match.deadlineTimer);
    match.timer = null;
    match.deadlineTimer = null;
  }

  private timer(delayMs: number, act: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(act, Math.max(0, delayMs));
    timer.unref?.();
    return timer;
  }
}
