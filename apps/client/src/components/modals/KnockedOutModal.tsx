import { Eye, Hourglass, Skull } from 'lucide-react';
import type { HandShareView, PublicPlayerView } from '@nomercy/shared';
import type { TableAvatars } from '../../lib/avatar';
import { endHandShare, requestHand } from '../../net/actions';
import { PlayerAvatar } from '../PlayerAvatar';
import { Modal } from '../ui/Modal';

interface KnockedOutModalProps {
  me: PublicPlayerView;
  players: PublicPlayerView[];
  handShare: HandShareView;
  avatarOf: TableAvatars;
  onClose: () => void;
}

/**
 * Shown to a player the moment they are knocked out: what happened, and a way to ask a player
 * still in the round to show them their hand (docs/RULES.md §5.17).
 */
export function KnockedOutModal({
  me,
  players,
  handShare,
  avatarOf,
  onClose,
}: KnockedOutModalProps) {
  const stillIn = players.filter((p) => p.id !== me.id && p.status === 'active');
  const refused = new Set(handShare.refusedIds);
  const watching = handShare.watching;

  return (
    <Modal title="You're out" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">
          <Skull size={34} />
        </div>
        <p className="font-display text-3xl">You're out</p>
        <p className="text-sm text-white/70">
          {me.eliminationReason === 'mercy'
            ? 'You reached 25 cards, so the Mercy Rule knocked you out of this round.'
            : 'You are out of this round.'}{' '}
          You can keep watching the table, or ask a player to show you their hand.
        </p>
      </div>

      {stillIn.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-chalk/80">Ask to see a hand</h3>
          <ul className="space-y-2">
            {stillIn.map((p) => {
              const mine = watching?.targetId === p.id ? watching : null;
              const saidNo = refused.has(p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar traits={avatarOf(p.id)} className="h-9 w-9 shrink-0" />
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="text-xs text-white/60">
                        {p.handCount} {p.handCount === 1 ? 'card' : 'cards'}
                      </span>
                    </span>
                  </span>
                  {saidNo ? (
                    <span className="shrink-0 text-sm text-white/50">Said no</span>
                  ) : mine?.status === 'pending' ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0 text-sm"
                      onClick={() => void endHandShare()}
                      aria-label={`Cancel your request to see ${p.name}'s hand`}
                    >
                      <Hourglass size={14} aria-hidden /> Waiting… Cancel
                    </button>
                  ) : mine?.status === 'allowed' ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm text-brass-soft">
                      <Eye size={14} aria-hidden /> Watching
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary shrink-0 text-sm"
                      onClick={() => void requestHand(p.id)}
                      aria-label={`Ask ${p.name} to show you their hand`}
                    >
                      <Eye size={14} aria-hidden /> Ask
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-white/50">
            They choose whether to show you. A player who says no can't be asked again this round.
          </p>
        </>
      )}

      <button type="button" className="btn-secondary mt-5 w-full" onClick={onClose}>
        Keep watching
      </button>
    </Modal>
  );
}
