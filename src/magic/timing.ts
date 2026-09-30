// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · time helpers. Pure functions, no audio, fully unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Grid slot index a (quantised) beat falls into. */
export function gridSlot(beat: number, grid: number): number {
  return Math.round(beat / grid);
}

/** Quantise a duration to the grid with a sensible minimum. */
export function quantizeDuration(dur: number, grid: number, maxBeats: number): number {
  const q = Math.max(grid, Math.round(dur / grid) * grid);
  return Math.min(maxBeats, q);
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats * 60) / tempo;
}

export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds * tempo) / 60;
}
