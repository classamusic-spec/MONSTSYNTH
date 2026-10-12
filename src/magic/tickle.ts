import type { AgeMode, MonsterKind } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER MAGIC · tickle time.
// Poking the same monster again and again gives it the giggles, and when the
// poking stops it laughs out loud in its own voice. Every poke still plays its
// note exactly as before: the tickle only adds a face, a wiggle and a laugh.
//
// Only NEW finger-downs count. A hold, a drag, a roll, a shake or a pinch is a
// single contact, so ordinary playing can never add up to a tickle by accident.
// Each monster keeps its own count.
//
//   ≥ `taps` contacts within `windowMs`   → giggly (level 1): ^ ^ eyes, blush
//   further pokes while giggly             → more (a bubble each, the laugh waits)
//   `quietMs` without a poke               → laugh (at the level of the giggles)
//   tickled again within `againMs` of it   → level 2: a "wheee" hop and a bigger laugh
//   after the top level                    → `restMs` of plain notes, then it starts over
//   still poking `drumMs` after the giggles began → that's drumming, not tickling:
//     the face calms (no laugh) and pokes are plain notes until a `drumGapMs` pause
//
// Pure: times come in as milliseconds, nothing here touches the DOM or audio.
// The studio (src/studio/tickle.ts) runs the timers and plays the laughs.
// ─────────────────────────────────────────────────────────────────────────────

export interface TickleConfig {
  /** New finger-downs needed … */
  taps: number;
  /** … inside this sliding window (ms). */
  windowMs: number;
  /** The laugh comes once the poking has stopped for this long (ms). */
  quietMs: number;
  /** Tickled again this soon after a laugh (ms): the next level. */
  againMs: number;
  /** The top level. After it, a rest. */
  maxLevel: number;
  /** After the top level, pokes are plain notes for this long (ms). */
  restMs: number;
  /** Laughs out loud (Little Monsters). Monster Makers only see the giggles: their fast drumming is never answered with a laugh. */
  laughs: boolean;
  /**
   * Pokes still coming this long after the giggles began (ms): the child is
   * drumming, not tickling. The face calms without a laugh. At least `againMs`,
   * so the next giggles always start again from level 1.
   */
  drumMs: number;
  /** Drumming ends after a pause this long (ms); then pokes count again. */
  drumGapMs: number;
}

export const TICKLE: Record<AgeMode, TickleConfig> = {
  little: { taps: 5, windowMs: 2000, quietMs: 450, againMs: 3000, maxLevel: 2, restMs: 5000, laughs: true, drumMs: 3000, drumGapMs: 1000 },
  maker: { taps: 8, windowMs: 1600, quietMs: 450, againMs: 3000, maxLevel: 1, restMs: 5000, laughs: false, drumMs: 3000, drumGapMs: 1000 },
};

export interface TickleState {
  /** Times (ms) of the recent new finger-downs, oldest first. */
  taps: readonly number[];
  /** Giggling now: more pokes keep it going, the laugh waits for quiet. */
  giggly: boolean;
  /** Level of the giggles now, or of the last laugh (0: never tickled). */
  level: number;
  lastTap: number;
  laughedAt: number;
  restUntil: number;
  /** When the giggles began (ms). */
  giggleAt: number;
  /** Drumming, not tickling: pokes are plain notes until a pause. */
  drumming: boolean;
}

export const NEW_TICKLE: TickleState = Object.freeze({
  taps: Object.freeze([]) as readonly number[],
  giggly: false,
  level: 0,
  lastTap: -Infinity,
  laughedAt: -Infinity,
  restUntil: -Infinity,
  giggleAt: -Infinity,
  drumming: false,
});

/** `drumming`: the giggles go away quietly (no laugh): the child is keeping a beat. */
export type TapOutcome = 'none' | 'giggly' | 'more' | 'drumming';

