import { laughPlan, NEW_TICKLE, TICKLE, tickleQuiet, tickleTap, type LaughKind, type TickleState } from '../magic/tickle';
import type { MonsterKind } from '../model/types';
import { getState, useApp, type AppState } from '../store/store';
import { emitStudioEvent, onStudioEvent } from './visualBus';

// ─────────────────────────────────────────────────────────────────────────────
// TICKLE TIME — the studio side (the counting itself is Monster Magic:
// src/magic/tickle.ts). Every new finger on a monster is reported here; this
// keeps one count per monster, waits for the quiet, plays the laugh and tells
// the UI what to show with `tickle` events:
//   giggly → ^ ^ eyes and a blush        more → a bubble for each extra poke
//   laugh  → the laugh (and a hop at level 2)   calm → back to normal, a happy blink
// A laugh is a chirp: heard, never recorded, never an edit (no undo step).
// Its SOUND never plays while the band plays, a take is recording or armed, a
// lesson plays, a grown-up panel is open, Mimic's microphone listens or the
// first-beat guide runs (the face may still show), and a laugh already ringing
// is cut short when one of those starts. While recording or armed nothing
// tickles at all: every poke is just a note in the take. Poking on and on is
// drumming, not tickling: the face calms without a laugh (`calm` with
// `drumming`, so the Coach counts those pokes as playing after all).
// ─────────────────────────────────────────────────────────────────────────────

export interface TickleHost {
  readonly ready: boolean;
  readonly lessonPlaying: boolean;
  /** Mimic's microphone is listening (its echo cancelling is off: a laugh would be in the word). */
  readonly micBusy: boolean;
  chirp(monster: MonsterKind, kind: LaughKind, delay?: number): void;
  /** Cut short every laugh still ringing (or waiting to start). */
  hushLaughs(): void;
}

/** A laugh with no sound (the band is playing) still shakes for this long (s). */
const SILENT_LAUGH_S = 0.8;
/** The happy face stays a moment after the last laugh note. */
const SETTLE_MS = 160;

type Timer = ReturnType<typeof setTimeout>;

export class Tickler {
  private states = new Map<string, TickleState>();
  private quietTimers = new Map<string, Timer>();
  private calmTimers = new Map<string, Timer>();
  private watching = false;
  /** Laughs heard so far (for the automated checks). */
  laughs = 0;

  constructor(private host: TickleHost) {}

  /** Monsters giggling or laughing right now. */
  get active(): number {
    let n = 0;
    for (const [id, s] of this.states) if (s.giggly || this.calmTimers.has(id)) n++;
    return n;
  }

  /** A new finger came down on a monster's pod (`at`: the touch's own timestamp, ms). */
  tap(trackId: string, at: number) {
    const s = getState();
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    // While a take records (or waits for its first note) a poke is only a note.
    // Sleeping monsters keep their closed eyes.
    if (s.resting || s.screen !== 'lab' || track.sleeping || s.transport.recording || s.transport.armed) {
      this.reset(trackId);
      return;
    }
    this.watch();
    const cfg = TICKLE[s.settings.ageMode];
    const { state, out } = tickleTap(this.states.get(trackId) ?? NEW_TICKLE, at, cfg);
    this.states.set(trackId, state);
    if (out === 'none') return;
    // Giggly again before the last laugh's face settled: the face just stays.
    this.clear(this.calmTimers, trackId);
    if (out === 'drumming') {
      // Poking on and on: that's a beat, not a tickle. The face calms, no laugh.
      this.clear(this.quietTimers, trackId);
      emitStudioEvent({ type: 'tickle', trackId, phase: 'calm', level: 0, drumming: true });
      return;
    }
    emitStudioEvent({ type: 'tickle', trackId, phase: out, level: state.level, taps: cfg.taps });
    this.armQuiet(trackId, cfg.quietMs);
  }

