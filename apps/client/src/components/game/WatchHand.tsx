import { Eye, EyeOff, Hourglass, X } from 'lucide-react';
import type { GameStateView } from '@nomercy/shared';
import { sortHand } from '../../lib/cards';
import type { NameLookup } from '../../lib/event-text';
import { requestWatch, stopWatching } from '../../net/actions';
import { PlayingCard } from '../card/PlayingCard';

interface WatchHandProps {
  game: GameStateView;
  meId: string;
  name: NameLookup;
}

/**
 * Where a knocked-out player sits in for the empty hand (docs/RULES.md §5.17): ask someone still in
 * play to show their cards, wait for the answer, and watch the hand once it is granted. Every
 * decision is the server's; this only lists who can be asked and shows what the server sent.
 */
export function WatchHand({ game, meId, name }: WatchHandProps) {
  const { outgoing, watching } = game.watch;
  const askable = game.public.players.filter(
    (p) => p.id !== meId && p.status === 'active' && !p.isComputer,
  );
  const hand = watching ? sortHand(watching.hand) : [];

  return (
    <div className="mx-auto mt-24 w-full max-w-2xl px-3 sm:mt-28 short:mt-16 shortest:mt-12">
      <div className="panel flex flex-col gap-2 p-3 short:p-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
            {watching ? (
              <Eye size={16} className="text-brass" />
            ) : outgoing ? (
              <Hourglass size={16} className="text-chalk/70" />
            ) : (
              <EyeOff size={16} className="text-chalk/60" />
            )}
            {watching ? (
              <span>
                Watching <strong>{name(watching.targetId)}</strong>&apos;s hand
                <span className="text-chalk/60">
                  {' '}
                  · {hand.length} {hand.length === 1 ? 'card' : 'cards'}
                </span>
              </span>
            ) : outgoing ? (
              <span>
                Waiting for <strong>{name(outgoing.targetId)}</strong> to answer
              </span>
            ) : (
              <span>You are out. Ask a player to show you their hand.</span>
            )}
          </p>
          {(watching || outgoing) && (
            <button
              type="button"
              className="btn-ghost ml-auto px-3 py-1 text-sm"
              onClick={() => void stopWatching()}
            >
              <X size={14} /> {outgoing ? 'Cancel request' : 'Stop watching'}
            </button>
          )}
        </div>

        {watching && (
          <ul
            aria-label={`${name(watching.targetId)}'s cards`}
            className="scroll-thin flex gap-1.5 overflow-x-auto pb-1 pt-1"
          >
            {hand.map((card) => (
              <li key={card.id} className="shrink-0">
                <PlayingCard card={card} size="sm" />
              </li>
            ))}
          </ul>
        )}

        {!outgoing && askable.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-chalk/60">
              {watching ? 'Watch someone else:' : 'Ask:'}
            </span>
            {askable
              .filter((p) => p.id !== watching?.targetId)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn-secondary px-3 py-1 text-sm"
                  onClick={() => void requestWatch(p.id)}
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}
        {!outgoing && !watching && askable.length === 0 && (
          <p className="text-xs text-chalk/60">No one left to ask.</p>
        )}
      </div>
    </div>
  );
}
