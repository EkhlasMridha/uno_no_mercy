import { useId } from 'react';
import type {
  AvatarTraits,
  EyeStyle,
  HairStyle,
  MouthStyle,
  PersonAvatar,
  RobotAvatar,
} from '../lib/avatar';

const INK = '#2a1a1e';
const LIPS = '#a3161a';
// Eight edge marks round the rim, like a poker chip: dash + gap = 2π·30.25 / 8.
const RIM_DASH = '6 17.76';

interface PlayerAvatarProps {
  /** This player's face, from `avatarsForTable`. */
  traits: AvatarTraits;
  className?: string;
}

/** A cartoon portrait printed on a poker chip. Decorative: the seat around it carries the label. */
export function PlayerAvatar({ traits, className = '' }: PlayerAvatarProps) {
  const clip = useId();

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="28.5" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="32" fill={traits.chip} />
      <g clipPath={`url(#${clip})`}>
        {traits.kind === 'robot' ? <Robot t={traits} /> : <Person t={traits} />}
      </g>
      <circle
        cx="32"
        cy="32"
        r="30.25"
        fill="none"
        stroke="#000"
        strokeOpacity="0.32"
        strokeWidth="3.5"
      />
      <circle
        cx="32"
        cy="32"
        r="30.25"
        fill="none"
        stroke="#f2e8da"
        strokeOpacity="0.75"
        strokeWidth="3.5"
        strokeDasharray={RIM_DASH}
        transform="rotate(-11 32 32)"
      />
      <circle cx="32" cy="32" r="28.5" fill="none" stroke="#000" strokeOpacity="0.25" />
    </svg>
  );
}

function Person({ t }: { t: PersonAvatar }) {
  return (
    <>
      <HairBack style={t.hairStyle} color={t.hair} hat={t.hat} long={t.gender === 'female'} />
      <path d="M10 64C11 53 20 48 32 48S53 53 54 64Z" fill={t.shirt} />
      <path
        d="M28 48.4 32 53l4-4.6"
        fill="none"
        stroke="#000"
        strokeOpacity="0.22"
        strokeWidth="1.4"
      />
      <rect x="28.5" y="40" width="7" height="9" rx="2" fill={t.skin} />
      <rect x="28.5" y="40" width="7" height="4" fill="#000" fillOpacity="0.12" />
      <circle cx="19.5" cy="32" r="3" fill={t.skin} />
      <circle cx="44.5" cy="32" r="3" fill={t.skin} />
      <ellipse cx="32" cy="31" rx="12.5" ry="13.5" fill={t.skin} />
      {t.earrings && (
        <g fill="#e7c886" stroke={INK} strokeOpacity="0.4" strokeWidth="0.5">
          <circle cx="19.3" cy="36.4" r="1.4" />
          <circle cx="44.7" cy="36.4" r="1.4" />
        </g>
      )}

      {t.blush && (
        <g fill="#e5383b" fillOpacity="0.25">
          <ellipse cx="24.5" cy="36" rx="2.4" ry="1.4" />
          <ellipse cx="39.5" cy="36" rx="2.4" ry="1.4" />
        </g>
      )}
      {t.freckles && (
        <g fill={INK} fillOpacity="0.35">
          {[24.5, 26, 23.5, 39.5, 38, 40.5].map((x, i) => (
            <circle key={i} cx={x} cy={[35, 36.2, 36.5][i % 3]} r="0.55" />
          ))}
        </g>
      )}

      <g fill="none" stroke={t.hair} strokeWidth="1.2" strokeLinecap="round">
        <path d="M25 27.4q2-1.2 4 0M35 27.4q2-1.2 4 0" />
      </g>
      <Eyes style={t.eyes} lashes={t.gender === 'female'} />
      <path
        d="M32 32.5q1.6 2.4-.4 3.4"
        fill="none"
        stroke={INK}
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {t.beard && (
        <>
          <path
            d="M19.5 32C20 44 25.5 49.5 32 49.5S44 44 44.5 32C42.5 38 38.5 41.5 32 41.5S21.5 38 19.5 32Z"
            fill={t.hair}
          />
          <path d="M28 36.8q4-2.2 8 0-4 1.2-8 0Z" fill={t.hair} />
        </>
      )}
      <Mouth style={t.mouth} lips={t.gender === 'female' ? LIPS : INK} />

      <HairFront style={t.hairStyle} color={t.hair} hat={t.hat} />

      {t.glasses && (
        <g fill="#fff" fillOpacity="0.12" stroke={INK} strokeWidth="1.3" strokeLinecap="round">
          <circle cx="27" cy="31.5" r="4" />
          <circle cx="37" cy="31.5" r="4" />
          <path d="M31 31q1-.8 2 0M23 31l-3.2-.5M41 31l3.2-.5" fill="none" />
        </g>
      )}
    </>
  );
}

