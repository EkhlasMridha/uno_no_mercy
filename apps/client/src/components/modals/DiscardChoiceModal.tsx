import { useState } from 'react';
import type { Card } from '@nomercy/shared';
import { PlayingCard } from '../card/PlayingCard';
import { Modal } from '../ui/Modal';

interface DiscardChoiceModalProps {
  /** The other cards of the Discard All's color in the hand. */
  extras: Card[];
  onConfirm: (discardIds: string[]) => void;
  onCancel: () => void;
}

/** Discard All: the player picks which same-color cards go with it (all selected by default). */
export function DiscardChoiceModal({ extras, onConfirm, onCancel }: DiscardChoiceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(extras.map((c) => c.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = selected.size === extras.length;

  return (
    <Modal title="Discard which cards?" onClose={onCancel}>
      <p className="mb-4 text-sm text-white/70">
        Tap cards to keep them in your hand. Selected cards are discarded with the Discard All.
      </p>
      <ul className="mb-4 flex flex-wrap justify-center gap-2">
        {extras.map((card) => (
          <li key={card.id}>
            <PlayingCard
              card={card}
              size="sm"
              playable={selected.has(card.id)}
              dimmed={!selected.has(card.id)}
              onClick={() => toggle(card.id)}
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={() => setSelected(new Set(allSelected ? [] : extras.map((c) => c.id)))}
        >
          {allSelected ? 'Keep all' : 'Select all'}
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() => onConfirm([...selected])}
        >
          Discard {selected.size}
        </button>
      </div>
    </Modal>
  );
}
