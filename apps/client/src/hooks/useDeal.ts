import { useEffect, useState } from 'react';
import {
  cardsDealtTo,
  dealTiming,
  STARTING_HAND_SIZE,
  type DealTiming,
  type GameStateView,
} from '@nomercy/shared';

/** The opening deal as this page sees it (docs/RULES.md §5.18). */
export interface Deal {
  /** `performance.now()` when the first card left the deck. */
  startedAt: number;
  timing: DealTiming;
  /** Player ids in the order they get their cards, starting left of the dealer. */
  order: string[];
  /** How many cards `playerId` holds so far. */
  dealtTo: (playerId: string) => number;
  /** Cards still on the deck waiting to be dealt. */
  undealt: number;
}

/**
 * Follows the opening deal while it runs, ticking once per card, and returns null when no deal is
 * on. It is timed by the server's `dealMs`, so a page that arrives or reloads mid-deal picks it up
 * where the table is, and one that arrives after it sees the hands as they are.
 */
export function useDeal(game: GameStateView): Deal | null {
  const players = game.public.players;
  const timing = dealTiming(players.length);
  const [anchor, setAnchor] = useState<{ game: GameStateView; startedAt: number | null }>({
    game,
    startedAt: game.dealMs > 0 ? performance.now() - (timing.totalMs - game.dealMs) : null,
  });
  const [now, setNow] = useState(() => performance.now());

  // Each state that arrives may be a new round's deal. Worked out during render, so the first frame
  // of a deal already shows empty hands rather than flashing the full ones.
  let startedAt = anchor.startedAt;
  if (anchor.game !== game) {
    const t = performance.now();
    const endsAt = t + game.dealMs;
    const current = startedAt === null ? null : startedAt + timing.totalMs;
    // A later state of the same deal says much the same thing; only a new deal moves the start.
    if (game.dealMs > 0 && (current === null || endsAt > current + 1000)) {
      startedAt = endsAt - timing.totalMs;
    }
    setAnchor({ game, startedAt });
  }
  const endsAt = startedAt === null ? 0 : startedAt + timing.totalMs;
  const active = startedAt !== null && now < endsAt;

  useEffect(() => {
    if (startedAt === null) return;
    setNow(performance.now());
    const tick = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= endsAt) window.clearInterval(tick);
    }, timing.gapMs);
    return () => window.clearInterval(tick);
  }, [startedAt, endsAt, timing.gapMs]);

  if (!active || startedAt === null) return null;
  const ids = players.map((p) => p.id);
  const started = game.public.log.find((e) => e.event.type === 'gameStarted')?.event;
  const dealer = started?.type === 'gameStarted' ? ids.indexOf(started.dealerId) : -1;
  const first = Math.max(dealer, 0) + 1;
  const order = ids.map((_, k) => ids[(first + k) % ids.length] as string);
  const elapsed = now - startedAt;
  const dealtTo = (playerId: string) => {
    const offset = order.indexOf(playerId);
    return offset < 0 ? STARTING_HAND_SIZE : cardsDealtTo(offset, ids.length, elapsed);
  };
  const dealt = order.reduce((sum, id) => sum + dealtTo(id), 0);
  return { startedAt, timing, order, dealtTo, undealt: timing.cards - dealt };
}
