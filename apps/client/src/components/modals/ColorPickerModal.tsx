import { Layers } from 'lucide-react';
import { CARD_COLORS, type CardColor } from '@nomercy/shared';
import { COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import { Modal } from '../ui/Modal';

interface ColorPickerModalProps {
  title: string;
  description: string;
  onPick: (color: CardColor) => void;
  onCancel?: () => void;
  /** Opens the cards on the discard pile over this picker, to check them before choosing. */
  onShowPlayed?: () => void;
  /** How many cards that list holds, shown on its button. */
  playedCount?: number;
}

/** A color choice that must be made, shown above your hand so you can see what you hold. */
export function ColorPickerModal({
  title,
  description,
  onPick,
  onCancel,
  onShowPlayed,
  playedCount,
}: ColorPickerModalProps) {
  return (
    <Modal title={title} onClose={onCancel} dismissible={Boolean(onCancel)} overHand>
      <p className="mb-4 text-sm text-white/70 short:mb-3">{description}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARD_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onPick(color)}
            className={`${COLOR_BG[color]} flex h-16 items-center sm:h-20 short:h-14 justify-center rounded-2xl border-4 border-white/90 font-display text-2xl shadow-card transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white ${
              color === 'yellow' ? 'text-felt-950' : 'text-white'
            }`}
          >
            {COLOR_LABEL[color]}
          </button>
        ))}
      </div>
      {onShowPlayed && (
        <button
          type="button"
          className="btn-secondary mt-4 w-full short:mt-3"
          onClick={onShowPlayed}
        >
          <Layers size={18} /> See played cards
          {playedCount !== undefined && ` (${playedCount})`}
        </button>
      )}
    </Modal>
  );
}
