import { Minus, Plus } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@nomercy/shared';

interface PlayerCountInputProps {
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
  /** Lowest allowed value (e.g. players already seated). */
  min?: number;
  max?: number;
  /** What is being counted, for the button labels ("Fewer players"). */
  noun?: string;
  label?: string;
}

/** − / number / + stepper for a seat count: room size, or computer opponents. */
export function PlayerCountInput({
  value,
  onChange,
  disabled = false,
  min = MIN_PLAYERS,
  max = MAX_PLAYERS,
  noun = 'players',
  label = 'Maximum players',
}: PlayerCountInputProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn-secondary h-10 w-10 p-0"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={`Fewer ${noun}`}
      >
        <Minus size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="input h-10 w-16 text-center font-display text-xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
      />
      <button
        type="button"
        className="btn-secondary h-10 w-10 p-0"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`More ${noun}`}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
