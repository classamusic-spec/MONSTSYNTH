import { create } from 'zustand';
import type { PlayMode } from '../magic/sequence';
import { createProject, projectMeta } from '../model/project';
import { DEFAULT_SETTINGS } from '../model/schema';
import type { PaintBrush, Project, ProjectMeta, Settings } from '../model/types';
import { scheduleSave } from './persistence';

// ─────────────────────────────────────────────────────────────────────────────
// App state (zustand). The project is immutable data; every edit goes through
// `commit`, which records undo history and schedules an autosave.
// ─────────────────────────────────────────────────────────────────────────────

export type Screen = 'lab' | 'blocks' | 'paint' | 'songs' | 'learn';
export type Overlay = null | 'parent' | 'tray' | 'magic';
export type PaintTool = 'brush' | 'stars' | 'eraser';

export interface TransportFlags {
  playing: boolean;
  recording: boolean;
  /** Record pressed with nothing playing yet: the loop starts on the first note. */
  armed: boolean;
  mode: PlayMode;
}

interface HistoryEntry {
  project: Project;
  key?: string;
  at: number;
}

export interface AppState {
  ready: boolean;
  settings: Settings;
  project: Project;
  songs: ProjectMeta[];
  screen: Screen;
  selectedTrackId: string;
  /** Audio unlocked and monsters awake. */
  awake: boolean;
  /** Play-time limit reached: the monsters sleep until a grown-up continues. */
  resting: boolean;
  transport: TransportFlags;
  overlay: Overlay;
  paint: { tool: PaintTool; brush: PaintBrush };
  past: HistoryEntry[];
  future: Project[];
}

const MAX_HISTORY = 80;
const COALESCE_MS = 1500;

const initialProject = createProject({ seed: 1 });

export const useApp = create<AppState>(() => ({
  ready: false,
  settings: { ...DEFAULT_SETTINGS },
  project: initialProject,
  songs: [],
  screen: 'lab',
  selectedTrackId: initialProject.tracks[0].id,
  awake: false,
  resting: false,
  transport: { playing: false, recording: false, armed: false, mode: 'loop' },
  overlay: null,
  paint: { tool: 'brush', brush: 'bloop' },
  past: [],
  future: [],
}));

export const getState = useApp.getState;
export const setState = useApp.setState;

export interface CommitOptions {
  /** false for edits that are grouped under an earlier checkpoint (e.g. notes while recording). */
  undoable?: boolean;
  /** Consecutive commits with the same key within 1.5 s become one undo step (sliders, swipes). */
  coalesce?: string;
}

function touchSongList(p: Project) {
  const meta = projectMeta(p);
  const songs = getState().songs;
  const idx = songs.findIndex((s) => s.id === p.id);
  const next = idx >= 0 ? songs.map((s, i) => (i === idx ? meta : s)) : [meta, ...songs];
  setState({ songs: next.sort((a, b) => b.modifiedAt - a.modifiedAt) });
}

export function commit(mutate: (p: Project) => Project, opts: CommitOptions = {}): boolean {
  const s = getState();
  const before = s.project;
  const after = mutate(before);
  if (after === before) return false;
  const next: Project = { ...after, modifiedAt: Date.now() };
  const undoable = opts.undoable !== false;
  let past = s.past;
  if (undoable) {
    const now = Date.now();
    const last = past[past.length - 1];
    if (opts.coalesce && last && last.key === opts.coalesce && now - last.at < COALESCE_MS) {
      past = [...past.slice(0, -1), { ...last, at: now }];
    } else {
      past = [...past, { project: before, key: opts.coalesce, at: now }].slice(-MAX_HISTORY);
    }
  }
  // Any real change makes the redo stack meaningless.
  setState({ project: next, past, future: [] });
  scheduleSave(next);
  touchSongList(next);
  return true;
}

/** Start an undo group (a recording pass). Returns a token for `endGroup`. */
export function beginGroup(key: string): Project {
  const s = getState();
  // Redo survives until something is actually recorded (commit clears it then).
  setState({ past: [...s.past, { project: s.project, key, at: Date.now() }].slice(-MAX_HISTORY) });
  return s.project;
}

/** Close an undo group; if nothing changed, the empty step is removed. */
export function endGroup(token: Project) {
  const s = getState();
  if (s.project === token) {
    const last = s.past[s.past.length - 1];
    if (last && last.project === token) setState({ past: s.past.slice(0, -1) });
  }
}

function fixSelection(p: Project, selected: string): string {
  return p.tracks.some((t) => t.id === selected) ? selected : p.tracks[0].id;
}

export function undo(): boolean {
  const s = getState();
  const last = s.past[s.past.length - 1];
  if (!last) return false;
  const project = { ...last.project, modifiedAt: Date.now() };
  setState({
    project,
    past: s.past.slice(0, -1),
    future: [s.project, ...s.future].slice(0, MAX_HISTORY),
    selectedTrackId: fixSelection(project, s.selectedTrackId),
  });
  scheduleSave(project);
  touchSongList(project);
  return true;
}

export function redo(): boolean {
  const s = getState();
  const next = s.future[0];
  if (!next) return false;
  const project = { ...next, modifiedAt: Date.now() };
  setState({
    project,
    past: [...s.past, { project: s.project, at: Date.now() }].slice(-MAX_HISTORY),
    future: s.future.slice(1),
    selectedTrackId: fixSelection(project, s.selectedTrackId),
  });
  scheduleSave(project);
  touchSongList(project);
  return true;
}

/** Replace the open song (opening from the shelf, new song): history starts fresh. */
export function setProject(p: Project) {
  const s = getState();
  setState({
    project: p,
    past: [],
    future: [],
    selectedTrackId: fixSelection(p, s.selectedTrackId),
  });
  touchSongList(p);
}
