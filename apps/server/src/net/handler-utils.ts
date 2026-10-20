import type { Ack, ApiError, ClientEventName } from '@nomercy/shared';
import type { z } from 'zod';
import { RoomError } from '../rooms/room-manager.js';
import type { RateLimiter } from './rate-limiter.js';
import type { GameSocket } from './socket-types.js';

type RawListener = (...args: unknown[]) => void;
/**
 * Incoming payloads are untrusted, so handlers are registered against `unknown` arguments
 * and validated with Zod instead of relying on the compile-time event map.
 */
interface UntypedListenerSocket {
  on(event: string, listener: RawListener): unknown;
}

export function errorAck(code: ApiError['code'], message: string): Ack<never> {
  return { ok: false, error: { code, message } };
}

export function toErrorAck(error: unknown): Ack<never> {
  if (error instanceof RoomError) return errorAck(error.code, error.message);
  console.error(
    '[server] unexpected handler error:',
    error instanceof Error ? error.message : error,
  );
  return errorAck('INTERNAL', 'Something went wrong on the server');
}

export function registerHandler<S extends z.ZodTypeAny, R>(
  socket: GameSocket,
  limiter: RateLimiter,
  event: ClientEventName,
  schema: S,
  handler: (payload: z.output<S>) => Ack<R>,
): void {
  (socket as unknown as UntypedListenerSocket).on(event, (rawPayload: unknown, rawAck: unknown) => {
    const ack = typeof rawAck === 'function' ? (rawAck as (res: Ack<R>) => void) : () => undefined;
    if (!limiter.tryTake()) {
      if (limiter.isAbusive) socket.disconnect(true);
      return ack(errorAck('RATE_LIMITED', 'Slow down — too many actions'));
    }
    const parsed = schema.safeParse(rawPayload ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return ack(errorAck('INVALID_PAYLOAD', issue?.message ?? 'Invalid request'));
    }
    try {
      ack(handler(parsed.data));
    } catch (error) {
      ack(toErrorAck(error));
    }
  });
}
