import { Check, Eye, X } from 'lucide-react';
import type { GameStateView } from '@nomercy/shared';
import type { NameLookup } from '../../lib/event-text';
import { respondToWatch } from '../../net/actions';

interface WatchRequestsProps {
  game: GameStateView;
  name: NameLookup;
}

/**
 * What a player still in the game sees about hand watching (docs/RULES.md §5.17): each knocked-out
 * player asking to see their cards, with whose hand that player already watches, and anyone who
 * currently has their hand open, with a way to close it. Floats over the table without blocking it.
 */
export function WatchRequests({ game, name }: WatchRequestsProps) {
  const { incoming, watchers } = game.watch;
  if (incoming.length === 0 && watchers.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Requests to watch your hand"
      className="pointer-events-none fixed inset-x-0 top-2 z-40 mx-auto flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {incoming.map((request) => (
        <div
          key={request.watcherId}
          role="alert"
          className="panel anim-toast pointer-events-auto flex flex-col gap-2 p-3 shadow-lifted ring-2 ring-brass/70"
        >
          <p className="flex items-start gap-2 text-sm">
            <Eye size={18} className="mt-0.5 shrink-0 text-brass" />
            <span>
              <strong>{name(request.watcherId)}</strong> is out and asks to watch your hand.
              {request.watchingId && (
                <span className="mt-0.5 block text-chalk/65">
                  Already watching {name(request.watchingId)}&apos;s hand.
                </span>
              )}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1 py-1.5"
              onClick={() => void respondToWatch(request.watcherId, true)}
            >
              <Check size={16} /> Accept
            </button>
            <button
              type="button"
              className="btn-secondary flex-1 py-1.5"
              onClick={() => void respondToWatch(request.watcherId, false)}
            >
              <X size={16} /> Decline
            </button>
          </div>
        </div>
      ))}
      {watchers.map((watcherId) => (
        <div
          key={watcherId}
          className="pill pointer-events-auto flex items-center gap-2 self-end py-1 pl-3 pr-1 text-sm"
        >
          <Eye size={14} className="text-brass" />
          {name(watcherId)} is watching your hand
          <button
            type="button"
            className="btn-ghost px-2 py-0.5 text-xs"
            onClick={() => void respondToWatch(watcherId, false)}
          >
            Stop
          </button>
        </div>
      ))}
    </div>
  );
}
