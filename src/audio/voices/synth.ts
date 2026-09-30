import { clamp, envelopeOff, envelopeOn, fadeOut, holdAt, mtof, noiseSource, saturationCurve, vowelAt } from '../dsp';
import type { SynthPatch } from '../presets';
import { NodeBag, velocityGain, type Voice, type VoiceHost, type VoiceParams } from './base';

// Subtractive synth voice (with an optional formant bank for voice-like pads).
//   oscillators (+noise) → filter or formant bank → [drive] → amp envelope → channel
// Squish/stretch (`size`) scales the envelopes, Dark ↔ Sparkly (`tone`) moves the
// filter (or the vowel), vertical drags glide the pitch.

const TONE_OCTAVES = 1.8;

export class SynthVoice implements Voice {
  readonly startTime: number;
  endTime: number;
  sequenced: boolean;
  onEnded: (() => void) | null = null;

  private bag = new NodeBag();
  private oscs: { node: OscillatorNode; semi: number; group: number }[] = [];
  private amp: GainNode;
  private filter: BiquadFilterNode | null = null;
  private formants: { filter: BiquadFilterNode; gain: GainNode }[] = [];
  private released = false;
  private readonly cutoffBase: number;
  private readonly rel: number;

  constructor(
    readonly channelId: string,
    host: VoiceHost,
    private patch: SynthPatch,
    params: VoiceParams,
    when: number,
    sequenced: boolean,
    durSec?: number,
  ) {
    const { ctx } = host;
    this.startTime = when;
    this.sequenced = sequenced;
    const sizeMul = Math.pow(2, clamp(params.size, -1, 1) * 1.2);
    const aenv = { ...patch.aenv, d: patch.aenv.d * sizeMul, r: patch.aenv.r * sizeMul };
    if (patch.chord) aenv.a = patch.aenv.a * Math.pow(2, params.size * 0.8);
    this.rel = aenv.r;

    const pitches = params.midi.length ? params.midi : [60];
    const groupGain = 1 / Math.sqrt(pitches.length);
    const mix = this.bag.add(ctx.createGain());

    // Optional vibrato shared by all oscillators of this voice.
    let vib: GainNode | null = null;
    if (patch.vibrato) {
      const lfo = this.bag.source(ctx.createOscillator());
      lfo.frequency.value = patch.vibrato.rate;
      vib = this.bag.add(ctx.createGain());
      vib.gain.setValueAtTime(0, when);
      vib.gain.setValueAtTime(0, when + patch.vibrato.delay);
      vib.gain.linearRampToValueAtTime(patch.vibrato.cents, when + patch.vibrato.delay + 0.25);
      lfo.connect(vib);
    }

    pitches.forEach((midi, group) => {
      for (const spec of patch.oscs) {
        const osc = this.bag.source(ctx.createOscillator());
        osc.type = spec.wave;
        const semi = spec.semi ?? 0;
        osc.frequency.value = mtof(midi + semi);
        const cents = spec.cents ?? 0;
        if (patch.pitchEnv) {
          osc.detune.setValueAtTime(cents + patch.pitchEnv.semis * 100, when);
          osc.detune.setTargetAtTime(cents, when, patch.pitchEnv.time / 3);
        } else {
          osc.detune.value = cents;
        }
        if (vib) vib.connect(osc.detune);
        this.bag.modulate(host.wiggle, osc.detune);
        const g = this.bag.add(ctx.createGain());
        g.gain.value = spec.gain * groupGain;
        osc.connect(g).connect(mix);
        this.oscs.push({ node: osc, semi, group });
      }
    });

    if (patch.noise) {
      const noise = this.bag.source(noiseSource(ctx));
      const ng = this.bag.add(ctx.createGain());
      ng.gain.value = patch.noise;
      noise.connect(ng).connect(mix);
    }

    let chain: AudioNode;
    const keyMidi = pitches[0];
    this.cutoffBase = patch.filter.cutoff * Math.pow(2, (patch.filter.keyTrack * (keyMidi - 60)) / 12);
    if (patch.formant) {
      const sum = this.bag.add(ctx.createGain());
      sum.gain.value = 2.6;
      const vowel = vowelAt(params.tone);
      for (let i = 0; i < 3; i++) {
        const f = this.bag.add(ctx.createBiquadFilter());
        f.type = 'bandpass';
        f.frequency.value = vowel.f[i];
        f.Q.value = vowel.f[i] / (70 + i * 40);
        const g = this.bag.add(ctx.createGain());
        g.gain.value = vowel.g[i];
        mix.connect(f).connect(g).connect(sum);
        this.formants.push({ filter: f, gain: g });
      }
      chain = sum;
    } else {
      const f = this.bag.add(ctx.createBiquadFilter());
      f.type = patch.filter.type;
      f.Q.value = patch.filter.q;
      f.frequency.value = this.cutoffFor(params.tone);
      const fenvCents = patch.filter.env * 1200;
      if (fenvCents !== 0) {
        const fe = { ...patch.fenv, d: patch.fenv.d * sizeMul };
        f.detune.setValueAtTime(0, when);
        f.detune.linearRampToValueAtTime(fenvCents, when + Math.max(0.002, fe.a));
        f.detune.setTargetAtTime(fenvCents * fe.s, when + fe.a, Math.max(0.005, fe.d / 3));
      }
      if (patch.filterLfo) {
        const lfo = this.bag.source(ctx.createOscillator());
        const rate = patch.filterLfo.beats ? host.tempo / 60 / patch.filterLfo.beats : patch.filterLfo.rate;
        lfo.frequency.value = rate;
        const depth = this.bag.add(ctx.createGain());
        depth.gain.value = patch.filterLfo.octaves * 600;
        lfo.connect(depth).connect(f.detune);
      }
      mix.connect(f);
      this.filter = f;
      chain = f;
    }

    if (patch.drive && patch.drive > 0) {
      const shaper = this.bag.add(ctx.createWaveShaper());
      shaper.curve = saturationCurve(patch.drive);
      shaper.oversample = '2x';
      const pre = this.bag.add(ctx.createGain());
      pre.gain.value = 1 + patch.drive * 3;
      const post = this.bag.add(ctx.createGain());
      post.gain.value = 1 / (1 + patch.drive * 1.5);
      chain.connect(pre).connect(shaper).connect(post);
      chain = post;
    }

    this.amp = this.bag.add(ctx.createGain());
    this.amp.gain.value = 0;
    chain.connect(this.amp).connect(host.dest);

    envelopeOn(this.amp.gain, when, aenv, patch.gain * velocityGain(params.vel));
    this.bag.start(when);

    if (durSec !== undefined) {
      const releaseAt = when + Math.max(durSec, aenv.a + 0.02);
      this.released = true;
      this.endTime = envelopeOff(this.amp.gain, releaseAt, aenv.r, false);
      this.bag.stop(this.endTime);
    } else if (aenv.s < 0.001) {
      // Percussive shapes (Moon Drops) end on their own even if a finger stays down.
      this.endTime = when + aenv.a + aenv.d * 2.2 + 0.05;
      this.bag.stop(this.endTime);
    } else {
      this.endTime = Infinity;
    }
    this.bag.onEnded(() => {
      this.bag.dispose();
      this.onEnded?.();
    });
  }

