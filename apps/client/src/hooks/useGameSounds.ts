import { useEffect, useRef, useState } from 'react';
import type { PublicGameView } from '@nomercy/shared';
import { playSound, type SoundKind } from '../lib/sound';
import { getState } from '../state/store';

const REMINDER_MS = 10_000;

function isOn(kind: SoundKind): boolean {
  const prefs = getState().sound;
  return !prefs.muted && prefs[kind];
}

function playIfOn(kind: SoundKind, delay = 0): void {
  if (isOn(kind)) playSound(kind, delay);
}

/**
 * The idle turn reminder's nudge for the hand. `count` only grows, one per reminder, so each one can
 * replay the hop; `active` stays true until anything happens at the table.
 */
export interface IdleNudge {
  count: number;
  active: boolean;
}

/**
 * Plays the card play, your turn, turn reminder, hand exchange, penalty, knockout and win sounds the player has
 * switched on, and returns the idle nudge so the hand can shake with the reminder. Purely
 * presentational: every trigger is state the server already sent.
 */
export function useGameSounds(
  view: PublicGameView,
  meId: string,
  mustAct: boolean,
  version: number,
): IdleNudge {
  const [tick, setTick] = useState({ count: 0, version: -1 });
  // `version` changes on every move, so anything happening at the table restarts the countdown.
  useEffect(() => {
    if (!mustAct) return;
    const timer = window.setInterval(() => {
      playIfOn('turnReminder');
      // The shake is a visual nudge, so it happens even when the knock is off.
      setTick((t) => ({ count: t.count + 1, version }));
    }, REMINDER_MS);
    return () => window.clearInterval(timer);
  }, [mustAct, version]);

  const lastSeq = useRef<number | null>(null);
  // Starts as the current state, so loading or reconnecting into your own turn stays quiet.
  const actingBefore = useRef(mustAct);
  useEffect(() => {
    const newest = view.log[view.log.length - 1]?.seq ?? 0;
    // A new round restarts the log while this page stays mounted, so a lower seq means "from the top".
    const since =
      lastSeq.current === null ? newest : newest < lastSeq.current ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const fresh = view.log.filter((e) => e.seq > since);
    // Every card played gets its own slap, a beat apart when several arrive in one update.
    const plays = fresh.filter((e) => e.event.type === 'cardPlayed').length;
    for (let i = 0; i < Math.min(plays, 3); i++) playIfOn('cardPlay', i * 0.12);
    const played = plays > 0;
    // A 0 or 7 is played and passed in one update: let the card land before the hands move.
    const exchanged = fresh.some(
      (e) => e.event.type === 'handsSwapped' || e.event.type === 'handsPassed',
    );
    if (exchanged) playIfOn('handExchange', played ? 0.25 : 0);
    // Everyone hears it when someone takes a stacked penalty or is caught without calling UNO.
    const penalized = fresh.some(
      (e) =>
        e.event.type === 'cardsDrawn' &&
        (e.event.reason === 'penalty' || e.event.reason === 'unoPenalty'),
    );
    // Reaching 25 cards knocks a player out (docs/RULES.md, Mercy Rule). That alarm replaces the
    // trombone, since the knockout usually arrives with the penalty that caused it.
    const knockedOut = fresh.some(
      (e) => e.event.type === 'playerEliminated' && e.event.reason === 'mercy',
    );
    if (knockedOut && isOn('knockout')) playIfOn('knockout', played ? 0.3 : 0);
    else if (penalized) playIfOn('penalty', played ? 0.3 : 0);

    // Your turn: when the move comes round to you, or straight back (a Skip with two players).
    const othersPlayed = fresh.some(
      (e) => e.event.type === 'cardPlayed' && e.event.playerId !== meId,
    );
    if (mustAct && (!actingBefore.current || othersPlayed)) {
      // Chime once the card has landed and any hands have finished passing.
      playIfOn('yourTurn', exchanged ? 0.8 : played ? 0.3 : 0);
    }
    actingBefore.current = mustAct;
  }, [view.log, mustAct, meId]);

  // Only the moment of winning cheers, after the final card lands; reloading into a finished game
  // stays quiet.
  const iWon = view.phase.type === 'finished' && view.phase.winnerId === meId;
  const wonBefore = useRef(iWon);
  useEffect(() => {
    if (iWon && !wonBefore.current) playIfOn('win', 0.3);
    wonBefore.current = iWon;
  }, [iWon]);

  // Worked out here rather than reset in an effect: a move only drops the class, so nothing remounts
  // and a card drawn right after a nudge still slides in.
  return { count: tick.count, active: tick.count > 0 && tick.version === version };
}
