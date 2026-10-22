import { useState } from 'react';
import { Bot, Users } from 'lucide-react';
import { MAX_COMPUTERS, type RoomView } from '@nomercy/shared';
import { startGame } from '../../net/actions';
import { TablePreview, type PreviewSeat } from '../TablePreview';
import { Modal } from '../ui/Modal';

interface FillSeatsModalProps {
  room: RoomView;
  meId: string;
  onClose: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Asked when the host starts with seats still open: fill them with computers, or start as is. */
export function FillSeatsModal({ room, meId, onClose }: FillSeatsModalProps) {
  const [busy, setBusy] = useState(false);
  const people = room.players.length;
  const open = room.maxPlayers - people;
  const computers = Math.min(open, MAX_COMPUTERS);
  const canStartAsIs = people >= room.minPlayers;

  // Seats in turn order from yours; computers sit after the people, as the server deals them.
  const mine = Math.max(
    room.players.findIndex((p) => p.id === meId),
    0,
  );
  const seats: PreviewSeat[] = [
    ...[...room.players.slice(mine), ...room.players.slice(0, mine)].map((p) => ({
      name: p.name,
      kind: p.id === meId ? ('you' as const) : ('person' as const),
    })),
    ...Array.from({ length: computers }, () => ({ name: '', kind: 'computer' as const })),
  ];

  const start = async (fill: boolean) => {
    setBusy(true);
    const result = await startGame(fill);
    setBusy(false);
    if (!result.ok) onClose();
  };

  const them = open === 1 ? 'it' : 'them';
  return (
    <Modal title="Fill the empty seats?" onClose={onClose}>
      <div className="space-y-5">
        <TablePreview seats={seats} />
        <p className="text-sm text-white/70">
          {open === 1 ? '1 seat is' : `${open} seats are`} still open.{' '}
          {canStartAsIs
            ? `Fill ${them} with computers, named at random, or start with just the ${people} of you.`
            : `Fill ${them} with computers, named at random, to start playing.`}
          {computers < open &&
            ` Computers fill up to ${MAX_COMPUTERS} seats, so ${plural(open - computers, 'seat')} stay${open - computers === 1 ? 's' : ''} empty.`}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-primary w-full py-3 text-lg"
            disabled={busy}
            onClick={() => void start(true)}
          >
            <Bot size={20} /> Add {plural(computers, 'computer')} and start
          </button>
          {canStartAsIs && (
            <button
              type="button"
              className="btn-secondary w-full py-3"
              disabled={busy}
              onClick={() => void start(false)}
            >
              <Users size={18} /> Start with {people} players
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
