export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'RATE_LIMITED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'GAME_IN_PROGRESS',
  'NAME_TAKEN',
  'ALREADY_IN_ROOM',
  'NOT_IN_ROOM',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'PLAYERS_NOT_READY',
  'INVALID_TOKEN',
  'STALE_STATE',
  'NOT_YOUR_TURN',
  'TURN_HOLD',
  'INVALID_MOVE',
  'INVALID_TARGET',
  'INVALID_PHASE',
  'CARD_NOT_IN_HAND',
  'GAME_NOT_ACTIVE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type AckCallback<T> = (response: Ack<T>) => void;
