import { Bot } from 'lucide-react';
import { seatAngle, seatPosition } from '../lib/table-geometry';

export interface PreviewSeat {
  name: string;
  kind: 'you' | 'person' | 'computer';
}

/** A small copy of the table about to be dealt: you on the near edge, everyone else round the rail. */
export function TablePreview({ seats }: { seats: readonly PreviewSeat[] }) {
  // Smaller seats as the table fills, so a full table still fits at phone width.
  const [avatar, icon] =
    seats.length > 14
      ? ['h-5 w-5 text-[10px]', 10]
      : seats.length > 10
        ? ['h-6 w-6 text-xs', 12]
        : ['h-8 w-8 text-sm', 15];
  return (
    <div className="relative mx-auto aspect-[2/1] w-full" aria-hidden>
      <div className="table-rail absolute inset-x-[5%] inset-y-[9%] rounded-[50%] p-2">
        <div className="table-felt h-full w-full rounded-[50%]" />
      </div>
      {seats.map((seat, offset) => (
        <span
          key={offset}
          className={[
            'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-display shadow-seat ring-2 transition-[left,top] duration-300 ease-out',
            avatar,
            seat.kind === 'you'
              ? 'bg-brass text-room ring-chalk'
              : seat.kind === 'person'
                ? 'bg-leather text-chalk ring-chalk/80'
                : 'bg-leather text-chalk ring-walnut-light/70',
          ].join(' ')}
          style={seatPosition(seatAngle(offset, seats.length))}
        >
          {seat.kind === 'computer' ? <Bot size={icon} /> : seat.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
