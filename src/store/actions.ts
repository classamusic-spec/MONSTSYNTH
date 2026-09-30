import { monsterBandProject } from '../magic/templates';
import { newId } from '../model/ids';
import { createProject, projectMeta } from '../model/project';
import type { Project, Settings } from '../model/types';
import {
  deleteProject,
  deleteSample,
  flushSave,
  listProjects,
  loadProject,
  loadSettings,
  sampleIds,
  samplesSavedThisSession,
  saveProjectNow,
  saveSettings,
} from './persistence';
import { idbDelete, idbKeys, requestPersistentStorage } from './idb';
import { commit, getState, setProject, setState, type Overlay, type PaintTool, type Screen } from './store';
import type { PaintBrush } from '../model/types';

// App-level actions: booting, switching songs, settings, navigation.

let booting: Promise<void> | null = null;

/** Load settings and the last song. Safe to call more than once (React StrictMode). */
export function boot(): Promise<void> {
  booting ??= doBoot();
  return booting;
}

async function doBoot(): Promise<void> {
  const settings = await loadSettings();
  let songs = await listProjects();
  let project: Project | null = null;
  if (settings.lastProjectId) project = await loadProject(settings.lastProjectId);
  if (!project && songs[0]) project = await loadProject(songs[0].id);
  if (!project) {
    project = createProject();
    await saveProjectNow(project);
    songs = [projectMeta(project)];
  }
  setState({ settings: { ...settings, lastProjectId: project.id }, songs, ready: true, screen: 'lab' });
  setProject(project);
  void saveSettings({ ...settings, lastProjectId: project.id });
  void requestPersistentStorage();
  void collectOrphanSamples();
}

/**
 * Remove Mimic recordings nothing refers to any more (replaced sounds, deleted
 * songs). Songs share recordings after "Copy", so a sound is only removed once
 * no saved song, the open song or its undo steps use it.
 */
async function collectOrphanSamples() {
  try {
    // List first: a recording saved while this runs is never touched.
    const stored = await sampleIds();
    const used = new Set<string>(samplesSavedThisSession());
    const addRefs = (p: Project) => {
      for (const t of [...p.tracks, ...p.bench.map((b) => b.track)]) if (t.sampleId) used.add(t.sampleId);
    };
    for (const id of await idbKeys('projects')) {
      const p = await loadProject(id);
      if (p) addRefs(p);
    }
    const s = getState();
    [s.project, ...s.past.map((h) => h.project), ...s.future].forEach(addRefs);
    for (const id of stored) if (!used.has(id)) await deleteSample(id);
  } catch {
    /* housekeeping only */
  }
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...getState().settings, ...patch };
  setState({ settings });
  void saveSettings(settings);
}

export function setScreen(screen: Screen) {
  if (getState().screen !== screen) setState({ screen, overlay: null });
}

export function selectTrack(trackId: string) {
  if (getState().selectedTrackId !== trackId) setState({ selectedTrackId: trackId });
}

export function setOverlay(overlay: Overlay) {
  setState({ overlay });
}

export function setPaintTool(tool: PaintTool) {
  setState({ paint: { ...getState().paint, tool } });
}

export function setPaintBrush(brush: PaintBrush) {
  setState({ paint: { tool: getState().paint.tool === 'eraser' ? 'brush' : getState().paint.tool, brush } });
}

async function switchTo(project: Project) {
  await flushSave();
  setProject(project);
  updateSettings({ lastProjectId: project.id });
  setState({ screen: 'lab', overlay: null, selectedTrackId: project.tracks[0].id });
}

export async function openSong(id: string) {
  if (getState().project.id === id) {
    setState({ screen: 'lab', overlay: null });
    return;
  }
  const p = await loadProject(id);
  if (p) await switchTo(p);
}

export async function newSong(kind: 'blank' | 'band' = 'blank') {
  const p = kind === 'band' ? monsterBandProject() : createProject();
  await saveProjectNow(p);
  await switchTo(p);
}

export async function duplicateSong(id: string) {
  const src = id === getState().project.id ? getState().project : await loadProject(id);
  if (!src) return;
  const now = Date.now();
  const copy: Project = { ...structuredClone(src), id: newId('p'), name: `${src.name} (copy)`.slice(0, 60), createdAt: now, modifiedAt: now };
  await saveProjectNow(copy);
  setState({ songs: [projectMeta(copy), ...getState().songs] });
}

export async function renameSong(id: string, name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  const current = getState().project;
  if (current.id === id) {
    commit((p) => ({ ...p, name: clean }));
    return;
  }
  const p = await loadProject(id);
  if (!p) return;
  const next = { ...p, name: clean };
  await saveProjectNow(next);
  setState({ songs: getState().songs.map((s) => (s.id === id ? projectMeta(next) : s)) });
}

/** Grown-ups only (Parent Space). Deleting also removes Mimic recordings that song owned. */
export async function deleteSong(id: string) {
  // Let any pending autosave land first so it cannot resurrect the deleted song.
  await flushSave();
  await deleteProject(id);
  const songs = getState().songs.filter((s) => s.id !== id);
  setState({ songs });
  if (getState().project.id === id) {
    const next = songs[0] ? await loadProject(songs[0].id) : null;
    const project = next ?? createProject();
    if (!next) await saveProjectNow(project);
    setProject(project);
    updateSettings({ lastProjectId: project.id });
  }
  // Its Mimic sounds go too, unless another song (a copy) still uses them.
  await collectOrphanSamples();
}

export async function refreshSongs() {
  setState({ songs: await listProjects() });
}

/** Grown-ups only: remove every song and recording from this device. */
export async function deleteEverything() {
  await flushSave();
  for (const id of await idbKeys('projects')) await idbDelete('projects', id);
  for (const id of await idbKeys('samples')) await idbDelete('samples', id);
  const project = createProject();
  await saveProjectNow(project);
  setState({ songs: [projectMeta(project)] });
  setProject(project);
  updateSettings({ lastProjectId: project.id });
}
