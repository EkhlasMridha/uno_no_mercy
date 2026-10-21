import { useEffect, useMemo, useState } from 'react';
import { BookOpen, DoorOpen, Layers, ScrollText, Skull, Wifi } from 'lucide-react';
import {
  colorOf,
  isWildCard,
  type Card,
  type CardColor,
  type GameStateView,
  type RoomView,
} from '@nomercy/shared';
import { ActionBar } from '../components/game/ActionBar';
import { EventBanner } from '../components/game/EventBanner';
import { EventFeed } from '../components/game/EventFeed';
import { GameTable } from '../components/game/GameTable';
import { PlayerHand } from '../components/game/PlayerHand';
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
import { cardName, COLOR_LABEL } from '../lib/cards';
import { nameLookup } from '../lib/event-text';
import {
  acceptPenalty,
  callUno,
  catchUno,
  chooseRouletteColor,
  drawCards,
  leaveRoom,
  playCard,
} from '../net/actions';
import { pushNotice } from '../state/store';

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
  const banner = useEventBanners(view.log, name);
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const [unoArmed, setUnoArmed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [showPlayed, setShowPlayed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shake, setShake] = useState(0);

  const playable = useMemo(() => new Set(actions.playableCardIds), [actions.playableCardIds]);

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
  useGameSounds(
    view,
    meId,
    !finished && (isMyTurn || actions.canChooseRouletteColor),
    game.version,
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

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* top bar */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-display text-lg tracking-widest">{room.code}</span>
          <span className="hidden text-white/50 sm:inline">Round {room.roundNumber}</span>
          <span className="flex items-center gap-1 text-emerald-300" title="Connected players">
            <Wifi size={14} /> {connectedCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5 text-sm lg:hidden"
            onClick={() => setShowFeed(true)}
          >
            <ScrollText size={16} /> Log
          </button>
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5 text-sm"
            onClick={() => setShowPlayed(true)}
          >
            <Layers size={16} /> <span className="hidden sm:inline">Played</span>
          </button>
          <SoundSettings className="btn-ghost px-2.5 py-1.5 text-sm" />
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5 text-sm"
            onClick={() => setShowRules(true)}
          >
            <BookOpen size={16} /> <span className="hidden sm:inline">Rules</span>
          </button>
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5 text-sm"
            onClick={() => setConfirmLeave(true)}
          >
            <DoorOpen size={16} /> <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* the table, with everyone seated around it */}
          <section aria-label="Table" className="relative min-h-[18rem] flex-1">
            <GameTable
              view={view}
              meId={meId}
              name={name}
              canDraw={actions.canDraw}
              catchableIds={actions.catchablePlayerIds}
              onDraw={() => void drawCards()}
              onCatch={(id) => void catchUno(id)}
              onShowPlayed={() => setShowPlayed(true)}
              targetName={
                view.pendingDraw && current ? (current.id === meId ? 'You' : current.name) : null
              }
            />
          </section>

          {/* your seat: the hand is held over the near edge of the table */}
          <section
            aria-label="Your hand"
            className="relative z-20 -mt-20 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:-mt-28"
          >
            <div key={shake} className={shake ? 'anim-shake' : ''}>
              <PlayerHand
                hand={heldHand}
                playableIds={playable}
                isMyTurn={isMyTurn && !finished}
                onCardClick={onCardClick}
              />
            </div>
            <div className="flex items-center justify-center gap-2 px-4 pb-1 text-sm">
              <span
                className={`rounded-sm px-2 py-0.5 font-semibold shadow transition-colors ${
                  isMyTurn && !finished ? 'anim-turn bg-brass text-room' : 'bg-room/85 text-chalk'
                }`}
              >
                {me?.name ?? 'You'}
              </span>
              <span className="text-chalk/60">{hand.length} cards</span>
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
              {hand.length >= 20 && me?.status === 'active' && (
                <span className="text-rose-300">{25 - hand.length} cards from knockout!</span>
              )}
            </div>
            <ActionBar
              actions={actions}
              statusText={statusText}
              emphasize={isMyTurn || actions.canChooseRouletteColor}
              pendingTotal={view.pendingDraw?.total ?? null}
              unoArmed={unoArmed}
              onDraw={() => void drawCards()}
              onAccept={() => void acceptPenalty()}
              onUno={onUno}
            />
          </section>
        </div>

        <aside className="panel m-3 hidden w-72 flex-col p-3 lg:flex">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/70">
            <ScrollText size={16} /> Action log
          </h2>
          <div className="min-h-0 flex-1">
            <EventFeed log={view.log} name={name} />
          </div>
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
        />
      )}
      {showFeed && (
        <Modal title="Action log" onClose={() => setShowFeed(false)}>
          <div className="max-h-[60vh]">
            <EventFeed log={view.log} name={name} />
          </div>
        </Modal>
      )}
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showPlayed && (
        <PlayedCardsModal
          history={view.playHistory}
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
            <button
              type="button"
              className="btn bg-rose-600 flex-1 text-white"
              onClick={() => void leaveRoom()}
            >
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
