import { createContext, useContext, useId, type CSSProperties, type ReactNode } from 'react';
import type { AvatarTraits, PersonAvatar, RobotAvatar } from '../lib/avatar';

const INK = '#2a1a1e';
const MOUTH = '#5a1620';
const TONGUE = '#e8606a';
const BLUSH = '#ff6b6b';
const PINK = '#f4a0b4';

/** Gradient ids for the soft light and shadow laid over every rounded shape. */
const Shading = createContext({ hi: '', lo: '' });

interface PlayerAvatarProps {
  /** This player's face, from `avatarsForTable`. */
  traits: AvatarTraits;
  className?: string;
}

/**
 * A cartoon character on a glowing disc, shoulders up. Decorative: the seat around it carries
 * the label.
 */
export function PlayerAvatar({ traits, className = '' }: PlayerAvatarProps) {
  const uid = useId();
  const ids = { clip: `${uid}c`, bg: `${uid}b`, hi: `${uid}h`, lo: `${uid}l` };
  const { backdrop } = traits;

  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id={ids.clip}>
          <circle cx="64" cy="64" r="59.5" />
        </clipPath>
        <radialGradient id={ids.bg} cx="0.42" cy="0.36" r="0.7">
          <stop offset="0" stopColor={backdrop.light} />
          <stop offset="0.55" stopColor={backdrop.base} />
          <stop offset="1" stopColor={backdrop.dark} />
        </radialGradient>
        <radialGradient id={ids.hi} cx="0.34" cy="0.26" r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.lo} cx="0.44" cy="0.36" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </radialGradient>
      </defs>
      <circle cx="64" cy="64" r="64" fill={`url(#${ids.bg})`} />
      <Shading.Provider value={{ hi: `url(#${ids.hi})`, lo: `url(#${ids.lo})` }}>
        <g clipPath={`url(#${ids.clip})`}>
          {traits.kind === 'robot' ? <Robot t={traits} /> : <Character t={traits} />}
        </g>
      </Shading.Provider>
      <circle cx="64" cy="64" r="61.5" fill="none" stroke={backdrop.light} strokeWidth="4" />
      <circle cx="64" cy="64" r="63.5" fill="none" stroke="#000" strokeOpacity="0.35" />
      <circle cx="64" cy="64" r="59.5" fill="none" stroke="#000" strokeOpacity="0.2" />
    </svg>
  );
}

/** A neon ring in the avatar's own disc color, for the seat that holds it. */
export function avatarGlow(traits: AvatarTraits): CSSProperties {
  const { light, base } = traits.backdrop;
  return { boxShadow: `0 0 0 3px ${light}, 0 0 18px 3px ${base}b3` };
}

function Character({ t }: { t: PersonAvatar }) {
  switch (t.character) {
    case 'gamer':
      return <Gamer t={t} />;
    case 'champ':
      return <Champ t={t} />;
    case 'fox':
      return <Fox t={t} />;
    case 'panda':
      return <Panda t={t} />;
    case 'monkey':
      return <Monkey t={t} />;
    case 'bunny':
      return <Bunny t={t} />;
    case 'cat':
      return <Cat t={t} />;
    case 'koala':
      return <Koala t={t} />;
  }
}

/** A filled path with the shared light and shadow over it, so it reads as rounded. */
function Blob({ d, fill }: { d: string; fill: string }) {
  const { hi, lo } = useContext(Shading);
  return (
    <>
      <path d={d} fill={fill} />
      <path d={d} fill={lo} />
      <path d={d} fill={hi} />
    </>
  );
}

/** A shaded ellipse. */
function Ball({
  cx,
  cy,
  rx,
  ry = rx,
  fill,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
  fill: string;
}) {
  const { hi, lo } = useContext(Shading);
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={lo} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={hi} />
    </>
  );
}

/** Draws the left-hand half and its mirror image. */
function Pair({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(128 0) scale(-1 1)">{children}</g>
    </>
  );
}

