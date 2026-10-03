import { boingCurve, clamp, noiseSource, saturationCurve } from '../dsp';
import type { DrumPatch } from '../presets';
import { Fader, NodeBag, velocityGain, type Voice, type VoiceHost, type VoiceParams } from './base';

// Boom's drum kit — every drum is synthesised, so kits can be re-tuned, squished
// (shorter/longer) and brightened live without sample libraries.

type Hit = (ctx: BaseAudioContext, bag: NodeBag, out: AudioNode, t: number, k: HitSettings) => number;

interface HitSettings {
  /** Frequency multiplier from the kit tuning and Boom's squish. */
  ratio: number;
  /** Decay multiplier. */
  decay: number;
  wiggle: AudioNode | null;
}

const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];

function metalBank(ctx: BaseAudioContext, bag: NodeBag, base: number, wiggle: AudioNode | null): GainNode {
  const sum = bag.add(ctx.createGain());
  sum.gain.value = 0.16;
  for (const r of METAL) {
    const o = bag.source(ctx.createOscillator());
    o.type = 'square';
    o.frequency.value = base * r;
    bag.modulate(wiggle, o.detune);
    o.connect(sum);
  }
  return sum;
}

const kick: Hit = (ctx, bag, out, t, k) => {
  const osc = bag.source(ctx.createOscillator());
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160 * k.ratio, t);
  osc.frequency.exponentialRampToValueAtTime(48 * k.ratio, t + 0.09);
  bag.modulate(k.wiggle, osc.detune);
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(1, t + 0.002);
  amp.gain.setTargetAtTime(0, t + 0.012, 0.09 * k.decay);
  osc.connect(amp).connect(out);

  const click = bag.source(noiseSource(ctx, false));
  const hp = bag.add(ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const cg = bag.add(ctx.createGain());
  cg.gain.setValueAtTime(0.28, t);
  cg.gain.setTargetAtTime(0, t, 0.004);
  click.connect(hp).connect(cg).connect(out);
  return t + 0.55 * k.decay + 0.05;
};

const snare: Hit = (ctx, bag, out, t, k) => {
  const noise = bag.source(noiseSource(ctx, false));
  const hp = bag.add(ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 1100 * Math.sqrt(k.ratio);
  const ng = bag.add(ctx.createGain());
  ng.gain.setValueAtTime(0.75, t);
  ng.gain.setTargetAtTime(0, t, 0.05 * k.decay);
  noise.connect(hp).connect(ng).connect(out);

  const body = bag.source(ctx.createOscillator());
  body.type = 'triangle';
  body.frequency.setValueAtTime(195 * k.ratio, t);
  body.frequency.exponentialRampToValueAtTime(165 * k.ratio, t + 0.06);
  bag.modulate(k.wiggle, body.detune);
  const bg = bag.add(ctx.createGain());
  bg.gain.setValueAtTime(0.7, t);
  bg.gain.setTargetAtTime(0, t, 0.035 * k.decay);
  body.connect(bg).connect(out);
  return t + 0.35 * k.decay + 0.05;
};

const hat: Hit = (ctx, bag, out, t, k) => {
  const metal = metalBank(ctx, bag, 40 * k.ratio, k.wiggle);
  const noise = bag.source(noiseSource(ctx, false));
  const nGain = bag.add(ctx.createGain());
  nGain.gain.value = 0.25;
  noise.connect(nGain);
  const bp = bag.add(ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 0.8;
  const hp = bag.add(ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0.9, t);
  amp.gain.setTargetAtTime(0, t, 0.018 * k.decay);
  metal.connect(bp);
  nGain.connect(bp);
  bp.connect(hp).connect(amp).connect(out);
  return t + 0.14 * k.decay + 0.04;
};

const clap: Hit = (ctx, bag, out, t, k) => {
  const noise = bag.source(noiseSource(ctx, false));
  const bp = bag.add(ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 1150 * Math.sqrt(k.ratio);
  bp.Q.value = 1.3;
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < 3; i++) {
    const bt = t + i * 0.011;
    amp.gain.setValueAtTime(1, bt);
    amp.gain.setTargetAtTime(0.08, bt + 0.001, 0.004);
  }
  amp.gain.setValueAtTime(0.95, t + 0.033);
  amp.gain.setTargetAtTime(0, t + 0.034, 0.06 * k.decay);
  noise.connect(bp).connect(amp).connect(out);
  return t + 0.4 * k.decay + 0.05;
};

const tom: Hit = (ctx, bag, out, t, k) => {
  const osc = bag.source(ctx.createOscillator());
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210 * k.ratio, t);
  osc.frequency.exponentialRampToValueAtTime(145 * k.ratio, t + 0.12);
  bag.modulate(k.wiggle, osc.detune);
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.95, t + 0.002);
  amp.gain.setTargetAtTime(0, t + 0.01, 0.08 * k.decay);
  osc.connect(amp).connect(out);

  const knock = bag.source(ctx.createOscillator());
  knock.type = 'triangle';
  knock.frequency.value = 420 * k.ratio;
  const kg = bag.add(ctx.createGain());
  kg.gain.setValueAtTime(0.25, t);
  kg.gain.setTargetAtTime(0, t, 0.015);
  knock.connect(kg).connect(out);
  return t + 0.45 * k.decay + 0.05;
};

const crash: Hit = (ctx, bag, out, t, k) => {
  const metal = metalBank(ctx, bag, 58 * k.ratio, k.wiggle);
  const noise = bag.source(noiseSource(ctx, false));
  const ng = bag.add(ctx.createGain());
  ng.gain.value = 0.5;
  noise.connect(ng);
  const hp = bag.add(ctx.createBiquadFilter());
  hp.type = 'highpass';
  hp.frequency.value = 4800;
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.55, t + 0.004);
  amp.gain.setTargetAtTime(0, t + 0.01, 0.38 * k.decay);
  metal.connect(hp);
  ng.connect(hp);
  hp.connect(amp).connect(out);
  return t + 2 * k.decay + 0.05;
};

