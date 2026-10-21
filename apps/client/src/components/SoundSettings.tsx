import { useCallback, useState } from 'react';
import { Bell, Play, Shuffle, Trophy, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import { playSound, type SoundKind } from '../lib/sound';
import { setSoundPref, useAppState } from '../state/store';
import { Modal } from './ui/Modal';

const SOUNDS: { kind: SoundKind; label: string; description: string; Icon: LucideIcon }[] = [
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

/** Top-bar button that opens the sound panel: a toggle and a preview for each game sound. */
export function SoundSettings({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const prefs = useAppState((s) => s.sound);
  // Stable, so the open panel keeps focus while game updates re-render the page.
  const close = useCallback(() => setOpen(false), []);
  const Icon = Object.values(prefs).some(Boolean) ? Volume2 : VolumeX;

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
        <Modal title="Sound" onClose={close}>
          <ul className="space-y-2">
            {SOUNDS.map(({ kind, label, description, Icon: SoundIcon }) => (
              <li key={kind} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
                <label className="flex flex-1 cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      <SoundIcon size={16} className="text-brass" /> {label}
                    </span>
                    <span className="block text-sm text-white/60">{description}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0 accent-accent"
                    checked={prefs[kind]}
                    onChange={(e) => setSoundPref(kind, e.target.checked)}
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
