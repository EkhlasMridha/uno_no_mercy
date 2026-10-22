# Architecture

```
apps/client      React + Vite + Tailwind UI (presentation only)
apps/server      Node + Express + Socket.IO host; authoritative engine; in-memory rooms
packages/shared  Card/game/room types, event contracts, Zod schemas, constants
docs             Rules, architecture, game flow, LAN setup
```

This is an npm workspaces monorepo with strict TypeScript everywhere. `packages/shared` is compiled to
`dist/` and used by both apps. There is no database and no external service. Everything lives in memory.

## Layers and boundaries

```
 Browser (React)                 Host (Node.js)
 ───────────────                 ───────────────────────────────────────────────
 pages/components ──actions──►  net/  (Socket.IO handlers, Zod validation, rate limit,
 state/store (view cache)        │      dedupe, broadcasting)
 net/socket  ◄──room:state──     ▼
              ◄──game:state──   rooms/ (RoomManager: lobby, sessions, reconnect, scoring)
                                 │
                                 ▼
                                engine/ (pure TypeScript rules; no I/O, no Socket.IO)
```

- **Engine** (`apps/server/src/engine`): pure functions over a `GameState`. It does not import Express,
  Socket.IO or React. Randomness is injected (`Rng`), so tests are deterministic.
- **Rooms** (`apps/server/src/rooms`): room lifecycle, membership, host authority, reconnect tokens,
  disconnect timers, per-player projections and optional match scoring.
- **Net** (`apps/server/src/net`): validates and routes typed events, then broadcasts. The handlers are
  small and call into `RoomManager`.
- **Client**: renders the projections. Legal moves come from the server's `validActions`, so the client
  holds no copy of the rules. Its only local logic is display: sorting the hand, labels and animations.

## Engine modules

| Module               | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `card.types.ts`      | Re-exports the shared discriminated-union card model                 |
| `deck.ts`            | Verified 168-card composition, unique random card ids, shuffled deck |
| `rng.ts`             | Crypto RNG, seeded RNG for tests, Fisher–Yates                       |
| `game.types.ts`      | `GameState`, `EnginePhase`, `GameCommand` (discriminated unions)     |
| `game.factory.ts`    | Setup: deal, first-discard flip, first player                        |
| `game.validation.ts` | Matching, playability, play validation                               |
| `turn-manager.ts`    | Seat iteration that skips knocked-out players, turn advance          |
| `pile.ts`            | Drawing, reshuffling, draw-with-Mercy-checks                         |
| `card-effects.ts`    | Action card effects, 7 swap, 0 pass, roulette resolution             |
| `stacking.ts`        | Stack validation, accumulation, accepting penalties                  |
| `mercy-rule.ts`      | 25-card elimination, set-aside handling                              |
| `uno-manager.ts`     | UNO status, catch window, catching                                   |
| `win-condition.ts`   | Empty-hand and last-standing victory                                 |
| `game.reducer.ts`    | The single state-transition pathway                                  |
| `game-selectors.ts`  | Valid actions and public projection                                  |
| `conservation.ts`    | Development invariant: 168 unique cards in total                     |
| `rules-config.ts`    | Switches for documented ambiguities                                  |

### The single transition pathway

`applyCommand(state, playerId, command, rng)`:

1. `structuredClone` the state. A rejected command can never leave a half-applied state behind.
2. Check that the game is not finished and the player belongs to it.
3. Dispatch on `command.type`, then check phase, turn ownership and the card or target (`RuleViolation`).
4. Apply the effect.
5. Finalize: sync UNO status, check last-standing victory, sanity-check the current seat, increment
   `version` and append public events to the log.
6. In development (`--dev`), assert that the 168 cards are all still there.

`RoomManager.executeGameCommand` adds the room-level checks around this: room status, membership and the
expected state version. When a game finishes it records the round result and scores.

## Game state machine

```
            ┌───────────── play (normal / stack) ─────────────┐
            ▼                                                  │
   ┌──────────────┐             draw              ┌────────┴──────────────┐
   │    turn      │ ────────────────────────────► │ drawing               │
   │ (pending     │ ◄─── play the last drawn card │ (only the last drawn  │ ◄─┐
   │  draw?)      │       (if it is playable) ─── │  card is playable)    │   │ draw again
   └──┬───────┬───┘                               └───────────────────────┘ ──┘
      │       │ play Wild Color Roulette
      │       ▼
      │  ┌──────────────┐ name color ┌────────────────┐ draw until color → next player
      │  │ rouletteColor│ ─────────► │ rouletteReveal │ ─────────────────────────► turn
      │  └──────────────┘            └────────────────┘
      │ empty hand / last standing
      ▼
   ┌──────────┐
   │ finished │
   └──────────┘
```

`pendingDraw: { total, lastValue } | null` sits next to the phase. When it is set, the current player in
`turn` may only stack or `acceptPenalty`.

## Information model

| Public (`PublicGameView`, the same for everyone)                         | Private (`PrivatePlayerView`, only for that player)       |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| names, seats, hand **counts**, status, connection, UNO status, host      | own hand (card ids and faces)                             |
| top card, current color, direction, current player                       | own `validActions`                                        |
| pending stack total and last value, phase, draw/discard/set-aside counts | own reconnect token (sent only in the join/reconnect ack) |
| public action log: played cards, draw **counts**, swaps, eliminations    |                                                           |

`Broadcaster` sends each socket `room:state` plus `game:state` built by `toGameView(room, playerId)`, which
copies only that player's hand. Swaps and passes therefore reach each player only as their own new hand.
Opponents' card ids are never sent. The integration test checks this byte for byte.

