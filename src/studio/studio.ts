import { audibleTime, audioSupported, getAudioContext, inputCompensation, unlockAudio } from '../audio/context';
import { AudioEngine, type ChannelSpec } from '../audio/engine';
import { MicCapture, micSupported } from '../audio/mic';
import { Transport } from '../audio/transport';
import type { Voice } from '../audio/voices/base';
import { audioBufferToWav, blobToAudioBuffer } from '../audio/wav';
import { placeNote } from '../magic/recorder';
import { collectEvents, type SeqEvent } from '../magic/sequence';
import { quantizeDuration } from '../magic/timing';
import { recordNote, setRecordedDuration, setTrackSample } from '../model/edits';
import { newId } from '../model/ids';
import { MODE_CAPS, MONSTERS } from '../model/monsters';
import { projectHasMusic, songBeats, trackHasLoop } from '../model/project';
import type { MonsterKind, Project, Settings, Track } from '../model/types';
import { flushSave, loadSample, saveSample } from '../store/persistence';
import { beginGroup, commit, endGroup, getState, redo, setState, undo, useApp, type TransportFlags } from '../store/store';
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
  rec: { noteId: string; startAbs: number } | null;
}

interface RecordSession {
  token: Project;
  recent: Map<string, number>;
  lastActivityBeat: number;
  notes: number;
  firstLoopFor: Set<string>;
}

interface ClickEvent {
  absBeat: number;
  click: true;
  accent: boolean;
}

type Scheduled = SeqEvent | ClickEvent;

const CLICK_CHANNEL = 'metronome';

function isClick(e: Scheduled): e is ClickEvent {
  return (e as ClickEvent).click === true;
}

function setTransport(patch: Partial<TransportFlags>) {
  setState({ transport: { ...getState().transport, ...patch } });
}

function trackSignature(t: Track): string {
  return `${t.monster}|${t.preset}|${t.fx.echo}|${t.fx.gloop}|${t.fx.chomper}|${t.fx.wiggle}|${t.volume}`;
}

