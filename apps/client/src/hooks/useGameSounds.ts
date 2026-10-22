import { useEffect, useRef, useState } from 'react';
import type { PublicGameView } from '@nomercy/shared';
import { playSound, type SoundKind } from '../lib/sound';
import { getState } from '../state/store';

const REMINDER_MS = 10_000;

function playIfOn(kind: SoundKind, delay = 0): void {
  const prefs = getState().sound;
  if (!prefs.muted && prefs[kind]) playSound(kind, delay);
}

/**
 * Plays the card play, turn reminder, hand exchange and win sounds the player has switched on. Returns
 * how many times the 10 s reminder has fired, so the hand can shake with it; it is 0 again as soon as
 * anything happens at the table. Purely presentational: every trigger is state the server already sent.
 */
export function useGameSounds(
  view: PublicGameView,
  meId: string,
  mustAct: boolean,
  version: number,
): number {
  const [nudge, setNudge] = useState(0);
  // `version` changes on every move, so anything happening at the table restarts the countdown.
  useEffect(() => {
    setNudge(0);
    if (!mustAct) return;
    const timer = window.setInterval(() => {
      playIfOn('turnReminder');
      // The shake is a visual nudge, so it happens even when the knock is off.
      setNudge((n) => n + 1);
    }, REMINDER_MS);
    return () => window.clearInterval(timer);
  }, [mustAct, version]);

  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const newest = view.log[view.log.length - 1]?.seq ?? 0;
    // A new round restarts the log while this page stays mounted, so a lower seq means "from the top".
    const since =
      lastSeq.current === null ? newest : newest < lastSeq.current ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const fresh = view.log.filter((e) => e.seq > since);
    const played = fresh.some((e) => e.event.type === 'cardPlayed');
    if (played) playIfOn('cardPlay');
    // A 0 or 7 is played and passed in one update: let the card land before the hands move.
    if (fresh.some((e) => e.event.type === 'handsSwapped' || e.event.type === 'handsPassed')) {
      playIfOn('handExchange', played ? 0.25 : 0);
    }
  }, [view.log]);

  // Only the moment of winning cheers, after the final card lands; reloading into a finished game
  // stays quiet.
  const iWon = view.phase.type === 'finished' && view.phase.winnerId === meId;
  const wonBefore = useRef(iWon);
  useEffect(() => {
    if (iWon && !wonBefore.current) playIfOn('win', 0.3);
    wonBefore.current = iWon;
  }, [iWon]);

  return nudge;
}
