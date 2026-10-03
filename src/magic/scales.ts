import { MONSTERS } from '../model/monsters';
import type { MonsterKind, ScaleId } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · scale locking.
// Keys on the play surface are *scale steps*, never raw pitches. Whatever a child
// presses is always inside the song's scale, and every monster shares it, so any
// combination of loops is harmonically compatible.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScaleInfo {
  id: ScaleId;
  /** What kids see (Monster Maker mode). */
  kidName: string;
  /** What grown-ups see. */
  musicName: string;
  steps: number[];
  /**
   * Letter offset from the tonic for each step (0 = the tonic's letter … 6), so
   * note names are spelled from the scale degree: D major has F♯, not G♭.
   * Empty for chromatic, which is spelled from a sharp or flat table instead.
   */
  degrees: number[];
  /** Which tonic spelling the mood reads with: major-type (E♭, B♭) or minor-type (C♯, G♯). */
  family: 'major' | 'minor';
}

export const SCALES: Record<ScaleId, ScaleInfo> = {
  pentatonicMajor: {
    id: 'pentatonicMajor',
    kidName: 'Happy',
    musicName: 'Major pentatonic',
    steps: [0, 2, 4, 7, 9],
    degrees: [0, 1, 2, 4, 5],
    family: 'major',
  },
  pentatonicMinor: {
    id: 'pentatonicMinor',
    kidName: 'Mystery',
    musicName: 'Minor pentatonic',
    steps: [0, 3, 5, 7, 10],
    degrees: [0, 2, 3, 4, 6],
    family: 'minor',
  },
  major: { id: 'major', kidName: 'Sunny', musicName: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], degrees: [0, 1, 2, 3, 4, 5, 6], family: 'major' },
  minor: { id: 'minor', kidName: 'Moody', musicName: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10], degrees: [0, 1, 2, 3, 4, 5, 6], family: 'minor' },
  // The blue note is spelled as a flat 5th (C E♭ F G♭ G B♭).
  blues: { id: 'blues', kidName: 'Bluesy', musicName: 'Blues', steps: [0, 3, 5, 6, 7, 10], degrees: [0, 2, 3, 4, 4, 6], family: 'minor' },
  chromatic: {
    id: 'chromatic',
    kidName: 'Wild',
    musicName: 'Chromatic',
    steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    degrees: [],
    family: 'major',
  },
};

export const SCALE_ORDER: ScaleId[] = ['pentatonicMajor', 'pentatonicMinor', 'major', 'minor', 'blues', 'chromatic'];

/** Scale step → semitone offset from the root (steps may exceed one octave or go negative). */
export function stepToSemitone(step: number, scale: ScaleId): number {
  const s = SCALES[scale].steps;
  const n = s.length;
  const octave = Math.floor(step / n);
  const idx = ((step % n) + n) % n;
  return octave * 12 + s[idx];
}

/** Key choice for a monster → MIDI pitch, already locked to the song's key and scale. */
export function stepToMidi(step: number, monster: MonsterKind, scale: ScaleId, key: number): number {
  return MONSTERS[monster].baseMidi + key + stepToSemitone(step, scale);
}

/**
 * Pads (Puff) play soft chords. Stacking every other scale step keeps chords inside
 * the scale, so a pad can never clash with the melody or the bass.
 */
export function chordSteps(step: number): number[] {
  return [step, step + 2, step + 4];
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Mimic plays a recorded voice at different speeds. Keys are centred around the
 * original recording (step 2 = as recorded) so kids hear themselves low and high.
 */
export function mimicSemitones(step: number, scale: ScaleId): number {
  return stepToSemitone(step, scale) - stepToSemitone(2, scale);
}
