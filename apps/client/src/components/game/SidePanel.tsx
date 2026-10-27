import { ScrollText, Users } from 'lucide-react';
import { useId } from 'react';
import type { PublicGameView } from '@nomercy/shared';
import type { TableAvatars } from '../../lib/avatar';
import type { NameLookup } from '../../lib/event-text';
import { EventFeed } from './EventFeed';
import { PlayerList } from './PlayerList';

export type SideTab = 'log' | 'players';

const TABS = [
  { id: 'log', label: 'Game log', Icon: ScrollText },
  { id: 'players', label: 'Players', Icon: Users },
] as const;

/** The game log and the player list, one tab at a time. */
export function SidePanel({
  tab,
  onTab,
  view,
  meId,
  name,
  avatarOf,
}: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  view: PublicGameView;
  meId: string;
  name: NameLookup;
  avatarOf: TableAvatars;
}) {
  const uid = useId();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Side panel" className="mb-2 flex border-b border-white/10">
        {TABS.map(({ id, label, Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${uid}-${id}`}
              aria-selected={selected}
              aria-controls={`${uid}-${id}-panel`}
              onClick={() => onTab(id)}
              className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-[3px] px-2 pb-2.5 pt-1 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                selected
                  ? 'border-brass text-chalk'
                  : 'border-transparent text-chalk/50 hover:text-chalk/80'
              }`}
            >
              <Icon size={16} className={selected ? 'text-brass' : ''} /> {label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-${tab}-panel`}
        aria-labelledby={`${uid}-${tab}`}
        className="min-h-0 flex-1"
      >
        {tab === 'log' ? (
          <EventFeed log={view.log} name={name} avatarOf={avatarOf} />
        ) : (
          <PlayerList
            players={view.players}
            meId={meId}
            currentPlayerId={view.currentPlayerId}
            avatarOf={avatarOf}
          />
        )}
      </div>
    </div>
  );
}