  private cutoffFor(tone: number): number {
    return clamp(this.cutoffBase * Math.pow(2, clamp(tone, -1, 1) * TONE_OCTAVES), 40, 18000);
  }

  release(when: number): void {
    if (this.released) return;
    this.released = true;
    const end = envelopeOff(this.amp.gain, when, this.rel);
    this.endTime = Math.min(this.endTime, end);
    this.bag.restop(this.endTime);
  }

  kill(when: number, fade = 0.02): void {
    this.released = true;
    const end = fadeOut(this.amp.gain, when, fade);
    this.endTime = Math.min(this.endTime, end);
    this.bag.restop(this.endTime);
  }

  setPitch(midi: number[], when: number): void {
    const glide = Math.max(0.01, this.patch.glide);
    for (const o of this.oscs) {
      const target = midi[o.group] ?? midi[midi.length - 1];
      if (target === undefined) continue;
      holdAt(o.node.frequency, when);
      o.node.frequency.setTargetAtTime(mtof(target + o.semi), when, glide / 3);
    }
  }

  setTone(tone: number, when: number): void {
    if (this.filter) {
      this.filter.frequency.setTargetAtTime(this.cutoffFor(tone), when, 0.03);
    } else if (this.formants.length) {
      const vowel = vowelAt(tone);
      this.formants.forEach((fm, i) => {
        fm.filter.frequency.setTargetAtTime(vowel.f[i], when, 0.05);
        fm.gain.gain.setTargetAtTime(vowel.g[i], when, 0.05);
      });
    }
  }
}
