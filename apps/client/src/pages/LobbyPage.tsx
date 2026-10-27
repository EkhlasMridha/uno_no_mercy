import { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Crown,
  DoorOpen,
  Link,
  Play,
  Trophy,
  Users,
  WifiOff,
} from 'lucide-react';
import type { RoomView } from '@nomercy/shared';
import { copyText, inviteText } from '../lib/invite';
import { leaveRoom, setMaxPlayers, setReady, setScoring, startGame } from '../net/actions';
import { pushNotice } from '../state/store';
import { FillSeatsModal } from '../components/modals/FillSeatsModal';
import { RulesPanel } from '../components/modals/RulesPanel';
import { PlayerCountInput } from '../components/PlayerCountInput';
import { SoundSettings } from '../components/SoundSettings';

export function LobbyPage({ room, meId }: { room: RoomView; meId: string }) {
  const [copied, setCopied] = useState<'code' | 'invite' | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showFill, setShowFill] = useState(false);
  const me = room.players.find((p) => p.id === meId);
  const isHost = room.hostId === meId;
  const others = room.players.filter((p) => p.id !== room.hostId);
  const waitingFor = others.filter((p) => !p.ready || !p.connected);
  const enoughPlayers = room.players.length >= room.minPlayers;
  const openSeats = Math.max(0, room.maxPlayers - room.players.length);
  // Open seats can go to computers, so a host on their own can start too.
  const canStart = isHost && waitingFor.length === 0 && (enoughPlayers || openSeats > 0);

  const copy = async (what: 'code' | 'invite') => {
    const ok = await copyText(what === 'code' ? room.code : inviteText(room.code));
    if (!ok) {
      pushNotice('error', "Couldn't copy here. Read the room code out to your friends instead.");
      return;
    }
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  };

  const startHint =
    waitingFor.length > 0
      ? `Waiting for ${waitingFor.map((p) => p.name).join(', ')}`
      : !enoughPlayers
        ? 'Start now and computers fill the empty seats'
        : 'Everyone is ready!';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-wide">Lobby</h1>
        <div className="flex gap-2">
          <SoundSettings className="btn-ghost text-sm" />
          <button type="button" className="btn-ghost text-sm" onClick={() => setShowRules(true)}>
            <BookOpen size={16} /> Rules
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={() => void leaveRoom()}>
            <DoorOpen size={16} /> Leave
          </button>
        </div>
      </header>

      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/50">Room code</p>
        <button
          type="button"
          onClick={() => void copy('code')}
          className="group flex items-center gap-3 font-display text-5xl tracking-[0.3em] sm:text-6xl"
          aria-label={`Room code ${room.code.split('').join(' ')}. Copy`}
        >
          {room.code}
          {copied === 'code' ? (
            <Check size={24} className="text-emerald-300" />
          ) : (
            <Copy size={22} className="text-white/40 group-hover:text-white" />
          )}
        </button>
        <button type="button" className="btn-secondary px-5" onClick={() => void copy('invite')}>
          {copied === 'invite' ? <Check size={18} /> : <Link size={18} />}
          {copied === 'invite' ? 'Invite link copied' : 'Copy invite link'}
        </button>
        <p role="status" aria-live="polite" className="sr-only">
          {copied === 'invite' ? 'Invite link and room code copied' : ''}
          {copied === 'code' ? 'Room code copied' : ''}
        </p>
        <p className="text-sm text-white/60">
          Send the link to friends on the same network: opening it takes them straight to this room.
          Or they can open <span className="font-mono text-white">{window.location.origin}</span>{' '}
          and enter the code.
        </p>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 flex items-center justify-between font-semibold">
          Players
          <span className="text-sm font-normal text-white/50">
            {room.players.length} / {room.maxPlayers}
          </span>
        </h2>
        <ul className="space-y-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-felt-600 font-display text-lg">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 truncate">
                {p.name} {p.id === meId && <span className="text-white/50">(you)</span>}
              </span>
              {p.isHost && (
                <span className="flex items-center gap-1 text-xs text-amber-300">
                  <Crown size={14} /> Host
                </span>
              )}
              {!p.connected && (
                <WifiOff size={16} className="text-rose-300" aria-label="Disconnected" />
              )}
              {!p.isHost && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    p.ready ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {p.ready ? 'Ready' : 'Not ready'}
                </span>
              )}
            </li>
          ))}
          {openSeats > 0 && (
            <li className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-white/40">
              {openSeats === 1
                ? 'Waiting for 1 more player to join…'
                : `Up to ${openSeats} more players can join…`}
            </li>
          )}
        </ul>
      </section>

      <section className="panel space-y-4 p-4">
        <div className={`flex items-center justify-between gap-4 ${isHost ? '' : 'opacity-70'}`}>
          <span>
            <span className="flex items-center gap-2 font-semibold">
              <Users size={16} className="text-sky-300" /> Max players
            </span>
            <span className="block text-sm text-white/60">
              How many players can join this room.
            </span>
          </span>
          <PlayerCountInput
            value={room.maxPlayers}
            disabled={!isHost}
            min={Math.max(room.minPlayers, room.players.length)}
            onChange={(n) => void setMaxPlayers(n)}
          />
        </div>

        <label className={`flex items-center justify-between gap-4 ${isHost ? '' : 'opacity-70'}`}>
          <span>
            <span className="flex items-center gap-2 font-semibold">
              <Trophy size={16} className="text-amber-300" /> Official scoring
            </span>
            <span className="block text-sm text-white/60">
              Winner scores opponents&apos; cards + 250 per knockout. First to {room.matchTarget}{' '}
              wins the match.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 accent-accent"
            checked={room.settings.scoringEnabled}
            disabled={!isHost}
            onChange={(e) => void setScoring(e.target.checked)}
          />
        </label>

        {isHost ? (
          <div className="space-y-2">
            <button
              type="button"
              className="btn-primary w-full py-3 text-lg"
              disabled={!canStart}
              onClick={() => (openSeats > 0 ? setShowFill(true) : void startGame())}
            >
              <Play size={20} /> Start game
            </button>
            <p className="text-center text-sm text-white/60">{startHint}</p>
          </div>
        ) : (
          <button
            type="button"
            className={`w-full py-3 text-lg ${me?.ready ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => void setReady(!me?.ready)}
          >
            {me?.ready ? 'Not ready' : "I'm ready"}
          </button>
        )}
      </section>
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showFill && <FillSeatsModal room={room} meId={meId} onClose={() => setShowFill(false)} />}
    </main>
  );
}
