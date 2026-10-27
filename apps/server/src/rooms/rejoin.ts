import type { Room, RoomPlayer } from './room.types.js';

/**
 * Who decides whether the table waits for a dropped player (docs/RULES.md §5.16): the next connected
 * person after them in the current direction of play. Null when there is nothing to decide: the
 * player is connected, a computer, gone, already out of the round, or nobody is left to ask.
 */
export function waitDeciderId(room: Room, player: RoomPlayer): string | null {
  const game = room.game;
  if (room.status !== 'inGame' || !game) return null;
  if (player.socketId || player.isComputer || player.departed) return null;
  const at = game.players.findIndex((p) => p.id === player.id);
  if (at < 0 || game.players[at]?.status !== 'active') return null;
  const count = game.players.length;
  for (let step = 1; step < count; step++) {
    const seat = game.players[(((at + step * game.direction) % count) + count) % count];
    if (!seat || seat.status !== 'active') continue;
    const member = room.players.find((p) => p.id === seat.id);
    if (member && member.socketId && !member.isComputer && !member.departed) return member.id;
  }
  return null;
}
