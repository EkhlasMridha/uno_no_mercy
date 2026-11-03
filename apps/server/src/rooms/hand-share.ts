import type { HandShareView } from '@nomercy/shared';
import { RoomError } from './room-manager.js';
import type { HandShare, Room } from './room.types.js';

/**
 * Knocked-out players asking to see someone's hand (docs/RULES.md §5.17). This is room state, not a
 * game rule: it never changes the game, it only decides whose hand a projection may include.
 */

function seatOf(room: Room, playerId: string) {
  return room.game?.players.find((p) => p.id === playerId);
}

function memberOf(room: Room, playerId: string) {
  return room.players.find((p) => p.id === playerId && !p.departed);
}

/** A share still counts while both players are at the table and the target is still playing. */
function isLive(room: Room, share: HandShare): boolean {
  return (
    memberOf(room, share.viewerId) !== undefined &&
    memberOf(room, share.targetId) !== undefined &&
    seatOf(room, share.targetId)?.status === 'active'
  );
}

/**
 * A knocked-out player asks to see an active player's hand. It replaces any earlier request of
 * theirs, so they watch one hand at a time. A computer agrees at once.
 */
export function requestHand(room: Room, viewerId: string, targetId: string): void {
  if (room.status !== 'inGame' || !room.game) {
    throw new RoomError('GAME_NOT_ACTIVE', 'There is no game in progress');
  }
  if (seatOf(room, viewerId)?.status !== 'eliminated') {
    throw new RoomError('INVALID_PHASE', "You can ask to see a hand once you're out of the round");
  }
  const target = memberOf(room, targetId);
  if (!target || targetId === viewerId || seatOf(room, targetId)?.status !== 'active') {
    throw new RoomError('INVALID_TARGET', 'Pick a player who is still in the round');
  }
  const asked = room.handShares.find((s) => s.viewerId === viewerId && s.targetId === targetId);
  if (asked?.status === 'denied') {
    throw new RoomError('INVALID_TARGET', `${target.name} said no this round. Ask someone else`);
  }
  // Asking again for the hand you already asked for changes nothing.
  if (asked) return;
  // Leave the refusals in place, so asking someone else can't be used to ask the same player again.
  room.handShares = room.handShares.filter((s) => s.viewerId !== viewerId || s.status === 'denied');
  room.handShares.push({
    viewerId,
    targetId,
    status: target.isComputer ? 'allowed' : 'pending',
  });
}

/** The target answers a pending request: show the hand, or refuse for the rest of the round. */
export function answerHandRequest(
  room: Room,
  targetId: string,
  viewerId: string,
  allow: boolean,
): void {
  const share = room.handShares.find(
    (s) => s.viewerId === viewerId && s.targetId === targetId && s.status === 'pending',
  );
  if (!share || !isLive(room, share)) {
    throw new RoomError('INVALID_TARGET', 'That request is no longer waiting for you');
  }
  share.status = allow ? 'allowed' : 'denied';
}

/**
 * Ends a share. Without `viewerId` the caller stops watching (or withdraws their request); with it,
 * the caller is the target and stops showing their hand to that viewer.
 */
export function endHandShare(room: Room, callerId: string, viewerId?: string): void {
  if (viewerId === undefined) {
    room.handShares = room.handShares.filter(
      (s) => s.viewerId !== callerId || s.status === 'denied',
    );
    return;
  }
  const share = room.handShares.find(
    (s) => s.viewerId === viewerId && s.targetId === callerId && s.status !== 'denied',
  );
  if (!share) throw new RoomError('INVALID_TARGET', 'That player is not watching your hand');
  // Taking it back counts as saying no, so the viewer can't simply ask again.
  share.status = 'denied';
}

/**
 * What one player may know about hand sharing: their own request (with the hand once allowed) and
 * the requests and watchers on their own hand. Nobody else's shares are included.
 */
export function handShareView(room: Room, playerId: string): HandShareView {
  const mine = room.handShares.find((s) => s.viewerId === playerId && s.status !== 'denied');
  const refused = room.handShares.filter((s) => s.viewerId === playerId && s.status === 'denied');
  const watching = mine && isLive(room, mine) ? mine : null;
  const target = watching ? seatOf(room, watching.targetId) : undefined;
  return {
    watching: watching
      ? {
          targetId: watching.targetId,
          status: watching.status === 'allowed' ? 'allowed' : 'pending',
          hand:
            watching.status === 'allowed' && target
              ? target.hand.map((card) => ({ ...card }))
              : null,
        }
      : null,
    refusedIds: refused.map((s) => s.targetId),
    watchers: room.handShares
      .filter((s) => s.targetId === playerId && s.status !== 'denied' && isLive(room, s))
      .map((s) => ({
        viewerId: s.viewerId,
        status: s.status === 'allowed' ? 'allowed' : 'pending',
      })),
  };
}
