import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Layers, LogOut, ScrollText, Skull, Users } from 'lucide-react';
import {
  colorOf,
  isWildCard,
  MERCY_HAND_LIMIT,
  type Card,
  type CardColor,
  type GameStateView,
  type RoomView,
} from '@nomercy/shared';
import { ActionBar } from '../components/game/ActionBar';
import { EventBanner } from '../components/game/EventBanner';
import { GameTable } from '../components/game/GameTable';
import { LastPlayedCard } from '../components/game/LastPlayedCard';
import { PlayerHand } from '../components/game/PlayerHand';
import { RejoinPrompt } from '../components/game/RejoinPrompt';
import { SidePanel, type SideTab } from '../components/game/SidePanel';
import { avatarGlow, PlayerAvatar } from '../components/PlayerAvatar';
import { SoundSettings } from '../components/SoundSettings';
import { ColorPickerModal } from '../components/modals/ColorPickerModal';
import { DiscardChoiceModal } from '../components/modals/DiscardChoiceModal';
import { GameOverModal } from '../components/modals/GameOverModal';
import { PlayedCardsModal } from '../components/modals/PlayedCardsModal';
import { RulesPanel } from '../components/modals/RulesPanel';
import { SwapTargetModal } from '../components/modals/SwapTargetModal';
import { Modal } from '../components/ui/Modal';
import { useEventBanners } from '../hooks/useEventBanners';
import { useGameSounds } from '../hooks/useGameSounds';
import { useLastPlay } from '../hooks/useLastPlay';
import { avatarsForTable } from '../lib/avatar';
import { cardName, COLOR_LABEL } from '../lib/cards';
import { latestPlaySeq, nameLookup } from '../lib/event-text';
import {
  acceptPenalty,
  callUno,
  catchUno,
  chooseRouletteColor,
  drawCards,
  leaveRoom,
  playCard,
} from '../net/actions';
import { clearNotices, pushNotice, togglePrivateHand, useAppState } from '../state/store';

type PendingChoice = { card: Card; step: 'color' | 'swap' | 'discard' };

