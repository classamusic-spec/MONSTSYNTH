import { clamp, holdAt, mtof } from '../dsp';
import type { BellPatch } from '../presets';
import { Fader, NodeBag, velocityGain, type Voice, type VoiceHost, type VoiceParams } from './base';

// Two-operator FM voice for Spark. A modulator at a (often inharmonic) ratio
// shakes the carrier's frequency; the modulation index decays quickly, which is
// what makes the "ting" of a bell or the "plink" of a pluck.

export class BellVoice implements Voice {
  readonly startTime: number;
  endTime: number;
  sequenced: boolean;
  onEnded: (() => void) | null = null;

  private bag = new NodeBag();
  private carriers: { osc: OscillatorNode; mod: OscillatorNode; ratio: number }[] = [];
  private amp: GainNode;
  private fader: Fader;

  constructor(
    readonly channelId: string,
    host: VoiceHost,
    patch: BellPatch,
    params: VoiceParams,
    when: number,
    sequenced: boolean,
  ) {
    const { ctx } = host;
    this.startTime = when;
    this.sequenced = sequenced;
    const sizeMul = Math.pow(2, clamp(params.size, -1, 1) * 1.2);
    const decay = patch.aenv.d * sizeMul;
    const toneMul = Math.pow(2, clamp(params.tone, -1, 1) * 1.2);
    const pitches = params.midi.length ? params.midi : [72];
    const groupGain = 1 / Math.sqrt(pitches.length);

    this.amp = this.bag.add(ctx.createGain());
    this.amp.gain.value = 0;
    let out: AudioNode = this.amp;
    if (patch.filter) {
      const f = this.bag.add(ctx.createBiquadFilter());
      f.type = 'lowpass';
      f.Q.value = patch.filter.q;
      f.frequency.value = clamp(patch.filter.cutoff * toneMul, 60, 16000);
      f.detune.setValueAtTime(patch.filter.env * 1200, when);
      f.detune.setTargetAtTime(0, when, patch.filter.decay / 3);
      this.amp.connect(f);
      out = f;
    }
    this.fader = new Fader(ctx, this.bag);
    out.connect(this.fader.node).connect(host.dest);

    for (const midi of pitches) {
      const freq = mtof(midi);
      const carrier = this.bag.source(ctx.createOscillator());
      carrier.type = patch.wave ?? 'sine';
      carrier.frequency.value = freq;
      const mod = this.bag.source(ctx.createOscillator());
      mod.type = 'sine';
      mod.frequency.value = freq * patch.ratio;
      const modGain = this.bag.add(ctx.createGain());
      const dev = patch.index * toneMul * freq * patch.ratio;
      modGain.gain.setValueAtTime(dev, when);
      modGain.gain.setTargetAtTime(dev * patch.indexEnd, when, Math.max(0.005, (patch.indexDecay * sizeMul) / 3));
      mod.connect(modGain).connect(carrier.frequency);
      if (patch.pitchEnv) {
        for (const o of [carrier, mod]) {
          o.detune.setValueAtTime(patch.pitchEnv.semis * 100, when);
          o.detune.setTargetAtTime(0, when, patch.pitchEnv.time / 3);
        }
      }
      this.bag.modulate(host.wiggle, carrier.detune);
      this.bag.modulate(host.wiggle, mod.detune);
      const g = this.bag.add(ctx.createGain());
      g.gain.value = groupGain;
      carrier.connect(g).connect(this.amp);
      this.carriers.push({ osc: carrier, mod, ratio: patch.ratio });

      if (patch.shimmer) {
        const sh = this.bag.source(ctx.createOscillator());
        sh.frequency.value = freq * patch.shimmer.ratio;
        const sg = this.bag.add(ctx.createGain());
        sg.gain.setValueAtTime(patch.shimmer.gain * groupGain * toneMul, when);
        sg.gain.setTargetAtTime(0, when, patch.shimmer.decay / 3);
        sh.connect(sg).connect(this.amp);
      }
    }

    const peak = patch.gain * velocityGain(params.vel);
    const a = Math.max(0.001, patch.aenv.a);
    this.amp.gain.setValueAtTime(0, when);
    this.amp.gain.linearRampToValueAtTime(peak, when + a);
    this.amp.gain.setTargetAtTime(0, when + a, Math.max(0.01, decay / 3));
    this.endTime = when + a + decay * 2.2 + 0.05;
    this.bag.start(when);
    this.bag.stop(this.endTime);
    this.bag.onEnded(() => {
      this.bag.dispose();
      this.onEnded?.();
    });
  }

  /** Bells ring out on their own; letting go of a key does not cut them. */
  release(): void {}

  kill(when: number, fade = 0.02): void {
    const end = this.fader.fadeOut(when, fade);
    this.endTime = Math.min(this.endTime, end);
    this.bag.restop(this.endTime);
  }

  setPitch(midi: number[], when: number): void {
    this.carriers.forEach((c, i) => {
      const m = midi[i] ?? midi[midi.length - 1];
      if (m === undefined) return;
      holdAt(c.osc.frequency, when);
      c.osc.frequency.setTargetAtTime(mtof(m), when, 0.02);
      holdAt(c.mod.frequency, when);
      c.mod.frequency.setTargetAtTime(mtof(m) * c.ratio, when, 0.02);
    });
  }

  setTone(): void {}
}
