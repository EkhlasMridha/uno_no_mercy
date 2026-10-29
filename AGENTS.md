# AGENTS.md

Guidance for anyone, human or AI agent, changing this repo. It covers the coding standards the codebase
already follows and a playbook for creating or changing game rules. When this file and the code disagree,
the code wins: fix this file in the same change.

**No Mercy LAN** is a real-time multiplayer card game for a local network, built to the rules of the
168-card _UNO Show 'em No Mercy_ game with original artwork. One host machine runs the server; everyone
else plays in a browser.

## Commands

Run from the repo root.

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Builds `shared`, then runs server (:3000) and Vite (:5173) in watch |
| `npm run dev:lan`   | Same, reachable from other devices on the network                   |
| `npm test`          | Builds `shared`, then runs the engine, simulation and socket tests  |
| `npm run typecheck` | Strict `tsc` across every workspace                                 |
| `npm run lint`      | ESLint                                                              |
| `npm run format`    | Prettier (`format:check` to verify only)                            |
| `npm run build`     | Production build of shared, server and client                       |
| `npm run start:lan` | Runs the production build. **Rebuild first**, or it serves old code |

`packages/shared` compiles to `dist/`. After changing a shared type outside `npm run dev`, run
`npm run build:shared` or the apps will typecheck against the old version.

## Repo map

```
packages/shared   Types (cards, game view, room view), event contracts, Zod schemas, constants
apps/server
  src/engine      Pure rules engine: no I/O, no Socket.IO, no Express
  src/rooms       Room lifecycle, sessions, reconnects, per-player projections, scoring
  src/net         Socket.IO handlers: validate, route, broadcast
  test/           Vitest: engine.test.ts, simulation.test.ts, multiplayer.test.ts,
                  turn-hold.test.ts, three-player-uno.test.ts
apps/client       React + Vite + Tailwind. Presentation only
docs              RULES.md, ARCHITECTURE.md, GAME-FLOW.md, LAN-SETUP.md
```

## Non-negotiables

These keep the game fair and the code testable. Do not trade them away for convenience.

1. **The server is the only authority.** The deck, hands, piles, turn, colors, stack, UNO state and
   eliminations live on the server. Clients send intentions and render what comes back.
2. **The client holds no rules.** What a player may do comes from `validActions`, computed by
   `getValidActions` in `game-selectors.ts`. The client may sort, label and animate, never decide
   legality. If the UI needs to know something new, add it to `ValidActions` or the public view.
3. **The engine is pure.** `apps/server/src/engine` never imports Express, Socket.IO, timers or `Math.random`.
   Randomness comes in as an `Rng`, so tests are deterministic.
4. **One transition pathway.** Every state change goes through `applyCommand` in `game.reducer.ts`,
   which works on a `structuredClone`. A rejected command (`fail(...)` throws `RuleViolation`) leaves no
   half-applied state.
5. **Hidden information stays hidden.** Opponents' card ids and faces are never sent. Public events carry
   counts, not cards, unless the card is genuinely face up for everyone (a played card, a Color Roulette
   reveal). `multiplayer.test.ts` checks this byte for byte.
6. **168 cards, always.** A card is always in exactly one place: draw pile, discard pile, a hand, or set
   aside. `conservation.ts` asserts it in `--dev` and in the simulation test. Never park a card in phase
   state. Put it in a real pile and keep ids in the phase (see `rouletteReveal.revealedIds`).
7. **Validate every payload.** Each client event has a strict Zod schema in `packages/shared/src/schemas.ts`.
   Unknown keys are rejected. Commands never carry the actor's player id; the socket binding decides that.
8. **Nothing persists.** No database, no cloud. The browser keeps only the reconnect token
   (`sessionStorage`), and the last display name and sound settings (`localStorage`).
9. **Players never reach the host.** Nothing from a client touches the file system, a shell, `eval` or
   `child_process`. New HTTP routes go behind the Host check in `http/request-guard.ts`, the socket keeps
   its same-origin and per-address limits, and errors never return stack traces. See "Reliability and
   security" in `docs/ARCHITECTURE.md`.

## Coding standards

### TypeScript

- Strict mode with `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters` and
  `noFallthroughCasesInSwitch`. `any` is a lint error. Prefix intentionally unused parameters with `_`.