class Studio {
  private ctx: AudioContext | null = null;
  private engine: AudioEngine | null = null;
  private transport: Transport<Scheduled> | null = null;
  private live = new Map<number, LiveNote>();
  private liveSeq = 0;
  private visuals: { time: number; v: NoteVisual }[] = [];
  private session: RecordSession | null = null;
  private skipBefore = new Map<string, number>();
  private signatures = new Map<string, string>();
  private sampleCache = new Map<string, AudioBuffer>();
  private channelSample = new Map<string, string | null>();
  private tempo = 0;
  private mic: MicCapture | null = null;
  private rolls = new Map<number, ReturnType<typeof setInterval>>();

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
      ended: () => this.songEnded(),
    });
    useApp.subscribe((state, prev) => {
      if (state.project !== prev.project) this.syncProject(state.project);
      if (state.settings !== prev.settings) this.syncSettings(state.settings);
      if (state.screen !== prev.screen) this.screenChanged(state.screen);
    });
    ctx.onstatechange = () => {
      if (ctx.state !== 'running' && getState().awake && !document.hidden) {
        this.stop();
        setState({ awake: false });
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
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
    if (!t.playing && !t.armed) return;
    const wantMode = screen === 'blocks' ? 'song' : 'loop';
    if (t.mode !== wantMode || screen === 'songs') this.stop();
  }

  // ── Live performance ──────────────────────────────────────────────────────

  press(trackId: string, step: number, expr: Partial<Expression> = {}): number {
    const engine = this.engine;
    if (!engine) return -1;
    const s = getState();
    const track = s.project.tracks.find((t) => t.id === trackId);
    if (!track) return -1;
    const vel = expr.vel ?? 0.85;
    const tone = expr.tone ?? 0;
    const size = expr.size ?? 0;
    const bend = expr.bend ?? 0;
    const req = noteRequest(s.project, track.monster, track.id, step, { vel, tone, size, bend });
    const voice = engine.noteOn(req);
    const id = ++this.liveSeq;
    const live: LiveNote = { id, trackId, monster: track.monster, step, vel, tone, size, bend, voice, rec: null };
    this.live.set(id, live);
    emitNote({ trackId, monster: track.monster, step, vel, dur: 0.35, source: 'live' });
    if (s.transport.recording || s.transport.armed) this.recordStart(live);
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
    if (t.recording) {
      this.finishRecNote(live);
      this.recordStart(live);
    }
  }

  release(id: number) {
    const live = this.live.get(id);
    if (!live) return;
    this.live.delete(id);
    this.engine?.noteOff(live.voice);
    this.finishRecNote(live);
  }

  releaseAll() {
    for (const id of [...this.live.keys()]) this.release(id);
    for (const id of [...this.rolls.keys()]) this.stopRoll(id);
  }

  /** A quick tap (keyboard shortcut, demo). */
  hit(trackId: string, step: number, expr: Partial<Expression> = {}) {
    const id = this.press(trackId, step, expr);
    if (id >= 0) setTimeout(() => this.release(id), 140);
  }

  /** A short note from a monster that may not be on stage (painting with Puff, say). */
  hitMonster(monster: MonsterKind, step: number, vel = 0.8) {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx) return;
    const id = `paint:${monster}`;
    const info = MONSTERS[monster];
    if (!engine.hasChannel(id)) {
      engine.ensureChannel({ id, monster, preset: info.presets[0].id, fx: info.defaultFx, volume: 0.75, maxVoices: info.maxVoices });
    }
    engine.trigger(noteRequest(getState().project, monster, id, step, { vel }), ctx.currentTime, 0.25);
    emitNote({ trackId: null, monster, step, vel, dur: 0.25, source: 'live' });
  }

  /** Holding Boom or Spark: a roll of repeated hits, eighth notes at the song tempo. */
  startRoll(trackId: string, step: number, expr: Partial<Expression> = {}): number {
    const tempo = getState().project.tempo;
    const period = (60 / tempo / 2) * 1000;
    const id = ++this.liveSeq;
    const timer = setInterval(() => this.hit(trackId, step, { ...expr, vel: (expr.vel ?? 0.8) * 0.85 }), period);
    this.rolls.set(id, timer);
    return id;
  }

  stopRoll(id: number) {
    const timer = this.rolls.get(id);
    if (timer) clearInterval(timer);
    this.rolls.delete(id);
  }

  /** Shaking a monster makes its sound wobble (vibrato) while the shake lasts. */
  setLiveWiggle(trackId: string, on: boolean) {
    this.engine?.setWiggleBoost(trackId, on ? 0.9 : 0);
  }

  /** Play a tiny phrase so a child hears a new costume/sound right away. */
  preview(trackId: string) {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine) return;
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
    if (!ctx || !transport || !this.session) return;
    const s = getState();
    const p = s.project;
    const caps = MODE_CAPS[s.settings.ageMode];
    let abs: number;
    if (s.transport.armed) {
      // Monster Magic: the first note of a new song *is* the downbeat.
      transport.setTempo(p.tempo);
      transport.start({ atTime: ctx.currentTime, fromBeat: 0 });
      setTransport({ playing: true, recording: true, armed: false, mode: 'loop' });
      abs = 0;
    } else {
      abs = transport.beatAt(ctx.currentTime - inputCompensation(ctx));
    }
    const place = placeNote(abs, { loopBeats: p.loopBeats, grid: caps.quantizeGrid, strength: caps.quantizeStrength });
    const noteId = newId('n');
    const info = MONSTERS[live.monster];
    const track = p.tracks.find((t) => t.id === live.trackId);
    const hadLoop = track ? trackHasLoop(track) : false;
    const protectedIds = this.protectedIds(abs, p.loopBeats);
    commit(
      (proj) =>
        recordNote(
          proj,
          live.trackId,
          { id: noteId, beat: place.beat, dur: info.sustain ? 0.25 : 0.5, step: live.step, vel: live.vel, tone: live.tone },
          { grid: caps.quantizeGrid, isDrum: live.monster === 'boom', protectedIds },
        ),
      { undoable: false },
    );
    // The child just heard this note live: don't play it again on this pass.
    this.skipBefore.set(noteId, place.absBeat + caps.quantizeGrid * 0.5);
    this.session.recent.set(noteId, abs);
    this.session.lastActivityBeat = Math.max(this.session.lastActivityBeat, abs);
    this.session.notes++;
    live.rec = { noteId, startAbs: abs };
    if (!hadLoop && !this.session.firstLoopFor.has(live.trackId)) {
      this.session.firstLoopFor.add(live.trackId);
      emitStudioEvent({ type: 'loop-created', trackId: live.trackId });
    }
  }

  private finishRecNote(live: LiveNote) {
    const rec = live.rec;
    live.rec = null;
    const ctx = this.ctx;
    const transport = this.transport;
    if (!rec || !ctx || !transport || !MONSTERS[live.monster].sustain) return;
    const p = getState().project;
    const endAbs = transport.beatAt(ctx.currentTime - inputCompensation(ctx));
    const dur = quantizeDuration(Math.max(0.05, endAbs - rec.startAbs), 0.25, p.loopBeats);
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
    if (s.screen === 'blocks' || s.screen === 'songs') return;
    this.session = { token: beginGroup('record'), recent: new Map(), lastActivityBeat: 0, notes: 0, firstLoopFor: new Set() };
    if (s.transport.playing && s.transport.mode === 'loop') {
      this.session.lastActivityBeat = transport.beatAt(ctx.currentTime);
      setTransport({ recording: true });
    } else if (projectHasMusic(s.project)) {
      this.startTransport('loop');
      setTransport({ recording: true });
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
    if (s.transport.armed) {
      // Pressing play while waiting for the first note starts the loop with recording on.
      this.startTransport('loop');
      setTransport({ armed: false, recording: true });
      return;
    }
    this.startTransport(s.screen === 'blocks' ? 'song' : 'loop');
  }

  private startTransport(mode: 'loop' | 'song') {
    const ctx = this.ctx;
    const transport = this.transport;
    const engine = this.engine;
    if (!ctx || !transport || !engine) return;
    const p = getState().project;
    this.tempo = p.tempo;
    engine.setTempo(p.tempo);
    transport.setTempo(p.tempo);
    this.visuals = [];
    transport.start({ atTime: ctx.currentTime + 0.04, fromBeat: 0, endBeat: mode === 'song' ? songBeats(p) : null });
    setTransport({ playing: true, mode });
  }

  stop() {
    this.stopRecording();
    this.transport?.stop();
    this.engine?.stopSequenced();
    this.visuals = [];
    const t = getState().transport;
    if (t.playing || t.recording || t.armed) setTransport({ playing: false, recording: false, armed: false });
  }

  private songEnded() {
    this.engine?.stopSequenced(0.8);
    setTransport({ playing: false, recording: false, armed: false });
    emitStudioEvent({ type: 'finale' });
    this.tada();
  }

  /** A little "ta-da!" when a song finishes: the band takes a bow. */
  private tada() {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine) return;
    const p = getState().project;
    const spark = p.tracks.find((t) => t.monster === 'spark') ?? p.tracks[0];
    [0, 2, 4, 7].forEach((step, i) => {
      const when = ctx.currentTime + 0.1 + i * 0.09;
      engine.trigger(noteRequest(p, spark.monster, spark.id, step, { vel: 0.7 }), when, 0.4);
      this.queueVisual(when, { trackId: spark.id, monster: spark.monster, step, vel: 0.7, dur: 0.4, source: 'loop' });
    });
  }

  private provide(from: number, to: number): Scheduled[] {
    const s = getState();
    const p = s.project;
    const events: Scheduled[] = collectEvents(p, from, to, {
      mode: s.transport.mode,
      skip: (noteId, abs) => {
        const until = this.skipBefore.get(noteId);
        if (until === undefined) return false;
        if (abs < until) return true;
        this.skipBefore.delete(noteId);
        return false;
      },
    });
    // A soft pulse while recording, until there is a beat to play along with.
    if (s.transport.recording && !p.tracks.some((t) => t.monster === 'boom' && trackHasLoop(t) && !t.sleeping)) {
      for (let b = Math.ceil(from - 1e-9); b < to - 1e-9; b++) {
        events.push({ absBeat: b, click: true, accent: b % p.beatsPerBar === 0 });
      }
      events.sort((a, b) => a.absBeat - b.absBeat);
    }
    return events;
  }

  private schedule(e: Scheduled, when: number) {
    const engine = this.engine;
    if (!engine) return;
    const p = getState().project;
    if (isClick(e)) {
      engine.ensureChannel({
        id: CLICK_CHANNEL,
        monster: 'boom',
        preset: 'pillow-drums',
        fx: { echo: 0, gloop: 0, chomper: 0, wiggle: 0 },
        volume: 0.28,
        maxVoices: 4,
      });
      engine.trigger({ channelId: CLICK_CHANNEL, midi: [], pad: 2, bend: e.accent ? 3 : 0, vel: e.accent ? 0.9 : 0.6, tone: 0, size: -0.5 }, when, 0.1);
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
      });
    }
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

  private queueVisual(time: number, v: NoteVisual) {
    this.visuals.push({ time, v });
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
    emitFrame({
      playing: flags.playing && transport.playing,
      recording: flags.recording,
      armed: flags.armed,
      mode: flags.mode,
      beat: transport.playing ? transport.beatAt(t) : 0,
      loopBeats: p.loopBeats,
      songBeats: songBeats(p),
      level: this.engine?.meter() ?? 0,
    });
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
    if (!this.micAvailable() || !this.ctx) return false;
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
    this.micRecording = false;
    if (!mic) return false;
    const buffer = await mic.stop().catch(() => null);
    this.scheduleMicRelease();
    if (!buffer || !this.engine) return false;
    const sampleId = newId('v');
    this.sampleCache.set(sampleId, buffer);
    await saveSample(sampleId, audioBufferToWav(buffer));
    this.channelSample.set(trackId, sampleId);
    this.engine.setSample(trackId, buffer);
    commit((p) => setTrackSample(p, trackId, sampleId));
    this.hit(trackId, 2, { vel: 0.9 });
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
      level: this.engine?.meter() ?? 0,
      beat: this.transport && this.ctx ? this.transport.beatAt(this.ctx.currentTime) : 0,
      playing: this.transport?.playing ?? false,
    };
  }
}

export const studio = new Studio();
