import { useEffect, useRef, useState } from 'react';
import type { Card, CardColor, GameLogEntry, PublicGameView } from '@nomercy/shared';

/** The latest card played, pinned to the seat of the player who played it. */
export interface LastPlay {
  seq: number;
  playerId: string;
  card: Card;
  chosenColor: CardColor | null;
  /** Whose turn followed the play. The card stays up until the turn moves on from them. */
  holderId: string | null;
}

function latestPlay(log: readonly GameLogEntry[], since: number): GameLogEntry | null {
  for (let i = log.length - 1; i >= 0 && log[i]!.seq > since; i--) {
    if (log[i]!.event.type === 'cardPlayed') return log[i]!;
  }
  return null;
}

/**
 * On loading into a game, the last play still stands unless a move that ends a turn without a card
 * (taking a penalty, finishing a Color Roulette) came after it.
 */
function standingPlay(view: PublicGameView): LastPlay | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const { seq, event } = view.log[i]!;
    if (event.type === 'cardPlayed') {
      return { seq, ...event, holderId: view.currentPlayerId };
    }
    if (event.type === 'penaltyAccepted' || event.type === 'rouletteResolved') return null;
  }
  return null;
}

/**
 * The last card played and who played it, kept until the player whose turn came next finishes
 * their move. Purely presentational: it only reads the log and whose turn it is.
 */
export function useLastPlay(view: PublicGameView): LastPlay | null {
  const [last, setLast] = useState<LastPlay | null>(() => standingPlay(view));
  const lastSeq = useRef(view.log[view.log.length - 1]?.seq ?? 0);

  useEffect(() => {
    const newest = view.log[view.log.length - 1]?.seq ?? 0;
    // A new round restarts the log while this page stays mounted, so a lower seq means "from the top".
    const restarted = newest < lastSeq.current;
    const since = restarted ? 0 : lastSeq.current;
    lastSeq.current = newest;
    const play = latestPlay(view.log, since);
    const { currentPlayerId } = view;
    setLast((prev) => {
      if (play && play.event.type === 'cardPlayed') {
        return { seq: play.seq, ...play.event, holderId: currentPlayerId };
      }
      if (restarted || (prev && prev.holderId !== currentPlayerId)) return null;
      return prev;
    });
  }, [view]);

  return last;
}
