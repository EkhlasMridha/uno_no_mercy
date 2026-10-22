export const MIN_PLAYERS = 2;
/**
 * Technical ceiling only: the host chooses each room's size. 20 × 7 dealt cards still leaves
 * enough of the 168-card deck to flip a starting card and keep a draw pile going.
 */
export const MAX_PLAYERS = 20;
export const STARTING_HAND_SIZE = 7;
export const DECK_SIZE = 168;
/** Mercy Rule: a player holding this many cards or more is eliminated. */
export const MERCY_HAND_LIMIT = 25;
export const UNO_PENALTY_CARDS = 2;
export const MATCH_TARGET_POINTS = 1000;
export const KNOCKOUT_BONUS_POINTS = 250;
export const ROOM_CODE_LENGTH = 5;
/** Alphabet without easily confused characters (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PLAYER_NAME_MAX_LENGTH = 20;
/** Most computer players a room can seat. */
export const MAX_COMPUTERS = 9;
