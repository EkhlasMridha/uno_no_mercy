import {
  acceptPenaltySchema,
  callUnoSchema,
  catchUnoSchema,
  drawSchema,
  playCardSchema,
  rouletteColorSchema,
  type Ack,
  type ClientEventName,
  type CommandResult,
} from '@nomercy/shared';
import type { z } from 'zod';
import type { GameCommand } from '../engine/index.js';
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
function registerGameCommand<S extends z.ZodType<CommandEnvelope, z.ZodTypeDef, unknown>>(
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

export function registerGameHandlers(deps: HandlerDeps): void {
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
