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
  /**
   * 'sky': a bell from the Lab's night sky (no monster plays it; never counts as playing the keys).
   * 'laugh': tickle time's laugh (the monster's face shows it; keys, sprites and the Coach do not).
   */
  source: 'live' | 'loop' | 'paint' | 'sky' | 'laugh';
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
  | { type: 'mic-level'; level: number }
  /**
   * Tickle time (src/studio/tickle.ts): `giggly` when quick pokes add up (`taps` is
   * how many it took), `more` for each extra poke, `laugh` once the poking stops
   * (`sound`: heard, `ms`: how long), `calm` when the face goes back (`drumming`:
   * the pokes went on and on, a beat rather than a tickle, so no laugh came).
   */
  | { type: 'tickle'; trackId: string; phase: 'giggly' | 'more' | 'laugh' | 'calm'; level: number; taps?: number; sound?: boolean; ms?: number; drumming?: boolean };

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
