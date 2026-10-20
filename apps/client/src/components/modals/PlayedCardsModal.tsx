import type { PlayedCardEntry } from '@nomercy/shared';
import { COLOR_BG, COLOR_LABEL } from '../../lib/cards';
import type { NameLookup } from '../../lib/event-text';
import { PlayingCard } from '../card/PlayingCard';
import { Modal } from '../ui/Modal';

interface PlayedCardsModalProps {
  history: PlayedCardEntry[];
  name: NameLookup;
  onClose: () => void;
}

/** Every card played this round, newest first, with who played it. */
export function PlayedCardsModal({ history, name, onClose }: PlayedCardsModalProps) {
  const newestFirst = history.slice().reverse();
  return (
    <Modal title={`Played cards (${history.length})`} onClose={onClose} wide>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
        {newestFirst.map((entry, i) => (
          <li
            // A card can be played again after a reshuffle, so its id is not unique here.
            key={history.length - i}
            className="flex flex-col items-center gap-1 text-center"
          >
            <PlayingCard
              card={entry.card}
              size="sm"
              activeColor={entry.chosenColor}
              className={i === 0 ? 'ring-2 ring-amber-300' : ''}
            />
            <span className="w-full truncate text-xs text-white/70">
              {entry.playerId ? name(entry.playerId) : 'Start'}
            </span>
            {entry.chosenColor && (
              <span className="flex items-center gap-1 text-[10px] text-white/50">
                <span className={`h-2 w-2 rounded-full ${COLOR_BG[entry.chosenColor]}`} />
                {COLOR_LABEL[entry.chosenColor]}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