- Model state as **discriminated unions** (`EnginePhase`, `GameCommand`, `GameEvent`, `Card`) and handle
  them with exhaustive `switch` statements. Adding a variant should break the build everywhere it matters.
  Let it, then fix each site.
- Prefer narrowing (`phase.type === 'drawing'`) over casts. A type guard like `(c): c is Card => ...` is
  fine. `as` is a last resort.
- ES modules everywhere. Server imports use the `.js` suffix (`'./pile.js'`) because of `NodeNext`.
- Shared types are imported from `@nomercy/shared`. The engine re-exports the card model through
  `card.types.ts`.

### Formatting and naming

- Prettier: single quotes, semicolons, trailing commas, 100-character lines. Run `npm run format` before you
  finish. Don't hand-format.
- Files use `kebab-case` or `dot.case` as their siblings do (`game.reducer.ts`, `card-effects.ts`).
  React components use `PascalCase.tsx`. Hooks use `useThing.ts`.
- Name things by what they mean in the game: `victimId`, `pendingDraw`, `drawnPlayableCardId`, not
  `data`, `info` or `flag`.

### Comments

- Comment density is low and purposeful. Write a JSDoc line on exported functions and on each union
  variant saying what it means in game terms. Write an inline comment only when the _why_ isn't obvious,
  and cite the rule when it encodes one (`// Official two-player rule: ...`,
  `// docs/RULES.md §6`).
- Don't narrate the code, and don't leave commented-out code behind.

### Errors

- Rule violations use `fail(code, message)` with a code from `packages/shared/src/errors.ts`. The
  message is shown to the player, so write it as plain advice: "Choose a color for your wild card", not
  "color required".
- Throw a plain `Error` only for programmer mistakes that should never happen in a valid state.

### Client (React + Tailwind)

- Function components and hooks. Server state arrives through the store as projections; components
  never mutate it.
- Network calls live in `src/net/actions.ts`. Components call those helpers and never touch the socket.
- Styling uses Tailwind with the theme tokens in `tailwind.config.js` (see _Table design system_ below).
  Shared component classes (`.btn-*`, `.panel`, `.input`, `.table-rail`, `.table-felt`) live in
  `src/index.css` under `@layer components`.
- Accessibility is part of done: real `<button>`s, `aria-label` on icon-only and card controls,
  `role="status"` + `aria-live` for turn and reveal messages, visible `focus-visible` outlines, and every
  animation disabled under `prefers-reduced-motion` (the global rule in `index.css` already does this for
  every CSS animation and transition; motion started from script must check the media query itself).
- Animations are cosmetic. They never delay or gate state. A new state is already applied when its
  animation starts.
- Sounds are cosmetic too. `lib/sound.ts` synthesizes them with Web Audio (no audio files): every
  card play (a Discard All has its own: a handful of cards hitting the pile), every card drawn from the pile (a Draw or a Color Roulette reveal, so the table hears
  someone drawing), the sweep and riffle when the discards are reshuffled into a new draw pile, the ding when a roulette reveal finds the named color, a voice shouting "UNO!" when anyone calls it (the browser's own speech voices, a man or a woman to match the caller's avatar), the chime when your turn
  starts, the turn reminder, 0/7 hand exchanges, the
  mocking trombone everyone hears when a player takes penalty cards, the danger alarm when the Mercy Rule knocks a player out at 25 cards, and the
  win. `useGameSounds` plays them only from
  state the server sent, and the Sound panel
  (`SoundSettings.tsx`) switches each one off or mutes them all.

### Tests

- Every rule change gets engine tests in `apps/server/test/engine.test.ts`, built with the helpers in
  `test/helpers.ts` (`buildState`, `run`, `reject`, `handOf`, `cardId`, `n`, `wild`, `filler`).
- `buildState({ drawPile: [a, b, c] })` lists cards **in draw order**: `a` is drawn first.
- Assert both sides: the legal move works (`run`) and the illegal one is refused with the right code
  (`reject(...)` returns the error code).
- `simulation.test.ts` plays many random full games through `getValidActions` and checks termination and
  card conservation. If a new phase can stall a game, this test will hang or fail. Treat that as a real bug.
- Don't weaken or delete a test to make a change pass. If the rule changed, rewrite the test to state the
  new rule.

## Game creator playbook

