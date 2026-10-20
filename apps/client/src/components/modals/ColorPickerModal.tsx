import { CARD_COLORS, type CardColor } from '@nomercy/shared';
import { COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import { Modal } from '../ui/Modal';

interface ColorPickerModalProps {
  title: string;
  description: string;
  onPick: (color: CardColor) => void;
  onCancel?: () => void;
}

export function ColorPickerModal({ title, description, onPick, onCancel }: ColorPickerModalProps) {
  return (
    <Modal title={title} onClose={onCancel} dismissible={Boolean(onCancel)}>
      <p className="mb-4 text-sm text-white/70">{description}</p>
      <div className="grid grid-cols-2 gap-3">
        {CARD_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onPick(color)}
            className={`${COLOR_BG[color]} flex h-24 items-center justify-center rounded-2xl border-4 border-white/90 font-display text-2xl shadow-card transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-4 focus-visible:outline-white ${
              color === 'yellow' ? 'text-felt-950' : 'text-white'
            }`}
          >
            {COLOR_LABEL[color]}
          </button>
        ))}
      </div>
    </Modal>
  );
}