/** A new finger came down on the monster at `now` (ms). */
export function tickleTap(s: TickleState, now: number, cfg: TickleConfig): { state: TickleState; out: TapOutcome } {
  if (!Number.isFinite(now)) return { state: s, out: 'none' };
  // Resting after the top level: plain notes (and nothing piles up for later).
  if (now < s.restUntil) {
    return { state: s.taps.length || s.giggly ? { ...s, taps: [], giggly: false } : s, out: 'none' };
  }
  if (s.drumming) {
    // Still keeping the beat: a plain note. After a pause, counting starts over.
    if (now - s.lastTap < cfg.drumGapMs) return { state: { ...s, lastTap: Math.max(s.lastTap, now) }, out: 'none' };
    s = { ...s, drumming: false, taps: [] };
  }
  if (s.giggly) {
    const lastTap = Math.max(s.lastTap, now);
    if (now - s.giggleAt >= cfg.drumMs) return { state: { ...s, taps: [], giggly: false, drumming: true, lastTap }, out: 'drumming' };
    return { state: { ...s, lastTap }, out: 'more' };
  }
  // A clock that went backwards (a stale timestamp) never counts twice.
  const taps = [...s.taps.filter((t) => t <= now && now - t < cfg.windowMs), now];
  if (taps.length < cfg.taps) return { state: { ...s, taps, lastTap: now }, out: 'none' };
  const again = now - s.laughedAt <= cfg.againMs;
  const level = again ? Math.min(cfg.maxLevel, s.level + 1) : 1;
  return { state: { ...s, taps: [], giggly: true, level, lastTap: now, giggleAt: now }, out: 'giggly' };
}

/**
 * Time passes with no new poke. Once a giggly monster has been left alone for
 * `quietMs` it laughs; `waitMs` says how much longer to wait otherwise.
 */
export function tickleQuiet(
  s: TickleState,
  now: number,
  cfg: TickleConfig,
): { state: TickleState; out: 'none' | 'laugh'; level: number; waitMs: number } {
  if (!s.giggly) return { state: s, out: 'none', level: 0, waitMs: Infinity };
  const left = s.lastTap + cfg.quietMs - now;
  if (left > 0) return { state: s, out: 'none', level: s.level, waitMs: left };
  const top = s.level >= cfg.maxLevel;
  return {
    state: { ...s, taps: [], giggly: false, laughedAt: now, restUntil: top ? now + cfg.restMs : -Infinity },
    out: 'laugh',
    level: s.level,
    waitMs: 0,
  };
}

// ── What a laugh sounds like ─────────────────────────────────────────────────
// Laughter, not a tune: fast staccato notes about 160–200 ms apart, stepping
// down with falling velocity. Steps are scale steps (drum pads for Boom), so a
// laugh is always in the song's key. Boom chuckles on its snappy drum, bongos
// (tuned lower each time) and tiny cymbal. Puff cannot do staccato (its sounds
// fade in slowly): it sighs one long soft "hoooo". Mimic laughs in its singing
// voice (its "ah" vowel makes it "ha-ha-ha").

export type LaughKind = 'giggle' | 'laugh' | 'wheee';

/** [scale step (a drum pad for Boom), start (s), length (s), velocity, drum tuning (semitones)] */
export type LaughNote = readonly [step: number, at: number, dur: number, vel: number, bend?: number];

export interface LaughTune {
  /** Melodic monsters. */
  tune: readonly LaughNote[];
  /** Boom. */
  drums: readonly LaughNote[];
  /** A monster with a laugh of its own. */
  by?: Partial<Record<MonsterKind, readonly LaughNote[]>>;
}

/** Steps down from `top`, one every `gap` seconds, velocity falling from `vel` to `low`. */
function chuckle(steps: number[], gap: number, dur: number, vel: number, low: number): LaughNote[] {
  return steps.map((step, i) => [step, +(i * gap).toFixed(3), dur, +(vel - ((vel - low) * i) / Math.max(1, steps.length - 1)).toFixed(3)] as const);
}

