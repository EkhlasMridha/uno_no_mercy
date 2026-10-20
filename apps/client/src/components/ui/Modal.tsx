import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  /** Mandatory choices (7 swap target, roulette color) cannot be dismissed. */
  dismissible?: boolean;
  wide?: boolean;
}

export function Modal({ title, children, onClose, dismissible = true, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    if (!dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel anim-toast max-h-[90vh] w-full overflow-y-auto p-5 outline-none ${wide ? 'max-w-2xl' : 'max-w-md'}`}
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
    </div>
  );
}
