# Rules — No Mercy LAN

This game implements the standard 168-card **UNO Show 'em No Mercy** base game (Mattel HWV18, not the
expansion pack). Source: the official instruction sheet
<https://service.mattel.com/instruction_sheets/HVW18-Eng.pdf> (read in full before implementing).
Where the sheet is silent, the chosen policy is listed in §6 and lives in one place in the code
(`apps/server/src/engine/rules-config.ts` or the module named next to it).

## 1. Objective

Be the first to get rid of every card in your hand, **or** be the last player remaining after everyone
else is knocked out by the Mercy Rule. 2–6 players.

## 2. Deck composition (168 cards)

The instruction sheet only says "168 Cards". The per-card breakdown below comes from a card-by-card deck
listing (Geeky Hobbies, "How to Play UNO Show 'em No Mercy"). It adds up exactly to 168 and agrees with
the sheet's card list and scoring table. `apps/server/test/engine.test.ts` checks every count.

| Card                     | Per color | Colors | Total   |
| ------------------------ | --------- | ------ | ------- |
| Number 0–9 (two of each) | 20        | 4      | 80      |
| Skip                     | 3         | 4      | 12      |
| Reverse                  | 3         | 4      | 12      |
| Draw Two (+2)            | 3         | 4      | 12      |
| Draw Four (+4, colored)  | 2         | 4      | 8       |
| Discard All              | 3         | 4      | 12      |
| Skip Everyone            | 2         | 4      | 8       |
| Wild Reverse Draw 4      | —         | wild   | 8       |
| Wild Draw 6              | —         | wild   | 4       |
| Wild Draw 10             | —         | wild   | 4       |
| Wild Color Roulette      | —         | wild   | 8       |
| **Total**                |           |        | **168** |

Each color has 36 cards (144 colored) and there are 24 wilds. The deck has no plain "Wild" card and no
classic "Wild Draw Four". Every physical card gets a unique random id per game, so an id never reveals
its face or deck position.

## 3. Setup

1. Shuffle all 168 cards (unbiased Fisher–Yates, `crypto.randomInt`).
2. Deal 7 cards to each player, one at a time, starting left of the dealer.
3. The remaining cards form the face-down draw pile.
4. Flip the top card to start the discard pile. **If it is an action card (any non-number card, wilds
   included), ignore it and flip the next one** (official). Ignored cards stay in the discard pile under the
   starting card and are recycled at the next reshuffle. A starting 7 or 0 has no effect, because number
   effects only happen when a card is played.
5. The player to the left of the dealer goes first. Play goes clockwise. The dealer is random for the first
   round and moves one seat each round after that.

## 4. A turn

- **Matching:** play one card that matches the top card's **color** (the chosen color after a wild),
  **number**, or **symbol** (the same action type). Wild cards can be played on anything.
- **Manual drawing:** when no penalty is pending, you draw **one card per Draw action**. Once you start
  drawing, the only card you may play is **the card you drew last**, and only if it is playable. You may
  always draw again instead, even after drawing a playable card. Drawing again locks the previous card: no
  other card in your hand may be played for the rest of the turn, including earlier draws. Penalty draws
  (§5.10) and Color Roulette reveals (§5.8) follow their own rules.
- **Voluntary drawing:** you may draw even while holding a playable card (see §6).
- **Mercy while drawing:** the draw that brings you to 25 cards knocks you out (§5.13), whether you drew
  because you had to or because you chose to.
- **Reshuffle:** when the draw pile is empty, every discard except the top card, plus any set-aside hands
  of knocked-out players, is shuffled into a new draw pile.

## 5. Card effects and special rules

### 5.1 Skip

The next active player loses their turn. With two players, you go again.

### 5.2 Reverse

Reverses the direction. With **two active players** it acts as a Skip, so you go again (official).

### 5.3 Draw Two / Draw Four (colored)

The next active player must draw 2 (or 4) and lose their turn, unless they stack (§5.10).

### 5.4 Discard All

After you play it, you may discard any or all of the other cards of the Discard All's color in your hand
(house rule: you choose which to keep; by default all are selected). Those cards go
**underneath** the Discard All, which stays on top. Cards of other colors are not touched. If this empties
your hand, you win. Then play passes to the next player.

### 5.5 Skip Everyone

Every other player is skipped. You take another turn right away.

### 5.6 Wild Reverse Draw 4

You choose a color, the direction reverses, and the next player **in the new direction** gets a +4 penalty
(stackable) and loses their turn. Played on top of a stack, this sends the stack back the way it came.
**Two players:** the other player is skipped and **you** draw 4, unless you stack it back with a Draw card
of +4 or more (official: "makes YOU draw 4 cards! You may use the stacking rule to send the penalty back").
The engine applies this even when the card is itself a stack response; see §6.

### 5.7 Wild Draw 6 / Wild Draw 10

You choose a color. The next player must draw 6 (or 10) and lose their turn, unless they stack.

### 5.8 Wild Color Roulette

