import type { ScaleId } from '../model/types';
import { SCALES } from './scales';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · the musical sky.
// The open night sky of the Lab stage is a bell instrument: touch it and Spark's
// Star Bells ring in the song's key. Higher on screen is higher, and (like the
// keys below) further right is higher too, so a sweep along the sky plays a
// twinkly run. Positions are fractions of the stage (0..1, y = 0 at the top), so
// any stage size or shape plays the same; the result is a scale STEP, never a
// pitch (the studio resolves it in the song's mood and key at play time).
// The moon rings a soft low bell: the mood's root, an octave below and at home.
// Pure: no DOM, no audio. Sky notes are never recorded and never saved.
// ─────────────────────────────────────────────────────────────────────────────

/** Spark steps the sky rings, from the bottom-left corner … */
export const SKY_LOW = 0;
/** … to the top-right corner (a high A in C: bright, not shrill). */
export const SKY_HIGH = 9;
/** Left-to-right weighs this much, bottom-to-top the rest. */
const ACROSS = 0.7;
/** A sweep rings at most one bell this often (ms). */
export const SKY_GAP_MS = 70;

/**
 * How a sky bell is played (Spark's own Star Bells, softer than a key). A lone
 * tap rings out clearly; a bell within `sweepMs` of the last one is part of a
 * sweep and rings softer, so a run never piles up louder than a key.
 */
export const SKY_BELL = { vel: 0.68, sweepVel: 0.45, sweepMs: 200, dur: 0.6 } as const;
/**
 * The moon's bell. Mashing it rings at most one bell every `gapMs` (the moon
 * still winks), and a bell while the last one still rings is softer (`again`).
 */
export const MOON_BELL = { vels: [0.52, 0.3], dur: 1.4, gapMs: 350, again: 0.5 } as const;

/** A sky bell's velocity, `sinceMs` after the sky last rang. */
export function skyVel(sinceMs: number): number {
  return sinceMs < SKY_BELL.sweepMs ? SKY_BELL.sweepVel : SKY_BELL.vel;
}

/** How loud the moon rings, `sinceMs` after it last rang: 1, softer (`again`), or 0 (not yet). */
export function moonLevel(sinceMs: number): number {
  if (sinceMs < MOON_BELL.gapMs) return 0;
  return sinceMs < MOON_BELL.dur * 1000 ? MOON_BELL.again : 1;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** The bell at a point of the stage (x, y in 0..1 of the stage box; y = 0 is the top). */
export function skyStep(x: number, y: number): number {
  const across = clamp01(x);
  const up = 1 - clamp01(y);
  const raw = SKY_LOW + (SKY_HIGH - SKY_LOW) * (ACROSS * across + (1 - ACROSS) * up);
  return Math.min(SKY_HIGH, Math.max(SKY_LOW, Math.round(raw)));
}

/** May a sweep ring its next bell now (`now`, `last` in ms)? */
export function skyReady(last: number, now: number, gap = SKY_GAP_MS): boolean {
  return !(now - last < gap);
}

/** The moon's bell: the mood's root an octave down, with the root above it. */
export function moonSteps(scale: ScaleId): [number, number] {
  return [-SCALES[scale].steps.length, 0];
}
