/** The game sounds. Each is synthesized with Web Audio, so the client ships no audio files. */
export type SoundKind = 'turnReminder' | 'handExchange' | 'win';

/** Which sounds the player has switched on. */
export type SoundPrefs = Record<SoundKind, boolean>;

let ctx: AudioContext | null = null;

/** Browsers keep audio suspended until the player interacts, so call this from a click or key press. */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
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

/** A burst of white noise through a band-pass sweeping from `fromHz` to `toHz`. */
function noise(
  ac: AudioContext,
  at: number,
  duration: number,
  peak: number,
  fromHz: number,
  toHz: number,
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
  amp.gain.linearRampToValueAtTime(peak, at + duration * 0.3);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(band).connect(amp).connect(ac.destination);
  source.start(at);
}

const SOUNDS: Record<SoundKind, (ac: AudioContext, at: number) => void> = {
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

/** Plays a sound now. Skipped until the player has interacted, rather than queued for later. */
export function playSound(kind: SoundKind): void {
  if (ctx?.state !== 'running') return;
  SOUNDS[kind](ctx, ctx.currentTime + 0.02);
}