## Network protocol

All client→server events are acknowledged with `Ack<T> = { ok: true, data } | { ok: false, error: { code, message } }`.

| Event                        | Payload                                                              | Notes                                                       |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `room:create`                | `{ name, maxPlayers, computers? }`                                   | returns `SessionInfo`; `computers` (1–19) deals at once     |
| `room:join`                  | `{ code, name }`                                                     | lobby only; max 6; unique names                             |
| `room:reconnect`             | `{ code, token }`                                                    | restores the seat; closes an older socket for the same seat |
| `room:leave`                 | `{}`                                                                 | lobby: frees the seat; in game: forfeit                     |
| `room:ready`                 | `{ ready }`                                                          |                                                             |
| `room:settings`              | `{ scoringEnabled }`                                                 | host, lobby only                                            |
| `game:start`                 | `{}`                                                                 | host; ≥2 players; everyone else ready and connected         |
| `game:restart`               | `{}`                                                                 | host; next round (or a new match after 1000 points)         |
| `room:return-lobby`          | `{}`                                                                 | host; resets scores and ready flags                         |
| `game:request-state`         | `{}`                                                                 | resends this player's projection                            |
| `game:play-card`             | `{ commandId, version, cardId, color?, swapTargetId?, declareUno? }` | also used for **stacking**                                  |
| `game:draw`                  | `{ commandId, version }`                                             | one card per press; reveals a card during Color Roulette    |
| `game:accept-penalty`        | `{ commandId, version }`                                             | take the whole stack                                        |
| `game:choose-roulette-color` | `{ commandId, version, color }`                                      | roulette victim only                                        |
| `game:call-uno`              | `{ commandId }`                                                      |                                                             |
| `game:catch-uno`             | `{ commandId, targetId }`                                            |                                                             |

Server→client: `room:state` (`RoomView`), `game:state` (`GameStateView`, per player), `room:closed`.

Differences from the suggested list: the wild color and the 7 swap target travel **inside**
`game:play-card`, so a wild or a 7 is applied in one atomic step and there are no half-played states.
`game:stack-card` is the same operation as `game:play-card` while a penalty is pending.

### Reliability and security

- **Validation:** every payload is parsed by a strict Zod schema (names, room codes, ids, tokens and
  colors). Unknown keys are rejected.
- **Authority:** the server owns the deck, hands, piles, turn, direction, stack, colors, UNO state,
  eliminations, wins and membership. Clients send intentions only.
- **Identity:** a socket is bound to `{ roomCode, playerId }` on create, join or reconnect. Commands never
  carry a player id for the actor.
- **Stale and duplicate commands:** turn commands carry the `version` the client saw. A mismatch returns
  `STALE_STATE` and a fresh projection. Each command has a `commandId`, and the last 64 results per player
  are cached, so a retry returns the original acknowledgement instead of running twice.
- **Concurrency:** handlers are synchronous from validation to broadcast, and Node handles one socket event
  at a time, so mutations of a room are serialized. Nothing awaits in the middle of a mutation.
- **Rate limiting:** a token bucket per socket allows a burst of 30 at 15 per second. Abusive sockets are
  disconnected. Socket.IO payloads are capped at 16 KB.
- **Secrets:** reconnect tokens are 256-bit random values compared in constant time. They are never placed
  in URLs or logs and are only sent to their owner. Logs record room events, never hands or tokens.
- **HTTP:** CSP `default-src 'self'`, `nosniff`, `frame-ancestors 'none'`, no `x-powered-by`. All assets,
  including the font, are bundled locally.

## Sessions, disconnects and reconnects

- The tab keeps `{ roomCode, playerId, reconnectToken }` in `sessionStorage`. A refresh reconnects to the
  same seat instead of creating a second player. Opening the same seat in a second window closes the older
  connection.
- When a player disconnects, their seat and hand are kept for `RECONNECT_GRACE_SECONDS` (default 120s) and
  other players see a disconnected icon. If the host disconnects, host rights move to a connected player.
- **When the reconnect window expires:** in the lobby the seat is freed. During a game the player forfeits
  (eliminated, cards set aside, play continues), is marked _departed_, and their token becomes invalid. When
  no human members remain, the room is deleted.
- **Host shutdown** (Ctrl+C): every client receives `room:closed` and all rooms are discarded. After a server
  restart, saved sessions fail to reconnect and the client shows "That room is no longer available".

## Computer players

Computer seats are `RoomPlayer`s with `isComputer` and no socket, created by `room:create` with
`computers`. They live in the rooms layer, not the engine. After every successful command and every new
round, `RoomManager` sets one timer per room, but only when some computer has a move
(`computerMoveDelayMs`, 900 ms by default, shorter on fuller tables and halved while a player is drawing
card by card). When it fires, `computerMoves` in `rooms/computer-player.ts` picks each computer's move
from `getValidActions` alone, UNO calls first so a computer saves itself before another can catch it,
and the first one goes through `executeGameCommand`, the same path a human command takes. A refused move
falls back to a plain draw or penalty, and if nothing goes through the timer is set again, so the table
never waits on a computer. Each move schedules the next, so computers keep playing until a human must act
or the round ends. The public views mark them `isComputer`, and they always count as connected and ready.

## No-persistence policy

Rooms, sessions, card instances, game states, reconnect tokens and match scores live only in memory. The
browser stores only the reconnect credential (`sessionStorage`) and the last-used display name
(`localStorage`, a convenience). There is no authoritative state in the browser.
