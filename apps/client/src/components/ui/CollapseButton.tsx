import { ChevronDown, ChevronUp } from 'lucide-react';

/** The minimize/expand control in the header of a side panel section. */
export function CollapseButton({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  /** What the section is called, e.g. "game log": read out as "Minimize game log". */
  label: string;
  onToggle: () => void;
}) {
  const Icon = open ? ChevronDown : ChevronUp;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? 'Minimize' : 'Expand'} ${label}`}
      title={`${open ? 'Minimize' : 'Expand'} ${label}`}
      onClick={onToggle}
      className="rounded-lg p-1.5 text-chalk/60 transition hover:bg-white/10 hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <Icon size={16} />
    </button>
  );
}
