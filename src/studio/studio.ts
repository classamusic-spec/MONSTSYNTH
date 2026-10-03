import { audibleTime, audioSupported, getAudioContext, inputCompensation, unlockAudio } from '../audio/context';
import { AudioEngine, type ChannelSpec } from '../audio/engine';
import { MicCapture, micSupported } from '../audio/mic';
import { METRONOME } from '../audio/presets';
import { Transport } from '../audio/transport';
import type { Voice } from '../audio/voices/base';
import { TICK_PAD } from '../audio/voices/drums';
import { audioBufferToWav, blobToAudioBuffer } from '../audio/wav';
import { magicArrange } from '../magic/arrange';
import { wandPattern } from '../magic/grooves';
import { placeNote } from '../magic/recorder';
import { audibleTracks, collectEvents, songHasSound, type PlayMode, type SeqEvent } from '../magic/sequence';
import { hasGridFace } from '../magic/steps';
import { gridLinesIn, isBounce, nextLine, nextOccurrence, snapDuration, wrap } from '../magic/timing';
import { recordNote, replaceLoopNotes, setRecordedDuration, setTrackSample, tidyLoop } from '../model/edits';
import { newId } from '../model/ids';
import { MODE_CAPS, MONSTERS } from '../model/monsters';
import { activeClip, projectHasMusic, songBeats, trackHasLoop } from '../model/project';
import type { Clip, MonsterKind, NoteEvent, Project, Settings, Track } from '../model/types';
import { flushSave, loadSample, saveSample } from '../store/persistence';
import { beginGroup, commit, endGroup, getState, labFace, redo, setState, undo, useApp, type AppState, type TransportFlags } from '../store/store';
import { noteRequest, type Expression } from './notes';
import { emitFrame, emitNote, emitStudioEvent, type NoteVisual } from './visualBus';

// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO — Monster Magic's runtime.
// Glue between the three layers: the UI reports gestures, the studio turns them
// into in-scale notes (Magic), plays them (Audio Engine), records them into
// loops, runs the transport, and tells the UI what to animate and when.
// ─────────────────────────────────────────────────────────────────────────────

interface LiveNote {
  id: number;
  trackId: string;
  monster: MonsterKind;
  step: number;
  vel: number;
  tone: number;
  size: number;
  bend: number;
  voice: Voice | null;
  /** AudioContext time the finger came down (from the touch's own timestamp when known). */
  t0: number;
  /** The note being recorded; `startAbs` is its snapped (unwrapped) start. */
  rec: { noteId: string; startAbs: number } | null;
  /** Feedback sounds (buddy taps, painting, previews) are heard but never recorded. */
  recordable: boolean;
}

interface RecordSession {
  token: Project;
  recent: Map<string, number>;
  lastActivityBeat: number;
  notes: number;
  firstLoopFor: Set<string>;
  /** The click plays for the whole take when it began without an awake drum loop. */
  click: boolean;
  /** Last recorded hit of each drum (`trackId:pad`), for the bounce filter. */
  lastHit: Map<string, number>;
}

interface ClickEvent {
  absBeat: number;
  click: true;
  accent: boolean;
}

/** One hit of a held roll, on a grid line. */
interface RollEvent {
  absBeat: number;
  roll: number;
}

type Scheduled = SeqEvent | ClickEvent | RollEvent;

/** Holding Boom or Spark: repeated hits on the beat grid. */
interface Roll {
  trackId: string;
  monster: MonsterKind;
  step: number;
  vel: number;
  tone: number;
  size: number;
  /** The clock it rides: the band's transport, or its own when nothing else plays. */
  clock: 'main' | 'solo';
  /** Grid lines up to here (beats on that clock) have been scheduled. */
  after: number;
  /** AudioContext time of its last scheduled hit, so a change of clock never doubles a hit. */
  lastWhen: number;
}

/** A note in a song lesson (a phrase the teacher sings, or the whole song with its band). */
export interface LessonEvent {
  absBeat: number;
  monster: MonsterKind;
  /** Scale step (a drum pad for Boom). */
  step: number;
  /** Beats. */
  dur: number;
  vel: number;
  /** Melody notes carry "phrase:index" so the words can follow along. */
  tag?: string;
}

export interface LessonPlayback {
  tempo: number;
  key: number;
  lengthBeats: number;
  onEnd?: () => void;
}

/** A note of a block being heard on its own (Monster Blocks). `absBeat` is the note's beat in its loop. */
interface AuditionEvent {
  absBeat: number;
  channelId: string;
  trackId: string;
  monster: MonsterKind;
  note: NoteEvent;
  /** Beat the preview ends (long notes are cut short there, with a little tail). */
  end: number;
}

/** A monster's little sounds: "huh?" (nothing to play), "yay!" and "pop" (a block goes away). */
export type ChirpKind = 'huh' | 'yay' | 'pop';

/** [scale step (a drum pad for Boom), start (s), length (s), velocity] */
type ChirpNote = [step: number, at: number, dur: number, vel: number];

const CHIRPS: Record<ChirpKind, { tune: ChirpNote[]; drums: ChirpNote[] }> = {
  // A question: two notes up, the second one longer.
  huh: {
    tune: [
      [2, 0, 0.12, 0.6],
      [4, 0.16, 0.3, 0.68],
    ],
    drums: [
      [4, 0, 0.12, 0.6],
      [7, 0.16, 0.3, 0.6],
    ],
  },
  // A cheer: a quick climb to the top.
  yay: {
    tune: [
      [2, 0, 0.1, 0.62],
      [4, 0.09, 0.1, 0.66],
      [7, 0.18, 0.34, 0.72],
    ],
    drums: [
      [0, 0, 0.12, 0.7],
      [1, 0.11, 0.12, 0.62],
      [3, 0.22, 0.2, 0.66],
    ],
  },
  // Going away: a soft blip, high then low.
  pop: {
    tune: [
      [5, 0, 0.07, 0.42],
      [2, 0.06, 0.1, 0.38],
    ],
    drums: [[4, 0, 0.08, 0.45]],
  },
};

/** The metronome: a woodblock tick on a channel of its own that no song change touches. */
const CLICK: ChannelSpec = {
  id: 'metronome',
  monster: 'boom',
  preset: METRONOME.preset,
  fx: { echo: 0, gloop: 0, chomper: 0, wiggle: 0 },
  volume: METRONOME.volume,
  maxVoices: 4,
  persistent: true,
};

/** A live drum hit this close to the loop playing the same drum is left to the loop (no flam). */
const FLAM_WINDOW = 0.06;
/** Frames keep coming this long after the band stops, so last animations can finish. */
const IDLE_SETTLE_MS = 600;
/** Touch timestamps older than this are not trusted (seconds). */
const MAX_TOUCH_LAG = 0.15;
/** A roll's first hit is at least this far ahead (seconds), so it is scheduled on time. */
const ROLL_LEAD = 0.02;
/** Moving to another clock, a roll's next hit is at least this many grid steps after its last one. */
const ROLL_HANDOFF_GAP = 0.75;
/** Stopping the band fades what it queued over this long (seconds); later queued hits are silent. */
const STOP_FADE = 0.06;
/**
 * Beat Hop: the first stone tapped with nothing playing starts the loop *from
 * that stone's beat*, so the first sound is the child's own stone, on the beat.
 * (false: start at beat 1 and preview the stone at once instead.)
 */
const GRID_START_FROM_TAP = true;
/** While the loop plays, a new stone due within this many beats needs no preview (the loop answers). */
const PREVIEW_NEAR = 0.5;
/** Grid previews while the loop plays wait for the next line of this grid (a sixteenth). */
const PREVIEW_GRID = 0.25;
/** With nothing playing, grid previews come at most this often (a swipe is not a machine gun). */
const QUIET_PREVIEW_MS = 60;

function isClick(e: Scheduled): e is ClickEvent {
  return (e as ClickEvent).click === true;
}

function isRoll(e: Scheduled): e is RollEvent {
  return (e as RollEvent).roll !== undefined;
}

/**
 * How long ago a touch happened, from its event timestamp (performance.now()
 * milliseconds): the handler may run tens of ms late on a busy tablet.
 */
function touchLag(at?: number): number {
  if (at === undefined) return 0;
  return Math.min(MAX_TOUCH_LAG, Math.max(0, (performance.now() - at) / 1000));
}