Use this when adding a card, changing a rule, or adding a new kind of turn. Work in this order. Each step
leans on the one before it.

### 1. Write the rule down first

Update `docs/RULES.md` before touching code. State exactly:

- who acts, what they may do, and what is forbidden;
- when it ends (every loop must provably terminate; say why);
- the edge cases: empty draw pile, Mercy Rule at 25 cards, two players, the player leaving mid-action,
  a pending penalty, UNO.

If the official sheet is ambiguous, pick a policy, add a row to the ambiguity table in RULES.md §6, and,
if it is worth toggling, add a switch to `rules-config.ts` with a comment pointing at that row.

### 2. Model it in the types

- **New card:** add the face to the card union in `packages/shared/src/cards.ts`, its count to `deck.ts`
  (keep the total at 168 or update `DECK_SIZE` and the composition test), its name in
  `apps/client/src/lib/cards.ts` and its art in `PlayingCard.tsx`.
- **New kind of turn:** add an `EnginePhase` variant in `game.types.ts` and a matching public variant in
  `GamePhaseView` (`packages/shared/src/game-view.ts`). The public one must not leak hidden cards.
- **New player action:** add a `GameCommand` variant, a Zod schema and payload type in `schemas.ts`, the
  event in `events.ts`, a handler in `apps/server/src/net/game-handlers.ts`, and a client helper in
  `net/actions.ts`. Reuse an existing command when the intent is the same: Color Roulette reveals reuse
  `draw` rather than adding a new event.
- **New public event:** add it to `GameEvent`, then give it a log line in `describeEvent` and, if it is a
  dramatic moment, a banner in `bannerFor` (`apps/client/src/lib/event-text.ts`).

### 3. Implement it in the engine

- Put the effect in the module that owns it (see the table in `docs/ARCHITECTURE.md`). Card effects go in
  `card-effects.ts`, draws in `pile.ts`, stacking in `stacking.ts`.
- Route the command through `dispatch` in `game.reducer.ts`. Check, in order: active player, turn
  ownership, phase, then the card or target.
- Draw cards with `drawOne` / `drawCardsInto` so reshuffles and the Mercy Rule apply automatically. Call
  `enforceMercy` after any loop that adds cards.
- Always leave the phase consistent: reset to `{ type: 'turn' }` and `advanceTurn` when the action ends,
  including on knockout and on an exhausted deck.
- Expose the new possibilities in `getValidActions` and the public projection in `phaseView`.

### 4. Test it

Cover the happy path, every refusal, and the edge cases from step 1. Run `npm test`. The simulation must
still pass.

### 5. Show it on the table

- Status text for the acting player and for watchers lives in `statusText` in `GamePage.tsx`. When a card
  click is refused, `explainUnplayable` gives the reason.
- Face-up moments everyone should see (like the Color Roulette tray, `RouletteReveal.tsx`) render on the
  felt inside `GameTable.tsx`, not in a modal, so the table stays visible.
- A choice the player must make before play continues goes in a modal that cannot be dismissed (see
  `ColorPickerModal` with no `onCancel`). When the choice depends on what you hold, open it with
  `overHand`: the panel sits at the top over a fading backdrop, so your hand stays readable.

### 6. Close the loop

Update `docs/GAME-FLOW.md` (the turn walkthrough), the state diagram and protocol table in
`docs/ARCHITECTURE.md`, and the copy in the rules panel if players need to learn the change. Then run the
definition of done below.

## Table design system

The game is drawn as a physical card table seen from above, in a games room at night lit by neon. Keep
new UI inside that metaphor.

- **Palette** (`tailwind.config.js`): `room` #0a0c1a (the dark navy room, with a warm lamp glow in
  `index.css`), `felt-*` (navy panel darks), `walnut` (the lit rail), `baize` (violet felt), `brass`
  #ffc22e (neon gold: highlights, the current turn, primary buttons; the token keeps its old name),
  `chalk` #eef0ff (text), `oxblood` (card backs). Card colors are `card-red/yellow/green/blue`. Don't
  introduce new accent colors. Gold is the only highlight. The only other glows are each seat's ring
  in its avatar's disc color (`avatarGlow`) and the top discard in the color in play.
