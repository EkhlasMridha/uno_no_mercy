import {
  acceptPenaltySchema,
  answerHandRequestSchema,
  callUnoSchema,
  catchUnoSchema,
  drawSchema,
  endHandShareSchema,
  playCardSchema,
  requestHandSchema,
  rouletteColorSchema,
  type Ack,
  type ClientEventName,
  type CommandResult,
} from '@nomercy/shared';
import type { z } from 'zod';
import type { GameCommand } from '../engine/index.js';
import { answerHandRequest, endHandShare, requestHand } from '../rooms/hand-share.js';
import type { Room } from '../rooms/room.types.js';
import { RoomError } from '../rooms/room-manager.js';
import { registerHandler, toErrorAck } from './handler-utils.js';
import { requireSession, type HandlerDeps } from './room-handlers.js';

interface CommandEnvelope {
  commandId: string;
  version?: number;
}

/**
 * Wires one game event to an engine command. Every command goes through the same path:
 * session check → duplicate check → version check → engine → broadcast.
 */
function registerGameCommand<S extends z.ZodType<CommandEnvelope>>(
  deps: HandlerDeps,
  event: ClientEventName,
  schema: S,
  toCommand: (payload: z.output<S>) => GameCommand,
): void {
  const { socket, manager, broadcaster, limiter } = deps;
  registerHandler(socket, limiter, event, schema, (payload): Ack<CommandResult> => {
    const session = requireSession(socket);
    const room = manager.requireRoom(session.roomCode);
    const member = manager.requireMember(room, session.playerId);

    const cached = member.commandCache.get(payload.commandId);
    if (cached) return cached as Ack<CommandResult>;

    let result: Ack<CommandResult>;
    try {
      const { version } = manager.executeGameCommand(
        room.code,
        member.id,
        toCommand(payload),
        payload.version ?? null,
      );
      result = { ok: true, data: { version } };
      broadcaster.room(room);
    } catch (error) {
      result = toErrorAck(error);
      if (error instanceof RoomError && error.code === 'STALE_STATE') {
        broadcaster.toPlayer(room, member.id);
      }
    }
    member.commandCache.set(payload.commandId, result);
    return result;
  });
}

/**
 * Wires one hand-sharing event (docs/RULES.md §5.17). These never touch the game, so they skip the
 * command cache and version check: repeating one has the same effect as sending it once.
 */
function registerHandShare<S extends z.ZodTypeAny>(
  deps: HandlerDeps,
  event: ClientEventName,
  schema: S,
  apply: (room: Room, playerId: string, payload: z.output<S>) => void,
): void {
  const { socket, manager, broadcaster, limiter } = deps;
  registerHandler(socket, limiter, event, schema, (payload): Ack<null> => {
    const session = requireSession(socket);
    const room = manager.requireRoom(session.roomCode);
    const member = manager.requireMember(room, session.playerId);
    apply(room, member.id, payload);
    broadcaster.room(room);
    return { ok: true, data: null };
  });
}

export function registerGameHandlers(deps: HandlerDeps): void {
  registerHandShare(deps, 'game:request-hand', requestHandSchema, (room, id, p) =>
    requestHand(room, id, p.targetId),
  );
  registerHandShare(deps, 'game:answer-hand-request', answerHandRequestSchema, (room, id, p) =>
    answerHandRequest(room, id, p.viewerId, p.allow),
  );
  registerHandShare(deps, 'game:end-hand-share', endHandShareSchema, (room, id, p) =>
    endHandShare(room, id, p.viewerId),
  );
  registerGameCommand(deps, 'game:play-card', playCardSchema, (p) => ({
    type: 'playCard',
    cardId: p.cardId,
    color: p.color,
    swapTargetId: p.swapTargetId,
    declareUno: p.declareUno,
    discardIds: p.discardIds,
  }));
  registerGameCommand(deps, 'game:draw', drawSchema, () => ({ type: 'draw' }));
  registerGameCommand(deps, 'game:accept-penalty', acceptPenaltySchema, () => ({
    type: 'acceptPenalty',
  }));
  registerGameCommand(deps, 'game:choose-roulette-color', rouletteColorSchema, (p) => ({
    type: 'chooseRouletteColor',
    color: p.color,
  }));
  registerGameCommand(deps, 'game:call-uno', callUnoSchema, () => ({ type: 'callUno' }));
  registerGameCommand(deps, 'game:catch-uno', catchUnoSchema, (p) => ({
    type: 'catchUno',
    targetId: p.targetId,
  }));
}