function setTransport(patch: Partial<TransportFlags>) {
  setState({ transport: { ...getState().transport, ...patch } });
}

/** The Lab shows Beat Hop's grid (and not the keys). */
function gridShown(s: AppState): boolean {
  return s.screen === 'lab' && labFace(s) === 'grid';
}

/** What a loop plays, ignoring ids and order (to tell two grooves apart). */
function patternOf(notes: readonly NoteEvent[]): string {
  return notes
    .map((n) => `${n.step}@${n.beat}`)
    .sort()
    .join(' ');
}

function trackSignature(t: Track): string {
  return `${t.monster}|${t.preset}|${t.fx.echo}|${t.fx.gloop}|${t.fx.chomper}|${t.fx.wiggle}|${t.volume}`;
}

class Studio {
  private ctx: AudioContext | null = null;
  private engine: AudioEngine | null = null;
  private transport: Transport<Scheduled> | null = null;
  private lessonTransport: Transport<LessonEvent> | null = null;
  private lessonEvents: LessonEvent[] = [];
  private lessonOpts: LessonPlayback | null = null;
  private live = new Map<number, LiveNote>();
  private liveSeq = 0;
  private visuals: { time: number; v: NoteVisual }[] = [];
  private session: RecordSession | null = null;
  private skipBefore = new Map<string, number>();
  /** Play mode of the running transport (read by the scheduler, set before it starts). */
  private mode: PlayMode = 'loop';
  private signatures = new Map<string, string>();
  private sampleCache = new Map<string, AudioBuffer>();
  private channelSample = new Map<string, string | null>();
  private tempo = 0;
  private mic: MicCapture | null = null;
  private rolls = new Map<number, Roll>();
  /** Plays held rolls when the band is not playing. */
  private rollTransport: Transport<Scheduled> | null = null;
  /**
   * When the loop plays each drum or key (`channelId:step` → AudioContext times):
   * the flam guard for live drums and rolls, and the grid's catch-up dedupe.
   */
  private seqHits = new Map<string, number[]>();
  /** Start of the finale, while a song is ending (its voices outlive the tail fade). */
  private finaleAt = Infinity;
  /** What the last idle frame showed; frames rest while nothing changes. */
  private idleKey = '';
  private idleSince = 0;
  /** Beat Hop: the next stone tapped with nothing playing starts the loop (until Stop, or leaving the grid). */
  private gridAutoStart = false;
  /** Beat Hop: the wand's next groove per monster. */
  private wandIndex = new Map<string, number>();
  /** Beat Hop: the line each drum was last previewed on (`trackId:step`), so a preview never doubles. */
  private lastPreviewLine = new Map<string, number>();
  private lastPreview: { beat: number; when: number } | null = null;
  private lastQuietPreview = -Infinity;
  /** This run of the song had something to hear when it started (an empty song never gets a finale). */
  private songHadSound = false;
  /** Monster Blocks: a block heard on its own, on a little clock of its own. */
  private auditionTransport: Transport<AuditionEvent> | null = null;
  private auditionEvents: AuditionEvent[] = [];
  private auditionVoices: Voice[] = [];
  /** Songs that had their first Magic this session (the first one starts on the beat). */
  private arranged = new Set<string>();

