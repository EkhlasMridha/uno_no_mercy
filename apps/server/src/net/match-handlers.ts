import { matchEmoteSchema, searchMatchSchema } from '@nomercy/shared';
import { z } from 'zod';
import { RoomError } from '../rooms/room-manager.js';
import { registerHandler } from './handler-utils.js';
import type { HandlerDeps } from './room-handlers.js';

const emptySchema = z.object({}).strict();

/** Play global: joining and leaving a match search (docs/RULES.md §5.19). */
export function registerMatchHandlers(deps: HandlerDeps): void {
  const { socket, matchmaker, limiter } = deps;

  registerHandler(
    socket,
    limiter,
    'match:search',
    searchMatchSchema,
    ({ name, gender, timeZone }) => {
      if (socket.data.session) {
        throw new RoomError('ALREADY_IN_ROOM', 'Leave your current room first');
      }
      const { match, seat } = matchmaker.search(socket.id, name, gender, timeZone);
      return { ok: true, data: matchmaker.viewFor(match, seat.id) };
    },
  );

  registerHandler(socket, limiter, 'match:cancel', emptySchema, () => {
    matchmaker.cancel(socket.id);
    return { ok: true, data: null };
  });

  registerHandler(socket, limiter, 'match:emote', matchEmoteSchema, ({ emote }) => {
    matchmaker.emote(socket.id, emote);
    return { ok: true, data: null };
  });
}
