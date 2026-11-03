import { Eye, EyeOff } from 'lucide-react';
import type { HandShareView } from '@nomercy/shared';
import type { NameLookup } from '../../lib/event-text';
import { answerHandRequest, endHandShare } from '../../net/actions';

interface HandShareRequestsProps {
  watchers: HandShareView['watchers'];
  name: NameLookup;
}

/**
 * Knocked-out players asking to see your hand, and the ones you are already showing it to. It sits
 * on the table without stopping play: you can answer whenever you like (docs/RULES.md §5.17).
 */
export function HandShareRequests({ watchers, name }: HandShareRequestsProps) {
  if (watchers.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-2 px-4"
    >
      {watchers.map((w) =>
        w.status === 'pending' ? (
          <div
            key={w.viewerId}
            className="panel anim-toast pointer-events-auto flex max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-2 px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <Eye size={16} className="shrink-0 text-brass" aria-hidden />
              <span>
                <span className="font-semibold">{name(w.viewerId)}</span> is out and asks to see
                your hand
              </span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="btn-primary px-3 py-1 text-sm"
                onClick={() => void answerHandRequest(w.viewerId, true)}
              >
                Show
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1 text-sm"
                onClick={() => void answerHandRequest(w.viewerId, false)}
              >
                No
              </button>
            </span>
          </div>
        ) : (
          <div
            key={w.viewerId}
            className="pill pointer-events-auto flex items-center gap-2 text-xs"
          >
            <Eye size={13} className="text-brass" aria-hidden />
            <span>
              <span className="font-semibold">{name(w.viewerId)}</span> can see your hand
            </span>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full px-1.5 font-semibold text-rose-300 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
              onClick={() => void endHandShare(w.viewerId)}
              aria-label={`Stop showing your hand to ${name(w.viewerId)}`}
            >
              <EyeOff size={13} aria-hidden /> Stop
            </button>
          </div>
        ),
      )}
    </div>
  );
}
