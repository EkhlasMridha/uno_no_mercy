import type { GameLogEntry } from '@nomercy/shared';
import { describeEvent, type NameLookup } from '../../lib/event-text';

export function EventFeed({ log, name }: { log: GameLogEntry[]; name: NameLookup }) {
  const entries = [...log].reverse();
  return (
    <ol
      className="scroll-thin max-h-full space-y-1 overflow-y-auto pr-1 text-sm"
      aria-label="Game log"
    >
      {entries.map((entry, i) => (
        <li
          key={entry.seq}
          className={`rounded-lg px-2.5 py-1.5 ${i === 0 ? 'bg-white/10 text-white' : 'text-white/65'} ${
            entry.event.type === 'playerEliminated' ? 'text-rose-200' : ''
          } ${entry.event.type === 'gameWon' ? 'font-semibold text-amber-200' : ''}`}
        >
          {describeEvent(entry.event, name)}
        </li>
      ))}
    </ol>
  );
}
