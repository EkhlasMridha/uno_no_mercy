import type { HandWatchView } from '@nomercy/shared';
import type { Room } from './room.types.js';

/** A knocked-out player (`watcherId`) and the player whose hand they ask to see or may see. */
export interface WatchLink {
  watcherId: string;
  targetId: string;
}

/** Requests waiting for an answer, and the watches that were accepted (docs/RULES.md §5.17). */
export interface WatchState {
  requests: WatchLink[];
  grants: WatchLink[];
}

export const emptyWatch = (): WatchState => ({ requests: [], grants: [] });

/**
 * Whether `playerId` may watch from the sidelines: knocked out in the running round and still
 * seated. A forfeit leaves the room, so nobody who left has a seat to watch from.
 */
export function canWatch(room: Room, playerId: string): boolean {
  const seat = room.game?.players.find((p) => p.id === playerId);
  const member = room.players.find((p) => p.id === playerId);
  return (
    room.status === 'inGame' &&
    seat?.status === 'eliminated' &&
    member !== undefined &&
    !member.departed &&
    !member.isComputer
  );
}

/** Whether `playerId` is a person still in play, so their hand is one that can be asked for. */
export function canBeWatched(room: Room, playerId: string): boolean {
  const seat = room.game?.players.find((p) => p.id === playerId);
  const member = room.players.find((p) => p.id === playerId);
  return (
    room.status === 'inGame' &&
    seat?.status === 'active' &&
    member !== undefined &&
    !member.departed &&
    !member.isComputer
  );
}

/**
 * The requests and watches that still make sense. Checked on every update instead of cleaned up at
 * each event, so a watcher can never see a hand once the watched player is out or gone, however
 * that happened, and nothing carries over once the round ends.
 */
export function liveWatch(room: Room): WatchState {
  return {
    requests: room.watch.requests.filter(
      (l) => canWatch(room, l.watcherId) && canBeWatched(room, l.targetId),
    ),
    grants: room.watch.grants.filter(
      (l) => canWatch(room, l.watcherId) && canBeWatched(room, l.targetId),
    ),
  };
}

/** What the player may see of hand watching: their own request, watch, and who asks about theirs. */
export function watchViewFor(room: Room, playerId: string): HandWatchView {
  const live = liveWatch(room);
  const grant = live.grants.find((l) => l.watcherId === playerId);
  const target = grant && room.game?.players.find((p) => p.id === grant.targetId);
  const request = live.requests.find((l) => l.watcherId === playerId);
  return {
    outgoing: request ? { targetId: request.targetId } : null,
    watching:
      grant && target
        ? { targetId: grant.targetId, hand: target.hand.map((card) => ({ ...card })) }
        : null,
    incoming: live.requests
      .filter((l) => l.targetId === playerId)
      .map((l) => ({
        watcherId: l.watcherId,
        watchingId: live.grants.find((g) => g.watcherId === l.watcherId)?.targetId ?? null,
      })),
    watchers: live.grants.filter((l) => l.targetId === playerId).map((l) => l.watcherId),
  };
}
