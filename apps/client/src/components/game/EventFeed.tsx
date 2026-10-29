import { Settings2 } from 'lucide-react';
import type { GameLogEntry } from '@nomercy/shared';
import type { TableAvatars } from '../../lib/avatar';
import { actorOf, describeEvent, type NameLookup } from '../../lib/event-text';
import { PlayingCard } from '../card/PlayingCard';
import { PlayerAvatar } from '../PlayerAvatar';

/** The game log, newest first: who did it, what happened, and the card when one was played. */
export function EventFeed({
  log,
  name,
  avatarOf,
}: {
  log: GameLogEntry[];
  name: NameLookup;
  avatarOf: TableAvatars;
}) {
  const entries = [...log].reverse();
  return (
    <ol className="scroll-thin max-h-full overflow-y-auto pr-1 text-sm" aria-label="Game log">
      {entries.map((entry, i) => {
        const { event } = entry;
        const actor = actorOf(event);
        return (
          <li
            key={entry.seq}
            className={[
              'flex items-center gap-2.5 border-b border-white/[0.06] px-1.5 py-2 last:border-b-0',
              i === 0 ? 'text-chalk' : 'text-chalk/70',
              event.type === 'playerEliminated' ? 'text-rose-200' : '',
              event.type === 'gameWon' ? 'font-semibold text-brass-soft' : '',
            ].join(' ')}
          >
            {actor ? (
              <PlayerAvatar traits={avatarOf(actor)} className="h-8 w-8 shrink-0" />
            ) : (
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-felt-800 text-chalk/60 ring-1 ring-white/10"
              >
                <Settings2 size={15} />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-snug">{describeEvent(event, name)}</span>
            {event.type === 'cardPlayed' && (
              <PlayingCard
                card={event.card}
                size="xs"
                activeColor={event.chosenColor}
                className="shrink-0"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
