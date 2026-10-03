import type { DrumSnap } from '../magic/timing';
import type { AgeMode, FxKind, FxLevels, MonsterKind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The Monster universe. Each monster is a musical role with a personality whose
// look hints at its sound. Sound *patches* live in the audio layer
// (src/audio/presets.ts); here we only describe identity, role and UI facts.
// ─────────────────────────────────────────────────────────────────────────────

export type Accessory =
  | 'none'
  | 'shades'
  | 'crown'
  | 'party'
  | 'headphones'
  | 'flower'
  | 'bow'
  | 'beanie'
  | 'halo';

export interface PresetInfo {
  id: string;
  name: string;
  /** Changing sound = changing costume. */
  accessory: Accessory;
}

export type KeyGlyph = 'bubble' | 'drum' | 'blob' | 'star' | 'cloud' | 'heart';

export interface MonsterInfo {
  kind: MonsterKind;
  name: string;
  role: string;
  /** Plain words for grown-ups reading over a child's shoulder. */
  description: string;
  color: string;
  colorLight: string;
  colorDark: string;
  /** Whether holding a key keeps the note going. */
  sustain: boolean;
  /** Percussive monsters get re-triggered (rolls) instead of held. */
  percussive: boolean;
  /** MIDI note of scale step 0 when the song is in C. */
  baseMidi: number;
  maxVoices: number;
  /** Notes one loop can hold; recording beyond it lets go of the oldest recording. */
  maxClipNotes: number;
  glyph: KeyGlyph;
  presets: PresetInfo[];
  defaultFx: FxLevels;
  /** How Sound Painting turns this monster's lines into notes. */
  paintMode: 'sustain' | 'hits';
}

const fx = (echo = 0, gloop = 0, chomper = 0, wiggle = 0): FxLevels => ({ echo, gloop, chomper, wiggle });

export const MONSTERS: Record<MonsterKind, MonsterInfo> = {
  bloop: {
    kind: 'bloop',
    name: 'Bloop',
    role: 'Lead Synth',
    description: 'Curious and bubbly. Sings the tune.',
    color: '#2eb8ff',
    colorLight: '#8fdcff',
    colorDark: '#1476d6',
    sustain: true,
    percussive: false,
    baseMidi: 60,
    maxVoices: 6,
    maxClipNotes: 96,
    glyph: 'bubble',
    presets: [
      { id: 'bubble-lead', name: 'Bubble Lead', accessory: 'none' },
      { id: 'laser-jelly', name: 'Laser Jelly', accessory: 'shades' },
      { id: 'rainbow-whistle', name: 'Rainbow Whistle', accessory: 'flower' },
      { id: 'moon-drops', name: 'Moon Drops', accessory: 'crown' },
      { id: 'alien-giggle', name: 'Alien Giggle', accessory: 'party' },
    ],
    defaultFx: fx(0, 0.35),
    paintMode: 'sustain',
  },
  boom: {
    kind: 'boom',
    name: 'Boom',
    role: 'Drums',
    description: 'Big, stompy and bouncy. Keeps the beat.',
    color: '#ff7a2f',
    colorLight: '#ffb27a',
    colorDark: '#d9501a',
    sustain: false,
    percussive: true,
    baseMidi: 36,
    maxVoices: 10,
    maxClipNotes: 160,
    glyph: 'drum',
    presets: [
      { id: 'stompy-kit', name: 'Stompy Kit', accessory: 'none' },
      { id: 'pillow-drums', name: 'Pillow Drums', accessory: 'beanie' },
      { id: 'robot-beats', name: 'Robot Beats', accessory: 'headphones' },
      { id: 'tin-can-band', name: 'Tin Can Band', accessory: 'party' },
    ],
    defaultFx: fx(0, 0.15),
    paintMode: 'hits',
  },
  grumble: {
    kind: 'grumble',
    name: 'Grumble',
    role: 'Bass',
    description: 'Huge, sleepy and wobbly. Makes the deep sounds.',
    color: '#4fd65c',
    colorLight: '#9cf08f',
    colorDark: '#23a03a',
    sustain: true,
    percussive: false,
    baseMidi: 36,
    maxVoices: 3,
    maxClipNotes: 96,
    glyph: 'blob',
    presets: [
      { id: 'big-belly-bass', name: 'Big Belly Bass', accessory: 'none' },
      { id: 'sleepy-dinosaur', name: 'Sleepy Dinosaur', accessory: 'beanie' },
      { id: 'wobble-cave', name: 'Wobble Cave', accessory: 'headphones' },
      { id: 'chocolate-thunder', name: 'Chocolate Thunder', accessory: 'crown' },
    ],
    defaultFx: fx(0, 0),
    paintMode: 'sustain',
  },
  spark: {
    kind: 'spark',
    name: 'Spark',
    role: 'Plucks',
    description: 'Fast, excitable and shiny. Bells and twinkles.',
    color: '#ffd233',
    colorLight: '#ffe98a',
    colorDark: '#e0a300',
    sustain: false,
    percussive: true,
    baseMidi: 72,
    maxVoices: 8,
    maxClipNotes: 96,
    glyph: 'star',
    presets: [
      { id: 'star-bells', name: 'Star Bells', accessory: 'none' },
      { id: 'magic-dust', name: 'Magic Dust', accessory: 'halo' },
      { id: 'robot-raindrops', name: 'Robot Raindrops', accessory: 'shades' },
      { id: 'ice-crystals', name: 'Ice Crystals', accessory: 'crown' },
    ],
    defaultFx: fx(0.35, 0.3),
    paintMode: 'hits',
  },
  puff: {
    kind: 'puff',
    name: 'Puff',
    role: 'Pads',
    description: 'Soft, floating and dreamy. Makes clouds of sound.',
    color: '#b9a5ff',
    colorLight: '#f1edff',
    colorDark: '#7f69e0',
    sustain: true,
    percussive: false,
    baseMidi: 48,
    maxVoices: 3,
    maxClipNotes: 96,
    glyph: 'cloud',
    presets: [
      { id: 'cloud-nap', name: 'Cloud Nap', accessory: 'none' },
      { id: 'dream-glow', name: 'Dream Glow', accessory: 'halo' },
      { id: 'pillow-choir', name: 'Pillow Choir', accessory: 'bow' },
      { id: 'slow-sunrise', name: 'Slow Sunrise', accessory: 'flower' },
    ],
    defaultFx: fx(0, 0.5),
    paintMode: 'sustain',
  },
  mimic: {
    kind: 'mimic',
    name: 'Mimic',
    role: 'Voice',
    description: 'Copies voices. Record a sound and play it like an instrument.',
    color: '#ff5fa2',
    colorLight: '#ffa3cb',
    colorDark: '#d93a7e',
    sustain: true,
    percussive: false,
    baseMidi: 60,
    maxVoices: 4,
    maxClipNotes: 96,
    glyph: 'heart',
    presets: [
      { id: 'mimic-me', name: 'Just Me', accessory: 'none' },
      { id: 'mimic-chipmunk', name: 'Chipmunk', accessory: 'party' },
      { id: 'mimic-giant', name: 'Giant', accessory: 'crown' },
      { id: 'mimic-robot', name: 'Robot', accessory: 'headphones' },
    ],
    defaultFx: fx(0.2, 0.25),
    paintMode: 'sustain',
  },
};

/** The four monsters every new song starts with. */
export const CORE_MONSTERS: MonsterKind[] = ['bloop', 'boom', 'grumble', 'spark'];

/** Every monster a child can invite through "Add Monster". */
export const ALL_MONSTERS: MonsterKind[] = ['bloop', 'boom', 'grumble', 'spark', 'puff', 'mimic'];

export interface DrumPad {
  id: string;
  name: string;
}

export const DRUM_PADS: DrumPad[] = [
  { id: 'kick', name: 'Big drum' },
  { id: 'snare', name: 'Snappy drum' },
  { id: 'hat', name: 'Tiny cymbal' },
  { id: 'clap', name: 'Clap' },
  { id: 'tom', name: 'Bongo drum' },
  { id: 'crash', name: 'Crash cymbal' },
  { id: 'cowbell', name: 'Cowbell' },
  { id: 'boing', name: 'Boing' },
];

export interface FxInfo {
  kind: FxKind;
  name: string;
  does: string;
  color: string;
}

export const FX_BUDDIES: Record<FxKind, FxInfo> = {
  echo: { kind: 'echo', name: 'Echo', does: 'repeats things', color: '#3de0c8' },
  gloop: { kind: 'gloop', name: 'Gloop', does: 'makes it big and spacey', color: '#8be04e' },
  chomper: { kind: 'chomper', name: 'Chomper', does: 'makes it crunchy', color: '#b061ff' },
  wiggle: { kind: 'wiggle', name: 'Wiggle', does: 'makes it wobble', color: '#ff5ccf' },
};

/** Mode-dependent capabilities. Complexity is revealed gradually, never all at once. */
export interface ModeCaps {
  keys: number;
  drumPads: number;
  maxMonsters: number;
  fx: FxKind[];
  redo: boolean;
  magicPanel: boolean;
  showNames: boolean;
  /** Melodic monsters: soft pull towards this grid (beats) … */
  quantizeGrid: number;
  /** … by this much (1 = exactly on the grid). */
  quantizeStrength: number;
  /** Boom: hard snap with an on-beat magnet (see snapDrum). */
  drumSnap: DrumSnap;
  rowMuteSolo: boolean;
}

export const MODE_CAPS: Record<AgeMode, ModeCaps> = {
  little: {
    keys: 8,
    drumPads: 6,
    maxMonsters: 4,
    fx: ['echo', 'gloop'],
    redo: false,
    magicPanel: false,
    showNames: false,
    quantizeGrid: 0.5,
    quantizeStrength: 0.9,
    drumSnap: { grid: 0.5, strongGrid: 1, strongWindow: 0.3 },
    rowMuteSolo: false,
  },
  maker: {
    keys: 8,
    drumPads: 8,
    maxMonsters: 6,
    fx: ['echo', 'gloop', 'chomper', 'wiggle'],
    redo: true,
    magicPanel: true,
    showNames: true,
    quantizeGrid: 0.25,
    quantizeStrength: 0.75,
    drumSnap: { grid: 0.25, strongGrid: 0.5, strongWindow: 0.1 },
    rowMuteSolo: true,
  },
};

/** FX buddies have three friendly levels: asleep, a little, a lot. */
export const FX_STEPS = [0, 0.4, 0.8] as const;

export function nextFxLevel(level: number): number {
  const idx = FX_STEPS.findIndex((s) => Math.abs(s - level) < 0.05);
  if (idx < 0) return FX_STEPS[1];
  return FX_STEPS[(idx + 1) % FX_STEPS.length];
}

export function fxStepIndex(level: number): number {
  let best = 0;
  let bestDist = Infinity;
  FX_STEPS.forEach((s, i) => {
    const d = Math.abs(s - level);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function presetInfo(kind: MonsterKind, presetId: string): PresetInfo {
  const list = MONSTERS[kind].presets;
  return list.find((p) => p.id === presetId) ?? list[0];
}

export function nextPreset(kind: MonsterKind, presetId: string): string {
  const list = MONSTERS[kind].presets;
  const idx = list.findIndex((p) => p.id === presetId);
  return list[(idx + 1) % list.length].id;
}

/** Number of keys/pads on the play surface for a monster in a mode. */
export function surfaceSize(kind: MonsterKind, mode: AgeMode): number {
  return kind === 'boom' ? MODE_CAPS[mode].drumPads : MODE_CAPS[mode].keys;
}
