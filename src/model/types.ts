// ─────────────────────────────────────────────────────────────────────────────
// MONSTER SYNTH — core project model.
//
// Everything a child makes lives in a `Project`. Projects are plain JSON so they
// can be autosaved to IndexedDB, exported, and migrated between schema versions
// (see schema.ts). Nothing in here may reference audio nodes or the DOM.
// ─────────────────────────────────────────────────────────────────────────────

export type MonsterKind = 'bloop' | 'boom' | 'grumble' | 'spark' | 'puff' | 'mimic';

/** Effect "buddies". They are monsters too, but they change sound instead of making it. */
export type FxKind = 'echo' | 'gloop' | 'chomper' | 'wiggle';

export type ScaleId = 'pentatonicMajor' | 'pentatonicMinor' | 'major' | 'minor' | 'blues' | 'chromatic';

export type AgeMode = 'little' | 'maker';

/** A single recorded musical event inside a clip. */
export interface NoteEvent {
  id: string;
  /** Start position inside the clip, in beats: 0 <= beat < clip.lengthBeats. */
  beat: number;
  /** Length in beats (always > 0). One-shot instruments ignore it. */
  dur: number;
  /**
   * Key index on the play surface (0 = lowest). For melodic monsters this is a
   * scale step that Monster Magic turns into a pitch at play time, so changing the
   * song's key or mood never produces wrong notes. For Boom it is the drum pad.
   */
  step: number;
  /** Loudness 0..1. */
  vel: number;
  /** "Dark ↔ Sparkly" timbre at the time the note was played, -1..1. */
  tone: number;
}

/** A loop. Blocks in the arrangement point at clips. */
export interface Clip {
  id: string;
  lengthBeats: number;
  notes: NoteEvent[];
}

export type FxLevels = Record<FxKind, number>;

/** One monster on the stage. */
export interface Track {
  id: string;
  monster: MonsterKind;
  preset: string;
  clips: Clip[];
  activeClipId: string | null;
  /** A sleeping monster is muted. Kids can see it snoozing. */
  sleeping: boolean;
  solo: boolean;
  /** Channel level 0..1 (kept conservative by default; the master chain protects ears). */
  volume: number;
  fx: FxLevels;
  /** Mimic only: id of the recorded voice sample in the sample store. */
  sampleId: string | null;
}

export type PaintBrush = MonsterKind | 'rainbow';

export interface Stroke {
  id: string;
  brush: PaintBrush;
  kind: 'line' | 'stars';
  /** Flat list of normalised canvas coordinates: [x0, y0, x1, y1, …], 0..1, y = 0 is the top. */
  points: number[];
  /** 0..1 intensity (from pen pressure when available). */
  weight: number;
}

export interface Painting {
  strokes: Stroke[];
  sleeping: boolean;
}

/** Key used in `arrangement.rows` for the Sound Painting layer. */
export const PAINT_ROW = 'paint';

/**
 * Monster Blocks. Each row is a track (or the painting); each column is one loop
 * length of the song. A cell holds the clip id that plays there, or null.
 */
export interface Arrangement {
  length: number;
  rows: Record<string, (string | null)[]>;
}

/** A monster sent home from the stage. It keeps its loops and its blocks for when it comes back. */
export interface BenchedTrack {
  track: Track;
  row: (string | null)[];
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  /** Beats per minute. */
  tempo: number;
  /** Root pitch class (0 = C). */
  key: number;
  scale: ScaleId;
  beatsPerBar: number;
  /** Length of one loop / one block, in beats. */
  loopBeats: number;
  /** Stage order = row order in Monster Blocks. */
  tracks: Track[];
  /** Monsters resting off stage (not playing), remembered with their loops. */
  bench: BenchedTrack[];
  arrangement: Arrangement;
  painting: Painting;
  /** Drives the song's artwork on the shelf (no filenames for kids). */
  art: { hue: number; seed: number };
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  monsters: MonsterKind[];
  hue: number;
  seed: number;
  /** Which monsters have loops; used to draw the song portrait. */
  filled: MonsterKind[];
  blocks: number;
}

export type MotionPreference = 'system' | 'reduce' | 'full';

export interface Settings {
  schemaVersion: number;
  ageMode: AgeMode;
  /** Master volume 0..1 (the child-facing level). */
  volume: number;
  /** Parent-set ceiling 0..1 applied on top of volume. */
  volumeCeiling: number;
  /** Parent must switch this on before Mimic can use the microphone. */
  micAllowed: boolean;
  motion: MotionPreference;
  highContrast: boolean;
  /** Wordless coach hints (pulsing hands) for first-time players. */
  hints: boolean;
  /** Optional play-time limit in minutes (0 = off). When reached, the monsters go to sleep. */
  sessionMinutes: number;
  lastProjectId: string | null;
  /** Best stars (1..3) earned per learned song, by song id (schema v2). */
  lessonStars: Record<string, number>;
}
