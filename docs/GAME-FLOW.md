# Game flow

## Room lifecycle

```
Home ──create──► Lobby (host) ◄──join (code)── Home (others)
                   │  guests toggle Ready; host may enable scoring
                   │  host: Start (all others ready & connected; open seats? fill with computers)
                   ▼
                 inGame ──(win)──► roundOver
                   ▲                 │ host: Next round ──► inGame (scores kept; reset after a match win)
                   │                 │ host: Back to lobby ──► Lobby (scores and ready flags reset)
                   └─────────────────┘
```

- **Play with computer** skips the lobby: the player picks 1–9 computer opponents, the server seats
  them under generated names and deals the first round at once. Computers move by themselves after a
  short pause; the player is the host for Next round and Back to lobby. The room closes when they leave.
- **Filling empty seats:** when the host presses Start with seats still open, a prompt shows the table
  with computers in the open seats. "Add N computers and start" fills them (up to 9); "Start with N
  players" starts as is (only with 2 or more people). A host on their own can start this way.
- With computers at the table, the round ends with no winner once every person is knocked out.
  Computers leave on Back to lobby, freeing their seats for people.
- Joining is only possible in the lobby. During a game, only reconnecting with a valid token is accepted.
- Players who leave or time out during a game are marked _departed_ and removed when the next round starts
  or the room returns to the lobby.

## Turn walkthrough

1. The server sends each player `game:state`. Their `validActions` list the playable card ids and say
   whether they may draw, take a penalty, name a roulette color, call UNO or catch someone.
2. The player clicks a highlighted card.
   - Wild (except Roulette): the client asks for a color first.
   - Colored 7 with more cards left: the client asks for a swap target first.
   - The client then sends one `game:play-card` with everything included.
3. The server validates and applies the command, increments the version, and broadcasts new projections.
   Clients animate the change; animations never hold up or alter the state. A 7 or a 0 shows each hand
   sliding face down from its old owner's seat to its new one, with a caption naming who swapped.
4. The player may press **Draw** (or the draw pile) at any time on their turn, one card per press. From then
   on only the card drawn last is playable, if it matches. The player can play it or keep drawing; each new
   draw locks the previous one.
5. With a penalty pending, only Draw cards of at least the last value are highlighted. **Take +N** accepts
   the stack.
6. Roulette: the victim gets a color dialog that cannot be dismissed, then presses **Draw** once per card.
   Every revealed card is shown face up to the whole table. When the named color appears, the revealed
   cards join the victim's hand, the reveal clears, and play continues with the player after the victim.

## Event ordering inside one command

For `playCard`:

1. Validate (turn, phase, card in hand, matching/stack rule, wild color, 7 target).
2. Close the UNO catch windows of other players (a new turn began).
3. Remove the card. For Discard All, also remove the other cards of its color and put them underneath.
4. Set the active color, then record the `cardPlayed` event (and the `unoCalled` event if UNO was declared
   with the play).
5. **Empty hand → win** (stop here).
6. Apply the effect: skip, reverse, swap, pass, add to the stack, start roulette, or advance the turn.
7. Finalize: UNO sync, last-standing check, version++, log.

For draw, penalty and roulette commands, the Mercy Rule is checked after **every** card enters a hand.

## Validation scenarios covered

Automated (`npm test`):

- Deck has 168 unique cards with the exact composition. Setup deals 7 each and ignores opening action cards.
- Matching by color, number and symbol. Wilds play on anything. After a wild only its chosen color matches.
- Draw until playable, then must play that card. Drawing is refused when a playable card is held.
- Reshuffle keeps the top card. The fallback when nothing is left to draw.
- Skip and Reverse with three and with two players. Skip Everyone. Discard All placement.
- +2, then +4, then accept, with the turn going to the right player. +10 only answered by +10. Unrelated
  cards and drawing are blocked while a stack is pending.
- Wild Reverse Draw 4 with three players, as a stack response, and the two-player self-penalty plus stacking
  back.
- Roulette: wilds don't count, the right player is next, and it ends when the deck runs out.
- 7 swap (target required, not yourself, a last card wins), 0 pass clockwise and counterclockwise, and
  skipping knocked-out players.
- Mercy at 25 in the middle of a penalty (the rest is void), the last player standing wins, set-aside cards
  return when reshuffled.
- UNO catching, the window closing after the next player acts, declaring with the play or afterwards.
- Out-of-turn plays, cards not in hand, a winning Draw card applies no penalty, forfeits, and rejected
  commands that leave the state untouched.
- 120 random complete games (2–6 players) that check all 168 cards are still there after every move and that
  nobody active ever holds 25 or more cards.
- Socket.IO integration: create, join, ready, start. Each player sees only their own cards and token. Late
  joins are rejected. `NOT_YOUR_TURN` and `STALE_STATE` work. A repeated command id runs once. Reconnecting
  restores the seat without duplicating the player, and a bad token is rejected.

Manual (browser, production build over the LAN address): created a room on `localhost`, joined from a second
tab through the machine's LAN IP, readied up and started. Played a Wild +6 with the color dialog. The target
saw the +6 banner, the right cards were disabled, and Take +6 resolved correctly. A refresh restored the same
seat.
