import { Crown, DoorOpen, Eye, Home, RotateCcw, Skull } from 'lucide-react';
import type { GameStateView, RoomView } from '@nomercy/shared';
import { leaveRoom, nextRound, returnToLobby } from '../../net/actions';
import { Modal } from '../ui/Modal';

interface GameOverModalProps {
  room: RoomView;
  game: GameStateView;
  meId: string;
  /** Closes the popup to look over the table; the bar under it brings the results back. */
  onClose: () => void;
}

/**
 * The end of a round on one screen: who won and why, then a single standings list that carries
 * each player's last hand and (with scoring on) their match score. It never scrolls for an
 * ordinary table; only a very full room scrolls the list itself.
 */
export function GameOverModal({ room, game, meId, onClose }: GameOverModalProps) {
  const phase = game.public.phase;
  if (phase.type !== 'finished') return null;
  const result = room.lastResult;
  const scoring = room.settings.scoringEnabled && result !== null;
  const isHost = room.hostId === meId;
  const winner = game.public.players.find((p) => p.id === phase.winnerId);
  const iWon = phase.winnerId === meId;
  const matchWinner = result?.matchWinnerId
    ? room.players.find((p) => p.id === result.matchWinnerId)
    : null;
  const scoreOf = (id: string) => room.players.find((p) => p.id === id)?.score ?? 0;
  // The winner leads; then the match score (or the fewest cards left when nothing is scored).
  const standings = [...game.public.players].sort((a, b) => {
    if (a.id === phase.winnerId) return -1;
    if (b.id === phase.winnerId) return 1;
    if (scoring) return scoreOf(b.id) - scoreOf(a.id);
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.handCount - b.handCount;
  });
  const knockedOut = phase.reason === 'peopleOut';

  return (
    <Modal title={iWon ? 'You win!' : 'Round over'} onClose={onClose} extraWide>
      <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-3 sm:p-4">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full sm:h-16 sm:w-16 ${
            knockedOut ? 'bg-rose-500/20 text-rose-300' : 'bg-brass/20 text-brass'
          }`}
        >
          {knockedOut ? <Skull size={30} /> : <Crown size={30} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl leading-tight sm:text-3xl">
            {winner ? (iWon ? 'Victory!' : `${winner.name} wins`) : 'No winner'}
          </p>
          <p className="text-sm text-chalk/70">
            {phase.reason === 'emptyHand'
              ? 'Played their final card.'
              : phase.reason === 'peopleOut'
                ? 'Everyone at the table was knocked out.'
                : 'Last player standing.'}
          </p>
        </div>
        {scoring && result.pointsAwarded > 0 && (
          <div className="shrink-0 text-right">
            <p className="font-display text-2xl leading-none text-brass sm:text-3xl">
              +{result.pointsAwarded}
            </p>
            <p className="mt-1 text-xs text-chalk/60">
              {result.cardPoints} cards
              {result.knockoutBonus > 0 && `, ${result.knockoutBonus} knockouts`}
            </p>
          </div>
        )}
      </div>

      {matchWinner && (
        <p className="mt-3 rounded-xl bg-brass/15 px-3 py-2 text-center font-display text-lg text-brass">
          {matchWinner.name} wins the match!
        </p>
      )}

      <ol className="scroll-thin mt-3 max-h-[34vh] space-y-1 overflow-y-auto text-sm short:max-h-[26vh] shortest:max-h-[16vh]">
        {standings.map((p, i) => {
          const score = scoreOf(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
              <span className="w-4 text-center text-xs font-semibold tabular-nums text-chalk/50">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {p.id === phase.winnerId && <Crown size={14} className="shrink-0 text-brass" />}
                {p.status === 'eliminated' && (
                  <Skull size={14} className="shrink-0 text-rose-300" />
                )}
                <span className="truncate font-semibold">{p.name}</span>
                {p.id === meId && <span className="shrink-0 text-chalk/50">(you)</span>}
              </span>
              <span className="shrink-0 text-chalk/60">
                {p.status === 'eliminated'
                  ? p.eliminationReason === 'mercy'
                    ? 'Knocked out'
                    : 'Left'
                  : p.handCount === 0
                    ? 'Out of cards'
                    : `${p.handCount} left`}
              </span>
              {scoring && (
                <span className="w-24 shrink-0 text-right sm:w-28">
                  <span className="font-semibold tabular-nums">{score}</span>
                  <span className="text-chalk/50"> / {room.matchTarget}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-brass"
                      style={{ width: `${Math.min(100, (score / room.matchTarget) * 100)}%` }}
                    />
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {isHost ? (
          <button
            type="button"
            className="btn-primary col-span-2 sm:min-w-[11rem] sm:flex-1"
            onClick={() => void nextRound()}
          >
            <RotateCcw size={18} /> {matchWinner ? 'New match' : 'Next round'}
          </button>
        ) : (
          <p className="col-span-2 self-center text-center text-sm text-chalk/60 sm:flex-1 sm:text-left">
            Waiting for the host…
          </p>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          <Eye size={18} /> Review the table
        </button>
        {isHost && (
          <button type="button" className="btn-secondary" onClick={() => void returnToLobby()}>
            <Home size={18} /> Lobby
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => void leaveRoom()}>
          <DoorOpen size={18} /> Leave
        </button>
      </div>
    </Modal>
  );
}
