import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, ChevronDown, LogIn, Play, WifiOff } from 'lucide-react';
import {
  DECK_SIZE,
  MAX_COMPUTERS,
  MAX_PLAYERS,
  MERCY_HAND_LIMIT,
  MERCY_WARNING_AT,
  playerNameSchema,
  roomCodeSchema,
  ROOM_CODE_LENGTH,
  STARTING_HAND_SIZE,
  type Card,
  type CardFace,
} from '@nomercy/shared';
import { createRoom, joinAs, joinFromInvite } from '../net/actions';
import { takeInviteCode } from '../lib/invite';
import { randomPlayerName } from '../lib/random-name';
import { loadName, saveName } from '../net/session-storage';
import { useAppState } from '../state/store';
import { CardBack, PlayingCard } from '../components/card/PlayingCard';
import { CardGallery } from '../components/landing/CardGallery';
import { MercyMeter } from '../components/landing/MercyMeter';
import { ShuffleDeck } from '../components/landing/ShuffleDeck';
import { StackDemo } from '../components/landing/StackDemo';
import { Modal } from '../components/ui/Modal';

// Read once when the app loads, so a page opened from an invite link joins that room.
const invitedCode = takeInviteCode();
// The invite is used once per page load. Leaving that room, or being removed from it, brings you
// back to this page, and must not send you straight back in.
let inviteUsed = false;

/** Seats in a room opened from Play; the host changes it in the lobby. */
const DEFAULT_SEATS = 4;

const sample = (card: CardFace, id: string): Card => ({ ...card, id }) as Card;

const savedName = () => {
  const parsed = playerNameSchema.safeParse(loadName());
  return parsed.success ? parsed.data : null;
};

/**
 * The room code in whatever was typed or pasted: the code itself, or the invite text from a lobby
 * (a link ending in `?join=CODE`). Keeps letters and digits only, up to the code's length.
 */
function readCode(raw: string): string {
  const upper = raw.toUpperCase();
  const fromLink = /JOIN=([A-Z0-9]+)/.exec(upper)?.[1];
  return (fromLink ?? upper).replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

const CODE_HINT = `Room codes are ${ROOM_CODE_LENGTH} characters and never use O, 0, I, 1 or L. Check the code in your friend's lobby.`;

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Is UNO No Mercy free to play here?',
    a: 'Yes. There is no account, no download and no ads. Open the page, press Play and you are the host of a new room.',
  },
  {
    q: 'How many people can play?',
    a: `From 2 to ${MAX_PLAYERS} in one room. The host sets the number of seats in the lobby and can change it until the deal.`,
  },
  {
    q: 'Can I play against the computer?',
    a: `Yes. Press Start in the lobby with seats still open and computer players fill them, up to ${MAX_COMPUTERS}. You can play alone against bots or mix them in with friends.`,
  },
  {
    q: 'How do my friends join?',
    a: `Send them the invite link from the lobby, or read out the ${ROOM_CODE_LENGTH}-character room code for them to enter under Join a room. They can play from any browser, phone or laptop.`,
  },
  {
    q: 'What is the Mercy Rule?',
    a: `Anyone holding ${MERCY_HAND_LIMIT} or more cards is knocked out on the spot. The last player standing, or the first to empty their hand, wins the round.`,
  },
  {
    q: 'Can you stack a +2 on a +4?',
    a: 'No. A stack only goes up: answer with a Draw card of equal or higher value, in any color. +2 goes under +4, +4 under +6, +6 under +10, and only a +10 answers a +10.',
  },
  {
    q: 'What do the 7 and the 0 do?',
    a: 'Play a 7 and you must swap your whole hand with a player you choose. Play a 0 and everyone passes their hand to the next player in the direction of play.',
  },
  {
    q: 'What happens when the draw pile runs out?',
    a: 'Every discard except the top card is shuffled into a new draw pile, along with the hands of players already knocked out.',
  },
  {
    q: 'Is there scoring?',
    a: 'It is optional. Turn it on in the lobby and the winner of each round scores the cards left in the other hands, plus 250 for every player knocked out. First to 1,000 wins the match.',
  },
  {
    q: 'What if my connection drops mid-game?',
    a: 'Your seat and hand are held while the table decides whether to wait for you. Reload the page to take your seat back, or use Join a room on another device with the room code and the name you were playing under.',
  },
  {
    q: 'Can I host it on my own network?',
    a: 'Yes. One computer runs the game server and everyone else joins over the same Wi-Fi. Rooms live only in the server’s memory and are gone when the last player leaves.',
  },
  {
    q: 'Is this the official UNO game?',
    a: `No. It is a fan-made browser version built to the published rules of the ${DECK_SIZE}-card No Mercy deck, with its own original card artwork. It is not affiliated with or endorsed by Mattel.`,
  },
];

