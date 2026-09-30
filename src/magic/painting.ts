import { MONSTERS } from '../model/monsters';
import type { MonsterKind, PaintBrush, Painting, Stroke } from '../model/types';
import { softQuantize, wrap } from './timing';

// ─────────────────────────────────────────────────────────────────────────────
// SOUND PAINTING · drawings become sound.
//   left → right  = time (the canvas is one loop)
//   up ↕ down     = pitch (8 lanes, locked to the song's scale)
//   colour        = which monster sings it
//   dots / stars  = short notes;  long flat lines = held notes
//   pen pressure  = loudness
// Playful rather than literal: a line going backwards is simply ignored where it
// re-crosses time it already covered.
// ─────────────────────────────────────────────────────────────────────────────

export interface PaintNote {
  id: string;
  strokeId: string;
  monster: MonsterKind;
  beat: number;
  dur: number;
  step: number;
  vel: number;
}

export const PAINT_LANES = 8;
export const PAINT_GRID = 0.25;
const DOT_EXTENT = 0.015;
const MAX_NOTES_PER_STROKE = 48;

export const RAINBOW_CYCLE: MonsterKind[] = ['bloop', 'spark', 'puff'];

export function laneForY(y: number): number {
  const lane = Math.round((1 - Math.min(1, Math.max(0, y))) * (PAINT_LANES - 1));
  return Math.min(PAINT_LANES - 1, Math.max(0, lane));
}

export function yForLane(lane: number): number {
  return 1 - lane / (PAINT_LANES - 1);
}

function brushMonster(brush: PaintBrush, index: number): MonsterKind {
  return brush === 'rainbow' ? RAINBOW_CYCLE[index % RAINBOW_CYCLE.length] : brush;
}

function velocity(stroke: Stroke): number {
  return 0.55 + stroke.weight * 0.4;
}

function beatForX(x: number, loopBeats: number): number {
  const clamped = Math.min(0.99999, Math.max(0, x));
  return wrap(softQuantize(clamped * loopBeats, PAINT_GRID, 1), loopBeats);
}

export function strokeToNotes(stroke: Stroke, loopBeats: number): PaintNote[] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < stroke.points.length; i += 2) pts.push([stroke.points[i], stroke.points[i + 1]]);
  if (pts.length === 0) return [];
  const vel = velocity(stroke);
  const out: PaintNote[] = [];
  const push = (beat: number, dur: number, step: number) => {
    const idx = out.length;
    out.push({ id: `${stroke.id}:${idx}`, strokeId: stroke.id, monster: brushMonster(stroke.brush, idx), beat, dur, step, vel });
  };

  if (stroke.kind === 'stars') {
    const seen = new Set<string>();
    for (const [x, y] of pts) {
      const beat = beatForX(x, loopBeats);
      const step = laneForY(y);
      const key = `${beat}:${step}`;
      if (seen.has(key)) continue;
      seen.add(key);
      push(beat, 0.5, step);
      if (out.length >= MAX_NOTES_PER_STROKE) break;
    }
    return out;
  }

  const xs = pts.map((p) => p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (maxX - minX < DOT_EXTENT || pts.length === 1) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    push(beatForX(mx, loopBeats), PAINT_GRID, laneForY(my));
    return out;
  }

  // Sample the line at the centre of every grid column it crosses (first crossing wins).
  const columns = Math.round(loopBeats / PAINT_GRID);
  const samples = new Map<number, number>();
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const cStart = Math.max(0, Math.ceil(lo * columns - 0.5));
    const cEnd = Math.min(columns - 1, Math.floor(hi * columns - 0.5));
    for (let c = cStart; c <= cEnd; c++) {
      if (samples.has(c)) continue;
      const cx = (c + 0.5) / columns;
      const t = x1 === x0 ? 0 : (cx - x0) / (x1 - x0);
      samples.set(c, y0 + (y1 - y0) * t);
    }
  }
  const cols = [...samples.keys()].sort((a, b) => a - b);
  if (cols.length === 0) {
    push(beatForX(minX, loopBeats), PAINT_GRID, laneForY(pts[0][1]));
    return out;
  }

  const mode = MONSTERS[brushMonster(stroke.brush, 0)].paintMode;
  if (mode === 'hits' && stroke.brush !== 'rainbow') {
    // Percussive monsters: a hit every eighth note, plus whenever the line jumps lanes.
    let lastLane = -1;
    for (const c of cols) {
      const lane = laneForY(samples.get(c)!);
      if (c % 2 === 0 || lane !== lastLane) push(c * PAINT_GRID, 0.5, lane);
      lastLane = lane;
      if (out.length >= MAX_NOTES_PER_STROKE) break;
    }
    return out;
  }

  // Sustaining monsters: flat stretches of a line become one long note.
  let startCol = cols[0];
  let prevCol = cols[0];
  let lane = laneForY(samples.get(cols[0])!);
  const flush = () => push(startCol * PAINT_GRID, (prevCol - startCol + 1) * PAINT_GRID, lane);
  for (let i = 1; i < cols.length; i++) {
    const c = cols[i];
    const l = laneForY(samples.get(c)!);
    if (c === prevCol + 1 && l === lane) {
      prevCol = c;
      continue;
    }
    flush();
    if (out.length >= MAX_NOTES_PER_STROKE) return out;
    startCol = c;
    prevCol = c;
    lane = l;
  }
  flush();
  return out;
}

const cache = new WeakMap<Painting, { loopBeats: number; notes: PaintNote[] }>();

/** All notes of a painting, cached per (immutable) painting object. */
export function paintingNotes(painting: Painting, loopBeats: number): PaintNote[] {
  const hit = cache.get(painting);
  if (hit && hit.loopBeats === loopBeats) return hit.notes;
  const notes = painting.strokes.flatMap((s) => strokeToNotes(s, loopBeats)).sort((a, b) => a.beat - b.beat);
  cache.set(painting, { loopBeats, notes });
  return notes;
}
