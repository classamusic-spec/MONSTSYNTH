import { ALL_MONSTERS, MONSTERS } from './monsters';
import { newId } from './ids';
import {
  DEFAULT_BLOCKS,
  DEFAULT_LOOP_BEATS,
  DEFAULT_TEMPO,
  MAX_TEMPO,
  MIN_TEMPO,
  PROJECT_SCHEMA_VERSION,
  createTrack,
} from './project';
import type {
  Clip,
  FxLevels,
  MonsterKind,
  NoteEvent,
  PaintBrush,
  Project,
  ScaleId,
  Settings,
  Stroke,
  Track,
} from './types';
import { PAINT_ROW } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Versioned schemas. Every stored document carries `schemaVersion`. Loading runs
// the migration chain up to the current version and then *sanitises* the result:
// unknown or broken values are replaced with safe defaults instead of throwing,
// because a child should never be told their song is "corrupt".
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;
type Migration = (doc: Json) => Json;

/** Project migrations: MIGRATIONS[n] upgrades a version-n document to n + 1. */
const PROJECT_MIGRATIONS: Record<number, Migration> = {
  // v0: unversioned drafts from the design prototype. Same shape, no version tag.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
};

const SCALE_IDS: ScaleId[] = ['pentatonicMajor', 'pentatonicMinor', 'major', 'minor', 'blues', 'chromatic'];

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function isMonster(v: unknown): v is MonsterKind {
  return typeof v === 'string' && (ALL_MONSTERS as string[]).includes(v);
}

function sanitizeNote(raw: unknown, lengthBeats: number): NoteEvent | null {
  if (!isObject(raw)) return null;
  const beat = num(raw.beat, NaN);
  if (!Number.isFinite(beat)) return null;
  return {
    id: str(raw.id, newId('n')),
    beat: ((beat % lengthBeats) + lengthBeats) % lengthBeats,
    dur: num(raw.dur, 0.5, 0.0625, lengthBeats),
    step: Math.round(num(raw.step, 0, 0, 15)),
    vel: num(raw.vel, 0.8, 0.05, 1),
    tone: num(raw.tone, 0, -1, 1),
  };
}

function sanitizeClip(raw: unknown, loopBeats: number): Clip | null {
  if (!isObject(raw)) return null;
  const lengthBeats = num(raw.lengthBeats, loopBeats, 1, 64);
  const notes = Array.isArray(raw.notes)
    ? raw.notes.map((n) => sanitizeNote(n, lengthBeats)).filter((n): n is NoteEvent => n !== null)
    : [];
  notes.sort((a, b) => a.beat - b.beat);
  return { id: str(raw.id, newId('c')), lengthBeats, notes };
}

function sanitizeFx(raw: unknown, defaults: FxLevels): FxLevels {
  const src = isObject(raw) ? raw : {};
  return {
    echo: num(src.echo, defaults.echo, 0, 1),
    gloop: num(src.gloop, defaults.gloop, 0, 1),
    chomper: num(src.chomper, defaults.chomper, 0, 1),
    wiggle: num(src.wiggle, defaults.wiggle, 0, 1),
  };
}

function sanitizeTrack(raw: unknown, loopBeats: number): Track | null {
  if (!isObject(raw) || !isMonster(raw.monster)) return null;
  const monster = raw.monster;
  const base = createTrack(monster);
  const info = MONSTERS[monster];
  const clips = Array.isArray(raw.clips)
    ? raw.clips.map((c) => sanitizeClip(c, loopBeats)).filter((c): c is Clip => c !== null)
    : [];
  const activeClipId =
    typeof raw.activeClipId === 'string' && clips.some((c) => c.id === raw.activeClipId)
      ? raw.activeClipId
      : clips[0]?.id ?? null;
  const preset =
    typeof raw.preset === 'string' && info.presets.some((p) => p.id === raw.preset) ? raw.preset : base.preset;
  return {
    id: str(raw.id, base.id),
    monster,
    preset,
    clips,
    activeClipId,
    sleeping: bool(raw.sleeping, false),
    solo: bool(raw.solo, false),
    volume: num(raw.volume, base.volume, 0, 1),
    fx: sanitizeFx(raw.fx, info.defaultFx),
    sampleId: typeof raw.sampleId === 'string' ? raw.sampleId : null,
  };
}

function sanitizeStroke(raw: unknown): Stroke | null {
  if (!isObject(raw) || !Array.isArray(raw.points)) return null;
  const brush: PaintBrush = raw.brush === 'rainbow' || isMonster(raw.brush) ? (raw.brush as PaintBrush) : 'bloop';
  const points = raw.points.filter((p): p is number => typeof p === 'number' && Number.isFinite(p)).map((p) => Math.min(1, Math.max(0, p)));
  if (points.length < 2) return null;
  if (points.length % 2 === 1) points.pop();
  return {
    id: str(raw.id, newId('s')),
    brush,
    kind: raw.kind === 'stars' ? 'stars' : 'line',
    points,
    weight: num(raw.weight, 0.7, 0, 1),
  };
}

