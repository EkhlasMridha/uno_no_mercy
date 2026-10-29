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

**UNO breather.** After a command that plays a card or changes whose turn it is, `RoomManager` sets
`room.turnHoldUntil` to `TURN_HOLD_MS` (2 s) ahead (docs/RULES.md §5.9). Until then `executeGameCommand`
refuses play, draw, take-penalty, roulette-color and catch commands with `TURN_HOLD`; `callUno` and leaving
still go through. `toGameView` sends `turnHoldMs` and strips every action except `canCallUno` from
`validActions`, and a per-room `holdTimer` re-broadcasts when the hold ends, so clients never run a clock.
A play that hands the turn straight back to its player skips the hold unless a player is left
vulnerable to a catch (`needsTurnHold`). Computers wait it out too. The timing lives in the rooms layer, so the engine stays clock-free.

## Network protocol

All client→server events are acknowledged with `Ack<T> = { ok: true, data } | { ok: false, error: { code, message } }`.

| Event                        | Payload                                                              | Notes                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `room:create`                | `{ name, gender, maxPlayers, computers? }`                           | returns `SessionInfo`; `computers` (1–9) deals at once; `gender` (`male`/`female`) picks the avatar set |
| `room:join`                  | `{ code, name, gender }`                                             | lobby: up to `maxPlayers`, unique names. In a game: only takes back a held seat under its name (§5.16)  |
| `room:wait-for-player`       | `{ playerId, wait }`                                                 | the dropped player's decider only: `true` holds the seat, `false` makes them forfeit now                |
| `room:reconnect`             | `{ code, token }`                                                    | restores the seat; closes an older socket for the same seat                                             |
| `room:leave`                 | `{}`                                                                 | lobby: frees the seat; in game: forfeit                                                                 |
| `room:profile`               | `{ name?, gender? }`                                                 | lobby only; your own seat; at least one field; names stay unique                                        |
| `room:kick`                  | `{ playerId }`                                                       | host, lobby only; the removed player gets `room:closed` and is unbound                                  |
| `room:transfer-host`         | `{ playerId }`                                                       | host, lobby only; target must be connected; the old host becomes a guest                                |
| `room:ready`                 | `{ ready }`                                                          |                                                                                                         |
| `room:settings`              | `{ scoringEnabled }`                                                 | host, lobby only                                                                                        |
| `game:start`                 | `{ fillWithComputers? }`                                             | host; everyone else ready; computers may fill open seats                                                |
| `game:restart`               | `{}`                                                                 | host; next round (or a new match after 1000 points)                                                     |
| `room:return-lobby`          | `{}`                                                                 | host; resets scores and ready flags                                                                     |
| `game:request-state`         | `{}`                                                                 | resends this player's projection                                                                        |
| `game:play-card`             | `{ commandId, version, cardId, color?, swapTargetId?, declareUno? }` | also used for **stacking**                                                                              |
| `game:draw`                  | `{ commandId, version }`                                             | one card per press; reveals a card during Color Roulette                                                |
| `game:accept-penalty`        | `{ commandId, version }`                                             | take the whole stack                                                                                    |
| `game:choose-roulette-color` | `{ commandId, version, color }`                                      | roulette victim only                                                                                    |
| `game:call-uno`              | `{ commandId }`                                                      |                                                                                                         |
| `game:catch-uno`             | `{ commandId, targetId }`                                            |                                                                                                         |

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
- **HTTP:** CSP `default-src 'self'`, `nosniff`, `frame-ancestors 'none'`, COOP/CORP `same-origin`, a
  `Permissions-Policy` that turns off camera, microphone and location, no `x-powered-by`. Error responses
  are plain "Bad request" / "Server error" with no stack trace. All assets, including the font, are bundled
  locally. Headers must arrive within 10 s and a request within 30 s; the server holds at most 1,000 sockets.
- **Host surface:** nothing a player sends reaches the file system, a shell, `eval` or a database. Static
  files come only from the client bundle, through Express's traversal-safe `static`. The server ignores
  `X-Forwarded-*` headers unless `TRUST_PROXY` is set for a reverse proxy; then it takes the public host
  from the first `X-Forwarded-Host` entry and the player's address from the last `X-Forwarded-For` entry,
  the only one the proxy itself added.
- **Link previews** (`http/index-page.ts`): `index.html` carries Open Graph and Twitter tags with
  root-relative URLs. The server makes `og:url`, `og:image` and `twitter:image` absolute for the origin of
  each request (the host is already checked; HTTPS only via a trusted `X-Forwarded-Proto`), because most
  crawlers ignore relative image URLs. The share image and icons are drawn from `apps/client/branding/`.
- **Who may connect** (`http/request-guard.ts`): the `Host` header must be an IP address, `localhost`, this
  machine's name or a name in `ALLOWED_HOSTS`; anything else gets `421`, which defeats DNS-rebinding pages.
  The Socket.IO handshake also requires a same-origin `Origin` (WebSockets skip CORS, so without it any
  website a player visits could drive the game socket). One address may hold `MAX_CONNECTIONS_PER_IP`
  sockets (default 32), so a single device can't fill the 50-room limit or exhaust memory. Each refusal is
  logged once with its reason, so a misconfigured proxy is easy to spot.
- **Container:** non-root user, read-only file system, every Linux capability dropped,
  `no-new-privileges`, 64 processes and 512 MB at most (`compose.yaml`). The image holds only `node`, one
  bundled server file and the static client.
- **Dev server:** `npm run dev:lan` exposes Vite to the network. `server.fs.allow` limits it to the client,
  the shared package and `node_modules`, so the rest of the repo and the machine stay unreadable. Keep Vite
  patched: older releases had file-read bugs on Windows. Use the production build for real game nights.

## Sessions, disconnects and reconnects

- The tab keeps `{ roomCode, playerId, reconnectToken }` in `sessionStorage`. A refresh reconnects to the
  same seat instead of creating a second player. Opening the same seat in a second window closes the older
  connection.
- When a player disconnects, their seat and hand are kept for `RECONNECT_GRACE_SECONDS` (default 120s) and
  other players see a disconnected icon. If the host disconnects, host rights move to a connected player.
- **Waiting for a dropped player** (docs/RULES.md §5.16): during a game, `waitDeciderId` in
  `rooms/rejoin.ts` names the next connected person in the direction of play, and the room view
  carries it with `seatHeld`. If they wait, the expiry timer is reset to `WAIT_FOR_REJOIN_MS` and
  `room:join` with the room code and the same name takes the seat back, with a new token. If they
  don't, the player forfeits at once.
- **When the reconnect window expires:** in the lobby the seat is freed. During a game the player forfeits
  (eliminated, cards set aside, play continues), is marked _departed_, and their token becomes invalid. When
  no human members remain, the room is deleted.
- **Host shutdown** (Ctrl+C): every client receives `room:closed` and all rooms are discarded. After a server
  restart, saved sessions fail to reconnect and the client shows "That room is no longer available".

## Computer players

Computer seats are `RoomPlayer`s with `isComputer` and no socket, created by `room:create` with
`computers`, or by `game:start` with `fillWithComputers`, which seats them in the open seats (at most
`MAX_COMPUTERS`, 9, per room) before the deal. They leave when the room goes back to the lobby, so the
lobby only ever shows people. They live in the rooms layer, not the engine; the engine only gets
`endWhenOut`, the people's seats, and ends the round with no winner (`peopleOut`) once all of them are
out. After every successful command and every new
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
browser stores only the reconnect credential (`sessionStorage`), and the last-used display name and
sound settings (`localStorage`, conveniences). There is no authoritative state in the browser.
