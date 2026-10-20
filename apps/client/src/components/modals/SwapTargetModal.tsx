import { ArrowRightLeft } from 'lucide-react';
import type { PublicPlayerView } from '@nomercy/shared';
import { Modal } from '../ui/Modal';

interface SwapTargetModalProps {
  players: PublicPlayerView[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
}

/** 7's Swap: the swap is mandatory once the 7 is played; cancelling only un-selects the card. */
export function SwapTargetModal({ players, onPick, onCancel }: SwapTargetModalProps) {
  return (
    <Modal title="Swap hands with…" onClose={onCancel}>
      <p className="mb-4 text-sm text-white/70">
        Playing a 7 forces you to trade your entire hand with another player.
      </p>
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              className="btn-secondary w-full justify-between py-3 text-left"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-felt-600 font-display">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{p.name}</span>
              </span>
              <span className="flex items-center gap-2 text-sm text-white/70">
                {p.handCount} cards <ArrowRightLeft size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