export const LAUGHS: Record<LaughKind, LaughTune> = {
  // Level 1: "hee-hee-hee-hee-hee".
  giggle: {
    tune: chuckle([7, 6, 5, 4, 3], 0.17, 0.09, 0.66, 0.4),
    drums: [
      [1, 0, 0.1, 0.64],
      [4, 0.16, 0.1, 0.58, 0],
      [4, 0.32, 0.1, 0.52, -2],
      [4, 0.48, 0.1, 0.46, -4],
      [2, 0.64, 0.08, 0.4],
    ],
    by: {
      grumble: chuckle([4, 3, 2, 1], 0.2, 0.12, 0.7, 0.46),
      spark: chuckle([7, 6, 5, 4, 3, 2], 0.16, 0.08, 0.6, 0.34),
      puff: [[3, 0, 0.85, 0.66]],
    },
  },
  // Level 2: a bigger laugh, from higher up and for longer.
  laugh: {
    tune: chuckle([9, 8, 7, 6, 5, 4], 0.165, 0.09, 0.72, 0.4),
    drums: [
      [1, 0, 0.1, 0.7],
      [4, 0.15, 0.1, 0.64, 2],
      [4, 0.3, 0.1, 0.58, 0],
      [4, 0.45, 0.1, 0.52, -2],
      [4, 0.6, 0.1, 0.46, -4],
      [2, 0.75, 0.08, 0.42],
    ],
    by: {
      grumble: chuckle([5, 4, 3, 2, 1], 0.19, 0.12, 0.72, 0.46),
      spark: chuckle([9, 8, 7, 6, 5, 4, 3], 0.15, 0.08, 0.64, 0.34),
      puff: [[5, 0, 1.05, 0.7]],
    },
  },
  // Level 2's hop: a quick climb ("wheee!"), softer than a note: its notes ring into each other.
  // Boom climbs its bongos to the boing.
  wheee: {
    tune: [
      [0, 0, 0.07, 0.4],
      [2, 0.07, 0.07, 0.44],
      [4, 0.14, 0.07, 0.48],
      [7, 0.21, 0.22, 0.52],
    ],
    drums: [
      [4, 0, 0.07, 0.36, -3],
      [4, 0.07, 0.07, 0.4, 0],
      [4, 0.14, 0.07, 0.42, 3],
      [7, 0.21, 0.3, 0.38],
    ],
    by: {
      grumble: [
        [0, 0, 0.08, 0.42],
        [2, 0.08, 0.08, 0.46],
        [4, 0.16, 0.08, 0.5],
        [7, 0.24, 0.2, 0.52],
      ],
      // Bells ring on: the softest climb.
      spark: [
        [0, 0, 0.07, 0.32],
        [2, 0.07, 0.07, 0.36],
        [4, 0.14, 0.07, 0.4],
        [7, 0.21, 0.2, 0.44],
      ],
      puff: [[7, 0, 0.5, 0.56]],
    },
  },
};

/** The notes of a laugh for one monster. */
export function laughNotes(kind: LaughKind, monster: MonsterKind): readonly LaughNote[] {
  const t = LAUGHS[kind];
  return t.by?.[monster] ?? (monster === 'boom' ? t.drums : t.tune);
}

/** How long a laugh lasts (seconds, to the end of its last note). */
export function laughLength(kind: LaughKind, monster: MonsterKind): number {
  return laughNotes(kind, monster).reduce((end, [, at, dur]) => Math.max(end, at + dur), 0);
}

/** Level 2: the bigger laugh starts this long after the "wheee" (seconds), as the hop lands. */
export const WHEEE_GAP = 0.42;

/** What a laugh at `level` plays: which laughs, when (seconds from now), and how long it all lasts. */
export function laughPlan(level: number, monster: MonsterKind): { parts: { kind: LaughKind; at: number }[]; seconds: number } {
  if (level >= 2) {
    return { parts: [{ kind: 'wheee', at: 0 }, { kind: 'laugh', at: WHEEE_GAP }], seconds: Math.max(laughLength('wheee', monster), WHEEE_GAP + laughLength('laugh', monster)) };
  }
  return { parts: [{ kind: 'giggle', at: 0 }], seconds: laughLength('giggle', monster) };
}