function HairBack({
  style,
  color,
  hat,
  long,
}: {
  style: HairStyle;
  color: string;
  hat: string;
  /** Long hair: falls from under a beanie, and curls grow out instead of staying cropped. */
  long: boolean;
}) {
  switch (style) {
    case 'beanie':
      return long ? <HairBack style="long" color={color} hat={hat} long /> : null;
    case 'ponytail':
      return (
        <g>
          <path d="M38 16c9-1 13 6 12 15-1 8-4 14-8 18 1-7 1-13-1-18-1-5-2-9-3-15Z" fill={color} />
          <circle cx="44" cy="19" r="2" fill={hat} />
        </g>
      );
    case 'pigtails':
      return (
        <g>
          <ellipse cx="14.5" cy="35" rx="4.5" ry="7" fill={color} />
          <ellipse cx="49.5" cy="35" rx="4.5" ry="7" fill={color} />
          <circle cx="16.5" cy="28.5" r="1.8" fill={hat} />
          <circle cx="47.5" cy="28.5" r="1.8" fill={hat} />
        </g>
      );
    case 'long':
      return (
        <path
          d="M17.5 31C16.5 18 24 14 32 14S47.5 18 46.5 31l1 21c-4.5 2-8.5 0-9.5-4H26c-1 4-5 6-9.5 4Z"
          fill={color}
        />
      );
    case 'bob':
      return (
        <path
          d="M17 33C15.5 18 24 13.5 32 13.5S48.5 18 47 33l.5 9c-2.5 2-5.5 1-6.5-1.5H23c-1 2.5-4 3.5-6.5 1.5Z"
          fill={color}
        />
      );
    case 'curls':
      return long ? (
        <g fill={color}>
          <circle cx="32" cy="24" r="15.5" />
          <circle cx="19" cy="26" r="6" />
          <circle cx="45" cy="26" r="6" />
          <circle cx="24" cy="14.5" r="6.5" />
          <circle cx="40" cy="14.5" r="6.5" />
        </g>
      ) : (
        <g fill={color}>
          <circle cx="24" cy="18" r="6" />
          <circle cx="32" cy="15.5" r="6.5" />
          <circle cx="40" cy="18" r="6" />
          <circle cx="20.5" cy="24" r="4.5" />
          <circle cx="43.5" cy="24" r="4.5" />
        </g>
      );
    case 'bun':
      return <circle cx="32" cy="13" r="5.5" fill={color} />;
    case 'crop':
    case 'swoop':
    case 'mohawk':
    case 'bald':
    case 'spikes':
      return null;
  }
}

function HairFront({ style, color, hat }: { style: HairStyle; color: string; hat: string }) {
  switch (style) {
    case 'crop':
    case 'bun':
    case 'ponytail':
      return (
        <path d="M19 31C18 20 24 15 32 15s14 5 13 16c-1.5-6-6-9-13-9s-11.5 3-13 9Z" fill={color} />
      );
    case 'swoop':
      return (
        <path d="M19 32C17 19 26 14 34 15s13 7 11 17c-1-6-4-9-7-10-4 3-12 4-19 10Z" fill={color} />
      );
    case 'long':
    case 'pigtails':
      return (
        <path
          d="M19.5 30c0-10 5.5-14 12.5-14s12.5 4 12.5 14c-2.5-6-8-7.5-12.5-7-4.5-.5-10 1-12.5 7Z"
          fill={color}
        />
      );
    case 'curls':
      return (
        <path
          d="M19.5 29c-.5-7 3.5-11 7.5-10.5 1.5-2 8.5-2 10 0 4-.5 8 3.5 7.5 10.5-2.5-4-4.5-5-7-4.5-1.5-1.5-9.5-1.5-11 0-2.5-.5-4.5.5-7 4.5Z"
          fill={color}
        />
      );
    case 'mohawk':
      return <path d="M28.5 22C28 14 30 8 32 7s4 7 3.5 15c-1-1-6-1-7 0Z" fill={color} />;
    case 'spikes':
      return (
        <path
          d="M19 30l-.5-10 4 1 .5-7 4 4 2-6.5 3 5.5 3-5.5 2 6.5 4-4 .5 7 4-1-.5 10c-2-6-7-8.5-13-8.5S21 24 19 30Z"
          fill={color}
        />
      );
    case 'bob':
      return <path d="M19.5 26c.5-7 6-10 12.5-10s12 3 12.5 10Z" fill={color} />;
    case 'bald':
      return <ellipse cx="27" cy="21" rx="3" ry="1.6" fill="#fff" fillOpacity="0.3" />;
    case 'beanie':
      return (
        <g>
          <circle cx="32" cy="8.5" r="3.2" fill={hat} />
          <circle cx="32" cy="8.5" r="3.2" fill="#fff" fillOpacity="0.3" />
          <path d="M18.5 25c0-11 6.5-16 13.5-16s13.5 5 13.5 16Z" fill={hat} />
          <rect x="17.5" y="21" width="29" height="6" rx="3" fill={hat} />
          <rect x="17.5" y="21" width="29" height="6" rx="3" fill="#000" fillOpacity="0.18" />
        </g>
      );
  }
}

