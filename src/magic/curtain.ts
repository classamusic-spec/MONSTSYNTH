import { seededRandom } from '../model/ids';
import type { Project, Track } from '../model/types';
import { PAINT_ROW } from '../model/types';
import { audibleTracks, paintingAudible } from './sequence';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · the curtain call.
// When a song ends, the band that played it takes a bow: each performer hops in
// row order, then they all bow together while the audience claps, and a big
// "again" sparkle invites an encore. Pure answers to "who performed?", "which
// row is singing this note?" and "when does each part of the bow happen?", so
// the UI and the studio share one timetable and the rules are unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rows heard somewhere in the song, in row order (tracks in stage order,
 * then the painting's row): a monster you can hear (awake, and not left out by
 * a solo) with a block whose loop has notes, or the painting's row when the
 * painting sings and one of its blocks is on. Sleeping monsters stay asleep and
 * a monster with no blocks just watches, so neither takes the bow.
 */
export function songPerformers(project: Project): string[] {
  const cols = project.arrangement.length;
  const used = (rowId: string) => (project.arrangement.rows[rowId] ?? []).slice(0, cols);
  const out = audibleTracks(project)
    .filter((t) => used(t.id).some((id) => !!id && (t.clips.find((c) => c.id === id)?.notes.length ?? 0) > 0))
    .map((t) => t.id);
  if (paintingAudible(project) && used(PAINT_ROW).some(Boolean)) out.push(PAINT_ROW);
  return out;
}

/**
 * Who plays the song's last downbeat (the studio's finale): Boom crashes, and
 * Spark (else the first other monster you can hear) sings "ta-da!". Only
 * monsters you can hear: a sleeping Boom stays asleep.
 */
export function finaleSingers(project: Project): { crash: Track | null; tada: Track | null } {
  const heard = audibleTracks(project);
  return {
    crash: heard.find((t) => t.monster === 'boom') ?? null,
    tada: heard.find((t) => t.monster === 'spark') ?? heard.find((t) => t.monster !== 'boom') ?? null,
  };
}

/**
 * Who takes the bow, in row order: the song's performers, and whoever sang its
 * ending (the crash and the "ta-da!" were heard too, so those monsters bow even
 * without a block). Everyone else watches.
 */
export function curtainCast(project: Project): string[] {
  const performers = new Set(songPerformers(project));
  // No song to hear, no ending and no bow.
  if (!performers.size) return [];
  const { crash, tada } = finaleSingers(project);
  const out = audibleTracks(project)
    .filter((t) => performers.has(t.id) || t.id === crash?.id || t.id === tada?.id)
    .map((t) => t.id);
  if (performers.has(PAINT_ROW)) out.push(PAINT_ROW);
  return out;
}

/**
 * The Monster Blocks row a note belongs to. Painting notes come first: when a
 * monster of the brush's kind is on stage, the painting borrows its voice (and
 * its track id), but the note is the painting's, not that monster's.
 */
export function noteRow(v: { trackId: string | null; source: string }): string | null {
  return v.source === 'paint' ? PAINT_ROW : v.trackId;
}

/** A row head reacts at most this often (a dense hi-hat row must not thrash). */
export const SING_GAP_MS = 90;

/**
 * Should a row head react to a note now? Once per `gap` ms per row, except a
 * priority note (Boom's big drum), which always shows.
 */
export function singGate(lastAt: number | undefined, now: number, priority = false, gap = SING_GAP_MS): boolean {
  return priority || lastAt === undefined || now - lastAt >= gap;
}

// ── The timetable (milliseconds after the song's end) ──────────────────────

/** The first hop waits for the crash and Spark's "ta-da!" (four notes, 90 ms apart). */
export const CURTAIN_START_MS = 420;
/** One hop: crouch, up, land. */
export const HOP_MS = 520;
/** The bow: down, a held moment with eyes closed, back up. */
export const BOW_MS = 1000;
/** All hops start within this long, however big the band. */
const HOP_SPREAD_MS = 700;
const HOP_GAP_MS = 140;

export interface CurtainTimes {
  /** When each performer hops, in row order. */
  hops: number[];
  /** When everybody bows together. */
  bow: number;
  /** When the clapping hands appear and the audience claps. */
  clap: number;
  /** When the "again" sparkle appears. */
  again: number;
  /** When the stars and hands are gone (the "again" sparkle stays on its own). */
  done: number;
}

export function curtainTimes(performers: number): CurtainTimes {
  const n = Math.max(0, Math.floor(performers));
  const gap = n > 1 ? Math.min(HOP_GAP_MS, HOP_SPREAD_MS / (n - 1)) : 0;
  const hops = Array.from({ length: n }, (_, i) => Math.round(CURTAIN_START_MS + i * gap));
  // Everybody bows once the last one has landed (no hops: straight to the bow).
  const bow = n ? hops[n - 1] + HOP_MS + 60 : CURTAIN_START_MS;
  const clap = bow + 250;
  const again = clap + Math.round(CLAP_TIMES[CLAP_TIMES.length - 1] * 1000) + 280;
  return { hops, bow, clap, again, done: Math.max(3400, again + 700) };
}

// ── Applause ───────────────────────────────────────────────────────────────

/** The audience's rhythm, in seconds: clap, clap, clap-clap-clap. */
export const CLAP_TIMES: readonly number[] = [0, 0.24, 0.48, 0.6, 0.72];
/** No clap is louder than this (Boom's clap pad, on the crowd's own quiet channel). */
export const MAX_CLAP_VEL = 0.5;

export interface ClapHit {
  /** Seconds after the applause starts. */
  at: number;
  vel: number;
  /** Semitones: each pair of hands sounds a little different. */
  bend: number;
  /** −1..1: shorter or longer claps. */
  size: number;
}

/**
 * The applause: every clap of the rhythm is two pairs of hands a few ms apart,
 * each tuned and sized a little differently, so it sounds like an audience and
 * not a drum machine. The last clap is the strongest. Deterministic per seed.
 * `times` [0] is one clap on its own (a child clapping along on the hands).
 */
export function applauseHits(seed: number, times: readonly number[] = CLAP_TIMES): ClapHit[] {
  const rnd = seededRandom(seed);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const round = (v: number, k = 1000) => Math.round(v * k) / k;
  const hits: ClapHit[] = [];
  times.forEach((at, i) => {
    const last = i === times.length - 1;
    const vel = last ? between(0.47, MAX_CLAP_VEL) : between(0.38, 0.45);
    hits.push({ at, vel: round(vel), bend: round(between(-1.5, 1.5), 10), size: round(between(-0.3, 0.1), 100) });
    hits.push({ at: round(at + between(0.008, 0.022)), vel: round(between(0.26, 0.34)), bend: round(between(-3, 3), 10), size: round(between(-0.4, 0.2), 100) });
  });
  return hits.sort((a, b) => a.at - b.at);
}
