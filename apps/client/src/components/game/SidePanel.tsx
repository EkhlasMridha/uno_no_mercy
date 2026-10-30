import { ScrollText, Users } from 'lucide-react';
import { useId, useState } from 'react';
import type { PublicGameView } from '@nomercy/shared';
import type { TableAvatars } from '../../lib/avatar';
import type { NameLookup } from '../../lib/event-text';
import { ChatBox } from '../ChatBox';
import { CollapseButton } from '../ui/CollapseButton';
import { EventFeed } from './EventFeed';
import { PlayerList } from './PlayerList';

export type SideTab = 'log' | 'players';

const TABS = [
  { id: 'log', label: 'Game log', Icon: ScrollText },
  { id: 'players', label: 'Players', Icon: Users },
] as const;

/**
 * The table's side panel in two halves: the game log and player list (one tab at a time) above,
 * the group chat below. Either half can be minimized to its header; both start expanded.
 */
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
  const [logOpen, setLogOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section
        aria-label="Game log and players"
        className={`flex min-h-0 flex-col ${logOpen ? 'flex-1 basis-0' : 'shrink-0'}`}
      >
        <div className="mb-2 flex items-center gap-1 border-b border-white/10">
          <div role="tablist" aria-label="Side panel" className="flex flex-1">
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
                  onClick={() => {
                    onTab(id);
                    setLogOpen(true);
                  }}
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
          <CollapseButton open={logOpen} label="game log" onToggle={() => setLogOpen((v) => !v)} />
        </div>
        {logOpen && (
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
        )}
      </section>
      <ChatBox
        meId={meId}
        avatarOf={avatarOf}
        open={chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
      />
    </div>
  );
}
