import { projectMeta } from '../model/project';
import { migrateProject, migrateSettings } from '../model/schema';
import type { Project, ProjectMeta, Settings } from '../model/types';
import { idbDelete, idbGet, idbKeys, idbPut } from './idb';

// ─────────────────────────────────────────────────────────────────────────────
// Autosave. There is no "save" button for kids: every change is written to
// IndexedDB shortly after it happens, and immediately when the app is hidden.
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'settings';
const AUTOSAVE_MS = 600;

export async function loadSettings(): Promise<Settings> {
  return migrateSettings(await idbGet('kv', SETTINGS_KEY));
}

export async function saveSettings(s: Settings): Promise<void> {
  await idbPut('kv', SETTINGS_KEY, s);
}

export async function loadProject(id: string): Promise<Project | null> {
  return migrateProject(await idbGet('projects', id));
}

export async function saveProjectNow(p: Project): Promise<void> {
  await idbPut('projects', p.id, p);
}

export async function deleteProject(id: string): Promise<void> {
  await idbDelete('projects', id);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const ids = await idbKeys('projects');
  const metas: ProjectMeta[] = [];
  for (const id of ids) {
    const p = await loadProject(id);
    if (p) metas.push(projectMeta(p));
  }
  return metas.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function saveSample(id: string, blob: Blob): Promise<void> {
  await idbPut('samples', id, blob);
}

export async function loadSample(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>('samples', id);
}

export async function deleteSample(id: string): Promise<void> {
  await idbDelete('samples', id);
}

export async function sampleIds(): Promise<string[]> {
  return idbKeys('samples');
}

// ── Debounced autosave ──────────────────────────────────────────────────────

let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> = Promise.resolve();
const listeners = new Set<(p: Project) => void>();

export function onSaved(cb: (p: Project) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function scheduleSave(p: Project) {
  pending = p;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), AUTOSAVE_MS);
}

export function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (!p) return inflight;
  inflight = inflight
    .then(() => saveProjectNow(p))
    .then(() => listeners.forEach((l) => l(p)))
    .catch(() => {
      /* storage full or blocked: keep playing, try again on the next change */
    });
  return inflight;
}
