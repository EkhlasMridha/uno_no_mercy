import { z } from 'zod';
import { CARD_COLORS } from './cards.js';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  MAX_COMPUTERS,
  MAX_PLAYERS,
  REACTION_EMOJIS,
  MIN_PLAYERS,
  PLAYER_NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
} from './constants.js';
import { GENDERS } from './room-view.js';

/** Runtime validation for every client-to-server payload. */

export const playerNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(PLAYER_NAME_MAX_LENGTH, `Name must be at most ${PLAYER_NAME_MAX_LENGTH} characters`)
  .regex(/^[\p{L}\p{N} _.'-]+$/u, "Name may only contain letters, numbers, spaces and . _ ' -");

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-HJKMNP-Z2-9]{${ROOM_CODE_LENGTH}}$`), 'Invalid room code');

export const reconnectTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/, 'Invalid token');
export const playerIdSchema = z.string().regex(/^p_[A-Za-z0-9_-]{8,32}$/, 'Invalid player id');
export const cardIdSchema = z.string().regex(/^c[a-z0-9]{6,16}$/, 'Invalid card id');
export const commandIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid command id');
export const cardColorSchema = z.enum(CARD_COLORS);
export const stateVersionSchema = z.number().int().nonnegative();
export const genderSchema = z.enum(GENDERS);
export const maxPlayersSchema = z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS);

export const createRoomSchema = z
  .object({
    name: playerNameSchema,
    gender: genderSchema,
    maxPlayers: maxPlayersSchema,
    /** Play with computer: seats this many computer opponents and deals straight away. */
    computers: z.number().int().min(1).max(MAX_COMPUTERS).optional(),
  })
  .strict();
export const joinRoomSchema = z
  .object({ code: roomCodeSchema, name: playerNameSchema, gender: genderSchema })
  .strict();
export const reconnectSchema = z
  .object({ code: roomCodeSchema, token: reconnectTokenSchema })
  .strict();
/** A lobby player changing their own name or avatar set. */
export const profileSchema = z
  .object({ name: playerNameSchema.optional(), gender: genderSchema.optional() })
  .strict()
  .refine((p) => p.name !== undefined || p.gender !== undefined, 'Change your name or avatar');
/** The host removing another player from the lobby. */
export const kickSchema = z.object({ playerId: playerIdSchema }).strict();
/** The host handing the room to another player. */
export const transferHostSchema = z.object({ playerId: playerIdSchema }).strict();
export const readySchema = z.object({ ready: z.boolean() }).strict();
/** The decider's answer for a dropped player: hold their seat, or let them forfeit (§5.16). */
export const waitForPlayerSchema = z
  .object({ playerId: playerIdSchema, wait: z.boolean() })
  .strict();
export const startGameSchema = z
  .object({
    /** Seat computer players in the open seats before dealing. */
    fillWithComputers: z.boolean().optional(),
  })
  .strict();
export const roomSettingsSchema = z
  .object({
    scoringEnabled: z.boolean().optional(),
    maxPlayers: maxPlayersSchema.optional(),
  })
  .strict();

/** A group chat line: one line of text and emoji, no control characters. */
export const chatSendSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Type a message first')
      .max(CHAT_MESSAGE_MAX_LENGTH, `Messages may be at most ${CHAT_MESSAGE_MAX_LENGTH} characters`)
      .regex(/^[^\p{Cc}]+$/u, 'Messages must be a single line of text'),
  })
  .strict();

/** Toggles the sender's reaction on a chat message. */
export const chatReactSchema = z
  .object({ messageId: z.number().int().nonnegative(), emoji: z.enum(REACTION_EMOJIS) })
  .strict();

const turnCommandShape = { commandId: commandIdSchema, version: stateVersionSchema };

export const playCardSchema = z
  .object({
    ...turnCommandShape,
    cardId: cardIdSchema,
    color: cardColorSchema.optional(),
    swapTargetId: playerIdSchema.optional(),
    declareUno: z.boolean().optional(),
    /** Discard All: the same-color cards to discard with it. Omitted means all of them. */
    discardIds: z.array(cardIdSchema).max(168).optional(),
  })
  .strict();
export const drawSchema = z.object(turnCommandShape).strict();
export const acceptPenaltySchema = z.object(turnCommandShape).strict();
export const rouletteColorSchema = z
  .object({ ...turnCommandShape, color: cardColorSchema })
  .strict();
export const callUnoSchema = z.object({ commandId: commandIdSchema }).strict();
export const catchUnoSchema = z
  .object({ commandId: commandIdSchema, targetId: playerIdSchema })
  .strict();

export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type ReconnectPayload = z.input<typeof reconnectSchema>;
export type ProfilePayload = z.input<typeof profileSchema>;
export type KickPayload = z.input<typeof kickSchema>;
export type TransferHostPayload = z.input<typeof transferHostSchema>;
export type ReadyPayload = z.input<typeof readySchema>;
export type WaitForPlayerPayload = z.input<typeof waitForPlayerSchema>;
export type StartGamePayload = z.input<typeof startGameSchema>;
export type RoomSettingsPayload = z.input<typeof roomSettingsSchema>;
export type ChatSendPayload = z.input<typeof chatSendSchema>;
export type ChatReactPayload = z.input<typeof chatReactSchema>;
export type PlayCardPayload = z.input<typeof playCardSchema>;
export type DrawPayload = z.input<typeof drawSchema>;
export type AcceptPenaltyPayload = z.input<typeof acceptPenaltySchema>;
export type RouletteColorPayload = z.input<typeof rouletteColorSchema>;
export type CallUnoPayload = z.input<typeof callUnoSchema>;
export type CatchUnoPayload = z.input<typeof catchUnoSchema>;
