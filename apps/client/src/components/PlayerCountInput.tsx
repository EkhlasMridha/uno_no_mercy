import { Minus, Plus } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@nomercy/shared';

interface PlayerCountInputProps {
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
  /** Lowest allowed value (e.g. players already seated). */
  min?: number;
}

const clamp = (n: number, min: number) => Math.min(MAX_PLAYERS, Math.max(min, n));

/** − / number / + stepper for how many players a room allows. */
export function PlayerCountInput({
  value,
  onChange,
  disabled = false,
  min = MIN_PLAYERS,
}: PlayerCountInputProps) {
  const lowest = Math.max(MIN_PLAYERS, min);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn-secondary h-10 w-10 p-0"
        disabled={disabled || value <= lowest}
        onClick={() => onChange(clamp(value - 1, lowest))}
        aria-label="Fewer players"
      >
        <Minus size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="input h-10 w-16 text-center font-display text-xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        min={lowest}
        max={MAX_PLAYERS}
        value={value}
        disabled={disabled}
        aria-label="Maximum players"
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(clamp(n, lowest));
        }}
      />
      <button
        type="button"
        className="btn-secondary h-10 w-10 p-0"
        disabled={disabled || value >= MAX_PLAYERS}
        onClick={() => onChange(clamp(value + 1, lowest))}
        aria-label="More players"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
