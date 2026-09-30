import { seededRandom } from '../model/ids';
import { activeClip, trackHasLoop } from '../model/project';
import type { Arrangement, MonsterKind, Project } from '../model/types';
import { PAINT_ROW } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER BLOCKS · arrangement operations (all pure, all undoable by the store).
// ─────────────────────────────────────────────────────────────────────────────

export function cloneArrangement(a: Arrangement): Arrangement {
  const rows: Record<string, (string | null)[]> = {};
  for (const [k, v] of Object.entries(a.rows)) rows[k] = [...v];
  return { length: a.length, rows };
}

/** Make sure every track (and the painting) has a row of the right length. */
export function ensureRows(project: Project): Arrangement {
  const a = cloneArrangement(project.arrangement);
  const ids = [...project.tracks.map((t) => t.id), PAINT_ROW];
  for (const id of ids) {
    const row = a.rows[id] ?? [];
    a.rows[id] = Array.from({ length: a.length }, (_, i) => row[i] ?? null);
  }
  for (const id of Object.keys(a.rows)) if (!ids.includes(id)) delete a.rows[id];
  return a;
}

export function fillRow(a: Arrangement, rowId: string, value: string): Arrangement {
  const next = cloneArrangement(a);
  next.rows[rowId] = new Array(a.length).fill(value);
  return next;
}

export function setCell(a: Arrangement, rowId: string, col: number, value: string | null): Arrangement {
  if (col < 0 || col >= a.length) return a;
  const next = cloneArrangement(a);
  const row = next.rows[rowId] ?? new Array(a.length).fill(null);
  row[col] = value;
  next.rows[rowId] = row;
  return next;
}

/** Move a block along its row. Dropping onto another block swaps them. */
export function moveCell(a: Arrangement, rowId: string, from: number, to: number): Arrangement {
  if (from === to || from < 0 || to < 0 || from >= a.length || to >= a.length) return a;
  const next = cloneArrangement(a);
  const row = next.rows[rowId];
  if (!row) return a;
  const tmp = row[to];
  row[to] = row[from];
  row[from] = tmp;
  return next;
}

export function rowIsEmpty(a: Arrangement, rowId: string): boolean {
  return !(a.rows[rowId] ?? []).some(Boolean);
}

// ── Monster Magic: "make it a song" ─────────────────────────────────────────

interface Layer {
  rowId: string;
  clipId: string;
  monster: MonsterKind | 'paint';
}

const RHYTHM: (MonsterKind | 'paint')[] = ['boom', 'grumble'];

const ENTRY_ORDERS: (MonsterKind | 'paint')[][] = [
  // Beat first: drums, then bass, then the tune.
  ['boom', 'grumble', 'spark', 'puff', 'bloop', 'paint', 'mimic'],
  // Dreamy start: clouds and twinkles, then the band arrives.
  ['puff', 'spark', 'boom', 'grumble', 'bloop', 'paint', 'mimic'],
  // Tune first: the melody introduces itself, then the groove.
  ['bloop', 'paint', 'boom', 'grumble', 'spark', 'puff', 'mimic'],
];

/**
 * Turn whatever loops exist into a little song: layers enter one by one, there is
 * a breakdown where the rhythm drops out, and everyone plays at the end. Each seed
 * gives a different (but always musical) arrangement so repeated taps reward play.
 */
export function magicArrange(project: Project, seed: number): Arrangement {
  const base = ensureRows(project);
  const length = base.length;
  const rnd = seededRandom(seed);

  const layers: Layer[] = [];
  for (const t of project.tracks) {
    const clip = activeClip(t);
    if (clip && trackHasLoop(t) && !t.sleeping) layers.push({ rowId: t.id, clipId: clip.id, monster: t.monster });
  }
  if (project.painting.strokes.length > 0 && !project.painting.sleeping) {
    layers.push({ rowId: PAINT_ROW, clipId: PAINT_ROW, monster: 'paint' });
  }

  const next = cloneArrangement(base);
  for (const id of Object.keys(next.rows)) next.rows[id] = new Array(length).fill(null);
  if (layers.length === 0) return next;

  const order = ENTRY_ORDERS[Math.abs(Math.floor(seed)) % ENTRY_ORDERS.length];
  layers.sort((a, b) => order.indexOf(a.monster) - order.indexOf(b.monster));

  if (layers.length === 1 || length < 4) {
    for (const l of layers) next.rows[l.rowId] = new Array(length).fill(l.clipId);
    return next;
  }

  const breakdownAt = length >= 6 && layers.length >= 2 && rnd() < 0.85 ? length - 3 - (rnd() < 0.3 ? 1 : 0) : -1;
  const entryWindow = breakdownAt > 0 ? breakdownAt : length - 1;
  layers.forEach((layer, i) => {
    const enter = Math.min(entryWindow - 1, Math.floor((i * entryWindow) / layers.length));
    for (let col = Math.max(0, enter); col < length; col++) next.rows[layer.rowId][col] = layer.clipId;
  });

  if (breakdownAt > 0) {
    let dropped = layers.filter((l) => RHYTHM.includes(l.monster));
    if (dropped.length === 0 || dropped.length === layers.length) dropped = [layers[0]];
    for (const l of dropped) next.rows[l.rowId][breakdownAt] = null;
    // Make sure the breakdown block still has somebody singing.
    const stillPlaying = layers.some((l) => next.rows[l.rowId][breakdownAt]);
    if (!stillPlaying) next.rows[layers[layers.length - 1].rowId][breakdownAt] = layers[layers.length - 1].clipId;
  }
  return next;
}