The player who plays it does **not** choose a color. The **next** player names a color, which becomes the
active color. Then they press Draw to reveal cards from the draw pile one at a time, face up for everyone
to see, until a card **of that color** appears. Wild cards never count as a match. They keep every revealed card and lose their turn. Play then
continues with the player after them.

- Roulette is not a Draw card, so it cannot be stacked and cannot answer a stack.
- Running out: the draw pile reshuffles as usual. If no cards are left anywhere, the reveal stops and the
  victim keeps what they revealed. The loop always ends because every reveal uses up a card from a finite
  pool.
- The Mercy Rule is checked during the reveal, and the reveal stops as soon as the victim reaches 25 cards.

### 5.9 Calling UNO

When your hand drops to exactly one card, you must call UNO. If another player catches you before you call,
and **before the next player begins their turn**, you draw 2 (official).

- **Ways to declare:** press UNO while you hold one card, or arm UNO before playing your second-to-last card
  (it is sent together with the play).
- **Catch window (server-enforced):** a player who reaches one card without declaring is _vulnerable_. The
  window closes as soon as **any other player performs a turn action** (play, draw, take a penalty, or name a
  roulette color). That is how "the next player begins their turn" is measured. After that the player is
  _safe_ until their hand size changes. The window itself has no timer, but no one can act on it during
  the UNO breather below.
- **One card through swaps, passes and other effects:** the same rule applies. Anyone whose hand becomes
  exactly one card for any reason (a 7 swap, a 0 pass, and so on) becomes vulnerable and must call UNO.
- Only active players can catch, and you cannot catch yourself.
- **UNO breather (server-enforced):** after every card play, and whenever the turn passes to another
  player, the table pauses for **2 seconds** (`TURN_HOLD_MS`). During the pause only **calling UNO** (and
  leaving) is open: nobody may play, draw, take a penalty, name a roulette color or catch. So a player who
  just reached one card always has 2 seconds to press UNO before anyone can catch them, and the next
  player cannot close the window early either. Drawing again within your own turn does not start a pause,
  and neither does a play that hands the turn straight back to you (Skip Everyone, or a Skip or Reverse
  with two players): you play on at once, unless that play left someone open to a catch (usually you, on
  one card), in which case the 2 seconds still apply so they can call UNO.
  The pause always ends on its own (the server re-sends the table when it does), so it cannot stall a
  game.

### 5.10 Stacking

Draw cards are +2, +4 (colored), Wild Reverse Draw 4 (+4), +6 and +10. When a penalty is pending against
you, you may answer with a Draw card **whose value is equal to or higher than the last Draw card played**
(official). The color does not matter. Its value is added to the total and the penalty moves on: to the next
player, or for Wild Reverse Draw 4, to the next player in the reversed direction.

- Examples: +2 then +4 makes 6 for the next player. +4 then +6 makes 10. +6 cannot be answered with +2 or
  +4. +10 can only be answered with +10.
- The engine stores `total` and `lastValue` separately.
- While a stack is pending, the target may **only** stack or take the whole penalty. Drawing normally and
  playing other cards are both rejected.
- Taking the penalty: draw the full total, lose your turn, and play passes to the next active player after
  you. The stack is cleared only at that point.

### 5.11 7's Swap

After you play any colored 7 you **must** swap your entire hand with another active player of your choice.
You cannot decline (the server rejects a 7 played without a valid target). The exchange happens in one step,
and play then continues in the current direction. If the 7 was your **last card, you win** and no swap
happens.

### 5.12 0's Pass

After you play any colored 0, **every active player passes their whole hand** to the next active player in
the current direction. All hands move at the same moment, from a snapshot, so no hand can overwrite another.
Knocked-out players are skipped. With two players the hands are exchanged. If the 0 was your last card,
you win and nothing is passed.

### 5.13 Mercy Rule

A player who holds **25 or more cards is knocked out immediately** (official). This is checked after every
single card enters a hand: penalties, mandatory draws, roulette reveals and UNO penalties.

