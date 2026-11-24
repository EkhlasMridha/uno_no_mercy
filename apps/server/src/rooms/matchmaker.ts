import {
  GLOBAL_BOT_WINDOW_MS,
  GLOBAL_SEARCH_MS,
  GLOBAL_TABLE_SIZE,
  MATCH_FOUND_PAUSE_MS,
  type Gender,
  type MatchSearchView,
} from '@nomercy/shared';
import type { Rng } from '../engine/index.js';
import { between, pickAvatar } from './human-like.js';
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
}

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

  /** Seats a searcher in the oldest match with room for them, or opens a new one. */
  search(socketId: string, name: string, gender: Gender): { match: Match; seat: GlobalSeat } {
    if (this.isSearching(socketId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'You are already searching for a match');
    }
    const lower = name.toLocaleLowerCase();
    const match =
      this.matches.find(
        (m) =>
          !m.found &&
          m.seats.length < this.tableSize &&
          !m.seats.some((s) => s.name.toLocaleLowerCase() === lower),
      ) ?? this.openMatch();
    const seat: GlobalSeat = {
      id: generatePlayerId(),
      name,
      gender,
      avatar: pickAvatar(gender, match.seats, this.options.rng),
      socketId,
    };
    match.seats.push(seat);
    this.afterArrival(match);
    return { match, seat };
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
      match.seats.push({ ...seat, id: generatePlayerId() });
    }
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
