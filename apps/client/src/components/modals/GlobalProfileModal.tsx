import { useState, type FormEvent } from 'react';
import { Globe, WifiOff } from 'lucide-react';
import { GENDERS, PLAYER_NAME_MAX_LENGTH, playerNameSchema, type Gender } from '@nomercy/shared';
import { searchMatch } from '../../net/actions';
import { saveName } from '../../net/session-storage';
import { useAppState } from '../../state/store';
import { PlayerAvatar } from '../PlayerAvatar';
import { Modal } from '../ui/Modal';
import { GENDER_LABEL, GENDER_SAMPLES } from './GenderPickerModal';

interface GlobalProfileModalProps {
  /** The name last used on this browser, to start the field with. */
  initialName: string;
  onClose: () => void;
}

/**
 * Play global asks for a name and an avatar set before searching (docs/RULES.md §5.19). The face
 * itself is dealt at random from that set once the search starts.
 */
export function GlobalProfileModal({ initialName, onClose }: GlobalProfileModalProps) {
  const online = useAppState((s) => s.connection === 'connected');
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<{ field: 'name' | 'gender' | 'server'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = playerNameSchema.safeParse(name);
    if (!parsed.success) {
      setError({ field: 'name', text: parsed.error.issues[0]?.message ?? 'Choose another name' });
      return;
    }
    if (!gender) {
      setError({ field: 'gender', text: 'Pick an avatar set to search with' });
      return;
    }
    setError(null);
    setBusy(true);
    const result = await searchMatch(parsed.data, gender);
    setBusy(false);
    if (result.ok) saveName(parsed.data);
    else setError({ field: 'server', text: result.error.message });
  };

  return (
    <Modal title="Play global" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        <p className="text-sm text-chalk/70">
          Get matched with players searching right now. A table of 5 is dealt as soon as it fills.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm text-chalk/75">Your name</span>
          <input
            className="input"
            value={name}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            autoComplete="nickname"
            required
            aria-invalid={error?.field === 'name'}
            aria-describedby={error?.field === 'name' ? 'global-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </label>
        <fieldset aria-describedby={error?.field === 'gender' ? 'global-error' : undefined}>
          <legend className="mb-1.5 text-sm text-chalk/75">
            Your avatar set <span className="text-chalk/50">(you get a random face from it)</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {GENDERS.map((g) => {
              const chosen = gender === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => {
                    setGender(g);
                    setError(null);
                  }}
                  className={[
                    'group flex flex-col items-center gap-2 rounded-2xl px-3 pb-3 pt-4 ring-1 transition',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass',
                    chosen
                      ? 'bg-brass/15 ring-2 ring-brass'
                      : 'bg-chalk/5 ring-chalk/15 hover:bg-chalk/10 hover:ring-chalk/30',
                    error?.field === 'gender' ? 'ring-rose-400' : '',
                  ].join(' ')}
                >
                  <span className="flex items-end -space-x-3" aria-hidden>
                    {GENDER_SAMPLES[g].map((traits, i) => (
                      <PlayerAvatar
                        key={i}
                        traits={traits}
                        className={[
                          'rounded-full shadow-seat',
                          i === 1 ? 'relative z-10 h-14 w-14' : 'h-11 w-11',
                        ].join(' ')}
                      />
                    ))}
                  </span>
                  <span className={`font-display text-xl ${chosen ? 'text-brass' : 'text-chalk'}`}>
                    {GENDER_LABEL[g]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p
            id="global-error"
            role="alert"
            className="notice bg-rose-500/15 text-rose-200 ring-rose-400/30"
          >
            {error.text}
          </p>
        )}
        {!online && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-rose-300">
            <WifiOff size={14} aria-hidden /> Waiting for the game server…
          </p>
        )}
        <button type="submit" className="btn-primary btn-lg w-full" disabled={busy || !online}>
          <Globe size={20} aria-hidden />
          {busy ? 'Starting the search…' : 'Find a match'}
        </button>
      </form>
    </Modal>
  );
}
