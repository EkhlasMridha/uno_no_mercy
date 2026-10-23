import { useState } from 'react';
import {
  Bell,
  Layers,
  Play,
  Shuffle,
  Trophy,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { playSound, type SoundKind } from '../lib/sound';
import { setSoundPref, useAppState } from '../state/store';
import { Modal } from './ui/Modal';

const SOUNDS: { kind: SoundKind; label: string; description: string; Icon: LucideIcon }[] = [
  {
    kind: 'cardPlay',
    label: 'Card play',
    description: 'A card slapped down on the table whenever anyone plays one.',
    Icon: Layers,
  },
  {
    kind: 'turnReminder',
    label: 'Turn reminder',
    description: "Knocks on the table every 10 seconds while it's your move.",
    Icon: Bell,
  },
  {
    kind: 'handExchange',
    label: 'Hand exchange',
    description: 'A card riffle when a 0 passes or a 7 swaps hands.',
    Icon: Shuffle,
  },
  { kind: 'win', label: 'Win', description: 'A fanfare when you win the round.', Icon: Trophy },
];

/** A brass-and-walnut switch drawn over a real checkbox, so keyboards and screen readers still work. */
function Toggle({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="h-6 w-11 rounded-full bg-walnut-dark ring-1 ring-walnut-light/60 transition-colors peer-checked:bg-brass peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-chalk shadow transition-transform peer-checked:translate-x-5 motion-reduce:transition-none"
      />
    </span>
  );
}

/** Top-bar button that opens the sound panel: mute all, plus a toggle and a preview for each sound. */
export function SoundSettings({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const prefs = useAppState((s) => s.sound);
  const Icon = !prefs.muted && SOUNDS.some(({ kind }) => prefs[kind]) ? Volume2 : VolumeX;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Sound settings"
      >
        <Icon size={16} /> <span className="hidden sm:inline">Sound</span>
      </button>
      {open && (
        <Modal title="Sound" onClose={() => setOpen(false)}>
          <label className="mb-3 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex items-center gap-2 font-semibold">
              <VolumeX size={16} className="text-brass" /> Mute all
            </span>
            <Toggle checked={prefs.muted} onChange={(on) => setSoundPref('muted', on)} />
          </label>
          <ul className="space-y-2">
            {SOUNDS.map(({ kind, label, description, Icon: SoundIcon }) => (
              <li key={kind} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
                <label
                  className={`flex flex-1 items-center justify-between gap-4 ${
                    prefs.muted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      <SoundIcon size={16} className="text-brass" /> {label}
                    </span>
                    <span className="block text-sm text-white/60">{description}</span>
                  </span>
                  <Toggle
                    checked={prefs[kind]}
                    disabled={prefs.muted}
                    onChange={(on) => setSoundPref(kind, on)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost p-2"
                  onClick={() => playSound(kind)}
                  aria-label={`Play the ${label.toLowerCase()} sound`}
                >
                  <Play size={18} />
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
