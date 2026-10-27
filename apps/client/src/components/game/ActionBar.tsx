import { Download, Megaphone, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ValidActions } from '@nomercy/shared';

interface ActionBarProps {
  /** Your name tag, card count and warnings, shown with the status. */
  seat: ReactNode;
  actions: ValidActions;
  statusText: string;
  emphasize: boolean;
  pendingTotal: number | null;
  unoArmed: boolean;
  onDraw: () => void;
  onAccept: () => void;
  onUno: () => void;
}

export function ActionBar({
  seat,
  actions,
  statusText,
  emphasize,
  pendingTotal,
  unoArmed,
  onDraw,
  onAccept,
  onUno,
}: ActionBarProps) {
  const unoActive = actions.canCallUno || actions.canDeclareWithPlay;
  const unoLabel = actions.canCallUno ? 'UNO!' : unoArmed ? 'UNO armed' : 'UNO';

  // Your place at the near edge of the table: who you are and what's happening on the left, Draw (or
  // Take) dead centre under your hand, UNO to its right. Draw keeps that spot however long the status
  // is and whether or not it's your move. The status always has room for two lines, so a longer one
  // never changes the strip's height and nudges the buttons or your hand. On a phone the seat and
  // status stack above the buttons, and Draw and UNO sit side by side at one fixed width each.
  return (
    <div className="flex flex-col items-center gap-3 px-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-6">
      <div className="flex w-full flex-col items-center gap-0.5 text-center sm:col-start-1 sm:row-start-1 sm:min-h-[4.75rem] sm:items-end sm:justify-center sm:text-right">
        {seat}
        <p
          role="status"
          aria-live="polite"
          className={`mt-1 flex min-h-10 items-center gap-2.5 rounded-2xl bg-felt-950/75 px-3.5 py-1.5 text-left text-sm ring-1 backdrop-blur-sm sm:text-base ${
            emphasize
              ? 'font-semibold text-brass-soft ring-brass/40'
              : 'text-chalk/75 ring-white/10'
          }`}
        >
          <MessageCircle size={17} aria-hidden className="shrink-0 opacity-80" />
          {statusText}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:contents">
        {/* Like UNO, Draw is always here and dims while you wait, so its spot never empties. A
            penalty swaps it for Take; the two are never offered together. */}
        <div className="flex justify-center sm:col-start-2 sm:row-start-1">
          {actions.canAcceptPenalty ? (
            <button
              type="button"
              className="btn-danger min-w-[9.5rem] whitespace-nowrap font-display text-xl tracking-wide sm:min-w-[11rem] sm:py-3 sm:text-2xl"
              onClick={onAccept}
            >
              <Download size={22} /> Take +{pendingTotal ?? 0}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary min-w-[9.5rem] font-display text-xl tracking-wide sm:min-w-[11rem] sm:py-3 sm:text-2xl"
              disabled={!actions.canDraw}
              onClick={onDraw}
            >
              <Download size={22} /> Draw
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onUno}
          disabled={!unoActive}
          aria-pressed={actions.canDeclareWithPlay ? unoArmed : undefined}
          title={
            actions.canDeclareWithPlay
              ? 'Arm UNO so it is declared together with your next card'
              : 'Call UNO when you have one card left'
          }
          className={[
            // Fixed width on a phone, where it sits beside Draw, so "UNO armed" can't shift the pair.
            'btn min-w-[9.5rem] whitespace-nowrap font-display text-xl tracking-wide sm:col-start-3 sm:row-start-1 sm:min-w-[8.5rem] sm:justify-self-start sm:py-3',
            actions.canCallUno
              ? 'anim-turn bg-brass text-room'
              : unoArmed
                ? 'bg-brass text-room'
                : 'bg-felt-900/90 text-chalk ring-1 ring-white/15',
          ].join(' ')}
        >
          <Megaphone size={18} /> {unoLabel}
        </button>
      </div>
    </div>
  );
}
