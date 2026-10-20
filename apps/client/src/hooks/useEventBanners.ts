import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@nomercy/shared';
import { bannerFor, type BannerSpec, type NameLookup } from '../lib/event-text';

export interface ActiveBanner extends BannerSpec {
  key: number;
}

/**
 * Turns new log entries into a queue of short-lived banners. Purely presentational: the
 * authoritative state is already applied when the banner shows.
 */
export function useEventBanners(log: GameLogEntry[], name: NameLookup): ActiveBanner | null {
  const lastSeq = useRef<number | null>(null);
  const [queue, setQueue] = useState<ActiveBanner[]>([]);

  useEffect(() => {
    const newest = log[log.length - 1]?.seq ?? 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    const since = lastSeq.current;
    const fresh = log.filter((e) => e.seq > since);
    lastSeq.current = Math.max(since, newest);
    const banners = fresh
      .map((e) => {
        const spec = bannerFor(e.event, name);
        return spec ? { ...spec, key: e.seq } : null;
      })
      .filter((b): b is ActiveBanner => b !== null);
    if (banners.length > 0) setQueue((q) => [...q, ...banners].slice(-4));
  }, [log, name]);

  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => q.slice(1)), 1700);
    return () => window.clearTimeout(timer);
  }, [current]);

  return current;
}