- **Chrome:** shared classes in `index.css`: `.btn-primary` (gold, with a lip), `.btn-danger` (Leave,
  Take), `.btn-tile` (top-bar icon over label), `.pill` (small facts on the felt and the status line),
  `.panel`. The sidebar (`SidePanel.tsx`) holds the game log and the player list as tabs; below `lg` it
  opens as a sheet from the Log tile.
- **Type:** _Lilita One_ (`font-display`) for card faces and big moments. _Bricolage Grotesque_
  (`font-sans`) for everything else. Use sentence case and no all-caps labels.
- **Layout:** the oval table fills the stage. Seats are placed on the rail by `seatAngle` and
  `seatPosition` in `lib/table-geometry.ts`, in turn order, clockwise, with you at the bottom. Your hand is
  a fan held over the near edge (`PlayerHand.tsx`): grouped by color with a gap between colors, spaced
  to fit the width so every corner index shows, and split into two tiers when one row would hide them.
  Under it, your seat shows your card count and, from 20 cards, how many are left before the
  25-card knockout. The card a player just played sits on their avatar, on the side away from the
  felt (`LastPlayedCard.tsx`, `useLastPlay`), until the player whose turn came next finishes their move.
  The last 10 plays stay visible on the felt (`DiscardHeap.tsx`), but only while they are really on the
  discard pile: a reshuffle drops the recycled plays from `playHistory` on the server, so the heap and
  the played-cards list restart from the top card, and an empty draw pile is an empty outlined spot. The color in play is a chip left
  of the draw pile (`ColorInPlay` in `GameTable.tsx`), and the direction shows only as the arrows on
  the felt. A pending penalty floats under the piles, so it never pushes them into the seats. Cards keep
  their scatter between renders because placement is seeded from history position (`scatter`).
- **Seat scale:** seats shrink for crowded tables (`lg` ≤ 6, `md` ≤ 10, `sm` above; rooms allow up to
  20). Below the `sm` breakpoint the card fans are hidden. Test new table UI at 390 × 844 with 8 players
  as well as on desktop.
- **Short screens:** laptops leave little height for the felt, so the `short` (≤ 860 px tall) and
  `shorter` (≤ 640 px) variants in `tailwind.config.js` shrink the table and hand cards, the heap's
  scatter (`--heap-px`) and the seat fans (`--fan-px`). Check 1280 × 575 (a 1080p laptop at 150%).
  `shortest` (≤ 500 px tall) is a phone held sideways: the cards and buttons shrink and the hand
  stays one tier. Seats stay on screen through `--seat-inset` and lift clear of the hand through
  `--seat-low-reach` (`seatPosition`). From `sm` up, nothing scrolls. Only a phone's hand may scroll
  sideways, and only when it is too big to fit. Check 390 × 844, 375 × 667 and 667 × 375.
- **Motion:** one meaningful movement per event. A card tossed from the thrower's seat, a draw sliding in,
  drawn cards flying face down from the draw pile to the drawer's seat, with a red `+N cards` tally
  popping over their avatar (`DrawFlight.tsx`, driven by `cardsDrawn` events; a Discard All raises the same tag in green (`ink-green`) as `−N cards` with the Discard All
  mark, counting the card itself), the new deck riffling once after a reshuffle (`anim-riffle`), hands sliding face down to their new owners on a 0 or 7 (`HandExchange.tsx`, driven by the
  `handsPassed.passes` pairs the server sends), the turn pulse, and your cards hopping in a ripple
  with the knock after 10 s idle on your move (`anim-nudge`, not `anim-shake`, which means "can't play
  that"). No decorative entrance animations.

## Copy and voice

Text in the game should help the player act. Use plain verbs and sentence case, and say exactly what
happens: "Draw", "Take +6", "Play it or keep drawing". When something is refused, say why and what to do
instead. Keep names consistent from button to log line: a "Draw" button produces "drew" in the log.

## Definition of done

- [ ] `docs/RULES.md` describes the behaviour, including edge cases.
- [ ] `npm test` passes, with new tests for the change.
- [ ] `npm run typecheck` and `npm run lint` are clean. `npm run format` has been run.
- [ ] No hidden card information reaches other players.
- [ ] The change is visible and understandable at phone width and on desktop.
- [ ] `docs/GAME-FLOW.md` and `docs/ARCHITECTURE.md` match the new behaviour.