/** Shoulders in a hoodie, with a shadow where the head sits. */
function Hoodie({ color, strings = true }: { color: string; strings?: boolean }) {
  return (
    <>
      <Blob d="M4 140C6 108 30 93 64 93S122 108 124 140Z" fill={color} />
      <path
        d="M40 96C46 112 82 112 88 96"
        fill="none"
        stroke="#000"
        strokeOpacity="0.22"
        strokeWidth="3"
      />
      <ellipse cx="64" cy="96" rx="26" ry="6" fill="#000" fillOpacity="0.28" />
      {strings && (
        <path
          d="M54 106v14M74 106v14"
          stroke="#fff"
          strokeOpacity="0.85"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/** A big glossy open eye. */
function Eye({ x, y, iris, r = 1 }: { x: number; y: number; iris: string; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${r})`}>
      <ellipse rx="6" ry="7.5" fill="#fff" />
      <ellipse cx="0.5" cy="1" rx="4.6" ry="5.6" fill={iris} />
      <circle cx="0.5" cy="1.5" r="2.6" fill="#1a0f0c" />
      <circle cx="-1.3" cy="-1.3" r="1.7" fill="#fff" />
    </g>
  );
}

/** A shut, smiling eye: the wink and the laugh. */
function Shut({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <path
      d={`M${x - 6} ${y + 1.5}Q${x} ${y - 5} ${x + 6} ${y + 1.5}`}
      fill="none"
      stroke={color}
      strokeWidth="2.8"
      strokeLinecap="round"
    />
  );
}

/** A sly half-lidded eye, lid drawn in the face's own color. */
function Sly({ x, y, iris, lid }: { x: number; y: number; iris: string; lid: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx="6.5" ry="5.5" fill="#fff" />
      <ellipse cx="1" cy="0.8" rx="4.4" ry="4.6" fill={iris} />
      <circle cx="1.4" cy="1" r="2.2" fill="#1a0f0c" />
      <circle cx="0" cy="1.6" r="1.1" fill="#fff" />
      <path d="M-8 -6H8V0Q0 -3.5 -8 0Z" fill={lid} />
      <path d="M-7 0Q0 -3.5 7 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/** A wide-open laugh with a row of top teeth. */
function Laugh({ y = 74 }: { y?: number }) {
  return (
    <g transform={`translate(0 ${y - 74})`}>
      <path d="M50 74Q64 72 78 74Q76 89 64 89Q52 89 50 74Z" fill={MOUTH} />
      <path d="M51.5 75Q64 73.5 76.5 75L76 78.5Q64 77.5 52 78.5Z" fill="#fff" />
      <path d="M56 85Q64 80 72 85Q68 89 64 89Q60 89 56 85Z" fill={TONGUE} />
    </g>
  );
}

function Blush({ y = 74, spread = 22 }: { y?: number; spread?: number }) {
  return (
    <Pair>
      <ellipse cx={64 - spread} cy={y} rx="6" ry="3.5" fill={BLUSH} fillOpacity="0.35" />
    </Pair>
  );
}

const FACE = 'M35 57C35 37 48 28 64 28S93 37 93 57C93 77 81 91 64 91S35 77 35 57Z';

/** A kid's head without hair: neck, ears and face. */
function KidHead({ skin }: { skin: string }) {
  return (
    <>
      <rect x="54" y="80" width="20" height="16" fill={skin} />
      <rect x="54" y="80" width="20" height="16" fill="#000" fillOpacity="0.15" />
      <Pair>
        <Ball cx={36} cy={62} rx={6} ry={8} fill={skin} />
      </Pair>
      <Blob d={FACE} fill={skin} />
      <path
        d="M63 67q2.5 3-1 4.5"
        fill="none"
        stroke={INK}
        strokeOpacity="0.35"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  );
}

/** The gamer: cap turned to the side, a wink and a big laugh. */
function Gamer({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <KidHead skin={t.skin} />
      <Blob d="M32 64L27 54L34 56L32 44L40 50Z" fill={t.hair} />
      <Blob d="M96 64L101 54L94 56L96 44L88 50Z" fill={t.hair} />
      <path d="M36 44Q40 56 45 50Q48 58 53 49Q57 56 61 47Q64 53 68 46L68 40H36Z" fill={t.hair} />
      <Blob d="M32 47C32 24 47 14 65 14S97 24 96 46C80 39 50 39 32 47Z" fill={t.hoodie} />
      <path
        d="M46 41C47 26 55 18 65 18S77 24 78 39C68 37 56 38 46 41Z"
        fill="#fff"
        fillOpacity="0.92"
      />
      <Blob d="M74 41C88 36 106 38 117 47C106 52 89 49 76 47Z" fill={t.hoodie} />
      <path
        d="M74 41C88 36 106 38 117 47"
        fill="none"
        stroke="#000"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M44 54Q51 49 58 53M70 53Q77 49 84 54"
        fill="none"
        stroke={t.hair}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <Shut x={51} y={62} />
      <Eye x={77} y={62} iris="#6b3e1f" />
      <Blush />
      <Laugh />
    </>
  );
}

/** The champ: long hair, round glasses, headphones and a laugh. */
function Champ({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Blob
        d="M28 60C24 30 42 18 64 18S104 30 100 60C102 80 106 98 110 118H18C22 98 26 80 28 60Z"
        fill={t.hair}
      />
      <Hoodie color={t.hoodie} />
      <KidHead skin={t.skin} />
      <Pair>
        <path d="M31 58C27 80 30 98 22 118L38 112C39 96 39 80 37 64Z" fill={t.hair} />
      </Pair>
      <Blob
        d="M34 56C33 34 47 24 64 24C82 24 95 34 94 56C88 43 78 37 68 35C69 41 64 45 58 45C60 41 59 38 57 36C49 40 40 46 34 56Z"
        fill={t.hair}
      />
      <path
        d="M30 58C26 20 102 20 98 58"
        fill="none"
        stroke="#1f2a4a"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Pair>
        <Ball cx={29} cy={62} rx={8} ry={11} fill="#eef0f4" />
        <ellipse cx="29" cy="62" rx="4.5" ry="7" fill="#2f6fe0" />
      </Pair>
      <Shut x={52} y={63} />
      <Shut x={76} y={63} />
      <Pair>
        <circle
          cx="52"
          cy="62"
          r="9.5"
          fill="#fff"
          fillOpacity="0.12"
          stroke="#1a1214"
          strokeWidth="2.6"
        />
      </Pair>
      <path d="M61.5 61Q64 59 66.5 61" fill="none" stroke="#1a1214" strokeWidth="2.4" />
      <Blush y={76} />
      <Laugh y={75} />
    </>
  );
}

const FOX = '#f07a24';
const CREAM = '#fbf1e4';

/** The trickster: a fox with a knowing smirk. */
function Fox({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Pair>
        <Blob d="M30 50L28 8L58 32Z" fill={FOX} />
        <path d="M34 42L33 18L51 33Z" fill={CREAM} />
      </Pair>
      <Blob
        d="M24 64C24 44 40 30 64 30S104 44 104 64L114 72L99 76L105 85L87 86C80 92 72 95 64 95S48 92 41 86L23 85L29 76L14 72Z"
        fill={FOX}
      />
      <path
        d="M38 68C46 78 56 80 64 73C72 80 82 78 90 68C94 82 82 95 64 95S34 82 38 68Z"
        fill={CREAM}
      />
      <path d="M41 51L57 56M87 51L71 56" stroke="#7a3a10" strokeWidth="3.2" strokeLinecap="round" />
      <Sly x={50} y={63} iris="#e8a23a" lid={FOX} />
      <Sly x={78} y={63} iris="#e8a23a" lid={FOX} />
      <Ball cx={64} cy={76} rx={5.5} ry={4} fill="#1a1214" />
      <path
        d="M64 80v3M55 82Q64 88 75 80"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  );
}

const PANDA = '#f4f2ee';
const PANDA_BLACK = '#1d1b20';

/** The chill one: a panda in sunglasses. */
function Panda({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Pair>
        <Ball cx={34} cy={32} rx={12} fill={PANDA_BLACK} />
      </Pair>
      <Ball cx={64} cy={61} rx={35} ry={32} fill={PANDA} />
      <Pair>
        <path
          d="M36 55C36 50 41 48 50 48H58C62 48 63 52 62 56C61 64 56 69 49 69C41 69 36 63 36 55Z"
          fill="#111"
        />
        <path
          d="M41 53Q46 50 52 51"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M37 53L28 50" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      </Pair>
      <path d="M61 52Q64 50 67 52" fill="none" stroke="#111" strokeWidth="3" />
      <ellipse cx="64" cy="78" rx="14" ry="10" fill="#fff" />
      <Ball cx={64} cy={73} rx={5.5} ry={4} fill={PANDA_BLACK} />
      <path
        d="M64 77v3M56 80Q64 86 73 79"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  );
}

const MONKEY = '#8a5230';
const MONKEY_FACE = '#e8b48a';

/** The wildcard: a monkey mid-laugh with a wink. */
function Monkey({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Pair>
        <Ball cx={31} cy={60} rx={12} fill={MONKEY} />
        <circle cx="31" cy="60" r="6.5" fill={MONKEY_FACE} />
      </Pair>
      <Ball cx={64} cy={60} rx={31} ry={32} fill={MONKEY} />
      <path d="M50 32Q54 16 63 26Q68 14 75 28Q66 24 50 32Z" fill="#6a3c22" />
      <Blob
        d="M40 61C40 47 52 45 64 53C76 45 88 47 88 61C92 75 84 93 64 93S36 75 40 61Z"
        fill={MONKEY_FACE}
      />
      <path
        d="M42 52Q50 46 58 51M70 51Q78 46 86 52"
        fill="none"
        stroke="#4a2814"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <Shut x={51} y={61} />
      <Eye x={77} y={61} iris="#6b3e1f" />
      <path d="M61 70h.1M67 70h.1" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <Laugh y={76} />
    </>
  );
}

const BUNNY = '#f7f3f0';

/** The speedy one: a bunny in a headband, laughing. */
function Bunny({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Blob d="M44 42C33 22 32 -2 44 -4S57 20 55 40Z" fill={BUNNY} />
      <path d="M46 36C39 22 39 4 45 3S51 20 51 35Z" fill={PINK} />
      <Blob d="M73 40C74 18 84 -2 95 2S90 26 83 42Z" fill={BUNNY} />
      <path d="M77 36C79 20 85 6 91 8S87 24 82 37Z" fill={PINK} />
      <Ball cx={64} cy={63} rx={31} ry={29} fill={BUNNY} />
      <Blob d="M33 52C46 41 82 41 95 52L95 60C82 49 46 49 33 60Z" fill="#e5383b" />
      <path d="M34 54L17 45L21 58ZM34 57L19 66L31 65Z" fill="#c42a2e" />
      <Shut x={51} y={66} />
      <Shut x={77} y={66} />
      <Blush y={76} spread={21} />
      <path d="M61 71H67L64 74.5Z" fill={PINK} />
      <path d="M54 77Q64 75 74 77Q72 91 64 91S56 91 54 77Z" fill={MOUTH} />
      <path d="M59.5 76.5H68.5V82H59.5Z" fill="#fff" />
      <path d="M64 76.5V82" stroke="#ccc" strokeWidth="0.8" />
      <path d="M58 87Q64 83 70 87Q67 91 64 91S60 91 58 87Z" fill={TONGUE} />
    </>
  );
}

const CAT = '#9a96a6';
const CAT_LIGHT = '#e4e1ea';

/** The strategist: a cat with a smug, half-lidded look. */
function Cat({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Pair>
        <Blob d="M31 54L33 16L58 38Z" fill={CAT} />
        <path d="M36 46L37 26L51 38Z" fill={PINK} />
      </Pair>
      <Blob
        d="M30 64C30 44 44 34 64 34S98 44 98 64L108 70L97 74L102 82L88 83C82 90 74 93 64 93S46 90 40 83L26 82L31 74L20 70Z"
        fill={CAT}
      />
      <path
        d="M58 37v8M64 36v10M70 37v8"
        stroke="#6e6a7a"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <Pair>
        <ellipse cx="58" cy="79" rx="8" ry="6" fill={CAT_LIGHT} />
        <path
          d="M46 76L30 73M46 80L30 81"
          stroke="#fff"
          strokeOpacity="0.8"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </Pair>
      <Sly x={50} y={63} iris="#5ac85a" lid={CAT} />
      <Sly x={78} y={63} iris="#5ac85a" lid={CAT} />
      <path d="M60.5 73.5H67.5L64 77Z" fill={PINK} />
      <path
        d="M64 77v2.5M56 81Q61 84 64 79.5Q68 85 75 79"
        fill="none"
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  );
}

const KOALA = '#a7a3ad';

/** A koala with big fluffy ears and a shy smile. */
function Koala({ t }: { t: PersonAvatar }) {
  return (
    <>
      <Hoodie color={t.hoodie} />
      <Pair>
        <Ball cx={30} cy={42} rx={16} fill={KOALA} />
        <circle cx="31" cy="44" r="9" fill="#f2eef0" />
      </Pair>
      <Ball cx={64} cy={63} rx={32} ry={29} fill={KOALA} />
      <Pair>
        <circle cx="46" cy="60" r="5" fill="#1a1214" />
        <circle cx="44.5" cy="58.3" r="1.7" fill="#fff" />
      </Pair>
      <Blob d="M55 63C55 54 73 54 73 63V73C73 82 55 82 55 73Z" fill="#2a2530" />
      <Blush y={72} spread={24} />
      <path
        d="M58 86Q64 90 70 86"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  );
}

const PLATING = '#eef0f4';
const VISOR = '#141826';

/** A computer player: a friendly robot with glowing eyes. */
function Robot({ t }: { t: RobotAvatar }) {
  return (
    <>
      <Blob d="M8 140C10 110 32 96 64 96S118 110 120 140Z" fill={PLATING} />
      <ellipse cx="64" cy="98" rx="24" ry="6" fill="#000" fillOpacity="0.28" />
      <Pair>
        <Ball cx={22} cy={116} rx={9} fill="#2f6fe0" />
      </Pair>
      <circle cx="64" cy="114" r="5" fill={t.glow} />
      <Pair>
        <path d="M50 28L42 10" stroke="#9aa3b2" strokeWidth="3" strokeLinecap="round" />
        <Ball cx={42} cy={9} rx={4.5} fill="#2f6fe0" />
        <Ball cx={28} cy={60} rx={8} ry={12} fill="#2f6fe0" />
      </Pair>
      <Blob
        d="M30 58C30 34 44 24 64 24S98 34 98 58C98 80 86 93 64 93S30 80 30 58Z"
        fill={PLATING}
      />
      <path
        d="M38 52C38 42 48 38 64 38S90 42 90 52V66C90 78 80 83 64 83S38 78 38 66Z"
        fill={VISOR}
      />
      <path
        d="M44 46Q54 41 66 42"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill={t.glow}>
        <Pair>
          <ellipse cx="52" cy="58" rx="9" ry="10" fillOpacity="0.2" />
          {t.eyes === 'round' && <rect x="47" y="51" width="10" height="13" rx="5" />}
          {t.eyes === 'bars' && <rect x="45.5" y="56" width="13" height="4" rx="2" />}
        </Pair>
      </g>
      {t.eyes === 'happy' && <Shut x={52} y={59} color={t.glow} />}
      {t.eyes === 'happy' && <Shut x={76} y={59} color={t.glow} />}
      <path
        d="M57 70Q64 75 71 70"
        fill="none"
        stroke={t.glow}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </>
  );
}
