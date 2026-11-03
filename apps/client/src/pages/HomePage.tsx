import { useEffect, useState, type FormEvent } from 'react';
import { Bot, BookOpen, LogIn, Play, Plus, Users, Wifi, WifiOff } from 'lucide-react';
import {
  MAX_COMPUTERS,
  MIN_PLAYERS,
  playerNameSchema,
  roomCodeSchema,
  ROOM_CODE_LENGTH,
  type Gender,
} from '@nomercy/shared';
import { createRoom, joinFromInvite, joinRoom } from '../net/actions';
import { takeInviteCode } from '../lib/invite';
import { loadName, saveName } from '../net/session-storage';
import { useAppState } from '../state/store';
import { GenderPickerModal } from '../components/modals/GenderPickerModal';
import { RulesPanel } from '../components/modals/RulesPanel';
import { PlayingCard } from '../components/card/PlayingCard';
import { PlayerCountInput } from '../components/PlayerCountInput';
import { Modal } from '../components/ui/Modal';
import { TablePreview } from '../components/TablePreview';

// Read once when the app loads, so a page opened from an invite link joins that room.
const invitedCode = takeInviteCode();

export function HomePage() {
  const connection = useAppState((s) => s.connection);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(invitedCode ?? '');
  // An invite waiting for the connection before it opens the avatar picker.
  const [pendingInvite, setPendingInvite] = useState(invitedCode);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lights the name field red after a try with a missing or bad name, until you type in it.
  const [nameInvalid, setNameInvalid] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showComputer, setShowComputer] = useState(false);
  const [computers, setComputers] = useState(3);
  // Creating or joining first asks which avatars to draw this player from.
  const [askGender, setAskGender] = useState<'create' | 'computer' | 'join' | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);

  const validName = () => {
    const parsed = playerNameSchema.safeParse(name);
    setNameInvalid(!parsed.success);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return null;
    }
    saveName(parsed.data);
    return parsed.data;
  };

  const openCreate = () => {
    setError(null);
    if (validName()) setAskGender('create');
  };

  const openComputer = () => {
    setError(null);
    if (validName()) setAskGender('computer');
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const n = validName();
    if (!n || !gender) return;
    setBusy(true);
    const result = await createRoom(n, gender, maxPlayers);
    setBusy(false);
    if (!result.ok) setShowCreate(false);
  };

  const onPlayComputer = async (e: FormEvent) => {
    e.preventDefault();
    const n = validName();
    if (!n || !gender) return;
    setBusy(true);
    const result = await createRoom(n, gender, computers + 1, computers);
    setBusy(false);
    if (!result.ok) setShowComputer(false);
  };

  const validCode = () => {
    const parsedCode = roomCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setError(`Room codes are ${ROOM_CODE_LENGTH} letters/numbers`);
      return null;
    }
    return parsedCode.data;
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (validName() && validCode()) setAskGender('join');
  };

  const join = async (chosen: Gender) => {
    const n = validName();
    const c = validCode();
    if (!n || !c) return;
    setBusy(true);
    await joinRoom(c, n, chosen);
    setBusy(false);
  };

  const onPickGender = (chosen: Gender) => {
    const next = askGender;
    setGender(chosen);
    setAskGender(null);
    if (next === 'create') setShowCreate(true);
    if (next === 'computer') setShowComputer(true);
    if (next === 'join') void join(chosen);
  };

  const online = connection === 'connected';

  // An invite link joins straight away once connected: under the name this browser last played
  // with, or a random one. The avatar set starts as male; both can be changed in the lobby.
  useEffect(() => {
    if (!pendingInvite || !online) return;
    setPendingInvite(null);
    const saved = playerNameSchema.safeParse(loadName());
    setBusy(true);
    void joinFromInvite(pendingInvite, saved.success ? saved.data : null).finally(() =>
      setBusy(false),
    );
  }, [pendingInvite, online]);

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
          A ruthless shedding card game for 2 or more players on your local network, or solo against
          the computer. Stack draws, swap hands, and survive the Mercy Rule.
        </p>
        <p
          className={`flex items-center gap-1.5 text-xs ${online ? 'text-emerald-300' : 'text-rose-300'}`}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? `Connected to host at ${window.location.host}` : 'Connecting to the host…'}
        </p>
      </header>

      <section className="panel w-full max-w-md space-y-5 p-5">
        {invitedCode && code === invitedCode && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-xl bg-brass/10 px-3 py-2 text-sm text-brass-soft ring-1 ring-brass/30"
          >
            You&apos;re invited to room{' '}
            <span className="font-display tracking-widest">{invitedCode}</span>.{' '}
            {pendingInvite || busy
              ? 'Taking you to the lobby…'
              : "Couldn't join automatically. Enter your name, then press Join."}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-white/80">Your name</span>
          <input
            className="input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Sam"
            aria-invalid={nameInvalid}
            aria-describedby={nameInvalid ? 'home-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameInvalid(false);
            }}
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
        <button
          type="button"
          className="btn-secondary w-full py-3 text-lg"
          disabled={busy || !online}
          onClick={openComputer}
        >
          <Bot size={20} /> Play with computer
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/40">
          <span className="h-px flex-1 bg-white/10" /> or join{' '}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="flex gap-2" onSubmit={onJoin}>
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
          <p
            id="home-error"
            role="alert"
            className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
      </section>

      <button type="button" className="btn-ghost text-sm" onClick={() => setShowRules(true)}>
        <BookOpen size={16} /> How to play
      </button>
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {askGender && <GenderPickerModal onPick={onPickGender} onCancel={() => setAskGender(null)} />}
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
      {showComputer && (
        <Modal title="Play with computer" onClose={() => setShowComputer(false)}>
          <form className="space-y-5" onSubmit={(e) => void onPlayComputer(e)}>
            <TablePreview
              seats={[
                { name: name.trim() || 'You', kind: 'you' },
                ...Array.from({ length: computers }, () => ({
                  name: '',
                  kind: 'computer' as const,
                })),
              ]}
            />
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  <Bot size={16} className="text-brass" /> Opponents
                </span>
                <span className="block text-sm text-white/60" aria-live="polite">
                  {computers === 1 ? '1 computer opponent' : `${computers} computer opponents`},
                  named at random.
                </span>
              </span>
              <PlayerCountInput
                value={computers}
                onChange={setComputers}
                min={1}
                max={MAX_COMPUTERS}
                noun="computers"
                label="Computer opponents"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-3 text-lg"
              disabled={busy || !online}
            >
              <Play size={20} /> Start game
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