const cowbell: Hit = (ctx, bag, out, t, k) => {
  const sum = bag.add(ctx.createGain());
  sum.gain.value = 0.5;
  for (const f of [540, 800]) {
    const o = bag.source(ctx.createOscillator());
    o.type = 'square';
    o.frequency.value = f * k.ratio;
    bag.modulate(k.wiggle, o.detune);
    o.connect(sum);
  }
  const bp = bag.add(ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = 820 * k.ratio;
  bp.Q.value = 2.5;
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0.8, t);
  amp.gain.setTargetAtTime(0.25, t + 0.004, 0.02);
  amp.gain.setTargetAtTime(0, t + 0.05, 0.12 * k.decay);
  sum.connect(bp).connect(amp).connect(out);
  return t + 0.7 * k.decay + 0.05;
};

const boing: Hit = (ctx, bag, out, t, k) => {
  const osc = bag.source(ctx.createOscillator());
  osc.type = 'triangle';
  const dur = 0.5 * k.decay;
  osc.frequency.setValueCurveAtTime(boingCurve(190 * k.ratio, dur), t, dur);
  bag.modulate(k.wiggle, osc.detune);
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.8, t + 0.004);
  amp.gain.setTargetAtTime(0, t + 0.02, 0.12 * k.decay);
  osc.connect(amp).connect(out);
  return t + dur + 0.1;
};

/** The metronome: a dry little woodblock, unlike any drum a child plays. */
const tick: Hit = (ctx, bag, out, t, k) => {
  const amp = bag.add(ctx.createGain());
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(1, t + 0.002);
  amp.gain.setTargetAtTime(0, t + 0.004, 0.012 * k.decay);
  for (const [f, g] of [
    [1700, 0.7],
    [2600, 0.35],
  ]) {
    const o = bag.source(ctx.createOscillator());
    o.type = 'triangle';
    o.frequency.value = f * k.ratio;
    const pg = bag.add(ctx.createGain());
    pg.gain.value = g;
    o.connect(pg).connect(amp);
  }
  amp.connect(out);
  return t + 0.1 * k.decay + 0.03;
};

export const DRUM_HITS: Hit[] = [kick, snare, hat, clap, tom, crash, cowbell, boing, tick];

/** The metronome's voice. It sits after the eight pads, so no pad can reach it. */
export const TICK_PAD = 8;

/** Which drums get the kit's drive/"tin can" resonance (cymbals stay clean). */
const BODY_DRUMS = new Set([0, 1, 3, 4]);

export class DrumVoice implements Voice {
  readonly startTime: number;
  endTime: number;
  sequenced: boolean;
  onEnded: (() => void) | null = null;
  private bag = new NodeBag();
  private out: GainNode;
  private fader: Fader;

  constructor(
    readonly channelId: string,
    host: VoiceHost,
    patch: DrumPatch,
    params: VoiceParams,
    when: number,
    sequenced: boolean,
  ) {
    const { ctx } = host;
    this.startTime = when;
    this.sequenced = sequenced;
    const pad = clamp(Math.round(params.pad), 0, DRUM_HITS.length - 1);
    const settings: HitSettings = {
      ratio: Math.pow(2, (patch.tune + params.bend) / 12),
      decay: patch.decay * Math.pow(2, clamp(params.size, -1, 1)),
      wiggle: host.wiggle,
    };

    this.out = this.bag.add(ctx.createGain());
    this.out.gain.value = patch.gain * velocityGain(params.vel) * 0.46;
    let head: AudioNode = this.out;

    const brightness = clamp(patch.tone + params.tone, -1, 1);
    const cutoff = Math.min(20000, 1500 * Math.pow(2, (brightness + 1) * 2.5));
    if (cutoff < 19000) {
      const lp = this.bag.add(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      lp.Q.value = 0.5;
      lp.connect(head);
      head = lp;
    }
    if (BODY_DRUMS.has(pad) && patch.metal > 0) {
      for (const [f, gain] of [
        [1750, 9],
        [3150, 7],
      ]) {
        const pk = this.bag.add(ctx.createBiquadFilter());
        pk.type = 'peaking';
        pk.frequency.value = f * settings.ratio;
        pk.Q.value = 9;
        pk.gain.value = gain * patch.metal;
        pk.connect(head);
        head = pk;
      }
    }
    if (BODY_DRUMS.has(pad) && patch.drive > 0) {
      const shaper = this.bag.add(ctx.createWaveShaper());
      shaper.curve = saturationCurve(patch.drive);
      const pre = this.bag.add(ctx.createGain());
      pre.gain.value = 1 + patch.drive * 2.5;
      const post = this.bag.add(ctx.createGain());
      post.gain.value = 1 / (1 + patch.drive);
      pre.connect(shaper).connect(post).connect(head);
      head = pre;
    }
    this.fader = new Fader(ctx, this.bag);
    this.out.connect(this.fader.node).connect(host.dest);
    // The chain was built back-to-front: `head` is its input, and the hit writes into it.
    this.endTime = DRUM_HITS[pad](ctx, this.bag, head, when, settings);
    this.bag.start(when);
    this.bag.stop(this.endTime);
    this.bag.onEnded(() => {
      this.bag.dispose();
      this.onEnded?.();
    });
  }

  release(): void {}

  kill(when: number, fade = 0.02): void {
    const end = this.fader.fadeOut(when, fade);
    this.endTime = Math.min(this.endTime, end);
    this.bag.restop(this.endTime);
  }

  setPitch(): void {}
  setTone(): void {}
}
