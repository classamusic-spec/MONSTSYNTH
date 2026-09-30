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
  saveProjectNow,
  saveSettings,
} from './persistence';
import { requestPersistentStorage } from './idb';
import { commit, getState, setProject, setState, type Overlay, type PaintTool, type Screen } from './store';
import type { PaintBrush } from '../model/types';

// App-level actions: booting, switching songs, settings, navigation.

export async function boot(): Promise<void> {
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
  const target = id === getState().project.id ? getState().project : await loadProject(id);
  // Let any pending autosave land first so it cannot resurrect the deleted song.
  await flushSave();
  await deleteProject(id);
  if (target) for (const t of target.tracks) if (t.sampleId) await deleteSample(t.sampleId);
  const songs = getState().songs.filter((s) => s.id !== id);
  setState({ songs });
  if (getState().project.id === id) {
    const next = songs[0] ? await loadProject(songs[0].id) : null;
    const project = next ?? createProject();
    if (!next) await saveProjectNow(project);
    setProject(project);
    updateSettings({ lastProjectId: project.id });
  }
}

export async function refreshSongs() {
  setState({ songs: await listProjects() });
}
