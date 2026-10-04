import { demoProject, findDemo } from '../magic/demos';
import { lessonProject, type TeachSong } from '../magic/lessons';
import { monsterBandProject } from '../magic/templates';
import { newId } from '../model/ids';
import { createProject, projectHasMusic, projectMeta } from '../model/project';
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
import { commit, getState, setProject, setState, type LabView, type Overlay, type PaintTool, type Screen } from './store';
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
  // labView is the child's choice of face, and it stays: a monster without a grid
  // shows its keys (labFace), and tapping back to Boom finds its grid again.
}

/** Flip the Lab's play surface between the keys and Beat Hop's grid. */
export function setLabView(labView: LabView) {
  if (getState().labView !== labView) setState({ labView });
}

/** A monster's first loop is waiting in Monster Blocks (the Blocks button wears a dot until visited). */
export function markNewBlock(trackId: string) {
  const s = getState();
  if (s.screen === 'blocks' || s.newBlocks.includes(trackId)) return;
  setState({ newBlocks: [...s.newBlocks, trackId] });
}

export function clearNewBlocks() {
  if (getState().newBlocks.length > 0) setState({ newBlocks: [] });
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
  setState({ screen: 'lab', overlay: null, selectedTrackId: project.tracks[0].id, labView: 'keys', newBlocks: [], guide: null });
}

export async function openSong(id: string) {
  if (getState().project.id === id) {
    setState({ screen: 'lab', overlay: null });
    return;
  }
  const p = await loadProject(id);
  if (p) await switchTo(p);
}

/** A new song: blank, the Monster Band, or "Make a beat" (opens straight onto Boom's grid). */
// ── Demo songs ───────────────────────────────────────────────────────────────
// A demo opens as the child's own editable copy (id "<demo id>~…"). While a copy
// is untouched, opening the demo again reopens it instead of making another.

export const DEMO_COPY = '~';

export function isDemoCopy(id: string): boolean {
  return id.startsWith('demo-') && id.includes(DEMO_COPY);
}

/** An untouched copy of a demo shows on the shelf as the demo card, not as a song of its own. */
export function isUntouchedDemo(meta: { id: string; createdAt: number; modifiedAt: number }): boolean {
  return isDemoCopy(meta.id) && meta.modifiedAt === meta.createdAt;
}

export async function openDemo(demoId: string): Promise<boolean> {
  const demo = findDemo(demoId);
  if (!demo) return false;
  const existing = getState().songs.find((m) => m.id.startsWith(`${demo.id}${DEMO_COPY}`) && isUntouchedDemo(m));
  const loaded = existing ? await loadProject(existing.id) : null;
  const p = loaded ?? { ...demoProject(demo), id: `${demo.id}${DEMO_COPY}${newId('p')}` };
  if (!loaded) {
    await saveProjectNow(p);
    setState({ songs: [projectMeta(p), ...getState().songs] });
  }
  await switchTo(p);
  // Demos are heard as whole songs first.
  setState({ screen: 'blocks' });
  return true;
}

// ── "My first beat" ──────────────────────────────────────────────────────────

/** Start the guided first beat on Boom's stones: reuse an untouched open song, else a fresh beat song. */
export async function startFirstBeat() {
  const s = getState();
  const p = s.project;
  const boom = p.tracks.find((t) => t.monster === 'boom');
  if (!boom || projectHasMusic(p) || s.past.length > 0 || p.loopBeats !== 8) await newSong('beat');
  const after = getState();
  const track = after.project.tracks.find((t) => t.monster === 'boom');
  if (!track) return;
  setState({ screen: 'lab', overlay: null, selectedTrackId: track.id, labView: 'grid', guide: { kind: 'first-beat', trackId: track.id, projectId: after.project.id } });
}

export function endGuide() {
  if (getState().guide) setState({ guide: null });
}

export async function newSong(kind: 'blank' | 'band' | 'beat' = 'blank') {
  const p = kind === 'band' ? monsterBandProject() : createProject();
  await saveProjectNow(p);
  await switchTo(p);
  const boom = p.tracks.find((t) => t.monster === 'boom');
  if (kind === 'beat' && boom) setState({ selectedTrackId: boom.id, labView: 'grid' });
}

/** A learned song becomes a real song: saved, opened, shown in Monster Blocks. */
export async function saveLessonAsSong(song: TeachSong) {
  const p = lessonProject(song);
  await saveProjectNow(p);
  await switchTo(p);
  setState({ screen: 'blocks' });
}

/** Keep the best stars a child earned for a song. */
export function recordLessonStars(songId: string, stars: number) {
  const current = getState().settings.lessonStars;
  if ((current[songId] ?? 0) >= stars) return;
  updateSettings({ lessonStars: { ...current, [songId]: stars } });
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
