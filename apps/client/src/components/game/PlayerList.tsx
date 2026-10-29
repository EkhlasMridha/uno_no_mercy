import { Crown, Skull, WifiOff } from 'lucide-react';
import type { PublicPlayerView } from '@nomercy/shared';
import type { TableAvatars } from '../../lib/avatar';
import { avatarGlow, PlayerAvatar } from '../PlayerAvatar';

/** Everyone at the table in turn order, with their card counts. */
export function PlayerList({
  players,
  meId,
  currentPlayerId,
  avatarOf,
}: {
  players: readonly PublicPlayerView[];
  meId: string;
  currentPlayerId: string | null;
  avatarOf: TableAvatars;
}) {
  return (
    <ul className="scroll-thin max-h-full space-y-1 overflow-y-auto pr-1" aria-label="Players">
      {players.map((p) => {
        const out = p.status === 'eliminated';
        const current = p.id === currentPlayerId && !out;
        return (
          <li
            key={p.id}
            aria-current={current ? 'true' : undefined}
            className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
              current ? 'bg-brass/10 ring-1 ring-brass/50' : ''
            } ${out ? 'opacity-55 grayscale' : ''}`}
          >
            <span
              className="relative h-9 w-9 shrink-0 rounded-full"
              style={avatarGlow(avatarOf(p.id))}
            >
              <PlayerAvatar traits={avatarOf(p.id)} className="h-full w-full" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold text-chalk">
                <span className="truncate">{p.id === meId ? `${p.name} (you)` : p.name}</span>
                {p.isHost && <Crown size={12} className="shrink-0 text-brass" aria-label="Host" />}
                {!p.connected && (
                  <WifiOff size={12} className="shrink-0 text-rose-300" aria-label="Disconnected" />
                )}
              </span>
              <span className="block text-xs text-chalk/55">
                {out ? (
                  <span className="inline-flex items-center gap-1 text-rose-200">
                    <Skull size={11} /> {p.eliminationReason === 'mercy' ? 'Knocked out' : 'Left'}
                  </span>
                ) : current ? (
                  <span className="text-brass-soft">Playing now</span>
                ) : p.isComputer ? (
                  'Computer'
                ) : (
                  'Waiting'
                )}
              </span>
            </span>
            {p.uno === 'declared' && !out && (
              <span className="rounded-full bg-brass px-2 font-display text-xs leading-5 text-room">
                UNO!
              </span>
            )}
            <span
              className={`min-w-[2rem] rounded-full px-2 py-0.5 text-center text-sm font-bold tabular-nums ring-1 ${
                p.handCount >= 20 && !out
                  ? 'bg-rose-500/20 text-rose-200 ring-rose-400/60'
                  : 'bg-felt-950 text-chalk ring-white/15'
              }`}
              aria-label={`${p.handCount} cards`}
            >
              {p.handCount}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
