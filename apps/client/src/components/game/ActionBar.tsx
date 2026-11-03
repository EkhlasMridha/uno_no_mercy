import { Download, Eye, EyeOff, Megaphone } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ValidActions } from '@nomercy/shared';

interface ActionBarProps {
  /** Your avatar, name tag, card count and warnings. */
  seat: ReactNode;
  actions: ValidActions;
  statusText: string;
  pendingTotal: number | null;
  unoArmed: boolean;
  onDraw: () => void;
  onAccept: () => void;
  onUno: () => void;
  /** Privacy mode is on: your cards show their backs until you point at them. */
  privateHand: boolean;
  onTogglePrivacy: () => void;
  /** An action is on its way to the host: Draw and Take wait for the answer. */
  busy?: boolean;
}

export function ActionBar({
  seat,
  actions,
  statusText,
  pendingTotal,
  unoArmed,
  onDraw,
  onAccept,
  onUno,
  privateHand,
  onTogglePrivacy,
  busy = false,
}: ActionBarProps) {
  const unoActive = actions.canCallUno || actions.canDeclareWithPlay;
  const unoLabel = actions.canCallUno ? 'UNO!' : unoArmed ? 'UNO armed' : 'UNO';

  // Your place at the near edge of the table: who you are on the left, Draw (or Take) dead centre
  // under your hand, UNO and Privacy to its right. On a phone the seat sits above the buttons, and
  // Draw and UNO sit side by side at one fixed width each. The turn status is read out to screen
  // readers only.
  return (
    <div className="flex flex-col items-center gap-3 px-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-6">
      <div className="flex justify-center sm:col-start-1 sm:row-start-1 sm:justify-end">{seat}</div>
      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>
      <div className="flex items-center gap-2 sm:contents">
        {/* Like UNO, Draw is always here and dims while you wait, so its spot never empties. A
            penalty swaps it for Take; the two are never offered together. */}
        <div className="flex justify-center sm:col-start-2 sm:row-start-1">
          {actions.canAcceptPenalty ? (
            <button
              type="button"
              className="btn-danger min-w-[8.5rem] whitespace-nowrap py-2 font-display text-lg tracking-wide sm:min-w-[9.5rem] sm:py-2.5 sm:text-xl short:py-2 shortest:min-w-[7.5rem] shortest:text-lg"
              disabled={busy}
              onClick={onAccept}
            >
              <Download size={20} /> Take +{pendingTotal ?? 0}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary min-w-[8.5rem] py-2 font-display text-lg tracking-wide sm:min-w-[9.5rem] sm:py-2.5 sm:text-xl short:py-2 shortest:min-w-[7.5rem] shortest:text-lg"
              disabled={!actions.canDraw || busy}
              onClick={onDraw}
            >
              <Download size={20} /> Draw
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-self-start">
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
              'btn min-w-[8.5rem] whitespace-nowrap py-2 font-display text-lg tracking-wide sm:min-w-[7.5rem] sm:py-2.5 sm:text-xl short:py-2 shortest:min-w-[6.5rem] shortest:text-lg',
              actions.canCallUno
                ? 'anim-turn bg-brass text-room'
                : unoArmed
                  ? 'bg-brass text-room'
                  : 'bg-felt-900/90 text-chalk ring-1 ring-white/15',
            ].join(' ')}
          >
            <Megaphone size={18} /> {unoLabel}
          </button>
          {/* Privacy reveals cards on hover, so it is offered only on screens with a mouse. */}
          <button
            type="button"
            onClick={onTogglePrivacy}
            aria-pressed={privateHand}
            aria-label="Privacy mode"
            title={privateHand ? 'Show your cards' : 'Hide your cards until you point at them'}
            className="btn hidden h-12 w-12 bg-felt-900/90 p-0 text-chalk ring-1 ring-white/15 hover:ring-white/30 aria-pressed:text-brass-soft aria-pressed:ring-brass/60 hoverable:inline-flex short:h-11 short:w-11 shortest:h-10 shortest:w-10"
          >
            {privateHand ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