export function sanitizeProject(raw: Json): Project {
  const loopBeats = Math.round(num(raw.loopBeats, DEFAULT_LOOP_BEATS, 2, 32));
  const seen = new Set<MonsterKind>();
  const tracks: Track[] = [];
  if (Array.isArray(raw.tracks)) {
    for (const t of raw.tracks) {
      const track = sanitizeTrack(t, loopBeats);
      // One of each monster per song (keeps the stage readable for kids).
      if (track && !seen.has(track.monster)) {
        seen.add(track.monster);
        tracks.push(track);
      }
    }
  }
  if (tracks.length === 0) tracks.push(createTrack('bloop'));

  const arrRaw = isObject(raw.arrangement) ? raw.arrangement : {};
  const length = Math.round(num(arrRaw.length, DEFAULT_BLOCKS, 1, 32));
  const rowsRaw = isObject(arrRaw.rows) ? arrRaw.rows : {};
  const rows: Record<string, (string | null)[]> = {};
  const rowFor = (id: string, validClip: (v: string) => boolean) => {
    const src = Array.isArray(rowsRaw[id]) ? (rowsRaw[id] as unknown[]) : [];
    const row: (string | null)[] = [];
    for (let i = 0; i < length; i++) {
      const v = src[i];
      row.push(typeof v === 'string' && validClip(v) ? v : null);
    }
    return row;
  };
  for (const t of tracks) rows[t.id] = rowFor(t.id, (v) => t.clips.some((c) => c.id === v));
  rows[PAINT_ROW] = rowFor(PAINT_ROW, (v) => v === PAINT_ROW);

  const paintRaw = isObject(raw.painting) ? raw.painting : {};
  const strokes = Array.isArray(paintRaw.strokes)
    ? paintRaw.strokes.map(sanitizeStroke).filter((s): s is Stroke => s !== null)
    : [];

  const artRaw = isObject(raw.art) ? raw.art : {};
  const now = Date.now();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: str(raw.id, newId('p')),
    name: str(raw.name, 'My Song').slice(0, 60),
    createdAt: num(raw.createdAt, now, 0),
    modifiedAt: num(raw.modifiedAt, now, 0),
    tempo: Math.round(num(raw.tempo, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO)),
    key: Math.round(num(raw.key, 0, 0, 11)),
    scale: SCALE_IDS.includes(raw.scale as ScaleId) ? (raw.scale as ScaleId) : 'pentatonicMajor',
    beatsPerBar: Math.round(num(raw.beatsPerBar, 4, 2, 7)),
    loopBeats,
    tracks,
    arrangement: { length, rows },
    painting: { strokes, sleeping: bool(paintRaw.sleeping, false) },
    art: { hue: num(artRaw.hue, 220, 0, 360), seed: num(artRaw.seed, 1, 0) },
  };
}

/** Load any stored project document. Returns null only when there is nothing usable at all. */
export function migrateProject(raw: unknown): Project | null {
  if (!isObject(raw)) return null;
  let doc: Json = { ...raw };
  let version = typeof doc.schemaVersion === 'number' ? Math.floor(doc.schemaVersion) : 0;
  while (version < PROJECT_SCHEMA_VERSION) {
    const step = PROJECT_MIGRATIONS[version];
    if (!step) break;
    doc = step(doc);
    version++;
  }
  // Documents from a *newer* app version are sanitised best-effort rather than rejected.
  return sanitizeProject(doc);
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  ageMode: 'little',
  volume: 0.8,
  volumeCeiling: 0.85,
  micAllowed: false,
  motion: 'system',
  highContrast: false,
  hints: true,
  lastProjectId: null,
};

export function migrateSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    ageMode: raw.ageMode === 'maker' ? 'maker' : 'little',
    volume: num(raw.volume, DEFAULT_SETTINGS.volume, 0, 1),
    volumeCeiling: num(raw.volumeCeiling, DEFAULT_SETTINGS.volumeCeiling, 0.1, 1),
    micAllowed: bool(raw.micAllowed, false),
    motion: raw.motion === 'reduce' || raw.motion === 'full' ? raw.motion : 'system',
    highContrast: bool(raw.highContrast, false),
    hints: bool(raw.hints, true),
    lastProjectId: typeof raw.lastProjectId === 'string' ? raw.lastProjectId : null,
  };
}
