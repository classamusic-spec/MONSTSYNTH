// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · time helpers. Pure functions, no audio, fully unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

/** Beats closer than this count as the same instant (floating-point dust). */
const EPS = 1e-9;

/** Positive modulo: wraps any beat into [0, length). */
export function wrap(beat: number, length: number): number {
  const r = beat % length;
  const w = r < 0 ? r + length : r;
  // Guard against floating point landing exactly on `length`.
  return w >= length - 1e-9 ? 0 : w;
}

/**
 * Soft quantisation: pulls a beat towards the nearest grid line by `strength`
 * (0 = untouched, 1 = hard snap). Kids' timing is loose; a strong pull keeps
 * loops tight while leaving a hint of human feel.
 */
export function softQuantize(beat: number, grid: number, strength: number): number {
  if (grid <= 0 || strength <= 0) return beat;
  const target = Math.round(beat / grid) * grid;
  const s = Math.min(1, strength);
  const q = beat + (target - beat) * s;
  // Snap away floating point dust when the pull is (almost) complete.
  return Math.abs(q - target) < 1e-6 ? target : q;
}

/**
 * How drums snap: always exactly onto the grid, with a magnet towards the
 * strong beats. A tap within `strongWindow` of a strong beat lands on it, so a
 * late "on the beat" tap stays on the beat instead of slipping onto the "and".
 */
export interface DrumSnap {
  grid: number;
  strongGrid: number;
  strongWindow: number;
}

/** Hard drum snap with an on-beat magnet. The result is an exact multiple of `grid`. */
export function snapDrum(beat: number, s: DrumSnap): number {
  const strong = Math.round(beat / s.strongGrid) * s.strongGrid;
  // `+ 0` turns -0 (a tap just before beat 0) into a plain 0.
  if (Math.abs(beat - strong) <= s.strongWindow + EPS) return strong + 0;
  return Math.round(beat / s.grid) * s.grid + 0;
}

/**
 * A finger bounce: the same drum hit again within `ms` (a da-dum the child did
 * not mean). Beats are transport beats; `tempo` in bpm.
 */
export function isBounce(prevAbs: number, abs: number, tempo: number, ms = 80): boolean {
  return abs >= prevAbs && abs - prevAbs < (ms / 1000) * (tempo / 60);
}

/** Grid slot index a (quantised) beat falls into. */
export function gridSlot(beat: number, grid: number): number {
  return Math.round(beat / grid);
}

/** Grid for note ends (sixteenths). */
export const DUR_GRID = 0.25;

/**
 * Length of a held note whose (snapped) start is `start`: its *end* snaps to the
 * grid, so lines stop on the beat. At least one grid step, at most `maxBeats`.
 */
export function snapDuration(start: number, rawDur: number, maxBeats: number, grid = DUR_GRID): number {
  const end = Math.round((start + rawDur) / grid) * grid;
  return Math.min(maxBeats, Math.max(grid, end - start));
}

/**
 * Grid lines k·grid with from <= line < to and line > after. Adjacent windows
 * [a, b) and [b, c) never share or skip a line, whatever the floating point.
 */
export function gridLinesIn(from: number, to: number, grid: number, after = -Infinity): number[] {
  const out: number[] = [];
  // Written so that NaN or infinite input returns nothing (never loops forever).
  if (!(grid > 0) || !(to > from) || !Number.isFinite(from) || !Number.isFinite(to)) return out;
  for (let k = Math.floor(from / grid) - 1; ; k++) {
    const line = k * grid;
    if (line >= to - EPS) break;
    if (line >= from - EPS && line > after + EPS) out.push(line);
  }
  return out;
}

/** The first time (at or after `fromAbs`) a note at `beatInLoop` comes round again. */
export function nextOccurrence(beatInLoop: number, loopBeats: number, fromAbs: number): number {
  const k = Math.ceil((fromAbs - beatInLoop - EPS) / loopBeats);
  return k * loopBeats + beatInLoop + 0;
}

/** The first multiple of `step` at or after `abs`. */
export function nextLine(abs: number, step: number): number {
  return Math.ceil((abs - EPS) / step) * step + 0;
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats * 60) / tempo;
}

export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds * tempo) / 60;
}