/** An invite link this page opened with: on its way in, or turned away with the server's reason. */
type InviteState = { status: 'joining' } | { status: 'failed'; reason: string } | null;

export function HomePage() {
  const connection = useAppState((s) => s.connection);
  const online = connection === 'connected';
  // What the player asked for and is waiting on: their own new room, or someone else's.
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  const [invite, setInvite] = useState<InviteState>(() =>
    invitedCode && !inviteUsed ? { status: 'joining' } : null,
  );
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState(invitedCode ?? '');
  const [joinName, setJoinName] = useState(() => savedName() ?? '');
  const [joinError, setJoinError] = useState<{ field: 'code' | 'name'; message: string } | null>(
    null,
  );
  const codeInputRef = useRef<HTMLInputElement>(null);

  const busy = pending !== null || invite?.status === 'joining';
  const inviteFailed = invite?.status === 'failed';

  // The popup focuses itself on open; move focus on to the code field once it has.
  useEffect(() => {
    if (!showJoin) return;
    const frame = requestAnimationFrame(() => {
      codeInputRef.current?.focus();
      codeInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [showJoin]);

  useEffect(() => {
    if (invite?.status !== 'joining' || !invitedCode || !online || inviteUsed) return;
    inviteUsed = true;
    void joinFromInvite(invitedCode, savedName(), { inline: true }).then((result) => {
      if (result.ok) return;
      setInvite({ status: 'failed', reason: result.error.message });
      // A full room or a game under way turns a retry away too, so only a code the server
      // couldn't find opens the popup to check it.
      if (result.error.code === 'ROOM_NOT_FOUND') {
        setJoinError({ field: 'code', message: result.error.message });
        setShowJoin(true);
      }
    });
  }, [invite, online]);

  // Play goes straight to a new lobby under the last name used here, or a random one; the name and
  // avatar set can be changed in the lobby, and computers can fill the empty seats from there.
  const play = async () => {
    if (busy || !online) return;
    const name = savedName() ?? randomPlayerName();
    saveName(name);
    setPending('create');
    await createRoom(name, 'male', DEFAULT_SEATS);
    setPending(null);
  };

  const openJoin = () => {
    setJoinError(null);
    setShowJoin(true);
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    const parsedCode = roomCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setJoinError({ field: 'code', message: CODE_HINT });
      return;
    }
    const typedName = joinName.trim();
    let name: string | null = null;
    if (typedName) {
      const parsedName = playerNameSchema.safeParse(typedName);
      if (!parsedName.success) {
        setJoinError({
          field: 'name',
          message: parsedName.error.issues[0]?.message ?? 'Choose another name',
        });
        return;
      }
      name = parsedName.data;
    }
    setJoinError(null);
    setPending('join');
    // A typed name is used exactly, so a held seat can be taken back from another device.
    const result = name
      ? await joinAs(parsedCode.data, name, 'male')
      : await joinFromInvite(parsedCode.data, null, { inline: true });
    setPending(null);
    if (result.ok) {
      if (name) saveName(name);
      return;
    }
    const field = result.error.code === 'NAME_TAKEN' ? 'name' : 'code';
    setJoinError({ field, message: result.error.message });
  };

  const playLabel = pending === 'create' ? 'Opening a table…' : online ? 'Play' : 'Connecting…';
  const joinLabel = inviteFailed && invitedCode ? `Join ${invitedCode}` : 'Join a room';

  /** The page's two actions. An invite that didn't get through puts joining first. */
  const actions = (where: 'hero' | 'cta') => {
    const playButton = (
      <button
        type="button"
        className={`${inviteFailed ? 'btn-secondary btn-lg' : 'btn-primary btn-hero'} w-full sm:w-auto`}
        disabled={busy || !online}
        aria-describedby={online ? undefined : 'connection-status'}
        onClick={() => void play()}
      >
        <Play size={inviteFailed ? 20 : 26} aria-hidden className="fill-current" />
        {inviteFailed && pending !== 'create' ? 'Start my own room' : playLabel}
      </button>
    );
    const joinButton = (
      <button
        type="button"
        className={`${inviteFailed ? 'btn-primary btn-hero' : 'btn-secondary btn-lg'} w-full sm:w-auto`}
        aria-haspopup="dialog"
        onClick={openJoin}
      >
        <LogIn size={inviteFailed ? 26 : 20} aria-hidden /> {joinLabel}
      </button>
    );
    return (
      <div
        className={`flex w-full max-w-sm flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row ${
          where === 'hero' ? 'lg:justify-start' : ''
        }`}
      >
        {inviteFailed ? joinButton : playButton}
        {inviteFailed ? playButton : joinButton}
      </div>
    );
  };

  return (
    <div className="relative overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-room/75 backdrop-blur-md">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 sm:gap-3"
        >
          <a
            href="#top"
            className="mr-auto flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <PlayingCard
              card={sample({ kind: 'wildDraw10' }, 'cnav')}
              size="xs"
              className="-rotate-12"
            />
            <span className="font-display text-lg leading-none tracking-wide sm:text-xl">
              UNO <span className="text-brass">No Mercy</span>
            </span>
          </a>
          <a href="#how-to-play" className="btn-ghost btn-nav" aria-label="How to play">
            <BookOpen size={16} aria-hidden />
            <span className="hidden sm:inline">How to play</span>
          </a>
          <a href="#cards" className="btn-ghost btn-nav hidden sm:inline-flex">
            Cards
          </a>
          <a href="#faq" className="btn-ghost btn-nav hidden sm:inline-flex">
            FAQ
          </a>
          <button
            type="button"
            className="btn-ghost btn-nav hidden sm:inline-flex"
            aria-haspopup="dialog"
            onClick={openJoin}
          >
            <LogIn size={16} aria-hidden /> Join
          </button>
          <button
            type="button"
            className="btn-primary btn-nav px-4 sm:px-5"
            disabled={busy || !online}
            aria-describedby={online ? undefined : 'connection-status'}
            onClick={() => void play()}
          >
            <Play size={16} aria-hidden className="fill-current" /> {playLabel}
          </button>
        </nav>
      </header>

      <main id="top">
        {/* ---- hero ---- */}
        <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:pb-24">
          <div className="text-center lg:text-left">
            {invite && invitedCode && (
              <p
                role="status"
                aria-live="polite"
                className="notice mb-5 inline-block bg-brass/10 text-brass-soft ring-brass/30"
              >
                {invite.status === 'joining' ? (
                  <>
                    Joining room <span className="font-display tracking-widest">{invitedCode}</span>
                    …
                  </>
                ) : (
                  <>
                    Couldn&apos;t join room{' '}
                    <span className="font-display tracking-widest">{invitedCode}</span>.{' '}
                    {invite.reason}
                  </>
                )}
              </p>
            )}
            <h1 className="font-display leading-[0.82]">
              <span className="block text-[clamp(2.5rem,7vw,4.5rem)] text-chalk/90">UNO</span>
              <span className="landing-wordmark block text-[clamp(4.25rem,13vw,8.5rem)]">
                No Mercy
              </span>
            </h1>
            <p className="landing-lede mx-auto mt-6 lg:mx-0">
              The {DECK_SIZE}-card shedding game that hits back, played right in your browser. Stack
              draws up to +10, swap hands on a 7, and drop out the moment you hold{' '}
              {MERCY_HAND_LIMIT} cards. Bring 2 to {MAX_PLAYERS} friends, or fill the table with
              bots.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 lg:items-start">
              {actions('hero')}
              <p className="text-sm text-chalk/70">
                Free, no sign-up. You get a lobby to invite friends or add bots.
              </p>
              {!online && (
                <p
                  id="connection-status"
                  role="status"
                  className="flex items-center gap-1.5 text-sm text-rose-300"
                >
                  <WifiOff size={14} aria-hidden />
                  {connection === 'disconnected'
                    ? "Can't reach the game server. It may be down; this page keeps trying."
                    : 'Connecting to the game server…'}
                </p>
              )}
            </div>
          </div>

          <ShuffleDeck />
        </section>

        {showJoin && (
          <Modal title="Join a room" onClose={() => setShowJoin(false)}>
            <form className="space-y-4" onSubmit={(e) => void onJoin(e)}>
              <label className="block">
                <span className="mb-1.5 block text-sm text-chalk/75">
                  Room code, from your friend&apos;s lobby or invite link
                </span>
                <input
                  ref={codeInputRef}
                  className="input text-center font-display text-2xl uppercase tracking-[0.35em]"
                  value={code}
                  placeholder={'•'.repeat(ROOM_CODE_LENGTH)}
                  aria-invalid={joinError?.field === 'code'}
                  aria-describedby={joinError?.field === 'code' ? 'join-error' : undefined}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  onChange={(e) => {
                    setCode(readCode(e.target.value));
                    setJoinError(null);
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-chalk/75">
                  Your name{' '}
                  <span className="text-chalk/50">
                    (optional; use the same one to take back a held seat)
                  </span>
                </span>
                <input
                  className="input"
                  value={joinName}
                  maxLength={20}
                  autoComplete="nickname"
                  placeholder="A random name if empty"
                  aria-invalid={joinError?.field === 'name'}
                  aria-describedby={joinError?.field === 'name' ? 'join-error' : undefined}
                  onChange={(e) => {
                    setJoinName(e.target.value);
                    setJoinError(null);
                  }}
                />
              </label>
              {joinError && (
                <p
                  id="join-error"
                  role="alert"
                  className="notice bg-rose-500/15 text-rose-200 ring-rose-400/30"
                >
                  {joinError.message}
                </p>
              )}
              {!online && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-rose-300">
                  <WifiOff size={14} aria-hidden /> Waiting for the game server…
                </p>
              )}
              <button
                type="submit"
                className="btn-primary btn-lg w-full"
                disabled={busy || !online}
              >
                <LogIn size={20} aria-hidden />
                {pending === 'join' ? 'Joining…' : online ? 'Join' : 'Connecting…'}
              </button>
            </form>
          </Modal>
        )}

        {/* ---- how to play ---- */}
        <section
          id="how-to-play"
          aria-labelledby="how-to-play-title"
          className="landing-section border-t border-white/[0.06] bg-felt-950/40"
        >
          <div className="landing-container">
            <h2 id="how-to-play-title" className="landing-h2">
              How to play UNO No Mercy
            </h2>
            <p className="landing-lede">
              Same idea as the classic: match the top card by color, number or symbol, and be the
              first to empty your hand. Then the No Mercy deck takes the brakes off.
            </p>

            <div className="mt-10 grid gap-8 md:grid-cols-3">
              <div>
                <h3 className="landing-h3">The deal</h3>
                <p className="landing-body">
                  Everyone gets {STARTING_HAND_SIZE} cards from a {DECK_SIZE}-card deck. One card is
                  turned face up to start the discard pile, and play goes clockwise.
                </p>
              </div>
              <div>
                <h3 className="landing-h3">Your turn</h3>
                <p className="landing-body">
                  Play one card that matches the top card&apos;s color, number or symbol. Wild cards
                  go on anything, and you name the next color.
                </p>
              </div>
              <div>
                <h3 className="landing-h3">Can&apos;t play? Keep drawing</h3>
                <p className="landing-body">
                  No one-card-and-pass here. You draw until you find a card you can play, and then
                  you must play it. Long dry spells hurt.
                </p>
              </div>
            </div>

            <div className="mt-20 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <h3 className="landing-h3-lg">Stack the draws</h3>
                <p className="landing-body">
                  Hit with a Draw card? Answer with one of equal or higher value, in any color, and
                  the total passes to the next player. The stack only climbs: +2, +4, +6, +10. The
                  player who can&apos;t answer takes every card and loses their turn.
                </p>
                <p className="landing-body">
                  Try it: build a stack, then see what happens when someone has to take it.
                </p>
              </div>
              <StackDemo />
            </div>

            <div className="mt-20 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className="lg:order-2">
                <h3 className="landing-h3-lg">The Mercy Rule</h3>
                <p className="landing-body">
                  Reach {MERCY_HAND_LIMIT} cards and you are knocked out on the spot, even in the
                  middle of taking a stack. From {MERCY_WARNING_AT} cards on, your seat counts down
                  how many are left, so you always know how close you are.
                </p>
                <p className="landing-body">
                  One last chance: if a card you chose to draw is your {MERCY_HAND_LIMIT}th and it
                  can be played, you play it straight away and stay in.
                </p>
              </div>
              <div className="lg:order-1">
                <MercyMeter />
              </div>
            </div>

            <div className="mt-20 grid gap-8 md:grid-cols-3">
              <article className="panel flex gap-4 p-4 sm:p-6">
                <PlayingCard
                  card={sample({ kind: 'number', color: 'yellow', value: 7 }, 'chow7')}
                  size="sm"
                />
                <div>
                  <h3 className="landing-h3">7 swaps hands</h3>
                  <p className="landing-caption">
                    Trade your whole hand with any player you choose. You have to.
                  </p>
                </div>
              </article>
              <article className="panel flex gap-4 p-4 sm:p-6">
                <PlayingCard
                  card={sample({ kind: 'number', color: 'blue', value: 0 }, 'chow0')}
                  size="sm"
                />
                <div>
                  <h3 className="landing-h3">0 passes them on</h3>
                  <p className="landing-caption">
                    Every hand moves one seat along in the direction of play.
                  </p>
                </div>
              </article>
              <article className="panel flex gap-4 p-4 sm:p-6">
                {/* one card left in your hand: the moment to call it */}
                <CardBack size="sm" />
                <div>
                  <h3 className="landing-h3">Call UNO</h3>
                  <p className="landing-caption">
                    Down to one card? Hit UNO. If someone catches you first, you draw 2.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---- the cards ---- */}
        <section id="cards" aria-labelledby="cards-title" className="landing-section">
          <div className="landing-container">
            <h2 id="cards-title" className="landing-h2">
              The action cards
            </h2>
            <p className="landing-lede">
              The No Mercy deck adds Skip Everyone, Discard All, Wild Draw 6, Wild Draw 10, Wild
              Reverse Draw 4 and Color Roulette to the usual Skips, Reverses and Draws. Here is what
              each one does.
            </p>
            <div className="mt-10">
              <CardGallery />
            </div>
          </div>
        </section>

        {/* ---- getting a game going ---- */}
        <section
          id="start"
          aria-labelledby="start-title"
          className="landing-section border-y border-white/[0.06] bg-felt-950/40"
        >
          <div className="landing-container">
            <h2 id="start-title" className="landing-h2">
              From this page to the first deal
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                {
                  title: 'Press Play',
                  text: 'You get a lobby of your own and host the room. Change your name and avatar there.',
                },
                {
                  title: 'Invite the table',
                  text: `Share the invite link or the ${ROOM_CODE_LENGTH}-character room code. Friends join from any browser, phone or laptop.`,
                },
                {
                  title: 'Deal',
                  text: `Press Start. Empty seats can go to computer players, up to ${MAX_COMPUTERS}, so you can play even on your own.`,
                },
              ].map((step, i) => (
                <li key={step.title} className="relative pl-14">
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full font-display text-xl text-brass ring-1 ring-brass/40"
                  >
                    {i + 1}
                  </span>
                  <h3 className="landing-h3">{step.title}</h3>
                  <p className="landing-caption">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex justify-center lg:justify-start">
              <button
                type="button"
                className="btn-primary btn-hero"
                disabled={busy || !online}
                aria-describedby={online ? undefined : 'connection-status'}
                onClick={() => void play()}
              >
                <Play size={26} aria-hidden className="fill-current" /> {playLabel}
              </button>
            </div>
            <p className="landing-body mt-10 max-w-3xl">
              Built for game nights: every move is checked by the game server, so nobody sees a hand
              they shouldn&apos;t and nobody plays a card they can&apos;t. Rooms live in memory
              only. When the last player leaves, the table is gone.
            </p>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" aria-labelledby="faq-title" className="landing-section">
          <div className="landing-container max-w-3xl">
            <h2 id="faq-title" className="landing-h2">
              Questions players ask
            </h2>
            <div className="panel mt-10 divide-y divide-white/[0.08]">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="landing-faq group px-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 font-semibold text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                    <h3>{q}</h3>
                    <ChevronDown
                      size={18}
                      aria-hidden
                      className="shrink-0 text-chalk/50 transition-transform group-open:rotate-180 group-open:text-brass"
                    />
                  </summary>
                  <p className="pb-5 leading-relaxed text-chalk/75">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---- last call ---- */}
        <section aria-labelledby="cta-title" className="px-4 pb-20 pt-4">
          <div className="table-rail mx-auto max-w-4xl rounded-[3rem] p-3 sm:rounded-[999px]">
            <div className="table-felt flex flex-col items-center gap-6 rounded-[2.25rem] px-6 py-12 text-center sm:rounded-[999px]">
              <h2 id="cta-title" className="landing-h2">
                Deal them in. Show no mercy.
              </h2>
              {actions('cta')}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-4 py-8 text-center text-xs leading-relaxed text-chalk/50">
        <p>
          A fan-made browser game with original card artwork. UNO is a trademark of Mattel. This
          game is not affiliated with or endorsed by Mattel.
        </p>
      </footer>
    </div>
  );
}
