import { ensureRows, fillRow, rowIsEmpty } from '../magic/arrange';
import { insertRecordedNote, setNoteDuration, type InsertOptions } from '../magic/recorder';
import { newId } from './ids';
import { FX_STEPS, nextFxLevel, nextPreset } from './monsters';
import { activeClip, createClip, createTrack } from './project';
import type { FxKind, MonsterKind, NoteEvent, Project, ScaleId, Stroke, Track } from './types';
import { PAINT_ROW } from './types';

// Pure, immutable project edits. The store wraps each one in an undoable commit.

export function updateTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const n = fn(t);
    if (n !== t) changed = true;
    return n;
  });
  return changed ? { ...p, tracks } : p;
}

export const setPreset = (p: Project, trackId: string, preset: string) =>
  updateTrack(p, trackId, (t) => (t.preset === preset ? t : { ...t, preset }));

export const cyclePreset = (p: Project, trackId: string) =>
  updateTrack(p, trackId, (t) => ({ ...t, preset: nextPreset(t.monster, t.preset) }));

export const cycleFx = (p: Project, trackId: string, fx: FxKind) =>
  updateTrack(p, trackId, (t) => ({ ...t, fx: { ...t.fx, [fx]: nextFxLevel(t.fx[fx]) } }));

export const setFx = (p: Project, trackId: string, fx: FxKind, level: number) =>
  updateTrack(p, trackId, (t) => ({ ...t, fx: { ...t.fx, [fx]: level } }));

export const toggleSleep = (p: Project, trackId: string) =>
  updateTrack(p, trackId, (t) => ({ ...t, sleeping: !t.sleeping }));

export const toggleSolo = (p: Project, trackId: string) =>
  updateTrack(p, trackId, (t) => ({ ...t, solo: !t.solo }));

export function clearLoop(p: Project, trackId: string): Project {
  return updateTrack(p, trackId, (t) => {
    const clip = activeClip(t);
    if (!clip || clip.notes.length === 0) return t;
    return { ...t, clips: t.clips.map((c) => (c.id === clip.id ? { ...c, notes: [] } : c)) };
  });
}

export function addMonster(p: Project, monster: MonsterKind): Project {
  if (p.tracks.some((t) => t.monster === monster)) return p;
  const track = createTrack(monster);
  const next = { ...p, tracks: [...p.tracks, track] };
  return { ...next, arrangement: ensureRows(next) };
}

export function removeMonster(p: Project, trackId: string): Project {
  if (p.tracks.length <= 1 || !p.tracks.some((t) => t.id === trackId)) return p;
  const next = { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) };
  return { ...next, arrangement: ensureRows(next) };
}

export const setTempo = (p: Project, tempo: number) => (p.tempo === tempo ? p : { ...p, tempo });
export const setScale = (p: Project, scale: ScaleId) => (p.scale === scale ? p : { ...p, scale });
export const renameProject = (p: Project, name: string) =>
  p.name === name || !name.trim() ? p : { ...p, name: name.trim().slice(0, 60) };

/**
 * Drop a freshly played note into a monster's loop (creating the loop if needed).
 * The first note of a loop also fills that monster's row in Monster Blocks, so the
 * song immediately contains what the child made.
 */
export function recordNote(p: Project, trackId: string, note: NoteEvent, opts: InsertOptions): Project {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) return p;
  let clip = activeClip(track);
  const wasEmpty = !clip || clip.notes.length === 0;
  let next = p;
  if (!clip) {
    clip = createClip(p.loopBeats);
    const created = clip;
    next = updateTrack(next, trackId, (t) => ({ ...t, clips: [...t.clips, created], activeClipId: created.id }));
  }
  const updated = insertRecordedNote(clip, note, opts);
  next = updateTrack(next, trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === updated.id ? updated : c)) }));
  if (wasEmpty && rowIsEmpty(next.arrangement, trackId)) {
    next = { ...next, arrangement: fillRow(ensureRows(next), trackId, updated.id) };
  }
  return next;
}

export function setRecordedDuration(p: Project, trackId: string, noteId: string, dur: number): Project {
  return updateTrack(p, trackId, (t) => {
    const clip = activeClip(t);
    if (!clip) return t;
    const updated = setNoteDuration(clip, noteId, dur);
    if (updated === clip) return t;
    return { ...t, clips: t.clips.map((c) => (c.id === clip.id ? updated : c)) };
  });
}

export function setTrackSample(p: Project, trackId: string, sampleId: string | null): Project {
  return updateTrack(p, trackId, (t) => (t.sampleId === sampleId ? t : { ...t, sampleId }));
}

// ── Sound Painting ───────────────────────────────────────────────────────────

export function addStroke(p: Project, stroke: Stroke): Project {
  const wasEmpty = p.painting.strokes.length === 0;
  let next: Project = { ...p, painting: { ...p.painting, strokes: [...p.painting.strokes, stroke] } };
  if (wasEmpty && rowIsEmpty(next.arrangement, PAINT_ROW)) {
    next = { ...next, arrangement: fillRow(ensureRows(next), PAINT_ROW, PAINT_ROW) };
  }
  return next;
}

export function eraseStrokes(p: Project, ids: string[]): Project {
  if (ids.length === 0) return p;
  const drop = new Set(ids);
  const strokes = p.painting.strokes.filter((s) => !drop.has(s.id));
  if (strokes.length === p.painting.strokes.length) return p;
  return { ...p, painting: { ...p.painting, strokes } };
}

export const togglePaintSleep = (p: Project) => ({ ...p, painting: { ...p.painting, sleeping: !p.painting.sleeping } });

export function newStrokeId(): string {
  return newId('s');
}

/** Level index helpers re-exported for UI convenience. */
export const FX_LEVELS = FX_STEPS;
