import { Download, Megaphone } from 'lucide-react';
import type { ValidActions } from '@nomercy/shared';

interface ActionBarProps {
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

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4">
      <p
        role="status"
        aria-live="polite"
        className={`min-w-0 text-center text-sm drop-shadow sm:text-base ${emphasize ? 'font-semibold text-brass-soft' : 'text-chalk/70'}`}
      >
        {statusText}
      </p>
      <div className="flex items-center gap-2">
        {actions.canAcceptPenalty && (
          <button
            type="button"
            className="btn bg-rose-600 text-white hover:brightness-110"
            onClick={onAccept}
          >
            <Download size={18} /> Take +{pendingTotal ?? 0}
          </button>
        )}
        {actions.canDraw && (
          <button type="button" className="btn-primary" onClick={onDraw}>
            <Download size={18} /> Draw
          </button>
        )}
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
            'btn font-display text-lg tracking-wide',
            actions.canCallUno
              ? 'anim-turn bg-brass text-room'
              : unoArmed
                ? 'bg-brass text-room'
                : 'bg-chalk/10 text-chalk ring-1 ring-chalk/15',
          ].join(' ')}
        >
          <Megaphone size={18} /> {unoLabel}
        </button>
      </div>
    </div>
  );
}