function Eyes({ style, lashes }: { style: EyeStyle; lashes: boolean }) {
  return (
    <>
      <EyeShapes style={style} />
      {lashes && (
        <path
          d="M24.6 30.4l-1.5-1.1M39.4 30.4l1.5-1.1"
          fill="none"
          stroke={INK}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function EyeShapes({ style }: { style: EyeStyle }) {
  const arc = (x: number) => (
    <path
      d={`M${x - 2} 32q2-2.4 4 0`}
      fill="none"
      stroke={INK}
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  );
  const dot = (x: number) => <circle cx={x} cy="31.5" r="1.7" fill={INK} />;
  switch (style) {
    case 'dots':
      return (
        <>
          {dot(27)}
          {dot(37)}
        </>
      );
    case 'happy':
      return (
        <>
          {arc(27)}
          {arc(37)}
        </>
      );
    case 'wink':
      return (
        <>
          {dot(27)}
          {arc(37)}
        </>
      );
    case 'wide':
      return (
        <>
          {[27, 37].map((x) => (
            <g key={x}>
              <circle cx={x} cy="31.5" r="2.7" fill="#fff" />
              <circle cx={x + 0.4} cy="31.8" r="1.4" fill={INK} />
            </g>
          ))}
        </>
      );
  }
}

function Mouth({ style, lips }: { style: MouthStyle; lips: string }) {
  const line = { fill: 'none', stroke: lips, strokeWidth: 1.5, strokeLinecap: 'round' as const };
  switch (style) {
    case 'smile':
      return <path d="M28.5 37.5q3.5 3.2 7 0" {...line} />;
    case 'smirk':
      return <path d="M29 38.8q3.8 1.2 6.8-1.8" {...line} />;
    case 'open':
      return <ellipse cx="32" cy="39" rx="1.9" ry="2.3" fill={INK} />;
    case 'grin':
      return (
        <>
          <path d="M27.5 37h9q-.6 5.2-4.5 5.2T27.5 37Z" fill={INK} />
          <path d="M28.3 37.4h7.4v1.5h-7.4Z" fill="#fff" />
        </>
      );
  }
}

function Robot({ t }: { t: RobotAvatar }) {
  return (
    <>
      <path d="M12 64c1-10 9-14 20-14s19 4 20 14Z" fill={t.plating} />
      <path d="M12 64c1-10 9-14 20-14s19 4 20 14Z" fill="#000" fillOpacity="0.22" />
      <rect x="28" y="41" width="8" height="10" fill={t.plating} />
      <rect x="28" y="41" width="8" height="10" fill="#000" fillOpacity="0.3" />
      <path d="M32 17v-7" stroke={t.plating} strokeWidth="2" />
      <circle cx="32" cy="9" r="2.6" fill={t.glow} />
      <rect x="15.5" y="27" width="4" height="9" rx="1.5" fill={t.plating} />
      <rect x="44.5" y="27" width="4" height="9" rx="1.5" fill={t.plating} />
      <rect x="15.5" y="27" width="4" height="9" rx="1.5" fill="#000" fillOpacity="0.2" />
      <rect x="44.5" y="27" width="4" height="9" rx="1.5" fill="#000" fillOpacity="0.2" />
      <rect x="18.5" y="16.5" width="27" height="27" rx="7" fill={t.plating} />
      <rect x="21.5" y="18.5" width="10" height="2" rx="1" fill="#fff" fillOpacity="0.45" />
      <g fill={INK} fillOpacity="0.35">
        <circle cx="21.5" cy="40.5" r="0.8" />
        <circle cx="42.5" cy="40.5" r="0.8" />
      </g>
      <rect x="22" y="22.5" width="20" height="14" rx="4" fill="#17151f" />
      {t.eyes === 'round' && (
        <g fill={t.glow}>
          <circle cx="27.5" cy="29" r="2.3" />
          <circle cx="36.5" cy="29" r="2.3" />
        </g>
      )}
      {t.eyes === 'bars' && (
        <g fill={t.glow}>
          <rect x="25" y="28" width="5" height="2.2" rx="1.1" />
          <rect x="34" y="28" width="5" height="2.2" rx="1.1" />
        </g>
      )}
      {t.eyes === 'happy' && (
        <path
          d="M25.5 30q2-2.6 4 0M34.5 30q2-2.6 4 0"
          fill="none"
          stroke={t.glow}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
      <path
        d="M29 33.6h6"
        stroke={t.glow}
        strokeOpacity="0.7"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  );
}
