import { AlertTriangle, Info, X } from 'lucide-react';
import { dismissNotice, useAppState } from '../state/store';

export function Toasts() {
  const notices = useAppState((s) => s.notices);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`anim-toast pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-2.5 text-sm shadow-xl ring-1 ${
            n.kind === 'error' ? 'bg-rose-950/95 ring-rose-400/40' : 'bg-felt-800/95 ring-white/15'
          }`}
        >
          {n.kind === 'error' ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0 text-sky-300" />
          )}
          <span className="flex-1">{n.text}</span>
          <button
            type="button"
            onClick={() => dismissNotice(n.id)}
            aria-label="Dismiss"
            className="text-white/60 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
