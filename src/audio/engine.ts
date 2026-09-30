import type { FxLevels, MonsterKind } from '../model/types';
import { Channel } from './channel';
import { clamp, impulseResponse, softClipCurve } from './dsp';
import { MIMIC_SINGER, patchFor, type VoicePatch } from './presets';
import type { Voice, VoiceHost, VoiceParams } from './voices/base';
import { BellVoice } from './voices/bell';
import { DrumVoice } from './voices/drums';
import { SamplerVoice } from './voices/sampler';
import { SynthVoice } from './voices/synth';

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE LAYER
// Knows about channels, voices and time — nothing about songs, scales or UI.
//
//  channels ──────────────┐
//  Echo bus (tempo delay) ─┼→ master bus → glue compressor → limiter → soft clip → volume ceiling → out
//  Gloop bus (reverb) ─────┘
//
// Ear & mix protection: conservative voice gains, per-channel and global voice
// limits with click-free stealing, a limiter + soft clipper, and a parent-set
// volume ceiling that the child cannot exceed.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelSpec {
  id: string;
  monster: MonsterKind;
  preset: string;
  fx: FxLevels;
  volume: number;
  maxVoices: number;
}

export interface NoteRequest extends VoiceParams {
  channelId: string;
}

const GLOBAL_VOICE_LIMIT = 30;

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  private masterIn: GainNode;
  private output: GainNode;
  private analyser: AnalyserNode | null = null;
  private echoDelay: DelayNode;
  private echoIn: GainNode;
  private gloopIn: GainNode;
  private channels = new Map<string, Channel>();
  private channelLimits = new Map<string, number>();
  private voices: Voice[] = [];
  private tempo = 100;
  private level = 0.8;
  private meterData: Float32Array<ArrayBuffer> | null = null;

  constructor(ctx: BaseAudioContext, opts: { meter?: boolean } = {}) {
    this.ctx = ctx;
    this.masterIn = ctx.createGain();
    this.masterIn.gain.value = 0.9;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 3;
    glue.attack.value = 0.005;
    glue.release.value = 0.2;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';

    this.output = ctx.createGain();
    this.output.gain.value = this.level;

    this.masterIn.connect(glue).connect(limiter).connect(clip).connect(this.output).connect(ctx.destination);
    if (opts.meter) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.output.connect(this.analyser);
    }

    // Echo: a tempo-synced dotted-eighth delay with a darkening feedback loop.
    this.echoIn = ctx.createGain();
    this.echoDelay = ctx.createDelay(2);
    this.echoDelay.delayTime.value = this.echoTime();
    const fb = ctx.createGain();
    fb.gain.value = 0.4;
    const fbTone = ctx.createBiquadFilter();
    fbTone.type = 'lowpass';
    fbTone.frequency.value = 2800;
    const fbLow = ctx.createBiquadFilter();
    fbLow.type = 'highpass';
    fbLow.frequency.value = 180;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.6;
    this.echoIn.connect(this.echoDelay);
    this.echoDelay.connect(fbTone).connect(fbLow).connect(fb).connect(this.echoDelay);
    this.echoDelay.connect(echoOut).connect(this.masterIn);

    // Gloop: convolution reverb with a procedurally generated room.
    this.gloopIn = ctx.createGain();
    const pre = ctx.createDelay(0.1);
    pre.delayTime.value = 0.018;
    const verb = ctx.createConvolver();
    verb.buffer = impulseResponse(ctx);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.85;
    this.gloopIn.connect(pre).connect(verb).connect(verbOut).connect(this.masterIn);
  }

  private echoTime() {
    return Math.min(1.9, 0.75 * (60 / this.tempo));
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }

  setTempo(bpm: number) {
    this.tempo = bpm;
    this.echoDelay.delayTime.setTargetAtTime(this.echoTime(), this.ctx.currentTime, 0.08);
  }

  /** Effective output = child volume × parent ceiling. */
  setOutputLevel(volume: number, ceiling: number) {
    this.level = clamp(volume, 0, 1) * clamp(ceiling, 0, 1);
    this.output.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.05);
  }

  // ── Channels ──────────────────────────────────────────────────────────────

  syncChannels(specs: ChannelSpec[]) {
    const keep = new Set(specs.map((s) => s.id));
    for (const [id, ch] of this.channels) {
      if (!keep.has(id) && !id.startsWith('paint:')) {
        ch.dispose();
        this.channels.delete(id);
      }
    }
    for (const spec of specs) this.ensureChannel(spec);
  }

  ensureChannel(spec: ChannelSpec): Channel {
    let ch = this.channels.get(spec.id);
    if (!ch || ch.monster !== spec.monster) {
      ch?.dispose();
      ch = new Channel(
        this.ctx,
        { master: this.masterIn, echo: this.echoIn, gloop: this.gloopIn },
        spec.monster,
        spec.preset,
        spec.fx,
        spec.volume,
      );
      this.channels.set(spec.id, ch);
    } else {
      ch.preset = spec.preset;
      ch.setFx(spec.fx);
      ch.setVolume(spec.volume);
    }
    this.channelLimits.set(spec.id, spec.maxVoices);
    return ch;
  }

  hasChannel(id: string): boolean {
    return this.channels.has(id);
  }

  setWiggleBoost(channelId: string, amount: number) {
    this.channels.get(channelId)?.setWiggleBoost(amount);
  }

  setSample(channelId: string, buffer: AudioBuffer | null) {
    const ch = this.channels.get(channelId);
    if (ch) ch.sample = buffer;
  }

  // ── Voices ────────────────────────────────────────────────────────────────

  private reap(now: number) {
    this.voices = this.voices.filter((v) => v.endTime > now);
  }

  private makeRoom(channelId: string, when: number) {
    this.reap(this.ctx.currentTime);
    const limit = this.channelLimits.get(channelId) ?? 6;
    const sounding = this.voices.filter((v) => v.channelId === channelId && v.endTime > when);
    for (let i = 0; i <= sounding.length - limit; i++) this.steal(sounding[i], when);
    const all = this.voices.filter((v) => v.endTime > when);
    for (let i = 0; i <= all.length - GLOBAL_VOICE_LIMIT; i++) this.steal(all[i], when);
  }

  private steal(v: Voice, when: number) {
    v.kill(Math.max(when, this.ctx.currentTime), 0.015);
    // Count it as gone from `when` on, so simultaneous notes don't steal twice.
    v.endTime = Math.min(v.endTime, when);
  }

  private createVoice(req: NoteRequest, when: number, sequenced: boolean, durSec?: number): Voice | null {
    const ch = this.channels.get(req.channelId);
    if (!ch) return null;
    this.makeRoom(req.channelId, when);
    const host: VoiceHost = { ctx: this.ctx, dest: ch.input, wiggle: ch.wiggle, tempo: this.tempo, sample: ch.sample };
    const patch = patchFor(ch.preset);
    let voice: Voice;
    switch (patch.kind) {
      case 'synth':
        voice = new SynthVoice(req.channelId, host, patch, req, when, sequenced, durSec);
        break;
      case 'bell':
        voice = new BellVoice(req.channelId, host, patch, req, when, sequenced);
        break;
      case 'drums':
        voice = new DrumVoice(req.channelId, host, patch, req, when, sequenced);
        break;
      case 'voice':
        voice = this.mimicVoice(req, host, patch, when, sequenced, durSec);
        break;
    }
    this.voices.push(voice);
    voice.onEnded = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    return voice;
  }

  private mimicVoice(req: NoteRequest, host: VoiceHost, patch: VoicePatch, when: number, sequenced: boolean, durSec?: number): Voice {
    if (host.sample) return new SamplerVoice(req.channelId, host, host.sample, patch, req, when, sequenced);
    // No recording yet: Mimic sings "la" with its formant voice.
    const midi = req.midi.map((m) => m + patch.semis);
    return new SynthVoice(req.channelId, host, MIMIC_SINGER, { ...req, midi }, when, sequenced, durSec);
  }

  /** A live note from a finger. Returns a handle for noteOff / glides. */
  noteOn(req: NoteRequest, when = this.ctx.currentTime): Voice | null {
    return this.createVoice(req, when, false);
  }

  noteOff(voice: Voice | null, when = this.ctx.currentTime) {
    voice?.release(Math.max(when, this.ctx.currentTime));
  }

  /** A sequenced note with a known length (loops, songs, offline export). */
  trigger(req: NoteRequest, when: number, durSec: number): Voice | null {
    return this.createVoice(req, when, true, durSec);
  }

  /** Transport stop: fade out and cancel everything the sequencer scheduled. */
  stopSequenced(fade = 0.06) {
    const now = this.ctx.currentTime;
    for (const v of this.voices) if (v.sequenced) v.kill(now, fade);
    this.voices = this.voices.filter((v) => !v.sequenced);
  }

  allNotesOff() {
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.kill(now, 0.05);
    this.voices = [];
  }

  voiceCount(): number {
    this.reap(this.ctx.currentTime);
    return this.voices.length;
  }

  /** Output level 0..1 for UI meters (and automated tests). */
  meter(): number {
    if (!this.analyser) return 0;
    if (!this.meterData) this.meterData = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i++) sum += this.meterData[i] * this.meterData[i];
    return Math.sqrt(sum / this.meterData.length);
  }
}