- The knocked-out player's cards are **set aside**, outside the draw pile and hands, and go back into play at
  the next reshuffle (official: "Set aside their hand of cards until the deck runs out and needs to be
  reshuffled").
- They are removed from turn order, swap targets, 0 passes and catching.
- **Knocked out while taking a stack:** drawing stops at the 25th card. The rest of the penalty is void, the
  stack is cleared, and play passes to the next active player after them. It is not passed on to anyone
  else.
- **Reaching 25 by drawing manually (house rule, last chance):** when a draw you chose to make brings you
  to 25 cards, look at the card you drew. If it can't be played, you are knocked out and play passes on.
  If it can, you are spared for one move: you must play that card, which brings you back to 24. Drawing
  again is not allowed, so the turn always ends with that play. This applies only to draws you choose
  to make. Penalty draws, UNO penalties and Color Roulette reveals still knock you out at 25.
  Switch: `RULES_CONFIG.lastChanceDraw` (§6, A13).

### 5.14 Winning

1. **Empty hand:** the moment you play your final card you win. This is checked **before** the card's
   effect, so a final +4 gives no penalty, and a final 7 or 0 swaps or passes nothing.
2. **Last standing:** when only one active player remains, they win.
3. **Tables with computers (house rule):** once every person at the table is knocked out, the round
   ends at once with **no winner** and no points, so nobody watches the computers play on. If a single
   computer is left, it still wins as last standing. Tables with only people are unaffected.

### 5.15 Optional scoring (official)

When enabled in the lobby, the winner scores the cards left in the active opponents' hands: number cards are
worth their face value, colored action cards 20 points, and wild action cards 50 points. The winner also gets
**250 points per player knocked out** during the hand (the knocked-out players' cards are ignored). Totals
carry over from round to round, and the first to **1,000** wins the match. This lives in
`apps/server/src/rooms/match-scoring.ts`, separate from the engine.

### 5.16 Dropping out and rejoining (house rule)

A person who loses their connection mid-game keeps their seat and hand for the reconnect window
(`RECONNECT_GRACE_SECONDS`, 120 s by default). A refresh in the same tab gets the seat straight back.

1. **Who decides:** the next connected person after them in the current direction of play (computers
   are skipped). They are asked, on the table, whether to wait. Everyone else sees who is deciding.
2. **Wait:** the seat is held for up to `WAIT_FOR_REJOIN_MS` (5 minutes) from the moment they agree.
   While it is held, the dropped player may **rejoin from any device**: open the game, enter the room
   code and the **same name**, and they get their seat and hand back. If it is their turn, play waits.
3. **Don't wait, or Stop waiting:** the dropped player forfeits at once (§6, A11) and play moves on. The
   decider can stop waiting at any time while the seat is held.
4. **No answer:** the normal reconnect window applies; when it runs out, the player forfeits.
5. **Refused rejoins:** joining a running game by code works only for a seat the table agreed to hold. A
   name matching a seat nobody agreed to hold is refused with who has to agree. Any other name is
   refused as before: the game has started.
6. **Edge cases:** if the decider drops out too, the question passes to the next connected person. A
   player already knocked out is not asked about. Rejoining replaces the lost session's token, so the old
   tab can no longer reclaim the seat. The wait always ends: on rejoin, on a refusal, or when the hold
   runs out.

## 6. Ambiguities and chosen policies

| #   | Situation                                                                                | Chosen behavior                                                                                                                                                                                    | Where                                                   |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A1  | Drawing while holding a playable card                                                    | Allowed: you may choose to draw instead of playing. After that, only the card drawn last may be played (if playable), and you may keep drawing as long as you like                                 | `RULES_CONFIG.allowVoluntaryDraw`, `handleDraw`         |
| A2  | Does a stack response need to match color?                                               | No, only value ≥ last value                                                                                                                                                                        | `RULES_CONFIG.stackingIgnoresColor`, `stacking.ts`      |
| A3  | Two-player Wild Reverse Draw 4 played _as a stack response_                              | The same two-player rule applies: the player who played it becomes the target with the accumulated stack and may stack again or take it                                                            | `RULES_CONFIG.twoPlayerWildReverseDraw4HitsPlayer`      |
| A4  | Recipient knocked out by a stack                                                         | Drawing stops at 25, the rest is void, the stack is cleared, the turn goes to the next active player                                                                                               | `stacking.ts`                                           |
| A5  | Draw pile **and** discards empty (every card is in hands or set aside after a reshuffle) | A manual draw with nothing to draw passes the turn (refused if you still hold a playable card). Penalty and roulette draws give what is available and the rest is void. Nothing is ever duplicated | `pile.ts`, `game.reducer.ts`                            |
| A6  | Who sets the active color after Roulette?                                                | The victim's named color                                                                                                                                                                           | `card-effects.ts`                                       |
| A7  | UNO catch window length                                                                  | Until another player's next turn action, which can't come sooner than the 2-second UNO breather after each play or turn change (§5.9); catches wait for the breather too                           | `uno-manager.ts`, `RoomManager` (`TURN_HOLD_MS`)        |
| A8  | One card left after a swap or pass                                                       | Must call UNO, same catch window                                                                                                                                                                   | `uno-manager.ts`                                        |
| A9  | Last card is a 7, 0, Draw or Discard All                                                 | The win is checked first, so no effect resolves                                                                                                                                                    | `game.reducer.ts`                                       |
| A10 | Ignored opening action cards                                                             | Stay in the discard pile underneath the starting card                                                                                                                                              | `game.factory.ts`                                       |
| A11 | Player leaves, the table won't wait for them, or their reconnect window expires mid-game | Forfeit: eliminated with reason `forfeit` and cards set aside. If it was their turn, any pending penalty against them is void and play moves on. Forfeits do not earn the 250 knockout bonus       | `handleForfeit`, `RULES_CONFIG.forfeitCountsAsKnockout` |
| A12 | Knocked-out players catching UNO                                                         | Not allowed                                                                                                                                                                                        | `uno-manager.ts`                                        |
| A13 | A draw you chose to make brings you to 25 cards (house rule)                             | If the drawn card is playable you must play it, back to 24, and stay in; drawing again is refused. If it isn't playable you are knocked out. Forced draws still knock out at 25                    | `handleDraw`, `RULES_CONFIG.lastChanceDraw`             |
