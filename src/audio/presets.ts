import type { Env } from './dsp';

// ─────────────────────────────────────────────────────────────────────────────
// Sound design. Every preset is plain data interpreted by a voice builder, so new
// presets (and future Build-a-Monster synths) never need new audio code.
//
// Gain staging: a single note at full velocity peaks around -10 dBFS so four
// monsters + effects stay clear of the master limiter.
// ─────────────────────────────────────────────────────────────────────────────

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/**
 * Wavetables: harmonic recipes (amplitude of harmonic 1, 2, 3, …) turned into
 * PeriodicWave oscillators — a cheap way to get timbres the four basic waves lack.
 */
export const WAVETABLES = {
  glass: [1, 0, 0.42, 0, 0.18, 0.09, 0, 0.06, 0, 0.03],
  organ: [1, 0.85, 0.5, 0.35, 0, 0.22, 0, 0.16],
  hollow: [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11],
} as const;

export type WavetableId = keyof typeof WAVETABLES;

export interface OscSpec {
  wave: Wave | 'table';
  /** Harmonic recipe when `wave` is 'table'. */
  table?: WavetableId;
  semi?: number;
  cents?: number;
  gain: number;
}

/** Subtractive / formant synth — Bloop, Grumble, Puff and Mimic's singing voice. */
export interface SynthPatch {
  kind: 'synth';
  oscs: OscSpec[];
  noise?: number;
  filter: { type: BiquadFilterType; cutoff: number; q: number; env: number; keyTrack: number };
  fenv: Env;
  aenv: Env;
  pitchEnv?: { semis: number; time: number };
  vibrato?: { rate: number; cents: number; delay: number };
  filterLfo?: { rate: number; octaves: number; beats?: number };
  drive?: number;
  glide: number;
  gain: number;
  chord?: boolean;
  formant?: boolean;
}

/** Two-operator FM — Spark's bells, plucks and drops. */
export interface BellPatch {
  kind: 'bell';
  wave?: Wave;
  ratio: number;
  index: number;
  indexEnd: number;
  indexDecay: number;
  aenv: Env;
  shimmer?: { ratio: number; gain: number; decay: number };
  pitchEnv?: { semis: number; time: number };
  filter?: { cutoff: number; q: number; env: number; decay: number };
  gain: number;
}

/** Synthesised drum kit — Boom. */
export interface DrumPatch {
  kind: 'drums';
  tune: number;
  decay: number;
  tone: number;
  drive: number;
  metal: number;
  gain: number;
}

/** Mimic: plays the child's recorded voice (or sings "la" until it has one). */
export interface VoicePatch {
  kind: 'voice';
  semis: number;
  robot: number;
  gain: number;
}

export type Patch = SynthPatch | BellPatch | DrumPatch | VoicePatch;

const env = (a: number, d: number, s: number, r: number): Env => ({ a, d, s, r });