export function GamePage({ room, game }: { room: RoomView; game: GameStateView }) {
  const meId = game.me.playerId;
  const view = game.public;
  const actions = game.me.validActions;
  const hand = game.me.hand;
  // Roulette cards stay face up on the table until the reveal ends, then join the fan.
  const onTable =
    view.phase.type === 'rouletteReveal' && view.phase.victimId === meId
      ? new Set(view.phase.revealed.map((c) => c.id))
      : null;
  const heldHand = onTable ? hand.filter((c) => !onTable.has(c.id)) : hand;

  const name = useMemo(() => nameLookup(view.players, meId), [view.players, meId]);
  const avatarOf = useMemo(() => avatarsForTable(view.players), [view.players]);
  const banner = useEventBanners(view.log, name);
  const lastPlay = useLastPlay(view);
  const myLastPlay = lastPlay?.playerId === meId ? lastPlay : null;
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const [unoArmed, setUnoArmed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>('log');
  // Below the lg breakpoint there is no sidebar: the log and player list open in a sheet.
  const [showSheet, setShowSheet] = useState(false);
  const [showPlayed, setShowPlayed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shake, setShake] = useState(0);
  const privateHand = useAppState((s) => s.privateHand);

  const playable = useMemo(() => new Set(actions.playableCardIds), [actions.playableCardIds]);

  // Toasts answer the moment they came from; once someone plays, they're out of date.
  const playSeq = latestPlaySeq(view.log);
  const seenPlaySeq = useRef(playSeq);
  useEffect(() => {
    if (playSeq > seenPlaySeq.current) clearNotices();
    seenPlaySeq.current = playSeq;
  }, [playSeq]);

  useEffect(() => {
    if (!actions.canDeclareWithPlay) setUnoArmed(false);
  }, [actions.canDeclareWithPlay]);
  useEffect(() => {
    if (pending && !playable.has(pending.card.id)) setPending(null);
  }, [pending, playable]);

  const me = view.players.find((p) => p.id === meId);
  const current = view.players.find((p) => p.id === view.currentPlayerId) ?? null;
  const isMyTurn = view.currentPlayerId === meId;
  const finished = view.phase.type === 'finished';
  // The UNO breather after a play: only calling UNO is open (docs/RULES.md §5.9).
  const held = game.turnHoldMs > 0;
  const myMove = isMyTurn && !finished && me?.status === 'active';
  const nudge = useGameSounds(
    view,
    meId,
    !finished && (isMyTurn || actions.canChooseRouletteColor),
    game.version,
    avatarOf,
  );

  const send = async (
    card: Card,
    options: { color?: CardColor; swapTargetId?: string; discardIds?: string[] } = {},
  ) => {
    setPending(null);
    const declareUno = unoArmed && actions.canDeclareWithPlay ? true : undefined;
    await playCard(card.id, { ...options, declareUno });
    setUnoArmed(false);
  };

  const discardExtras = (card: Card): Card[] =>
    card.kind === 'discardAll'
      ? hand.filter((c) => c.id !== card.id && colorOf(c) === card.color)
      : [];

  const explainUnplayable = (): string => {
    if (view.phase.type === 'drawing') {
      if (view.phase.lastChance) {
        return 'You hold 25 cards: only the card you just drew can keep you in. Play it.';
      }
      return actions.drawnPlayableCardId
        ? 'Once you start drawing, only the card you drew last can be played.'
        : "Once you start drawing, only the card you drew last can be played, and it doesn't match. Draw again.";
    }
    if (view.pendingDraw) {
      return `A +${view.pendingDraw.total} penalty is on you: stack +${view.pendingDraw.lastValue} or higher, or take the cards.`;
    }
    if (view.phase.type === 'rouletteColor') return 'Waiting for the Color Roulette color.';
    if (view.phase.type === 'rouletteReveal') return 'Finish drawing for Color Roulette first.';
    return `That card doesn't match ${COLOR_LABEL[view.currentColor]} or ${cardName(view.topCard)}.`;
  };

  const onCardClick = (card: Card) => {
    if (finished) return;
    if (held) {
      pushNotice('info', 'Hold on: everyone gets 2 seconds to call UNO after a play.', 2000);
      return;
    }
    if (!isMyTurn) {
      pushNotice('info', current ? `It's ${current.name}'s turn.` : 'Not your turn.', 2500);
      return;
    }
    if (!playable.has(card.id)) {
      setShake((n) => n + 1);
      pushNotice('error', explainUnplayable(), 3500);
      return;
    }
    if (isWildCard(card) && card.kind !== 'wildColorRoulette') setPending({ card, step: 'color' });
    else if (card.kind === 'number' && card.value === 7 && hand.length > 1)
      setPending({ card, step: 'swap' });
    else if (discardExtras(card).length > 0) setPending({ card, step: 'discard' });
    else void send(card);
  };

  const onUno = () => {
    if (actions.canCallUno) void callUno();
    else if (actions.canDeclareWithPlay) setUnoArmed((a) => !a);
  };

  const statusText = (() => {
    if (finished) return 'Game over';
    if (me?.status === 'eliminated') return 'You are out — watching the rest of the game.';
    if (held) {
      if (actions.canCallUno) return 'One card left — call UNO before anyone catches you!';
      return isMyTurn
        ? 'Your turn in a moment…'
        : `${current?.name ?? 'Next player'} is up in a moment…`;
    }
    if (view.phase.type === 'rouletteColor') {
      return view.phase.victimId === meId
        ? 'Color Roulette! Name a color.'
        : `${name(view.phase.victimId)} is naming a Color Roulette color…`;
    }
    if (view.phase.type === 'rouletteReveal') {
      const colorName = COLOR_LABEL[view.phase.color];
      return view.phase.victimId === meId
        ? `Color Roulette: draw until you hit ${colorName}.`
        : `${name(view.phase.victimId)} is drawing for ${colorName}…`;
    }
    if (isMyTurn) {
      if (view.phase.type === 'drawing') {
        if (view.phase.lastChance) return 'Last chance! Play the card you drew to stay in.';
        return actions.drawnPlayableCardId
          ? 'You drew a playable card — play it or keep drawing.'
          : "That card can't be played — draw again.";
      }
      if (view.pendingDraw) {
        return `+${view.pendingDraw.total} incoming! Stack +${view.pendingDraw.lastValue} or higher, or take them.`;
      }
      if (actions.canDraw && actions.playableCardIds.length === 0) return 'No match — draw a card.';
      return actions.canDraw ? 'Your turn — play a card or draw.' : 'Your turn — play a card.';
    }
    return current ? `Waiting for ${current.name}…` : '';
  })();

  const swapTargets = view.players.filter((p) => actions.swapTargetIds.includes(p.id));
  const connectedCount = view.players.filter((p) => p.connected && p.status === 'active').length;

  const openSide = (tab: SideTab) => {
    setSideTab(tab);
    if (!window.matchMedia('(min-width: 1024px)').matches) setShowSheet(true);
  };

  return (
    // Fixed to the screen: flights and banners in motion must never make the page scroll.
    <div className="lounge-room flex h-[100dvh] flex-col overflow-hidden">
      {/* top bar */}
      <header className="relative z-30 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-felt-950/55 px-3 py-2 backdrop-blur sm:px-4 shortest:py-1">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span
            aria-hidden
            className="hidden -rotate-6 font-display text-[1.75rem] leading-none text-brass shortest:text-2xl drop-shadow-[0_3px_0_rgba(229,56,59,0.85)] md:block"
          >
            No Mercy
          </span>
          <span aria-hidden className="hidden h-9 w-px bg-white/10 md:block" />
          <div className="min-w-0 leading-tight">
            <p className="whitespace-nowrap font-semibold sm:text-lg shortest:text-base">
              Round {room.roundNumber}
            </p>
            <p className="truncate text-xs text-chalk/60 sm:text-sm">
              Room <span className="font-display tracking-widest text-chalk/85">{room.code}</span>
              {room.settings.scoringEnabled && `, first to ${room.matchTarget} points`}
            </p>
          </div>
        </div>
        {/* On a phone the player list sits behind the Log tile's tabs, and the discard heap opens
            the played cards, so those two tiles step aside for room. */}
        <nav aria-label="Game menu" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className="btn-tile max-sm:hidden"
            aria-label={`Players, ${connectedCount} online`}
            onClick={() => openSide('players')}
          >
            <Users size={17} /> <span className="hidden lg:inline">{connectedCount} online</span>
          </button>
          <button
            type="button"
            className="btn-tile lg:hidden"
            aria-label="Game log"
            onClick={() => openSide('log')}
          >
            <ScrollText size={17} /> <span className="hidden lg:inline">Log</span>
          </button>
          <button
            type="button"
            className="btn-tile max-sm:hidden"
            aria-label="Played cards"
            onClick={() => setShowPlayed(true)}
          >
            <Layers size={17} /> <span className="hidden lg:inline">Played</span>
          </button>
          <SoundSettings className="btn-tile" labelClassName="hidden lg:inline" />
          <button
            type="button"
            className="btn-tile"
            aria-label="Rules"
            onClick={() => setShowRules(true)}
          >
            <BookOpen size={17} /> <span className="hidden lg:inline">Rules</span>
          </button>
          <button
            type="button"
            className="btn-danger ml-1 px-3 py-2 text-sm lg:px-4 lg:py-2.5"
            aria-label="Leave game"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut size={17} /> <span className="hidden lg:inline">Leave game</span>
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <RejoinPrompt room={room} meId={meId} />
          {/* the table, with everyone seated around it */}
          <section aria-label="Table" className="relative min-h-[18rem] flex-1 shortest:min-h-0">
            <GameTable
              view={view}
              meId={meId}
              name={name}
              avatarOf={avatarOf}
              canDraw={actions.canDraw}
              catchableIds={actions.catchablePlayerIds}
              onDraw={() => void drawCards()}
              onCatch={(id) => void catchUno(id)}
              onShowPlayed={() => setShowPlayed(true)}
              lastPlay={lastPlay}
              targetName={
                view.pendingDraw && current ? (current.id === meId ? 'You' : current.name) : null
              }
            />
          </section>

          {/* your seat: the hand is held over the near edge of the table */}
          <section
            aria-label="Your hand"
            className="relative z-20 -mt-20 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:-mt-28 short:-mt-16 shortest:-mt-14"
          >
            {/* gold light pools behind the hand while it's your move */}
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[150%] bg-[radial-gradient(ellipse_60%_70%_at_50%_100%,rgba(255,194,46,0.26),rgba(255,194,46,0.08)_45%,transparent_75%)] transition-opacity duration-500 ${
                myMove ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div key={shake} className={shake ? 'anim-shake' : ''}>
              <PlayerHand
                hand={heldHand}
                playableIds={playable}
                isMyTurn={isMyTurn && !finished}
                onCardClick={onCardClick}
                nudge={nudge}
                concealed={privateHand}
              />
            </div>
            <ActionBar
              seat={
                <div className="flex items-center gap-3">
                  <span
                    className={`relative h-11 w-11 shrink-0 rounded-full shortest:h-9 shortest:w-9 ${myMove ? 'anim-turn' : ''}`}
                    style={myMove ? undefined : avatarGlow(avatarOf(meId))}
                  >
                    {myMove && <span aria-hidden className="turn-orbit" />}
                    <PlayerAvatar traits={avatarOf(meId)} className="h-full w-full" />
                    {myLastPlay && <LastPlayedCard key={myLastPlay.seq} play={myLastPlay} />}
                  </span>
                  <div className="flex flex-col items-start gap-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {/* Your turn lights the tag with the gold ring the seats use, leaving Draw the
                          only solid gold in the row. */}
                      <span
                        className={`rounded-full bg-felt-950/90 px-2.5 py-0.5 font-semibold shadow ring-1 ring-white/15 ${
                          myMove ? 'anim-turn text-brass-soft' : 'text-chalk'
                        }`}
                      >
                        {me?.name ?? 'You'}
                      </span>
                      <span className="text-chalk/60">
                        {hand.length} {hand.length === 1 ? 'card' : 'cards'}
                      </span>
                      {me?.uno === 'declared' && (
                        <span className="rounded-sm bg-brass px-1.5 font-display text-xs leading-5 text-room">
                          UNO!
                        </span>
                      )}
                      {me?.status === 'eliminated' && (
                        <span className="flex items-center gap-1 text-rose-300">
                          <Skull size={14} /> Out
                        </span>
                      )}
                      {hand.length >= MERCY_HAND_LIMIT - 5 && me?.status === 'active' && (
                        <span className="font-semibold text-rose-300">
                          {hand.length >= MERCY_HAND_LIMIT
                            ? 'Last chance: play the card you drew!'
                            : `${MERCY_HAND_LIMIT - hand.length} ${
                                MERCY_HAND_LIMIT - hand.length === 1 ? 'card' : 'cards'
                              } from knockout!`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              }
              actions={actions}
              statusText={statusText}
              pendingTotal={view.pendingDraw?.total ?? null}
              unoArmed={unoArmed}
              onDraw={() => void drawCards()}
              onAccept={() => void acceptPenalty()}
              onUno={onUno}
              privateHand={privateHand}
              onTogglePrivacy={togglePrivateHand}
            />
          </section>
        </div>

        <aside className="panel my-3 mr-3 hidden w-80 flex-col p-3 lg:flex">
          <SidePanel
            tab={sideTab}
            onTab={setSideTab}
            view={view}
            meId={meId}
            name={name}
            avatarOf={avatarOf}
          />
        </aside>
      </div>

      <EventBanner banner={banner} />

      {pending?.step === 'color' && (
        <ColorPickerModal
          title="Choose a color"
          description={`${cardName(pending.card)}: pick the color play continues in.`}
          onPick={(color) => void send(pending.card, { color })}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.step === 'swap' && (
        <SwapTargetModal
          players={swapTargets}
          avatarOf={avatarOf}
          onPick={(id) => void send(pending.card, { swapTargetId: id })}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.step === 'discard' && (
        <DiscardChoiceModal
          extras={discardExtras(pending.card)}
          onConfirm={(ids) => void send(pending.card, { discardIds: ids })}
          onCancel={() => setPending(null)}
        />
      )}
      {actions.canChooseRouletteColor && (
        <ColorPickerModal
          title="Color Roulette!"
          description="Name a color. Then draw cards one at a time, face up for everyone to see, until that color shows up. You keep every card you draw. Wild cards don't count."
          onPick={(color) => void chooseRouletteColor(color)}
          // Rendered after this picker, the list opens on top of it; closing it returns here.
          onShowPlayed={() => setShowPlayed(true)}
          playedCount={view.playHistory.length}
        />
      )}
      {showSheet && (
        <Modal title="At the table" onClose={() => setShowSheet(false)}>
          <div className="h-[60vh]">
            <SidePanel
              tab={sideTab}
              onTab={setSideTab}
              view={view}
              meId={meId}
              name={name}
              avatarOf={avatarOf}
            />
          </div>
        </Modal>
      )}
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showPlayed && (
        <PlayedCardsModal
          history={view.playHistory}
          shuffledAway={view.playHistoryStart}
          name={name}
          onClose={() => setShowPlayed(false)}
        />
      )}
      {confirmLeave && (
        <Modal title="Leave the game?" onClose={() => setConfirmLeave(false)}>
          <p className="mb-4 text-sm text-white/70">
            {finished
              ? 'You will leave this room.'
              : 'Leaving forfeits this game: you will be removed from play and cannot rejoin this round.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-danger flex-1" onClick={() => void leaveRoom()}>
              Leave
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setConfirmLeave(false)}
            >
              Stay
            </button>
          </div>
        </Modal>
      )}
      {finished && !confirmLeave && <GameOverModal room={room} game={game} meId={meId} />}
    </div>
  );
}