  private armQuiet(trackId: string, ms: number) {
    this.clear(this.quietTimers, trackId);
    this.quietTimers.set(
      trackId,
      setTimeout(() => this.quiet(trackId), Math.max(0, ms) + 15),
    );
  }

  private quiet(trackId: string) {
    this.quietTimers.delete(trackId);
    const state = this.states.get(trackId);
    if (!state) return;
    const s = getState();
    const cfg = TICKLE[s.settings.ageMode];
    const r = tickleQuiet(state, performance.now(), cfg);
    if (r.out === 'none') {
      if (state.giggly && Number.isFinite(r.waitMs)) this.armQuiet(trackId, r.waitMs);
      return;
    }
    this.states.set(trackId, r.state);
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track) {
      this.reset(trackId);
      return;
    }
    const sound = cfg.laughs && this.mayLaugh(s);
    let seconds = SILENT_LAUGH_S;
    if (sound) {
      const plan = laughPlan(r.level, track.monster);
      for (const part of plan.parts) this.host.chirp(track.monster, part.kind, part.at);
      seconds = plan.seconds;
      this.laughs++;
    }
    emitStudioEvent({ type: 'tickle', trackId, phase: 'laugh', level: r.level, sound, ms: Math.round(seconds * 1000) });
    this.calmTimers.set(
      trackId,
      setTimeout(() => this.settle(trackId), seconds * 1000 + SETTLE_MS),
    );
  }

  private settle(trackId: string) {
    this.calmTimers.delete(trackId);
    if (this.states.get(trackId)?.giggly) return; // tickled again: the face stays for the next laugh
    emitStudioEvent({ type: 'tickle', trackId, phase: 'calm', level: 0 });
  }

  /** May the laugh be heard now? Never over the band, a take, a lesson, a grown-up panel, the microphone or the guide. */
  private mayLaugh(s: AppState): boolean {
    const t = s.transport;
    return this.host.ready && !s.resting && s.screen === 'lab' && !s.overlay && !s.guide && !t.playing && !t.recording && !t.armed && !this.host.lessonPlaying && !this.host.micBusy;
  }

  /** Forget one monster's tickle; its face goes back to normal if it was showing. */
  reset(trackId: string) {
    const showing = !!this.states.get(trackId)?.giggly || this.calmTimers.has(trackId);
    this.clear(this.quietTimers, trackId);
    this.clear(this.calmTimers, trackId);
    this.states.delete(trackId);
    if (showing) emitStudioEvent({ type: 'tickle', trackId, phase: 'calm', level: 0 });
  }

  /** Everyone calms down, and a laugh still ringing stops. */
  resetAll() {
    for (const id of new Set([...this.states.keys(), ...this.calmTimers.keys()])) this.reset(id);
    this.host.hushLaughs();
  }

  private clear(map: Map<string, Timer>, id: string) {
    const t = map.get(id);
    if (t !== undefined) clearTimeout(t);
    map.delete(id);
  }

  /**
   * Start over when a take starts (or waits), the Lab is left, the monsters rest
   * or the age mode changes. When the band starts, a grown-up panel opens or the
   * guide begins, a laugh still ringing stops (the face may finish its laugh).
   */
  private watch() {
    if (this.watching) return;
    this.watching = true;
    onStudioEvent((e) => {
      if (e.type === 'record-start') this.resetAll();
    });
    useApp.subscribe((s, prev) => {
      if (s.screen !== prev.screen || (s.resting && !prev.resting) || s.settings.ageMode !== prev.settings.ageMode) {
        this.resetAll();
        return;
      }
      if ((s.transport.playing && !prev.transport.playing) || (s.overlay && !prev.overlay) || (s.guide && !prev.guide)) this.host.hushLaughs();
      if (s.project !== prev.project) {
        for (const id of [...this.states.keys()]) {
          const t = s.project.tracks.find((x) => x.id === id);
          if (!t || t.sleeping) this.reset(id);
        }
      }
    });
  }
}
