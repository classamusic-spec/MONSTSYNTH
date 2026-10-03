import type { MonsterKind } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Visual bus: how sound becomes animation. Live notes are emitted instantly;
// sequenced notes are emitted when they actually leave the speakers, so a monster
// squashes on the beat you hear — not when the note was scheduled.
// Listeners animate DOM nodes directly (no React re-render per note).
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteVisual {
  trackId: string | null;
  monster: MonsterKind;
  step: number;
  vel: number;
  /** Seconds the note lasts. */
  dur: number;
  source: 'live' | 'loop' | 'paint';
  noteId?: string;
}

export interface StudioPosition {
  playing: boolean;
  recording: boolean;
  armed: boolean;
  mode: 'loop' | 'song';
  /** Audible transport beat (what you hear right now). */
  beat: number;
  loopBeats: number;
  songBeats: number;
  /** 0..1 output level (measured when read). */
  readonly level: number;
}

export type StudioEvent =
  | { type: 'finale' }
  | { type: 'wake' }
  | { type: 'record-start' }
  | { type: 'record-stop'; notes: number }
  | { type: 'loop-created'; trackId: string }
  /** Play (or Magic) was pressed with nothing to hear: the Coach shows where the music comes from. */
  | { type: 'nothing-to-play' }
  | { type: 'mic-level'; level: number };

type NoteListener = (v: NoteVisual) => void;
type FrameListener = (p: StudioPosition) => void;
type EventListener = (e: StudioEvent) => void;

const noteListeners = new Set<NoteListener>();
const frameListeners = new Set<FrameListener>();
const eventListeners = new Set<EventListener>();

export function onNote(l: NoteListener): () => void {
  noteListeners.add(l);
  return () => noteListeners.delete(l);
}

export function emitNote(v: NoteVisual) {
  for (const l of noteListeners) l(v);
}

let lastFrame: StudioPosition | null = null;

/**
 * Frames come every animation frame while the band plays; when it is stopped
 * they rest. A new listener gets the latest frame at once, so it never waits.
 */
export function onFrame(l: FrameListener): () => void {
  frameListeners.add(l);
  if (lastFrame) l(lastFrame);
  return () => frameListeners.delete(l);
}

export function emitFrame(p: StudioPosition) {
  lastFrame = p;
  for (const l of frameListeners) l(p);
}

export function onStudioEvent(l: EventListener): () => void {
  eventListeners.add(l);
  return () => eventListeners.delete(l);
}

export function emitStudioEvent(e: StudioEvent) {
  for (const l of eventListeners) l(e);
}
