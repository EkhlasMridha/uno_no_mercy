import { createPortal } from 'react-dom';
import type { ActiveBanner } from '../../hooks/useEventBanners';

const TONE: Record<ActiveBanner['tone'], string> = {
  danger: 'bg-rose-600 ring-rose-200',
  info: 'bg-indigo-600 ring-indigo-200',
  success: 'bg-amber-400 text-felt-950 ring-amber-100',
  warning: 'bg-orange-500 ring-orange-200',
};

export function EventBanner({ banner }: { banner: ActiveBanner | null }) {
  if (!banner) return null;
  return createPortal(
    <div
      key={banner.key}
      aria-hidden
      className={`anim-banner pointer-events-none fixed left-1/2 top-1/2 z-40 rounded-3xl px-8 py-4 text-center shadow-2xl ring-4 ${TONE[banner.tone]}`}
    >
      <p className="font-display text-4xl leading-none sm:text-5xl">{banner.title}</p>
      {banner.subtitle && (
        <p className="mt-1 text-sm font-semibold sm:text-base">{banner.subtitle}</p>
      )}
    </div>,
    document.body,
  );
}
