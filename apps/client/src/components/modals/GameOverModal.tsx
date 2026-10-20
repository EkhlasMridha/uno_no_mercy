import { Crown, DoorOpen, Home, RotateCcw, Skull } from 'lucide-react';
import type { GameStateView, RoomView } from '@nomercy/shared';
import { leaveRoom, nextRound, returnToLobby } from '../../net/actions';
import { Modal } from '../ui/Modal';

interface GameOverModalProps {
  room: RoomView;
  game: GameStateView;
  meId: string;
}

export function GameOverModal({ room, game, meId }: GameOverModalProps) {
  const phase = game.public.phase;
  if (phase.type !== 'finished') return null;
  const result = room.lastResult;
  const isHost = room.hostId === meId;
  const winner = game.public.players.find((p) => p.id === phase.winnerId);
  const iWon = phase.winnerId === meId;
  const matchWinner = result?.matchWinnerId
    ? room.players.find((p) => p.id === result.matchWinnerId)
    : null;
  const ranked = [...room.players].filter((p) => !p.departed).sort((a, b) => b.score - a.score);

  return (
    <Modal title={iWon ? 'You win!' : 'Game over'} dismissible={false}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
          <Crown size={34} />
        </div>
        <p className="font-display text-3xl">
          {winner ? (iWon ? 'Victory!' : `${winner.name} wins`) : 'No winner'}
        </p>
        <p className="text-white/70">
          {phase.reason === 'emptyHand'
            ? 'Played their final card.'
            : 'Last player standing — everyone else was knocked out.'}
        </p>
      </div>

      <ul className="mt-4 space-y-1 text-sm">
        {game.public.players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
          >
            <span className="flex items-center gap-2">
              {p.id === phase.winnerId && <Crown size={14} className="text-amber-300" />}
              {p.status === 'eliminated' && <Skull size={14} className="text-rose-300" />}
              {p.name}
              {p.id === meId && <span className="text-white/50">(you)</span>}
            </span>
            <span className="text-white/60">
              {p.status === 'eliminated'
                ? p.eliminationReason === 'mercy'
                  ? 'Knocked out'
                  : 'Left'
                : `${p.handCount} cards left`}
            </span>
          </li>
        ))}
      </ul>

      {room.settings.scoringEnabled && result && (
        <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm">
          <p className="mb-2 font-semibold">
            +{result.pointsAwarded} points ({result.cardPoints} from cards, {result.knockoutBonus}{' '}
            knockout bonus)
          </p>
          <ol className="space-y-1">
            {ranked.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                <span className="tabular-nums">
                  {p.score} / {room.matchTarget}
                </span>
              </li>
            ))}
          </ol>
          {matchWinner && (
            <p className="mt-2 font-display text-lg text-amber-300">
              {matchWinner.name} wins the match!
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {isHost ? (
          <>
            <button type="button" className="btn-primary flex-1" onClick={() => void nextRound()}>
              <RotateCcw size={18} /> {matchWinner ? 'New match' : 'Next round'}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => void returnToLobby()}
            >
              <Home size={18} /> Back to lobby
            </button>
          </>
        ) : (
          <p className="flex-1 self-center text-center text-sm text-white/60">
            Waiting for the host…
          </p>
        )}
        <button type="button" className="btn-ghost" onClick={() => void leaveRoom()}>
          <DoorOpen size={18} /> Leave
        </button>
      </div>
    </Modal>
  );
}