export const PATCHES: Record<string, Patch> = {
  // ── Bloop · lead synth ────────────────────────────────────────────────────
  'bubble-lead': {
    kind: 'synth',
    oscs: [
      { wave: 'triangle', gain: 0.6 },
      { wave: 'square', cents: 6, gain: 0.16 },
      { wave: 'sine', semi: 12, gain: 0.12 },
    ],
    filter: { type: 'lowpass', cutoff: 1900, q: 5, env: 1.6, keyTrack: 0.5 },
    fenv: env(0.005, 0.25, 0.35, 0.25),
    aenv: env(0.008, 0.3, 0.75, 0.28),
    pitchEnv: { semis: -5, time: 0.045 },
    vibrato: { rate: 5.5, cents: 14, delay: 0.35 },
    glide: 0.06,
    gain: 0.34,
  },
  'laser-jelly': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', cents: -9, gain: 0.5 },
      { wave: 'sawtooth', cents: 9, gain: 0.5 },
    ],
    filter: { type: 'lowpass', cutoff: 900, q: 11, env: 3, keyTrack: 0.6 },
    fenv: env(0.002, 0.35, 0.15, 0.2),
    aenv: env(0.004, 0.4, 0.6, 0.2),
    pitchEnv: { semis: 12, time: 0.07 },
    glide: 0.05,
    gain: 0.3,
  },
  'rainbow-whistle': {
    kind: 'synth',
    oscs: [
      { wave: 'sine', gain: 0.8 },
      { wave: 'triangle', semi: 12, gain: 0.08 },
    ],
    noise: 0.035,
    filter: { type: 'lowpass', cutoff: 3600, q: 1, env: 0.3, keyTrack: 0.3 },
    fenv: env(0.05, 0.3, 0.8, 0.3),
    aenv: env(0.06, 0.2, 0.85, 0.35),
    pitchEnv: { semis: -2, time: 0.08 },
    vibrato: { rate: 5.8, cents: 22, delay: 0.18 },
    glide: 0.1,
    gain: 0.3,
  },
  'moon-drops': {
    kind: 'synth',
    oscs: [
      { wave: 'table', table: 'glass', gain: 0.62 },
      { wave: 'sine', semi: 19, gain: 0.05 },
    ],
    filter: { type: 'lowpass', cutoff: 4200, q: 0.7, env: 0, keyTrack: 0 },
    fenv: env(0.002, 0.5, 1, 0.5),
    aenv: env(0.003, 0.9, 0, 0.6),
    pitchEnv: { semis: 2, time: 0.03 },
    glide: 0.03,
    gain: 0.4,
  },
  'alien-giggle': {
    kind: 'synth',
    oscs: [
      { wave: 'square', gain: 0.35 },
      { wave: 'triangle', semi: 7, gain: 0.15 },
    ],
    filter: { type: 'lowpass', cutoff: 2500, q: 4, env: 1, keyTrack: 0.4 },
    fenv: env(0.005, 0.2, 0.5, 0.2),
    aenv: env(0.005, 0.2, 0.7, 0.18),
    pitchEnv: { semis: 5, time: 0.12 },
    vibrato: { rate: 11, cents: 70, delay: 0 },
    glide: 0.04,
    gain: 0.38,
  },

  // ── Grumble · bass ────────────────────────────────────────────────────────
  'big-belly-bass': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', gain: 0.45 },
      { wave: 'square', cents: -5, gain: 0.28 },
      { wave: 'sine', gain: 0.5 },
      // An octave-up edge so the bass is still heard on tablet and phone speakers.
      { wave: 'square', semi: 12, gain: 0.12 },
    ],
    filter: { type: 'lowpass', cutoff: 380, q: 5, env: 2.2, keyTrack: 0.3 },
    fenv: env(0.004, 0.22, 0.25, 0.15),
    aenv: env(0.006, 0.25, 0.8, 0.14),
    drive: 0.15,
    glide: 0.05,
    gain: 0.36,
  },
  'sleepy-dinosaur': {
    kind: 'synth',
    oscs: [
      { wave: 'sine', gain: 0.8 },
      { wave: 'triangle', semi: 12, gain: 0.25 },
    ],
    filter: { type: 'lowpass', cutoff: 700, q: 1, env: 0.5, keyTrack: 0.3 },
    fenv: env(0.04, 0.4, 0.6, 0.4),
    aenv: env(0.04, 0.5, 0.8, 0.4),
    pitchEnv: { semis: -1, time: 0.15 },
    vibrato: { rate: 3, cents: 8, delay: 0.4 },
    glide: 0.12,
    gain: 0.38,
  },
  'wobble-cave': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', cents: -7, gain: 0.5 },
      { wave: 'sawtooth', cents: 7, gain: 0.5 },
      { wave: 'square', semi: 12, gain: 0.1 },
    ],
    filter: { type: 'lowpass', cutoff: 320, q: 9, env: 1, keyTrack: 0.3 },
    fenv: env(0.01, 0.3, 0.6, 0.2),
    aenv: env(0.01, 0.3, 0.85, 0.2),
    filterLfo: { rate: 3.3, octaves: 2.2, beats: 0.5 },
    glide: 0.06,
    gain: 0.3,
  },
  'chocolate-thunder': {
    kind: 'synth',
    oscs: [
      { wave: 'square', gain: 0.5 },
      { wave: 'sawtooth', cents: 10, gain: 0.35 },
      { wave: 'square', semi: 12, gain: 0.15 },
    ],
    filter: { type: 'lowpass', cutoff: 600, q: 3, env: 1.8, keyTrack: 0.3 },
    fenv: env(0.004, 0.3, 0.3, 0.2),
    aenv: env(0.005, 0.35, 0.7, 0.2),
    drive: 0.7,
    glide: 0.05,
    gain: 0.42,
  },

  // ── Spark · bells & plucks ────────────────────────────────────────────────
  'star-bells': {
    kind: 'bell',
    ratio: 3.5,
    index: 5.5,
    indexEnd: 0.15,
    indexDecay: 0.9,
    aenv: env(0.002, 1.6, 0, 1.2),
    shimmer: { ratio: 2.76, gain: 0.12, decay: 0.4 },
    gain: 0.22,
  },
  'magic-dust': {
    kind: 'bell',
    ratio: 2,
    index: 3,
    indexEnd: 0,
    indexDecay: 0.12,
    aenv: env(0.001, 0.5, 0, 0.4),
    shimmer: { ratio: 4, gain: 0.15, decay: 0.15 },
    gain: 0.32,
  },
  'robot-raindrops': {
    kind: 'bell',
    wave: 'triangle',
    ratio: 1,
    index: 1.5,
    indexEnd: 0,
    indexDecay: 0.08,
    aenv: env(0.001, 0.25, 0, 0.15),
    pitchEnv: { semis: 12, time: 0.04 },
    filter: { cutoff: 1200, q: 12, env: 3, decay: 0.08 },
    gain: 0.34,
  },
  'ice-crystals': {
    kind: 'bell',
    ratio: 7.07,
    index: 2.5,
    indexEnd: 0.3,
    indexDecay: 1.5,
    aenv: env(0.003, 2.2, 0, 1.5),
    shimmer: { ratio: 11.3, gain: 0.06, decay: 0.5 },
    gain: 0.19,
  },

  // ── Puff · pads (always chords) ───────────────────────────────────────────
  'cloud-nap': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', cents: -8, gain: 0.3 },
      { wave: 'sawtooth', cents: 8, gain: 0.3 },
      { wave: 'triangle', semi: 12, gain: 0.15 },
    ],
    filter: { type: 'lowpass', cutoff: 900, q: 1, env: 0.8, keyTrack: 0.3 },
    fenv: env(0.6, 1.5, 0.6, 1.5),
    aenv: env(0.45, 1, 0.85, 1.6),
    vibrato: { rate: 4.5, cents: 5, delay: 0.5 },
    glide: 0.2,
    gain: 0.3,
    chord: true,
  },
  'dream-glow': {
    kind: 'synth',
    oscs: [
      { wave: 'table', table: 'organ', gain: 0.42 },
      { wave: 'sine', semi: 12, gain: 0.2 },
      { wave: 'table', table: 'hollow', cents: 6, gain: 0.14 },
    ],
    filter: { type: 'lowpass', cutoff: 2200, q: 2, env: 0.4, keyTrack: 0.2 },
    fenv: env(0.3, 1, 0.8, 1.5),
    aenv: env(0.3, 1.2, 0.8, 2),
    filterLfo: { rate: 0.3, octaves: 0.8 },
    glide: 0.2,
    gain: 0.27,
    chord: true,
  },
  'pillow-choir': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', cents: -6, gain: 0.5 },
      { wave: 'sawtooth', cents: 6, gain: 0.5 },
    ],
    filter: { type: 'lowpass', cutoff: 4000, q: 0.7, env: 0, keyTrack: 0 },
    fenv: env(0.3, 1, 1, 1),
    aenv: env(0.35, 0.8, 0.85, 1.4),
    vibrato: { rate: 5, cents: 12, delay: 0.3 },
    glide: 0.15,
    gain: 0.55,
    chord: true,
    formant: true,
  },
  'slow-sunrise': {
    kind: 'synth',
    oscs: [
      { wave: 'sawtooth', cents: -10, gain: 0.35 },
      { wave: 'sawtooth', cents: 10, gain: 0.35 },
      { wave: 'square', semi: -12, gain: 0.1 },
    ],
    filter: { type: 'lowpass', cutoff: 300, q: 3, env: 3, keyTrack: 0.2 },
    fenv: env(2.5, 2, 0.7, 2),
    aenv: env(1.2, 1, 0.9, 2.2),
    glide: 0.25,
    gain: 0.26,
    chord: true,
  },

  // ── Boom · drum kits ──────────────────────────────────────────────────────
  'stompy-kit': { kind: 'drums', tune: 0, decay: 1, tone: 0.1, drive: 0.25, metal: 0, gain: 1 },
  'pillow-drums': { kind: 'drums', tune: -3, decay: 0.85, tone: -0.7, drive: 0, metal: 0, gain: 1.15 },
  'robot-beats': { kind: 'drums', tune: 2, decay: 0.65, tone: 0.4, drive: 0.6, metal: 0.2, gain: 0.85 },
  'tin-can-band': { kind: 'drums', tune: 6, decay: 0.6, tone: 0.7, drive: 0.3, metal: 1, gain: 0.8 },

  // ── Mimic · voice ─────────────────────────────────────────────────────────
  'mimic-me': { kind: 'voice', semis: 0, robot: 0, gain: 0.6 },
  'mimic-chipmunk': { kind: 'voice', semis: 7, robot: 0, gain: 0.55 },
  'mimic-giant': { kind: 'voice', semis: -9, robot: 0, gain: 0.65 },
  'mimic-robot': { kind: 'voice', semis: 0, robot: 0.9, gain: 0.6 },
};

/** Mimic sings with this formant voice until a child teaches it a real sound. */
export const MIMIC_SINGER: SynthPatch = {
  kind: 'synth',
  oscs: [
    { wave: 'sawtooth', gain: 0.6 },
    { wave: 'sawtooth', cents: 7, gain: 0.3 },
  ],
  noise: 0.02,
  filter: { type: 'lowpass', cutoff: 5000, q: 0.7, env: 0, keyTrack: 0 },
  fenv: env(0.01, 0.2, 1, 0.2),
  aenv: env(0.03, 0.2, 0.8, 0.25),
  pitchEnv: { semis: -1, time: 0.06 },
  vibrato: { rate: 5.5, cents: 18, delay: 0.25 },
  glide: 0.07,
  gain: 0.5,
  formant: true,
};

/**
 * The metronome: Boom's plain kit playing the woodblock tick (drum TICK_PAD),
 * on a quiet channel so it guides without covering the child's drums.
 */
export const METRONOME = { preset: 'stompy-kit', volume: 0.28, vel: 0.6, accentVel: 0.9, accentBend: 3 } as const;

export function patchFor(presetId: string): Patch {
  return PATCHES[presetId] ?? PATCHES['bubble-lead'];
}
