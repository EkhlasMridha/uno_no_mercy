/** The game sounds. Each is synthesized with Web Audio, so the client ships no audio files. */
export type SoundKind = 'cardPlay' | 'yourTurn' | 'turnReminder' | 'handExchange' | 'win';

/** Which sounds the player has switched on, and whether all of them are muted. */
export type SoundPrefs = Record<SoundKind, boolean> & { muted: boolean };

declare global {
  interface Window {
    /** Safari before 14.1 only has the prefixed constructor. */
    webkitAudioContext?: typeof AudioContext;
  }
}

// Undefined where there's no Web Audio at all (some in-app webviews); every sound is then skipped.
const AudioContextCtor: typeof AudioContext | undefined =
  window.AudioContext ?? window.webkitAudioContext;

let ctx: AudioContext | null = null;

/**
 * Browsers keep audio suspended until the player interacts, so call this from a click, tap or key
 * press. It returns at once while audio runs, and resumes a context the OS suspended (a phone sent
 * to the background) on the next tap.
 */
export function unlockAudio(): void {
  if (!AudioContextCtor || ctx?.state === 'running') return;
  ctx ??= new AudioContextCtor();
  void ctx.resume();
}

/** One enveloped oscillator note, optionally gliding to `endHz`. */
function tone(
  ac: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  at: number,
  duration: number,
  peak: number,
  hz: number,
  endHz = hz,
): void {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (endHz !== hz) osc.frequency.exponentialRampToValueAtTime(endHz, at + duration);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/**
 * A burst of white noise through a band-pass sweeping from `fromHz` to `toHz`. `attack` is the share
 * of the burst spent swelling to its peak; keep it small for a sharp hit.
 */
function noise(
  ac: AudioContext,
  at: number,
  duration: number,
  peak: number,
  fromHz: number,
  toHz: number,
  attack = 0.3,
): void {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ac.createBufferSource();
  const band = ac.createBiquadFilter();
  const amp = ac.createGain();
  source.buffer = buffer;
  band.type = 'bandpass';
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(fromHz, at);
  band.frequency.exponentialRampToValueAtTime(toHz, at + duration);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(peak, at + duration * attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(band).connect(amp).connect(ac.destination);
  source.start(at);
}

const SOUNDS: Record<SoundKind, (ac: AudioContext, at: number) => void> = {
  // A card flicked from the fingers, a breath of air in flight, and a soft slap on the felt as the
  // toss lands. Each play varies a little, so a run of plays never sounds machine-made.
  cardPlay(ac, at) {
    const vary = (v: number) => v * (0.88 + Math.random() * 0.24);
    const land = at + 0.18 + Math.random() * 0.04;
    noise(ac, at, 0.012, 0.18, vary(4500), vary(5200), 0.1);
    noise(ac, at + 0.02, 0.14, 0.035, vary(2200), vary(900));
    noise(ac, land, 0.045, 0.25, vary(900), vary(550), 0.04);
    tone(ac, ac.destination, 'sine', land, 0.08, 0.2, vary(140), 70);
  },
  // A soft rising chime, A5 then E6, in pure sine so it stays clear without being shrill. A faint
  // octave above the second note gives it a little shine.
  yourTurn(ac, at) {
    const out = ac.destination;
    tone(ac, out, 'sine', at, 0.32, 0.2, 880);
    tone(ac, out, 'sine', at + 0.14, 0.6, 0.22, 1318.5);
    tone(ac, out, 'sine', at + 0.14, 0.35, 0.03, 2637);
  },
  // Two knuckle knocks on the rail, then a small brass bell.
  turnReminder(ac, at) {
    const out = ac.destination;
    tone(ac, out, 'triangle', at, 0.1, 0.5, 190, 70);
    tone(ac, out, 'triangle', at + 0.15, 0.1, 0.5, 190, 70);
    tone(ac, out, 'sine', at + 0.36, 0.9, 0.18, 1046.5);
    tone(ac, out, 'sine', at + 0.36, 0.5, 0.05, 2890);
  },
  // A riffle as the cards slide across the felt: one long sweep with flicks along it.
  handExchange(ac, at) {
    noise(ac, at, 0.5, 0.35, 700, 3800);
    for (let i = 0; i < 7; i++) noise(ac, at + 0.04 + i * 0.06, 0.03, 0.22, 2600, 4200);
  },
  // A brass fanfare up to a held C major chord, with a few sparkles on top.
  win(ac, at) {
    const brass = ac.createBiquadFilter();
    brass.type = 'lowpass';
    brass.frequency.value = 2400;
    brass.connect(ac.destination);
    [392, 523.25, 659.25, 783.99].forEach((hz, i) =>
      tone(ac, brass, 'sawtooth', at + i * 0.12, 0.18, 0.14, hz),
    );
    for (const hz of [523.25, 659.25, 783.99, 1046.5]) {
      tone(ac, brass, 'sawtooth', at + 0.5, 1.2, 0.1, hz);
    }
    for (let i = 0; i < 6; i++) {
      tone(ac, ac.destination, 'sine', at + 0.6 + i * 0.13, 0.2, 0.05, 2000 + Math.random() * 2000);
    }
  },
};

/**
 * Plays a sound now, or `delay` seconds from now so sounds from one move can follow each other.
 * Skipped until the player has interacted, rather than queued for later.
 */
export function playSound(kind: SoundKind, delay = 0): void {
  if (ctx?.state !== 'running') return;
  SOUNDS[kind](ctx, ctx.currentTime + 0.02 + delay);
}
