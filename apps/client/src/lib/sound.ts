import type { Gender } from '@nomercy/shared';

/**
 * The game sounds. Each is synthesized with Web Audio, or spoken by the browser's own speech voices
 * for the UNO call, so the client ships no audio files.
 */
export type SoundKind =
  | 'cardPlay'
  | 'discardAll'
  | 'cardDraw'
  | 'rouletteHit'
  | 'unoCall'
  | 'yourTurn'
  | 'turnReminder'
  | 'handExchange'
  | 'penalty'
  | 'knockout'
  | 'win';

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

/**
 * A plunger-muted trombone note: a sawtooth through a resonant low-pass that opens and closes, so it
 * says "wah". `wobble` adds a vibrato that also shakes the mute, for a drawn-out last note.
 */
function wah(
  ac: AudioContext,
  at: number,
  duration: number,
  hz: number,
  endHz: number,
  wobble = 0,
): void {
  const osc = ac.createOscillator();
  const mute = ac.createBiquadFilter();
  const amp = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(hz, at);
  osc.frequency.linearRampToValueAtTime(endHz, at + duration);
  mute.type = 'lowpass';
  mute.Q.value = 7;
  mute.frequency.setValueAtTime(320, at);
  mute.frequency.exponentialRampToValueAtTime(1700, at + duration * 0.3);
  mute.frequency.exponentialRampToValueAtTime(380, at + duration);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(0.13, at + 0.03);
  amp.gain.setValueAtTime(0.13, at + duration * 0.75);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  if (wobble > 0) {
    const lfo = ac.createOscillator();
    const pitchDepth = ac.createGain();
    const muteDepth = ac.createGain();
    lfo.frequency.value = 6.5;
    pitchDepth.gain.value = wobble;
    muteDepth.gain.value = 350;
    lfo.connect(pitchDepth).connect(osc.frequency);
    lfo.connect(muteDepth).connect(mute.frequency);
    lfo.start(at);
    lfo.stop(at + duration + 0.05);
  }
  osc.connect(mute).connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

// Voices whose names give them away, for the systems that ship them (Windows, macOS, iOS, Android,
// Chrome). "female" is tested first because it contains "male".
const FEMALE_VOICE =
  /female|woman|zira|aria|jenny|libby|sonia|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|serena|google us english/i;
const MALE_VOICE =
  /\bmale\b|\bman\b|david|mark|guy|ryan|george|james|daniel|alex|fred|oliver|rishi|thomas/i;

const speech: SpeechSynthesis | undefined = window.speechSynthesis;
// Chrome fills the voice list in the background after the first ask, so ask now, well before the
// first UNO is called.
speech?.getVoices();

/** Picks an English voice that sounds like the player, or null when the device has none to tell apart. */
function voiceFor(gender: Gender): SpeechSynthesisVoice | null {
  const english = (speech?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().startsWith('en'));
  const female = english.filter((v) => FEMALE_VOICE.test(v.name));
  const male = english.filter((v) => !FEMALE_VOICE.test(v.name) && MALE_VOICE.test(v.name));
  const pool = gender === 'female' ? female : male;
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/**
 * A short, bright shout of "UNO!" in a man's or a woman's voice. Without a matching voice it uses the
 * default one, pitched down for a man and up for a woman, so the two still sound different.
 */
function sayUno(gender: Gender, delay: number): void {
  if (!speech) return;
  const utterance = new SpeechSynthesisUtterance('Uno!');
  const voice = voiceFor(gender);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'en-US';
  utterance.pitch = voice ? (gender === 'female' ? 1.15 : 0.9) : gender === 'female' ? 1.6 : 0.6;
  utterance.rate = 1.1;
  window.setTimeout(() => speech.speak(utterance), delay * 1000);
}

const SOUNDS: Record<Exclude<SoundKind, 'unoCall'>, (ac: AudioContext, at: number) => void> = {
  // A card slapped down on the table: a quick "fwip" as it leaves the hand, then a crisp crack, a
  // papery thwap and a light thump as the toss lands. Most of the energy sits in 1-4 kHz so it cuts
  // through laptop and phone speakers. Each play varies a little, so a run never sounds machine-made.
  cardPlay(ac, at) {
    const vary = (v: number) => v * (0.88 + Math.random() * 0.24);
    const land = at + 0.15 + Math.random() * 0.03;
    noise(ac, at, 0.12, vary(0.18), vary(1800), vary(4200), 0.6);
    noise(ac, land, 0.05, vary(0.9), vary(3800), vary(2400), 0.02);
    noise(ac, land, 0.09, vary(0.8), vary(1100), vary(700), 0.03);
    noise(ac, land + 0.03, 0.02, 0.25, vary(5000), vary(4500), 0.1);
    tone(ac, ac.destination, 'sine', land, 0.07, 0.35, vary(170), 80);
  },
  // A Discard All dumping a handful of cards on the pile: a "fwip", a quick run of slaps that tumble
  // lower as they land, a broad papery settle with a soft thump, and a light rising flick at the end
  // because the hand just got lighter.
  discardAll(ac, at) {
    const out = ac.destination;
    const vary = (v: number) => v * (0.9 + Math.random() * 0.2);
    noise(ac, at, 0.1, vary(0.16), vary(1800), vary(4200), 0.6);
    for (let i = 0; i < 5; i++) {
      const hit = at + 0.1 + i * 0.05;
      noise(
        ac,
        hit,
        0.035,
        vary(0.65 - i * 0.07),
        vary(3600 - i * 280),
        vary(2200 - i * 180),
        0.02,
      );
    }
    const land = at + 0.38;
    noise(ac, land, 0.22, vary(0.45), vary(1300), vary(320), 0.05);
    tone(ac, out, 'sine', land, 0.18, 0.3, vary(130), 60);
    tone(ac, out, 'triangle', land + 0.06, 0.2, 0.07, 660, 1320);
  },
  // A card slid off the draw pile: a soft papery swish falling in pitch, then a light tick as it
  // lands in the hand. No crack or thump, so it never sounds like a card being played.
  cardDraw(ac, at) {
    const vary = (v: number) => v * (0.9 + Math.random() * 0.2);
    noise(ac, at, 0.16, vary(0.32), vary(3400), vary(1300), 0.3);
    noise(ac, at + 0.14, 0.025, vary(0.16), vary(2400), vary(1900), 0.1);
  },
  // Color Roulette found its color: a quick bright "ding-ding" a fifth apart, C6 then G6, in
  // triangle so it sounds like a bell rather than the softer sine chime of your turn.
  rouletteHit(ac, at) {
    const out = ac.destination;
    tone(ac, out, 'triangle', at, 0.14, 0.22, 1046.5);
    tone(ac, out, 'triangle', at + 0.1, 0.4, 0.24, 1568);
    tone(ac, out, 'sine', at + 0.1, 0.25, 0.04, 3136);
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
  // The table laughing at whoever took the cards: a cheeky slap-bass lick, then a sad trombone
  // wah-wah-wah-ing down to a long, wobbling last note.
  penalty(ac, at) {
    const out = ac.destination;
    [82.41, 164.81, 98, 110].forEach((hz, i) => {
      noise(ac, at + i * 0.09, 0.02, 0.12, 2500, 1500, 0.05);
      tone(ac, out, 'square', at + i * 0.09, 0.09, 0.09, hz, hz * 0.94);
    });
    const horn = at + 0.45;
    [233.08, 220, 207.65].forEach((hz, i) => wah(ac, horn + i * 0.32, 0.28, hz, hz * 0.98));
    wah(ac, horn + 0.96, 1.1, 196, 180, 5);
  },
  // Danger: a heavy hit as the hand reaches 25, then three klaxon whoops rising over a sinking drone.
  knockout(ac, at) {
    const out = ac.destination;
    const klaxon = ac.createBiquadFilter();
    klaxon.type = 'lowpass';
    klaxon.frequency.value = 2200;
    klaxon.connect(out);
    tone(ac, out, 'sine', at, 0.7, 0.45, 120, 38);
    noise(ac, at, 0.3, 0.3, 700, 120, 0.02);
    for (let i = 0; i < 3; i++) {
      tone(ac, klaxon, 'sawtooth', at + 0.18 + i * 0.42, 0.38, 0.12, 440, 880);
      tone(ac, klaxon, 'square', at + 0.18 + i * 0.42, 0.38, 0.04, 445, 890);
    }
    tone(ac, klaxon, 'sawtooth', at + 0.18, 1.3, 0.07, 110, 55);
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
 * Skipped until the player has interacted, rather than queued for later. `voice` is whose voice
 * calls UNO.
 */
export function playSound(kind: SoundKind, delay = 0, voice: Gender = 'male'): void {
  if (ctx?.state !== 'running') return;
  if (kind === 'unoCall') return sayUno(voice, delay);
  SOUNDS[kind](ctx, ctx.currentTime + 0.02 + delay);
}