  get ready(): boolean {
    return !!this.engine;
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  // ── Wake-up (audio unlock) ────────────────────────────────────────────────

  /** Call from a user gesture (pointerup / click / keydown). */
  async wake(): Promise<boolean> {
    if (!audioSupported()) {
      setState({ awake: true });
      return false;
    }
    const unlocking = unlockAudio();
    if (!this.engine) this.build();
    const ok = await unlocking;
    this.syncProject(getState().project, true);
    this.syncSettings(getState().settings);
    setState({ awake: true });
    emitStudioEvent({ type: 'wake' });
    if (ok) this.hello();
    return ok;
  }

  private build() {
    const ctx = getAudioContext();
    this.ctx = ctx;
    this.engine = new AudioEngine(ctx, { meter: true });
    this.transport = new Transport<Scheduled>(ctx, {
      provide: (from, to) => this.provide(from, to),
      schedule: (e, when) => this.schedule(e, when),
      ending: (when) => this.finale(when),
      ended: () => this.songEnded(),
    });
    this.rollTransport = new Transport<Scheduled>(ctx, {
      provide: (from, to) => this.rollEvents('solo', from, to),
      schedule: (e, when) => this.schedule(e, when),
    });
    useApp.subscribe((state, prev) => {
      if (state.project !== prev.project) this.syncProject(state.project);
      if (state.settings !== prev.settings) this.syncSettings(state.settings);
      if (state.screen !== prev.screen) this.screenChanged(state.screen);
      const grid = gridShown(state);
      if (grid !== gridShown(prev)) this.gridFaceChanged(grid);
    });
    this.gridAutoStart = gridShown(getState());
    ctx.onstatechange = () => {
      if (ctx.state !== 'running' && getState().awake && !document.hidden) {
        this.stop();
        setState({ awake: false });
      }
    };
    // Losing focus (Alt/Cmd-Tab, a system dialog) must never leave a note stuck on.
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lessonStop();
        this.stop();
        this.releaseAll();
        void flushSave();
      } else if (ctx.state !== 'running') {
        setState({ awake: false });
      }
    });
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
  }

  /** Every monster on stage says hello (a friendly arpeggio) when woken. */
  private hello() {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx) return;
    const p = getState().project;
    const steps: Record<MonsterKind, number> = { grumble: 0, boom: 0, bloop: 2, spark: 4, puff: 0, mimic: 3 };
    p.tracks.forEach((t, i) => {
      const when = ctx.currentTime + 0.05 + i * 0.12;
      const req = noteRequest(p, t.monster, t.id, steps[t.monster], { vel: 0.7 });
      engine.trigger(req, when, 0.3);
      this.queueVisual(when, { trackId: t.id, monster: t.monster, step: steps[t.monster], vel: 0.7, dur: 0.3, source: 'loop' });
    });
  }

  // ── Syncing project → engine ──────────────────────────────────────────────

  private channelSpec(t: Track): ChannelSpec {
    return { id: t.id, monster: t.monster, preset: t.preset, fx: t.fx, volume: t.volume, maxVoices: MONSTERS[t.monster].maxVoices };
  }

  private syncProject(p: Project, force = false) {
    const engine = this.engine;
    if (!engine) return;
    const ids = new Set(p.tracks.map((t) => t.id));
    // A monster leaving the stage loses its channel; forget its sample so it is
    // re-attached if the same track comes back (bench, undo).
    for (const id of [...this.channelSample.keys()]) if (!ids.has(id)) this.channelSample.delete(id);
    let changed = force || [...this.signatures.keys()].some((id) => !ids.has(id));
    for (const t of p.tracks) if (this.signatures.get(t.id) !== trackSignature(t)) changed = true;
    if (changed) {
      engine.syncChannels(p.tracks.map((t) => this.channelSpec(t)));
      this.signatures = new Map(p.tracks.map((t) => [t.id, trackSignature(t)]));
    }
    if (p.tempo !== this.tempo) {
      this.tempo = p.tempo;
      engine.setTempo(p.tempo);
      this.transport?.setTempo(p.tempo);
      this.rollTransport?.setTempo(p.tempo);
    }
    for (const t of p.tracks) {
      if (t.monster !== 'mimic') continue;
      if (this.channelSample.get(t.id) === t.sampleId && !force) continue;
      this.channelSample.set(t.id, t.sampleId);
      void this.attachSample(t.id, t.sampleId);
    }
  }

  private async attachSample(trackId: string, sampleId: string | null) {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx) return;
    if (!sampleId) {
      engine.setSample(trackId, null);
      return;
    }
    let buf = this.sampleCache.get(sampleId);
    if (!buf) {
      const blob = await loadSample(sampleId);
      if (!blob) return;
      try {
        buf = await blobToAudioBuffer(ctx, blob);
        this.sampleCache.set(sampleId, buf);
      } catch {
        return;
      }
    }
    // The track may have changed while we were decoding.
    const track = getState().project.tracks.find((t) => t.id === trackId);
    if (track?.sampleId === sampleId) engine.setSample(trackId, buf);
  }

  private syncSettings(s: Settings) {
    this.engine?.setOutputLevel(s.volume, s.volumeCeiling);
  }

  private screenChanged(screen: string) {
    const t = getState().transport;
    // Recording belongs to the Lab: leaving it finishes the take.
    if ((t.recording || t.armed) && screen !== 'lab') this.stopRecording();
    if (screen !== 'learn') this.lessonStop();
    if (!t.playing) return;
    const wantMode = screen === 'blocks' ? 'song' : 'loop';
    if (this.mode !== wantMode || screen === 'songs' || screen === 'learn') this.stop();
  }

  /**
   * Beat Hop's grid appeared or went away. A take never continues under the
   * grid (it ends as one undo step), and the first stone may start the loop.
   */
  private gridFaceChanged(shown: boolean) {
    if (shown) this.stopRecording();
    this.gridAutoStart = shown;
  }

  // ── Live performance ──────────────────────────────────────────────────────

  /**
   * A finger goes down. `opts.at` is the touch's own timestamp (event.timeStamp):
   * recording measures from it, so a busy main thread does not make notes late.
   */
  press(trackId: string, step: number, expr: Partial<Expression> = {}, opts: { record?: boolean; at?: number } = {}): number {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx) return -1;
    const s = getState();
    if (s.resting) return -1;
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track) return -1;
    const vel = expr.vel ?? 0.85;
    const tone = expr.tone ?? 0;
    const size = expr.size ?? 0;
    const bend = expr.bend ?? 0;
    const req = noteRequest(s.project, track.monster, track.id, step, { vel, tone, size, bend });
    // Flam guard: playing along with a drum the loop is hitting right now, the
    // loop's hit is the one heard (it is on the beat). The touch still shows and records.
    const flam = track.monster === 'boom' && s.transport.playing && this.seqHitNear(track.id, step, ctx.currentTime);
    const voice = flam ? null : engine.noteOn(req);
    const id = ++this.liveSeq;
    const recordable = opts.record !== false;
    const t0 = ctx.currentTime - touchLag(opts.at);
    const live: LiveNote = { id, trackId, monster: track.monster, step, vel, tone, size, bend, voice, t0, rec: null, recordable };
    this.live.set(id, live);
    emitNote({ trackId, monster: track.monster, step, vel, dur: 0.35, source: 'live' });
    if (recordable && (s.transport.recording || s.transport.armed)) this.recordStart(live);
    return id;
  }

  /** Change a held note: new key (glide or re-hit) and/or timbre. */
  move(id: number, patch: { step?: number; tone?: number; size?: number }) {
    const live = this.live.get(id);
    const engine = this.engine;
    const ctx = this.ctx;
    if (!live || !engine || !ctx) return;
    const now = ctx.currentTime;
    if (patch.tone !== undefined && Math.abs(patch.tone - live.tone) > 0.01) {
      live.tone = patch.tone;
      live.voice?.setTone(patch.tone, now);
    }
    if (patch.size !== undefined) live.size = patch.size;
    if (patch.step === undefined || patch.step === live.step) return;
    const p = getState().project;
    live.step = patch.step;
    const info = MONSTERS[live.monster];
    const req = noteRequest(p, live.monster, live.trackId, patch.step, live);
    if (info.sustain && live.voice && live.voice.endTime === Infinity) {
      live.voice.setPitch(req.midi, now);
    } else {
      live.voice = engine.noteOn(req);
    }
    emitNote({ trackId: live.trackId, monster: live.monster, step: patch.step, vel: live.vel, dur: 0.3, source: 'live' });
    const t = getState().transport;
    if (t.recording && live.recordable) {
      this.finishRecNote(live);
      live.t0 = now;
      this.recordStart(live);
    }
  }

  /** A finger lifts; `at` is its event timestamp, as for press(). */
  release(id: number, at?: number) {
    const live = this.live.get(id);
    if (!live) return;
    this.live.delete(id);
    this.engine?.noteOff(live.voice);
    this.finishRecNote(live, touchLag(at));
  }

  releaseAll() {
    for (const id of [...this.live.keys()]) this.release(id);
    for (const id of [...this.rolls.keys()]) this.stopRoll(id);
  }

  /** A quick tap. Pass `{ record: false }` for feedback sounds that must not land in a loop. */
  hit(trackId: string, step: number, expr: Partial<Expression> = {}, opts: { record?: boolean } = {}) {
    const id = this.press(trackId, step, expr, opts);
    if (id >= 0) setTimeout(() => this.release(id), 140);
  }

  /** A short note from a monster that may not be on stage (painting with Puff, say). */
  hitMonster(monster: MonsterKind, step: number, vel = 0.8) {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx || getState().resting) return;
    const id = `paint:${monster}`;
    const info = MONSTERS[monster];
    if (!engine.hasChannel(id)) {
      engine.ensureChannel({ id, monster, preset: info.presets[0].id, fx: info.defaultFx, volume: 0.75, maxVoices: info.maxVoices, persistent: true });
    }
    engine.trigger(noteRequest(getState().project, monster, id, step, { vel }), ctx.currentTime, 0.25);
    emitNote({ trackId: null, monster, step, vel, dur: 0.25, source: 'live' });
  }

  /**
   * Holding Boom or Spark: a roll of repeated hits locked to the beat grid
   * (eighths in Little mode, sixteenths in Maker), starting on the next grid
   * line. While the band plays it rides the band's clock (and records); when
   * nothing plays it gets a little clock of its own at the song's tempo.
   */
  startRoll(trackId: string, step: number, expr: Partial<Expression> = {}): number {
    const s = getState();
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!this.engine || !track || s.resting) return -1;
    const id = ++this.liveSeq;
    const roll: Roll = {
      trackId,
      monster: track.monster,
      step,
      vel: (expr.vel ?? 0.8) * 0.85,
      tone: expr.tone ?? 0,
      size: expr.size ?? 0,
      clock: 'main',
      after: -Infinity,
      lastWhen: -Infinity,
    };
    this.rolls.set(id, roll);
    this.homeRoll(id, roll);
    return id;
  }

  /** Letting go ends the roll. A hit already in the look-ahead window (≤ 120 ms) still sounds. */
  stopRoll(id: number) {
    this.rolls.delete(id);
    if (![...this.rolls.values()].some((r) => r.clock === 'solo')) this.rollTransport?.stop();
  }

  private rollGrid(): number {
    return MODE_CAPS[getState().settings.ageMode].drumSnap.grid;
  }

  /**
   * Put a roll on the clock that runs now; its next hit is the next grid line.
   * A change of clock (the band starts or stops under a held roll) never doubles
   * a hit: what the old clock queued still sounds, so the first hit on the new
   * one comes at least ¾ of a grid step after it, unless that hit was silenced
   * (from `silencedFrom` on, the band's stop faded out what it had queued).
   */
  private homeRoll(id: number, roll: Roll, silencedFrom = Infinity) {
    const ctx = this.ctx;
    const main = this.transport;
    const solo = this.rollTransport;
    if (!ctx || !main || !solo) return;
    const grid = this.rollGrid();
    const tempo = getState().project.tempo;
    const gridSec = grid * (60 / tempo);
    const earliest = Math.max(ctx.currentTime + ROLL_LEAD, Math.min(roll.lastWhen + ROLL_HANDOFF_GAP * gridSec, silencedFrom));
    if (!main.playing && !solo.playing) {
      // A clock of its own: the roll keeps its pulse (a silenced hit is played again in its place).
      const pulse = roll.lastWhen > -Infinity;
      const at = pulse ? roll.lastWhen + Math.ceil((earliest - roll.lastWhen) / gridSec - 1e-9) * gridSec : earliest;
      roll.clock = 'solo';
      roll.after = -grid / 2;
      solo.setTempo(tempo);
      solo.start({ atTime: at, fromBeat: 0 });
      return;
    }
    const clock = main.playing ? main : solo;
    roll.clock = main.playing ? 'main' : 'solo';
    const first = nextLine(clock.beatAt(earliest), grid);
    roll.after = first - grid / 2;
    // Lines the clock has already handed out would be skipped: schedule them now.
    for (const line of gridLinesIn(first, clock.scheduledUntil, grid)) {
      roll.after = line;
      this.schedule({ absBeat: line, roll: id }, clock.timeAt(line));
    }
  }

  /** The band started or stopped: held rolls move to the clock that runs now. */
  private rehomeRolls(silencedFrom = Infinity) {
    this.rollTransport?.stop();
    for (const [id, roll] of this.rolls) this.homeRoll(id, roll, silencedFrom);
  }

  private rollEvents(clock: 'main' | 'solo', from: number, to: number): RollEvent[] {
    const out: RollEvent[] = [];
    if (this.rolls.size === 0) return out;
    const grid = this.rollGrid();
    for (const [id, roll] of this.rolls) {
      if (roll.clock !== clock) continue;
      for (const line of gridLinesIn(from, to, grid, roll.after)) {
        out.push({ absBeat: line, roll: id });
        roll.after = line;
      }
    }
    return out;
  }

  private playRoll(e: RollEvent, when: number) {
    const engine = this.engine;
    const roll = this.rolls.get(e.roll);
    if (!engine || !roll) return;
    const p = getState().project;
    if (!p.tracks.some((t) => t.id === roll.trackId)) return;
    roll.lastWhen = when;
    // The loop already hits this drum on this line: one hit, not two.
    if (roll.monster !== 'boom' || !this.seqHitNear(roll.trackId, roll.step, when)) {
      engine.trigger(noteRequest(p, roll.monster, roll.trackId, roll.step, roll), when, 0.12);
    }
    this.queueVisual(when, { trackId: roll.trackId, monster: roll.monster, step: roll.step, vel: roll.vel, dur: 0.35, source: 'live' });
    if (roll.clock === 'main' && getState().transport.recording) this.recordAt(roll, e.absBeat);
  }

  /** Did the loop schedule this drum (or key) within the flam window of `at`? */
  private seqHitNear(channelId: string, step: number, at: number): boolean {
    const times = this.seqHits.get(`${channelId}:${step}`);
    return !!times && times.some((t) => Math.abs(t - at) < FLAM_WINDOW);
  }

  private noteSeqHit(channelId: string, step: number, when: number) {
    const key = `${channelId}:${step}`;
    const now = this.ctx?.currentTime ?? 0;
    const times = (this.seqHits.get(key) ?? []).filter((t) => t > now - 0.25);
    times.push(when);
    this.seqHits.set(key, times);
  }

  /** Shaking a monster makes its sound wobble (vibrato) while the shake lasts. */
  setLiveWiggle(trackId: string, on: boolean) {
    this.engine?.setWiggleBoost(trackId, on ? 0.9 : 0);
  }

  /** Play a tiny phrase so a child hears a new costume/sound right away. */
  preview(trackId: string) {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine || getState().resting) return;
    const p = getState().project;
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    const phrase = t.monster === 'boom' ? [0, 2, 1] : [2, 4, 5];
    phrase.forEach((step, i) => {
      const when = ctx.currentTime + 0.02 + i * 0.16;
      engine.trigger(noteRequest(p, t.monster, t.id, step, { vel: 0.75 }), when, 0.14);
      this.queueVisual(when, { trackId, monster: t.monster, step, vel: 0.75, dur: 0.14, source: 'loop' });
    });
  }

  // ── Beat Hop (the step grid) ──────────────────────────────────────────────
  // Grid edits change the loop like any other edit; the studio makes sure the
  // child hears them on the beat:
  //   nothing playing, first stone  → the loop starts from that stone's beat
  //   nothing playing after Stop     → the stone sounds at once
  //   loop playing                   → the stone plays in this very pass, and a
  //                                    soft preview on the next sixteenth when
  //                                    its turn is more than half a beat away

  /** Apply a grid edit to a monster's loop and make it heard. False when nothing changed. */
  stepEdit(trackId: string, edit: (p: Project) => Project, o: { col: number; coalesce?: string; preview?: 'tap' | 'none' }): boolean {
    const before = getState().project.tracks.find((t) => t.id === trackId);
    if (!before) return false;
    const was = activeClip(before)?.notes ?? [];
    const hadLoop = trackHasLoop(before);
    if (!commit(edit, { coalesce: o.coalesce })) return false;
    const track = getState().project.tracks.find((t) => t.id === trackId);
    const clip = track ? activeClip(track) : null;
    if (!track || !clip) return true;
    const wasById = new Map(was.map((n) => [n.id, n]));
    const nowIds = new Set(clip.notes.map((n) => n.id));
    const added = clip.notes.filter((n) => !wasById.has(n.id));
    // A bead that jumped to another key (or was dragged there) keeps its id.
    const moved = clip.notes.filter((n) => {
      const w = wasById.get(n.id);
      return !!w && (w.step !== n.step || w.beat !== n.beat);
    });
    const removed = was.filter((n) => !nowIds.has(n.id));
    if (!hadLoop && clip.notes.length > 0) emitStudioEvent({ type: 'loop-created', trackId });
    this.soundEdit(track, clip, added, moved, removed, o);
    return true;
  }

  private soundEdit(track: Track, clip: Clip, added: NoteEvent[], moved: NoteEvent[], removed: NoteEvent[], o: { col: number; preview?: 'tap' | 'none' }) {
    const ctx = this.ctx;
    const transport = this.transport;
    const engine = this.engine;
    if (!ctx || !transport || !engine || getState().resting) return;
    const earliest = (list: NoteEvent[]) => list.reduce<NoteEvent | null>((a, n) => (!a || n.beat < a.beat ? n : a), null);
    // The stone the finger set: the earliest new note (a double's first hit), or
    // a bead a tap made jump to another key (a drag is auditioned by the lane itself).
    const tapped = earliest(added) ?? (o.preview === 'tap' ? earliest(moved) : null);
    if (!transport.playing) {
      if (tapped && this.gridAutoStart) {
        this.gridAutoStart = false;
        this.startTransport('loop', GRID_START_FROM_TAP ? o.col : 0);
        if (GRID_START_FROM_TAP || o.preview === 'none' || !tapped) return;
      }
      if (o.preview === 'none') return;
      const now = performance.now();
      if (now - this.lastQuietPreview < QUIET_PREVIEW_MS) return;
      this.lastQuietPreview = now;
      // Taking a stone away makes only a soft blip, so it never sounds like an add.
      if (tapped) this.hit(track.id, tapped.step, { vel: 0.8 }, { record: false });
      else if (removed.length > 0) this.hit(track.id, removed[0].step, { vel: 0.3 }, { record: false });
      return;
    }
    if (this.mode !== 'loop' || (added.length === 0 && !tapped)) return;
    const L = clip.lengthBeats;
    const nowBeat = transport.beatAt(ctx.currentTime);
    const heard = audibleTracks(getState().project).some((t) => t.id === track.id);
    // Catch up: the transport has already handed out the next ~120 ms, so a note
    // due inside it would be skipped for a whole loop. Schedule it once now, unless
    // that drum (or key) is already queued for this moment (the old groove's or
    // tune's same note after a wand tap, a stone taken away and put back, a partly
    // lit stone rewritten onto the beat): one hit, not two. Only new notes: a bead
    // that moved keeps its id, and its old key may already be queued.
    for (const n of added) {
      const occ = nextOccurrence(n.beat, L, nowBeat);
      if (!heard || occ >= transport.scheduledUntil - 1e-9) continue;
      const when = transport.timeAt(occ);
      if (this.seqHitNear(track.id, n.step, when)) continue;
      this.schedule({ absBeat: occ, channelId: track.id, trackId: track.id, monster: track.monster, note: n, source: 'clip' }, when);
    }
    if (!tapped || o.preview === 'none' || !heard) return;
    const occ = nextOccurrence(tapped.beat, L, nowBeat);
    // A bead that jumped inside the handed-out window: its old key plays this time
    // round, and the new one is previewed just after it (never on top of it).
    const queuedOld = moved.includes(tapped) && occ < transport.scheduledUntil - 1e-9;
    if (!queuedOld && occ - nowBeat <= PREVIEW_NEAR) return;
    // A soft taste of the new stone on the next sixteenth (never off the grid).
    const line = nextLine(queuedOld ? Math.max(nowBeat + 0.05, occ + 1e-6) : nowBeat + 0.05, PREVIEW_GRID);
    // The loop already plays this drum (or key) on that line: that note is the preview.
    if (clip.notes.some((n) => n.step === tapped.step && Math.abs(wrap(n.beat, L) - wrap(line, L)) < 1e-6)) return;
    const key = `${track.id}:${tapped.step}`;
    if (this.lastPreviewLine.get(key) === line) return;
    const when = transport.timeAt(line);
    // That drum (or key) is already queued for that moment (an old pattern's note): it is the preview.
    if (this.seqHitNear(track.id, tapped.step, when)) return;
    this.lastPreviewLine.set(key, line);
    // Remembered like a loop note, so a stone put on that very line next is not doubled.
    this.noteSeqHit(track.id, tapped.step, when);
    const p = getState().project;
    const vel = tapped.vel * 0.6;
    const durSec = Math.max(0.05, tapped.dur * (60 / p.tempo));
    engine.trigger(noteRequest(p, track.monster, track.id, tapped.step, { vel, tone: 0 }), when, durSec);
    this.queueVisual(when, { trackId: track.id, monster: track.monster, step: tapped.step, vel, dur: durSec, source: 'live' });
    this.lastPreview = { beat: line, when };
  }

  /** A row head on the grid: the drum (or note) sounds at once, and nothing is recorded. */
  auditionStep(trackId: string, step: number, vel = 0.8) {
    this.hit(trackId, step, { vel }, { record: false });
  }

  /** Waiting for the first stone to start the loop (for the Coach's Play hint). */
  get gridWaiting(): boolean {
    return this.gridAutoStart;
  }

  /**
   * The wand ("Surprise"): the monster's loop becomes the next ready-made groove
   * (Boom) or tune (the bead lane). A burst of taps is one undo step back to the
   * child's own pattern. If nothing plays, the loop starts from beat 1.
   */
  gridWand(trackId: string) {
    const s = getState();
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track || !hasGridFace(track.monster) || s.resting) return;
    const mode = s.settings.ageMode;
    const o = { beatsPerBar: s.project.beatsPerBar };
    let idx = this.wandIndex.get(trackId) ?? 0;
    let notes = wandPattern(track.monster, mode, idx, o);
    // Every tap must change something: skip the idea the loop already plays.
    if (patternOf(notes) === patternOf(activeClip(track)?.notes ?? [])) notes = wandPattern(track.monster, mode, ++idx, o);
    this.wandIndex.set(trackId, idx + 1);
    this.stepEdit(trackId, (p) => replaceLoopNotes(p, trackId, notes), { col: 0, coalesce: `wand:${trackId}`, preview: 'none' });
    if (!this.transport?.playing) {
      this.gridAutoStart = false;
      this.startTransport('loop', 0);
    }
  }

  /**
   * The magnet: every note of the monster's loop slides exactly onto the beat
   * grid (one undo step), and the monster plays a little twinkle.
   */
  tidy(trackId: string): boolean {
    this.stopRecording();
    const s = getState();
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const caps = MODE_CAPS[s.settings.ageMode];
    const grid = track.monster === 'boom' ? caps.drumSnap.grid : caps.quantizeGrid;
    if (!commit((p) => tidyLoop(p, trackId, grid))) return false;
    this.preview(trackId);
    return true;
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  private protectedIds(abs: number, loopBeats: number): Set<string> {
    const out = new Set<string>();
    if (!this.session) return out;
    for (const [id, b] of this.session.recent) {
      const age = abs - b;
      if (age < loopBeats * 0.5) out.add(id);
      else if (age > loopBeats * 2) this.session.recent.delete(id);
    }
    return out;
  }

  private recordStart(live: LiveNote) {
    const ctx = this.ctx;
    const transport = this.transport;
    const session = this.session;
    if (!ctx || !transport || !session) return;
    const s = getState();
    const p = s.project;
    const caps = MODE_CAPS[s.settings.ageMode];
    // Where the child heard themselves play: the touch time, minus output latency and touch delay.
    const heard = live.t0 - inputCompensation(ctx);
    let abs: number;
    if (s.transport.armed) {
      // Monster Magic: the first note of a new song *is* the downbeat. The loop
      // starts where the finger landed, so every later note is measured alike.
      setTransport({ recording: true, armed: false });
      this.startTransport('loop', 0, heard);
      abs = 0;
    } else {
      abs = transport.beatAt(heard);
    }
    const drum = live.monster === 'boom';
    if (drum) {
      // A finger bouncing on a drum is one hit (it still sounded, it is just not recorded twice).
      const key = `${live.trackId}:${live.step}`;
      const prev = session.lastHit.get(key);
      if (prev !== undefined && isBounce(prev, abs, p.tempo)) return;
      session.lastHit.set(key, abs);
    }
    const grid = drum ? caps.drumSnap.grid : caps.quantizeGrid;
    const place = placeNote(abs, {
      loopBeats: p.loopBeats,
      grid: caps.quantizeGrid,
      strength: caps.quantizeStrength,
      snap: drum ? caps.drumSnap : undefined,
    });
    const info = MONSTERS[live.monster];
    const note = { beat: place.beat, dur: info.sustain ? 0.25 : 0.5, step: live.step, vel: live.vel, tone: live.tone };
    const noteId = this.commitRecorded(live.trackId, live.monster, note, place.absBeat, abs, grid);
    live.rec = { noteId, startAbs: place.absBeat };
  }

  /** A roll hit lands in the loop exactly on its grid line (it was played by the clock, not a finger). */
  private recordAt(roll: Roll, absBeat: number) {
    const session = this.session;
    if (!session) return;
    const s = getState();
    const caps = MODE_CAPS[s.settings.ageMode];
    const grid = roll.monster === 'boom' ? caps.drumSnap.grid : caps.quantizeGrid;
    const note = { beat: wrap(absBeat, s.project.loopBeats), dur: 0.5, step: roll.step, vel: roll.vel, tone: roll.tone };
    this.commitRecorded(roll.trackId, roll.monster, note, absBeat, absBeat, grid);
    if (roll.monster === 'boom') session.lastHit.set(`${roll.trackId}:${roll.step}`, absBeat);
  }

  /**
   * Drop a played note into the loop. `placedAbs` is its (snapped) transport
   * beat, `heardAbs` when it was actually played.
   */
  private commitRecorded(
    trackId: string,
    monster: MonsterKind,
    note: Omit<NoteEvent, 'id'>,
    placedAbs: number,
    heardAbs: number,
    grid: number,
  ): string {
    const session = this.session!;
    const p = getState().project;
    const noteId = newId('n');
    const track = p.tracks.find((t) => t.id === trackId);
    const hadLoop = track ? trackHasLoop(track) : false;
    const protectedIds = this.protectedIds(heardAbs, p.loopBeats);
    commit(
      (proj) =>
        recordNote(proj, trackId, { id: noteId, ...note }, { grid, isDrum: monster === 'boom', protectedIds, maxNotes: MONSTERS[monster].maxClipNotes }),
      { undoable: false },
    );
    // The child just heard this note: don't play it again on this pass.
    this.skipBefore.set(noteId, placedAbs + grid * 0.5);
    session.recent.set(noteId, heardAbs);
    session.lastActivityBeat = Math.max(session.lastActivityBeat, heardAbs);
    session.notes++;
    if (!hadLoop && !session.firstLoopFor.has(trackId)) {
      session.firstLoopFor.add(trackId);
      emitStudioEvent({ type: 'loop-created', trackId });
    }
    return noteId;
  }

  /** A held note ends: its end snaps to the grid, measured from its snapped start. */
  private finishRecNote(live: LiveNote, lag = 0) {
    const rec = live.rec;
    live.rec = null;
    const ctx = this.ctx;
    const transport = this.transport;
    if (!rec || !ctx || !transport || !MONSTERS[live.monster].sustain) return;
    const p = getState().project;
    const endAbs = transport.beatAt(ctx.currentTime - lag - inputCompensation(ctx));
    const dur = snapDuration(rec.startAbs, endAbs - rec.startAbs, p.loopBeats);
    commit((proj) => setRecordedDuration(proj, live.trackId, rec.noteId, dur), { undoable: false });
    if (this.session) this.session.lastActivityBeat = Math.max(this.session.lastActivityBeat, endAbs);
  }

  toggleRecord() {
    const t = getState().transport;
    if (t.recording || t.armed) this.stopRecording();
    else this.startRecording();
  }

  startRecording() {
    const ctx = this.ctx;
    const transport = this.transport;
    if (!ctx || !transport) return;
    const s = getState();
    // Nothing records while the grid is showing (its stones are the way to write).
    if (s.screen !== 'lab' || s.resting || gridShown(s)) return;
    this.session = {
      token: beginGroup('record'),
      recent: new Map(),
      lastActivityBeat: 0,
      notes: 0,
      firstLoopFor: new Set(),
      // Decided once, from what will be heard (asleep or left out of a solo, Boom keeps no beat):
      // a take that makes the drum loop keeps its click to the end.
      click: !audibleTracks(s.project).some((t) => t.monster === 'boom' && trackHasLoop(t)),
      lastHit: new Map(),
    };
    if (s.transport.playing && s.transport.mode === 'loop') {
      this.session.lastActivityBeat = transport.beatAt(ctx.currentTime);
      setTransport({ recording: true });
    } else if (projectHasMusic(s.project)) {
      // Flags first: the transport schedules its first window (and click) at once.
      setTransport({ recording: true });
      this.startTransport('loop');
    } else {
      setTransport({ armed: true });
    }
    emitStudioEvent({ type: 'record-start' });
  }

  stopRecording() {
    const t = getState().transport;
    if (!t.recording && !t.armed) return;
    for (const live of this.live.values()) this.finishRecNote(live);
    setTransport({ recording: false, armed: false });
    const session = this.session;
    this.session = null;
    if (session) {
      endGroup(session.token);
      emitStudioEvent({ type: 'record-stop', notes: session.notes });
    }
  }

  // ── History ───────────────────────────────────────────────────────────────

  /** Undo always ends a recording first, so a take is undone as one piece. */
  undo(): boolean {
    this.stopRecording();
    return undo();
  }

  redo(): boolean {
    this.stopRecording();
    return redo();
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  togglePlay() {
    if (getState().transport.playing) this.stop();
    else this.play();
  }

  play() {
    if (!this.engine) return;
    const s = getState();
    if (s.resting) return;
    if (s.transport.armed) {
      // Pressing play while waiting for the first note starts the loop with recording on.
      setTransport({ armed: false, recording: true });
      this.startTransport('loop');
      return;
    }
    const mode = s.screen === 'blocks' ? 'song' : 'loop';
    // Play on an empty song would only run a silent clock (and end with false
    // praise). The monster wonders "huh?" instead, and the Coach shows where
    // the music comes from. Beat Hop's grid always has its pulse to play.
    if (!songHasSound(s.project, mode) && !(mode === 'loop' && gridShown(s))) {
      this.nothingToPlay();
      return;
    }
    this.startTransport(mode);
  }

  /** Nothing to hear: the spotlight monster says "huh?" and the UI points the way (`nothing-to-play`). */
  private nothingToPlay() {
    const s = getState();
    const monster = s.project.tracks.find((t) => t.id === s.selectedTrackId)?.monster ?? s.project.tracks[0]?.monster ?? 'bloop';
    this.chirp(monster, 'huh');
    emitStudioEvent({ type: 'nothing-to-play' });
  }

  /**
   * "Make it a song" in one tap: Monster Magic arranges every loop into a song,
   * Monster Blocks opens and the song plays from block 1. One undo step takes
   * the arrangement back. The song's first Magic starts on the beat when there
   * is one. False (and a "huh?") when there is nothing to arrange.
   */
  makeSong(seed = Math.floor(Math.random() * 1e6)): boolean {
    return this.arrangeAndPlay(seed, true);
  }

  /** Monster Blocks' Magic: a new arrangement, played from block 1 at once, so every tap is heard. */
  rearrange(seed = Math.floor(Math.random() * 1e6)): boolean {
    return this.arrangeAndPlay(seed, false);
  }

  private arrangeAndPlay(seed: number, openBlocks: boolean): boolean {
    this.stopRecording();
    const s = getState();
    if (s.resting) return false;
    const p = s.project;
    const arrangement = magicArrange(p, seed, { beatFirst: !this.arranged.has(p.id) });
    if (!songHasSound({ ...p, arrangement }, 'song')) {
      // Nothing to arrange: no empty undo step, just a "huh?" and a pointer.
      this.nothingToPlay();
      return false;
    }
    this.arranged.add(p.id);
    if (arrangement !== p.arrangement) commit((q) => ({ ...q, arrangement }));
    // The screen changes first: leaving the Lab stops its loop (screenChanged), then the song starts.
    if (openBlocks) setState({ screen: 'blocks', overlay: null });
    if (getState().transport.playing) this.stop();
    this.startTransport('song');
    return true;
  }

  /** Start the band at `fromBeat`, by default 40 ms from now (`atTime` may lie in the past). */
  private startTransport(mode: 'loop' | 'song', fromBeat = 0, atTime?: number) {
    const ctx = this.ctx;
    const transport = this.transport;
    const engine = this.engine;
    if (!ctx || !transport || !engine) return;
    const p = getState().project;
    this.stopAudition();
    this.tempo = p.tempo;
    engine.setTempo(p.tempo);
    transport.setTempo(p.tempo);
    this.visuals = [];
    this.seqHits.clear();
    this.finaleAt = Infinity;
    // Only a song with something to hear ends with a bow (and "You made a song!").
    this.songHadSound = mode === 'song' && songHasSound(p, 'song');
    // Mode and guards are set *before* start(): the transport schedules its first window immediately.
    this.mode = mode;
    this.skipBefore.clear();
    // Every run counts its beats from the start again: old preview lines mean nothing now.
    this.lastPreviewLine.clear();
    setTransport({ playing: true, mode });
    transport.start({ atTime: atTime ?? ctx.currentTime + 0.04, fromBeat, endBeat: mode === 'song' ? songBeats(p) : null });
    this.rehomeRolls();
  }

  stop() {
    this.stopRecording();
    // After Stop, a stone sounds at once instead of starting the band (until the grid is opened again).
    this.gridAutoStart = false;
    const wasPlaying = !!this.transport?.playing;
    this.transport?.stop();
    this.engine?.stopSequenced(STOP_FADE);
    const silencedFrom = (this.ctx?.currentTime ?? 0) + STOP_FADE;
    this.stopAudition();
    this.visuals = [];
    this.skipBefore.clear();
    this.seqHits.clear();
    this.finaleAt = Infinity;
    const t = getState().transport;
    if (t.playing || t.recording || t.armed) setTransport({ playing: false, recording: false, armed: false });
    if (wasPlaying) this.rehomeRolls(silencedFrom);
  }

  /**
   * The song's last downbeat is coming (the transport tells us ahead of time):
   * Boom crashes and Spark sings "ta-da!" exactly on it. The band takes a bow.
   */
  private finale(when: number) {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine || !this.songHadSound) return;
    const at = Math.max(ctx.currentTime, when);
    this.finaleAt = at;
    const p = getState().project;
    // Only monsters the child can hear take the bow (a sleeping Boom stays asleep).
    const heard = audibleTracks(p);
    const boom = heard.find((t) => t.monster === 'boom');
    if (boom) {
      for (const [pad, vel] of [
        [5, 0.75],
        [0, 0.9],
      ]) {
        engine.trigger(noteRequest(p, 'boom', boom.id, pad, { vel }), at, 0.5);
        this.queueVisual(at, { trackId: boom.id, monster: 'boom', step: pad, vel, dur: 0.5, source: 'loop' });
      }
    }
    const singer = heard.find((t) => t.monster === 'spark') ?? heard.find((t) => t.monster !== 'boom');
    if (!singer) return;
    [0, 2, 4, 7].forEach((step, i) => {
      const t = at + i * 0.09;
      engine.trigger(noteRequest(p, singer.monster, singer.id, step, { vel: 0.7 }), t, 0.4);
      this.queueVisual(t, { trackId: singer.id, monster: singer.monster, step, vel: 0.7, dur: 0.4, source: 'loop' });
    });
  }

  private songEnded() {
    // Tails of the last block fade; the finale (already playing) rings on.
    this.engine?.stopSequenced(0.8, this.finaleAt);
    this.finaleAt = Infinity;
    setTransport({ playing: false, recording: false, armed: false });
    this.rehomeRolls();
    // No false praise: a song that had nothing to hear just stops.
    if (this.songHadSound) emitStudioEvent({ type: 'finale' });
    this.songHadSound = false;
  }

  private provide(from: number, to: number): Scheduled[] {
    const s = getState();
    const p = s.project;
    const events: Scheduled[] = collectEvents(p, from, to, {
      mode: this.mode,
      skip: (noteId, abs) => {
        const until = this.skipBefore.get(noteId);
        if (until === undefined) return false;
        if (abs < until) return true;
        this.skipBefore.delete(noteId);
        return false;
      },
    });
    const n = events.length;
    // A soft woodblock tick on every beat of a take that began without a drum loop,
    // and under Beat Hop's grid while no drum loop can be heard (stones need a beat to sit on).
    const gridPulse = this.mode === 'loop' && gridShown(s) && !audibleTracks(p).some((t) => t.monster === 'boom' && trackHasLoop(t));
    if ((s.transport.recording && this.session?.click) || gridPulse) {
      for (let b = Math.ceil(from - 1e-9); b < to - 1e-9; b++) {
        events.push({ absBeat: b, click: true, accent: b % p.beatsPerBar === 0 });
      }
    }
    events.push(...this.rollEvents('main', from, to));
    // A stable sort: on a shared line the loop's notes come first (the roll's flam guard needs them).
    if (events.length > n) events.sort((a, b) => a.absBeat - b.absBeat);
    return events;
  }

  private schedule(e: Scheduled, when: number) {
    const engine = this.engine;
    if (!engine) return;
    const p = getState().project;
    if (isClick(e)) {
      engine.ensureChannel(CLICK);
      const bend = e.accent ? METRONOME.accentBend : 0;
      const vel = e.accent ? METRONOME.accentVel : METRONOME.vel;
      engine.trigger({ channelId: CLICK.id, midi: [], pad: TICK_PAD, bend, vel, tone: 0, size: 0 }, when, 0.1);
      return;
    }
    if (isRoll(e)) {
      this.playRoll(e, when);
      return;
    }
    if (!engine.hasChannel(e.channelId)) {
      const info = MONSTERS[e.monster];
      engine.ensureChannel({
        id: e.channelId,
        monster: e.monster,
        preset: info.presets[0].id,
        fx: info.defaultFx,
        volume: 0.75,
        maxVoices: info.maxVoices,
        // Painting's own channels (a monster that is not on stage) belong to the studio.
        persistent: e.trackId === null,
      });
    }
    // Every loop note is remembered (drums for the flam guard, any key for the grid's catch-up).
    this.noteSeqHit(e.channelId, e.note.step, when);
    const spb = 60 / p.tempo;
    const durSec = Math.max(0.05, e.note.dur * spb);
    engine.trigger(noteRequest(p, e.monster, e.channelId, e.note.step, { vel: e.note.vel, tone: e.note.tone }), when, durSec);
    this.queueVisual(when, {
      trackId: e.trackId,
      monster: e.monster,
      step: e.note.step,
      vel: e.note.vel,
      dur: durSec,
      source: e.source === 'paint' ? 'paint' : 'loop',
      noteId: e.note.id,
    });
  }

  /** Queue a visual for when it is heard. The queue stays in time order (frame() pops from the front). */
  private queueVisual(time: number, v: NoteVisual) {
    const q = this.visuals;
    let lo = 0;
    let hi = q.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (q[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    q.splice(lo, 0, { time, v });
  }

  private frame() {
    const ctx = this.ctx;
    const transport = this.transport;
    if (!ctx || !transport) return;
    const t = audibleTime(ctx);
    let n = 0;
    while (n < this.visuals.length && this.visuals[n].time <= t) {
      emitNote(this.visuals[n].v);
      n++;
    }
    if (n) this.visuals.splice(0, n);

    const s = getState();
    const p = s.project;
    const flags = s.transport;
    if (flags.recording && this.session && transport.playing) {
      // Kids forget to press stop: after two quiet loops, recording switches off.
      const nowBeat = transport.beatAt(ctx.currentTime);
      if (nowBeat - this.session.lastActivityBeat > p.loopBeats * 2 + 0.5) this.stopRecording();
    }
    if (this.mic && this.micRecording) emitStudioEvent({ type: 'mic-level', level: this.mic.level() });
    const playing = flags.playing && transport.playing;
    if (!playing) {
      // Stopped: after a short settle (so last animations finish), frames rest until something changes.
      const key = `${flags.recording}|${flags.armed}|${flags.mode}|${p.loopBeats}|${p.arrangement.length}`;
      const now = performance.now();
      if (key !== this.idleKey) {
        this.idleKey = key;
        this.idleSince = now;
      } else if (now - this.idleSince > IDLE_SETTLE_MS) return;
    } else this.idleKey = '';
    const engine = this.engine;
    emitFrame({
      playing,
      recording: flags.recording,
      armed: flags.armed,
      mode: flags.mode,
      beat: transport.playing ? transport.beatAt(t) : 0,
      loopBeats: p.loopBeats,
      songBeats: songBeats(p),
      // Measured only if someone reads it.
      get level() {
        return engine?.meter() ?? 0;
      },
    });
  }

  // ── Hearing a block, and little monster sounds ────────────────────────────

  /**
   * Monster Blocks: let a block be heard. The first `beats` beats of its loop
   * (from the beat of its first note) play on a preview channel dressed like the
   * monster (costume, effects, Mimic's voice), on a little clock of their own.
   * Nothing is recorded or written. While the band plays, the song is what you
   * hear, so this stays quiet. False when there was nothing to play.
   */
  audition(trackId: string, clipId: string, beats = 2): boolean {
    const ctx = this.ctx;
    const engine = this.engine;
    const s = getState();
    if (!ctx || !engine || s.resting || this.transport?.playing || this.lessonTransport?.playing) return false;
    const track = s.project.tracks.find((t) => t.id === trackId);
    const clip = track?.clips.find((c) => c.id === clipId);
    if (!track || !clip || clip.notes.length === 0) return false;
    this.stopAudition();
    const channelId = `preview:${track.monster}`;
    engine.ensureChannel({ ...this.channelSpec(track), id: channelId, persistent: true });
    if (track.monster === 'mimic') engine.setSample(channelId, (track.sampleId && this.sampleCache.get(track.sampleId)) || null);
    // A loop that begins with a rest is heard from its first note's beat.
    const from = Math.floor(Math.min(...clip.notes.map((n) => n.beat)) + 1e-9);
    const end = from + beats;
    this.auditionEvents = clip.notes
      .filter((n) => n.beat >= from - 1e-9 && n.beat < end - 1e-9)
      .map((note) => ({ absBeat: note.beat, channelId, trackId, monster: track.monster, note, end }))
      .sort((a, b) => a.absBeat - b.absBeat);
    this.auditionTransport ??= new Transport<AuditionEvent>(ctx, {
      provide: (a, b) => this.auditionEvents.filter((e) => e.absBeat >= a - 1e-9 && e.absBeat < b - 1e-9),
      schedule: (e, when) => this.scheduleAudition(e, when),
    });
    this.auditionTransport.setTempo(s.project.tempo);
    this.auditionTransport.start({ atTime: ctx.currentTime + 0.02, fromBeat: from, endBeat: end });
    return true;
  }

  /** Cut a block's preview short (the block was taken away, or the band starts). */
  stopAudition() {
    if (this.auditionTransport?.playing) this.auditionTransport.stop();
    this.auditionEvents = [];
    const now = this.ctx?.currentTime ?? 0;
    for (const v of this.auditionVoices) if (v.endTime > now) v.kill(now, 0.04);
    this.auditionVoices = [];
  }

  private scheduleAudition(e: AuditionEvent, when: number) {
    const engine = this.engine;
    if (!engine) return;
    const p = getState().project;
    const spb = 60 / p.tempo;
    // A long note rings a little past the end of the preview, never for its whole length.
    const durSec = Math.max(0.05, Math.min(e.note.dur, e.end - e.note.beat + 0.5) * spb);
    const voice = engine.trigger(noteRequest(p, e.monster, e.channelId, e.note.step, { vel: e.note.vel, tone: e.note.tone }), when, durSec);
    const now = this.ctx?.currentTime ?? 0;
    this.auditionVoices = this.auditionVoices.filter((v) => v.endTime > now);
    if (voice) this.auditionVoices.push(voice);
    this.queueVisual(when, { trackId: e.trackId, monster: e.monster, step: e.note.step, vel: e.note.vel, dur: durSec, source: 'loop', noteId: e.note.id });
  }

  /**
   * A monster's little voice for a moment that needs one (a speech bubble, a
   * block popping away, Play with nothing to play): two or three notes in its
   * own sound, never recorded. Monsters off stage sing on a channel of their own.
   */
  chirp(monster: MonsterKind, kind: ChirpKind) {
    const ctx = this.ctx;
    const engine = this.engine;
    const s = getState();
    if (!ctx || !engine || s.resting) return;
    const track = s.project.tracks.find((t) => t.monster === monster);
    // A recorded word would play whole (seconds long) for every note: Mimic chirps with its singing voice.
    let channelId = track && !(track.monster === 'mimic' && track.sampleId) ? track.id : undefined;
    if (!channelId || !engine.hasChannel(channelId)) {
      channelId = `paint:${monster}`;
      const info = MONSTERS[monster];
      if (!engine.hasChannel(channelId)) {
        engine.ensureChannel({ id: channelId, monster, preset: info.presets[0].id, fx: info.defaultFx, volume: 0.75, maxVoices: info.maxVoices, persistent: true });
      }
    }
    const p = s.project;
    const notes = monster === 'boom' ? CHIRPS[kind].drums : CHIRPS[kind].tune;
    for (const [step, at, dur, vel] of notes) {
      const when = ctx.currentTime + 0.01 + at;
      engine.trigger(noteRequest(p, monster, channelId, step, { vel }), when, dur);
      // Shown like a loop note: the monster sings it, but it never counts as the child playing.
      this.queueVisual(when, { trackId: track?.id ?? null, monster, step, vel, dur, source: 'loop' });
    }
  }

  // ── Song lessons ──────────────────────────────────────────────────────────
  // Lessons play on their own channels ("lesson:<monster>") and their own
  // transport, so they never touch the open song.

  private lessonChannel(monster: MonsterKind): string | null {
    const engine = this.engine;
    if (!engine) return null;
    const id = `lesson:${monster}`;
    if (!engine.hasChannel(id)) {
      const info = MONSTERS[monster];
      engine.ensureChannel({ id, monster, preset: info.presets[0].id, fx: info.defaultFx, volume: 0.8, maxVoices: info.maxVoices, persistent: true });
    }
    return id;
  }

  /** A key on the lesson keyboard: plays at once, in the song's key. */
  lessonHit(monster: MonsterKind, step: number, key: number, opts: { durSec?: number; vel?: number } = {}) {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx || getState().resting) return;
    const channel = this.lessonChannel(monster);
    if (!channel) return;
    const vel = opts.vel ?? 0.85;
    const dur = Math.max(0.2, opts.durSec ?? 0.4);
    engine.trigger(noteRequest({ scale: 'major', key }, monster, channel, step, { vel }), ctx.currentTime, dur);
    emitNote({ trackId: null, monster, step, vel, dur, source: 'live' });
  }

  /** Play a lesson timeline; `onEnd` fires when the last beat has been heard. */
  lessonPlay(events: LessonEvent[], opts: LessonPlayback): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.engine || getState().resting) return false;
    this.stop();
    this.lessonStop();
    this.lessonEvents = [...events].sort((a, b) => a.absBeat - b.absBeat);
    this.lessonOpts = opts;
    this.lessonTransport ??= new Transport<LessonEvent>(ctx, {
      provide: (from, to) => this.lessonEvents.filter((e) => e.absBeat >= from - 1e-9 && e.absBeat < to - 1e-9),
      schedule: (e, when) => this.scheduleLesson(e, when),
      ended: () => {
        const done = this.lessonOpts?.onEnd;
        this.lessonOpts = null;
        done?.();
      },
    });
    this.lessonTransport.setTempo(opts.tempo);
    this.lessonTransport.start({ atTime: ctx.currentTime + 0.08, fromBeat: 0, endBeat: opts.lengthBeats });
    return true;
  }

  lessonStop() {
    if (!this.lessonTransport?.playing && !this.lessonOpts) return;
    this.lessonTransport?.stop();
    this.lessonOpts = null;
    this.engine?.stopSequenced();
    this.visuals = [];
  }

  get lessonPlaying(): boolean {
    return !!this.lessonTransport?.playing;
  }

  private scheduleLesson(e: LessonEvent, when: number) {
    const engine = this.engine;
    const opts = this.lessonOpts;
    if (!engine || !opts) return;
    const channel = this.lessonChannel(e.monster);
    if (!channel) return;
    const durSec = Math.max(0.08, e.dur * (60 / opts.tempo));
    engine.trigger(noteRequest({ scale: 'major', key: opts.key }, e.monster, channel, e.step, { vel: e.vel }), when, durSec);
    this.queueVisual(when, { trackId: null, monster: e.monster, step: e.step, vel: e.vel, dur: durSec, source: 'loop', noteId: e.tag ? `lesson:${e.tag}` : undefined });
  }

  // ── Mimic's microphone ────────────────────────────────────────────────────

  private micRecording = false;
  private micIdle: ReturnType<typeof setTimeout> | null = null;

  /** The microphone is only open while it is needed; the browser's mic light goes off soon after. */
  private scheduleMicRelease() {
    if (this.micIdle) clearTimeout(this.micIdle);
    this.micIdle = setTimeout(() => {
      if (!this.micRecording) this.releaseMic();
    }, 15000);
  }

  micAvailable(): boolean {
    return micSupported() && getState().settings.micAllowed;
  }

  /** Grown-up flow: request the permission while the parent is present. */
  async requestMic(): Promise<boolean> {
    if (!micSupported()) return false;
    try {
      const ctx = this.ctx ?? getAudioContext();
      this.ctx = ctx;
      this.mic ??= new MicCapture(ctx);
      await this.mic.open();
      // Permission granted; close again until Mimic actually listens.
      this.releaseMic();
      return true;
    } catch {
      return false;
    }
  }

  async startVoiceRecording(): Promise<boolean> {
    if (!this.micAvailable() || !this.ctx || getState().resting) return false;
    try {
      if (this.micIdle) clearTimeout(this.micIdle);
      this.mic ??= new MicCapture(this.ctx);
      await this.mic.open();
      this.mic.start();
      this.micRecording = true;
      return true;
    } catch {
      this.micRecording = false;
      return false;
    }
  }

  /** Stop, clean up the sound, store it on this device, and teach it to Mimic. */
  async finishVoiceRecording(trackId: string): Promise<boolean> {
    const mic = this.mic;
    if (!mic || !this.micRecording) {
      this.micRecording = false;
      return false;
    }
    this.micRecording = false;
    const buffer = await mic.stop().catch(() => null);
    this.scheduleMicRelease();
    if (!buffer || !this.engine) return false;
    const sampleId = newId('v');
    this.sampleCache.set(sampleId, buffer);
    await saveSample(sampleId, audioBufferToWav(buffer));
    this.channelSample.set(trackId, sampleId);
    this.engine.setSample(trackId, buffer);
    commit((p) => setTrackSample(p, trackId, sampleId));
    this.hit(trackId, 2, { vel: 0.9 }, { record: false });
    return true;
  }

  cancelVoiceRecording() {
    this.micRecording = false;
    void this.mic?.stop().catch(() => null);
    this.scheduleMicRelease();
  }

  releaseMic() {
    this.mic?.close();
    this.mic = null;
    this.micRecording = false;
  }

  // ── Diagnostics (used by automated tests) ────────────────────────────────

  debug() {
    return {
      state: this.ctx?.state ?? 'none',
      voices: this.engine?.voiceCount() ?? 0,
      held: this.engine?.heldCount() ?? 0,
      live: this.live.size,
      level: this.engine?.meter() ?? 0,
      beat: this.transport && this.ctx ? this.transport.beatAt(this.ctx.currentTime) : 0,
      playing: this.transport?.playing ?? false,
      /** The transport has handed out every event before this beat. */
      scheduledUntil: this.transport?.scheduledUntil ?? 0,
      rolls: this.rolls.size,
      soloRoll: this.rollTransport?.playing ?? false,
      /** Beat Hop: the first stone will start the loop. */
      gridAutoStart: this.gridAutoStart,
      /** Beat Hop: the last preview played while the loop ran (its beat is always on a sixteenth). */
      lastPreview: this.lastPreview,
      /** Monster Blocks: a block is being heard on its own. */
      auditioning: this.auditionTransport?.playing ?? false,
    };
  }
}

export const studio = new Studio();
