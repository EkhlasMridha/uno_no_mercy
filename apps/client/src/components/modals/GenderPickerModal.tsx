import { GENDERS, type Gender } from '@nomercy/shared';
import { avatarsForTable, type AvatarTraits } from '../../lib/avatar';
import { PlayerAvatar } from '../PlayerAvatar';
import { Modal } from '../ui/Modal';

export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female' };

// Three sample faces per choice, dealt like a small table so they all differ.
export const GENDER_SAMPLES = Object.fromEntries(
  GENDERS.map((gender) => {
    const seats = [0, 1, 2].map((seat) => ({
      id: `sample-${gender}-${seat}`,
      seat,
      isComputer: false,
      gender,
    }));
    const avatarOf = avatarsForTable(seats);
    return [gender, seats.map((s) => avatarOf(s.id))];
  }),
) as Record<Gender, AvatarTraits[]>;

interface GenderPickerModalProps {
  onPick: (gender: Gender) => void;
  onCancel: () => void;
}

/** Asked on create and join: which set of cartoon avatars this player is drawn from. */
export function GenderPickerModal({ onPick, onCancel }: GenderPickerModalProps) {
  return (
    <Modal title="Choose your avatar" onClose={onCancel}>
      <p className="mb-4 text-sm text-chalk/70">
        You get a face of your own at the table, drawn from the set you pick.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {GENDERS.map((gender) => (
          <button
            key={gender}
            type="button"
            onClick={() => onPick(gender)}
            className="group flex flex-col items-center gap-3 rounded-2xl bg-chalk/5 px-3 pb-4 pt-5 ring-1 ring-chalk/15 transition hover:bg-chalk/10 hover:ring-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            <span className="flex items-end -space-x-3" aria-hidden>
              {GENDER_SAMPLES[gender].map((traits, i) => (
                <PlayerAvatar
                  key={i}
                  traits={traits}
                  className={[
                    'rounded-full shadow-seat transition-transform group-hover:-translate-y-0.5',
                    i === 1 ? 'relative z-10 h-16 w-16' : 'h-12 w-12',
                  ].join(' ')}
                />
              ))}
            </span>
            <span className="font-display text-2xl text-chalk">{GENDER_LABEL[gender]}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
