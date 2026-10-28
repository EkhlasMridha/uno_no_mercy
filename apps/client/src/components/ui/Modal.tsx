import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  /** Mandatory choices (7 swap target, roulette color) cannot be dismissed. */
  dismissible?: boolean;
  wide?: boolean;
  /** Sit at the top over a backdrop that clears toward the bottom, so your hand stays readable. */
  overHand?: boolean;
}

export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
  wide = false,
  overHand = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus once on open; refocusing on every render would pull focus out of inputs inside. On close,
  // focus goes back to what opened it, such as a button in a picker still open underneath.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (!dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  // Rendered at the end of <body> so no stacking context on the page (the table, the hand) can cover it.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center p-4 ${
        overHand
          ? 'items-start bg-gradient-to-b from-black/75 via-black/45 to-transparent pt-3 sm:pt-[7vh] short:pt-4'
          : 'items-end bg-black/60 backdrop-blur-sm sm:items-center'
      }`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel anim-toast max-h-[90vh] w-full overflow-y-auto p-5 outline-none ${wide || overHand ? 'max-w-2xl' : 'max-w-md'} ${overHand ? 'short:p-4' : ''}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl tracking-wide">{title}</h2>
          {dismissible && onClose && (
            <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
