import { useEffect, useRef } from 'react';
import type { PublicGameView } from '@nomercy/shared';
import { playSound, type SoundKind } from '../lib/sound';
import { getState } from '../state/store';

const REMINDER_MS = 10_000;

function playIfOn(kind: SoundKind): void {
  if (getState().sound[kind]) playSound(kind);
}

/**
 * Plays the turn reminder, hand exchange and win sounds the player has switched on. Purely
 * presentational: every trigger is state the server already sent.
 */
export function useGameSounds(
  view: PublicGameView,
  meId: string,
  mustAct: boolean,
  version: number,
): void {
  // `version` changes on every move, so anything happening at the table restarts the countdown.
  useEffect(() => {
    if (!mustAct) return;
    const timer = window.setInterval(() => playIfOn('turnReminder'), REMINDER_MS);
    return () => window.clearInterval(timer);
  }, [mustAct, version]);

  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const newest = view.log[view.log.length - 1]?.seq ?? 0;
    // A new round restarts the log while this page stays mounted, so a lower seq means "from the top".
    const since =
      lastSeq.current === null ? newest : newest < lastSeq.current ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const exchanged = view.log.some(
      (e) => e.seq > since && (e.event.type === 'handsSwapped' || e.event.type === 'handsPassed'),
    );
    if (exchanged) playIfOn('handExchange');
  }, [view.log]);

  // Only the moment of winning cheers; reloading into a finished game stays quiet.
  const iWon = view.phase.type === 'finished' && view.phase.winnerId === meId;
  const wonBefore = useRef(iWon);
  useEffect(() => {
    if (iWon && !wonBefore.current) playIfOn('win');
    wonBefore.current = iWon;
  }, [iWon]);
}
