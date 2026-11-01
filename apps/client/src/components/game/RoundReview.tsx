import { useState } from 'react';
import { Crown, DoorOpen, Eye, Home, RotateCcw, Skull, Trophy, X } from 'lucide-react';
import type { Card, GameStateView, PlayedCardEntry, RoomView } from '@nomercy/shared';
import { sortHand } from '../../lib/cards';
import type { NameLookup } from '../../lib/event-text';
import { nextRound, returnToLobby } from '../../net/actions';
import { PlayingCard } from '../card/PlayingCard';

type Tab = 'hands' | 'played' | 'draw';

const TABS: { id: Tab; label: string }[] = [
  { id: 'hands', label: 'Hands' },
  { id: 'played', label: 'Played' },
  { id: 'draw', label: 'Draw pile' },
];

interface RoundReviewProps {
  room: RoomView;
  game: GameStateView;
  meId: string;
  name: NameLookup;
  /** Brings the result popup back. */
  onShowResults: () => void;
}

/**
 * What is left on screen once the result popup is closed: a bar with the next steps, and a drawer
 * that lays the whole table open (every hand, the plays in order, the draw pile in draw order).
 * The drawer takes no backdrop, so the felt stays visible above it. Everything comes from
 * `game.reveal`, which the server fills only when the round is finished.
 */
export function RoundReview({ room, game, meId, name, onShowResults }: RoundReviewProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('hands');
  const reveal = game.reveal;
  const phase = game.public.phase;
  const winnerId = phase.type === 'finished' ? phase.winnerId : null;
  const isHost = room.hostId === meId;
  const matchOver = Boolean(room.lastResult?.matchWinnerId);

  if (!open) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-felt-950/95 p-2 shadow-lifted ring-1 ring-white/15 backdrop-blur">
          {reveal && (
            <button type="button" className="btn-primary px-4 py-2" onClick={() => setOpen(true)}>
              <Eye size={18} /> Review the table
            </button>
          )}
          <button type="button" className="btn-secondary px-4 py-2" onClick={onShowResults}>
            <Trophy size={18} /> Results
          </button>
          {isHost ? (
            <>
              <button
                type="button"
                className="btn-secondary px-4 py-2"
                onClick={() => void nextRound()}
              >
                <RotateCcw size={18} /> {matchOver ? 'New match' : 'Next round'}
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-2"
                onClick={() => void returnToLobby()}
              >
                <Home size={18} /> Lobby
              </button>
            </>
          ) : (
            <span className="px-2 text-sm text-chalk/70">Waiting for the host…</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Review the table"
      className="panel fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[52vh] w-full max-w-4xl flex-col rounded-b-none pb-[max(env(safe-area-inset-bottom),0.5rem)] shortest:max-h-[60vh]"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div role="tablist" aria-label="What to review" className="flex flex-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === t.id ? 'bg-brass text-room' : 'text-chalk/75 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={onShowResults}>
          <Trophy size={16} /> Results
        </button>
        <button
          type="button"
          className="btn-ghost p-2"
          aria-label="Close the review"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {reveal && tab === 'hands' && (
          <ul className="space-y-3">
            {reveal.hands.map((hand) => {
              const player = game.public.players.find((p) => p.id === hand.playerId);
              return (
                <li key={hand.playerId}>
                  <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    {hand.playerId === winnerId && (
                      <Crown size={14} className="text-brass" aria-label="Winner" />
                    )}
                    {player?.status === 'eliminated' && (
                      <Skull size={14} className="text-rose-300" aria-label="Knocked out" />
                    )}
                    {name(hand.playerId)}
                    {hand.playerId === meId && <span className="text-chalk/50">(you)</span>}
                    <span className="font-normal text-chalk/60">
                      {hand.cards.length === 0
                        ? 'no cards left'
                        : `${hand.cards.length} ${hand.cards.length === 1 ? 'card' : 'cards'}`}
                    </span>
                  </p>
                  <CardRow cards={sortHand(hand.cards)} />
                </li>
              );
            })}
            {reveal.setAside.length > 0 && (
              <li>
                <p className="mb-1 text-sm font-semibold">
                  Set aside{' '}
                  <span className="font-normal text-chalk/60">{reveal.setAside.length} cards</span>
                </p>
                <CardRow cards={reveal.setAside} />
              </li>
            )}
          </ul>
        )}

        {reveal && tab === 'played' && (
          <>
            <p className="mb-2 text-sm text-chalk/70">
              In the order they landed on the pile. The last card is on top.
            </p>
            <NumberedCards
              cards={reveal.discardPile}
              entryOf={(i) => entryAt(game.public.playHistory, reveal.discardPile, i)}
              name={name}
            />
          </>
        )}

        {reveal && tab === 'draw' && (
          <>
            <p className="mb-2 text-sm text-chalk/70">
              {reveal.drawPile.length === 0
                ? 'The draw pile is empty.'
                : 'In the order they would have been drawn: card 1 was next.'}
            </p>
            <NumberedCards cards={reveal.drawPile} name={name} />
          </>
        )}
      </div>

      {isHost && (
        <div className="flex gap-2 border-t border-white/10 px-3 py-2">
          <button
            type="button"
            className="btn-primary flex-1 py-2"
            onClick={() => void nextRound()}
          >
            <RotateCcw size={18} /> {matchOver ? 'New match' : 'Next round'}
          </button>
          <button type="button" className="btn-secondary py-2" onClick={() => void returnToLobby()}>
            <DoorOpen size={18} /> Lobby
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Which play put the pile's card at `index` there. The history lines up with the end of the pile
 * (a reshuffle leaves only its top card), so it is matched from the back and checked by card id.
 */
function entryAt(
  history: readonly PlayedCardEntry[],
  pile: readonly Card[],
  index: number,
): PlayedCardEntry | null {
  const entry = history[index - (pile.length - history.length)];
  return entry && entry.card.id === pile[index]?.id ? entry : null;
}

function CardRow({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {cards.map((card) => (
        <li key={card.id}>
          <PlayingCard card={card} size="sm" />
        </li>
      ))}
    </ul>
  );
}

/** A sequence, so each card carries its place in line (and who played it, where that is known). */
function NumberedCards({
  cards,
  entryOf,
  name,
}: {
  cards: Card[];
  entryOf?: (index: number) => PlayedCardEntry | null;
  name: NameLookup;
}) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-x-2 gap-y-3">
      {cards.map((card, i) => {
        const entry = entryOf?.(i) ?? null;
        return (
          <li key={card.id} className="flex flex-col items-center gap-0.5 text-center">
            <PlayingCard
              card={card}
              size="sm"
              activeColor={entry?.chosenColor ?? null}
              className={entryOf && i === cards.length - 1 ? 'ring-2 ring-amber-300' : ''}
            />
            <span className="text-[11px] font-semibold tabular-nums text-chalk/80">{i + 1}</span>
            {entry && (
              <span className="w-full truncate text-[10px] text-chalk/55">
                {entry.playerId ? name(entry.playerId) : 'Start'}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
