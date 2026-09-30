import { songName } from '../magic/names';
import { newId } from './ids';
import { CORE_MONSTERS, MONSTERS } from './monsters';
import type { Clip, MonsterKind, Project, ProjectMeta, Track } from './types';
import { PAINT_ROW } from './types';

export const PROJECT_SCHEMA_VERSION = 1;

export const DEFAULT_TEMPO = 100;
export const MIN_TEMPO = 70;
export const MAX_TEMPO = 140;
export const DEFAULT_LOOP_BEATS = 8;
export const DEFAULT_BLOCKS = 8;

export function createTrack(monster: MonsterKind): Track {
  const info = MONSTERS[monster];
  return {
    id: newId('t'),
    monster,
    preset: info.presets[0].id,
    clips: [],
    activeClipId: null,
    sleeping: false,
    solo: false,
    volume: 0.8,
    fx: { ...info.defaultFx },
    sampleId: null,
  };
}

export function createClip(lengthBeats: number): Clip {
  return { id: newId('c'), lengthBeats, notes: [] };
}

export interface CreateProjectOptions {
  monsters?: MonsterKind[];
  seed?: number;
  now?: number;
}

export function createProject(opts: CreateProjectOptions = {}): Project {
  const now = opts.now ?? Date.now();
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const tracks = (opts.monsters ?? CORE_MONSTERS).map(createTrack);
  const rows: Record<string, (string | null)[]> = {};
  for (const t of tracks) rows[t.id] = new Array(DEFAULT_BLOCKS).fill(null);
  rows[PAINT_ROW] = new Array(DEFAULT_BLOCKS).fill(null);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('p'),
    name: songName(seed),
    createdAt: now,
    modifiedAt: now,
    tempo: DEFAULT_TEMPO,
    key: 0,
    scale: 'pentatonicMajor',
    beatsPerBar: 4,
    loopBeats: DEFAULT_LOOP_BEATS,
    tracks,
    arrangement: { length: DEFAULT_BLOCKS, rows },
    painting: { strokes: [], sleeping: false },
    art: { hue: Math.floor((seed % 360 + 360) % 360), seed },
  };
}

export function activeClip(track: Track): Clip | null {
  if (!track.activeClipId) return null;
  return track.clips.find((c) => c.id === track.activeClipId) ?? null;
}

export function trackHasLoop(track: Track): boolean {
  const clip = activeClip(track);
  return !!clip && clip.notes.length > 0;
}

export function projectHasMusic(project: Project): boolean {
  return project.tracks.some(trackHasLoop) || project.painting.strokes.length > 0;
}

export function findTrack(project: Project, trackId: string): Track | undefined {
  return project.tracks.find((t) => t.id === trackId);
}

export function trackForMonster(project: Project, monster: MonsterKind): Track | undefined {
  return project.tracks.find((t) => t.monster === monster);
}

export function projectMeta(project: Project): ProjectMeta {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    monsters: project.tracks.map((t) => t.monster),
    hue: project.art.hue,
    seed: project.art.seed,
    filled: project.tracks.filter(trackHasLoop).map((t) => t.monster),
    blocks: project.arrangement.length,
  };
}

/** Seconds per beat. */
export function spb(project: Pick<Project, 'tempo'>): number {
  return 60 / project.tempo;
}

export function songBeats(project: Pick<Project, 'arrangement' | 'loopBeats'>): number {
  return project.arrangement.length * project.loopBeats;
}
