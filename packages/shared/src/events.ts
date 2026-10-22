import type { AckCallback } from './errors.js';
import type { GameStateView } from './game-view.js';
import type { RoomView, SessionInfo } from './room-view.js';
import type {
  AcceptPenaltyPayload,
  CallUnoPayload,
  CatchUnoPayload,
  CreateRoomPayload,
  DrawPayload,
  JoinRoomPayload,
  PlayCardPayload,
  ReadyPayload,
  ReconnectPayload,
  RoomSettingsPayload,
  RouletteColorPayload,
  StartGamePayload,
} from './schemas.js';

export interface CommandResult {
  version: number;
}

/**
 * Client → server commands. Every command is acknowledged with an `Ack<T>`.
 * Stacking a draw card uses `game:play-card` (a stack response is simply a play while a
 * penalty is pending), so there is no separate stack event.
 */
export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: AckCallback<SessionInfo>) => void;
  'room:join': (payload: JoinRoomPayload, ack: AckCallback<SessionInfo>) => void;
  'room:reconnect': (payload: ReconnectPayload, ack: AckCallback<SessionInfo>) => void;
  'room:leave': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'room:ready': (payload: ReadyPayload, ack: AckCallback<null>) => void;
  'room:settings': (payload: RoomSettingsPayload, ack: AckCallback<null>) => void;
  'room:return-lobby': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'game:start': (payload: StartGamePayload, ack: AckCallback<null>) => void;
  'game:restart': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'game:request-state': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'game:play-card': (payload: PlayCardPayload, ack: AckCallback<CommandResult>) => void;
  'game:draw': (payload: DrawPayload, ack: AckCallback<CommandResult>) => void;
  'game:accept-penalty': (payload: AcceptPenaltyPayload, ack: AckCallback<CommandResult>) => void;
  'game:choose-roulette-color': (
    payload: RouletteColorPayload,
    ack: AckCallback<CommandResult>,
  ) => void;
  'game:call-uno': (payload: CallUnoPayload, ack: AckCallback<CommandResult>) => void;
  'game:catch-uno': (payload: CatchUnoPayload, ack: AckCallback<CommandResult>) => void;
}

/** Server → client events. `game:state` is a per-player projection. */
export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'game:state': (state: GameStateView) => void;
  'room:closed': (payload: { reason: string }) => void;
}

export type ClientEventName = keyof ClientToServerEvents;
