import { useState, type FormEvent } from 'react';
import { BookOpen, LogIn, Plus, Users, Wifi, WifiOff } from 'lucide-react';
import { MIN_PLAYERS, playerNameSchema, roomCodeSchema, ROOM_CODE_LENGTH } from '@nomercy/shared';
import { createRoom, joinRoom } from '../net/actions';
import { loadName, saveName } from '../net/session-storage';
import { useAppState } from '../state/store';
import { RulesPanel } from '../components/modals/RulesPanel';
import { PlayingCard } from '../components/card/PlayingCard';
import { PlayerCountInput } from '../components/PlayerCountInput';
import { Modal } from '../components/ui/Modal';

export function HomePage() {
  const connection = useAppState((s) => s.connection);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const validName = () => {
    const parsed = playerNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return null;
    }
    saveName(parsed.data);
    return parsed.data;
  };

  const openCreate = () => {
    setError(null);
    if (validName()) setShowCreate(true);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const n = validName();
    if (!n) return;
    setBusy(true);
    const result = await createRoom(n, maxPlayers);
    setBusy(false);
    if (!result.ok) setShowCreate(false);
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = validName();
    if (!n) return;
    const parsedCode = roomCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setError(`Room codes are ${ROOM_CODE_LENGTH} letters/numbers`);
      return;
    }
    setBusy(true);
    await joinRoom(parsedCode.data, n);
    setBusy(false);
  };

  const online = connection === 'connected';

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <div className="flex -space-x-6" aria-hidden>
          <PlayingCard
            card={{ id: 'chome1', kind: 'wildDraw10' }}
            size="md"
            className="-rotate-12"
          />
          <PlayingCard
            card={{ id: 'chome2', kind: 'skipEveryone', color: 'red' }}
            size="md"
            className="z-10 -translate-y-2"
          />
          <PlayingCard
            card={{ id: 'chome3', kind: 'number', color: 'blue', value: 7 }}
            size="md"
            className="rotate-12"
          />
        </div>
        <h1 className="font-display text-6xl leading-none tracking-wide drop-shadow-[0_4px_0_rgba(255,77,109,0.6)] sm:text-7xl">
          NO MERCY
        </h1>
        <p className="max-w-md text-white/70">
          A ruthless shedding card game for 2 or more players on your local network. Stack draws,
          swap hands, and survive the Mercy Rule.
        </p>
        <p
          className={`flex items-center gap-1.5 text-xs ${online ? 'text-emerald-300' : 'text-rose-300'}`}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? `Connected to host at ${window.location.host}` : 'Connecting to the host…'}
        </p>
      </header>

      <section className="panel w-full max-w-md space-y-5 p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-white/80">Your name</span>
          <input
            className="input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Sam"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn-primary w-full py-3 text-lg"
          disabled={busy || !online}
          onClick={openCreate}
        >
          <Plus size={20} /> Create a room
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/40">
          <span className="h-px flex-1 bg-white/10" /> or join{' '}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="flex gap-2" onSubmit={(e) => void onJoin(e)}>
          <input
            className="input text-center font-display text-xl uppercase tracking-[0.35em]"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn-secondary px-5" disabled={busy || !online}>
            <LogIn size={18} /> Join
          </button>
        </form>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </section>

      <button type="button" className="btn-ghost text-sm" onClick={() => setShowRules(true)}>
        <BookOpen size={16} /> How to play
      </button>
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showCreate && (
        <Modal title="Create a room" onClose={() => setShowCreate(false)}>
          <form className="space-y-5" onSubmit={(e) => void onCreate(e)}>
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  <Users size={16} className="text-sky-300" /> Max players
                </span>
                <span className="block text-sm text-white/60">
                  Including you. At least {MIN_PLAYERS}.
                </span>
              </span>
              <PlayerCountInput value={maxPlayers} onChange={setMaxPlayers} />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-3 text-lg"
              disabled={busy || !online}
            >
              <Plus size={20} /> Create room
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
