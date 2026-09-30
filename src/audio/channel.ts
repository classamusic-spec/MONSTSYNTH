import type { FxLevels, MonsterKind } from '../model/types';
import { clamp, saturationCurve } from './dsp';

// One channel strip per monster:
//
//   voices → input ─┬─ dry ─────────────────────────────┐
//                   └─ pre → Chomper shaper → post → wet ┴→ pan → volume → master
//                                                               ├→ Echo send
//                                                               └→ Gloop send
//   Wiggle LFO (cents) → every oscillator's detune on this channel

export interface ChannelBuses {
  master: AudioNode;
  echo: AudioNode;
  gloop: AudioNode;
}

const PAN: Record<MonsterKind, number> = {
  bloop: 0.12,
  boom: 0,
  grumble: 0,
  spark: -0.22,
  puff: 0.25,
  mimic: -0.12,
};

export class Channel {
  readonly input: GainNode;
  readonly wiggle: GainNode;
  sample: AudioBuffer | null = null;
  preset: string;

  private dry: GainNode;
  private wet: GainNode;
  private pre: GainNode;
  private post: GainNode;
  private volume: GainNode;
  private echoSend: GainNode;
  private gloopSend: GainNode;
  private wiggleLfo: OscillatorNode;
  private nodes: AudioNode[] = [];
  private baseWiggle = 0;
  private wiggleBoost = 0;

  constructor(
    private ctx: BaseAudioContext,
    buses: ChannelBuses,
    readonly monster: MonsterKind,
    preset: string,
    fx: FxLevels,
    volume: number,
  ) {
    this.preset = preset;
    const g = () => this.track(ctx.createGain());
    this.input = g();
    this.dry = g();
    this.wet = g();
    this.pre = g();
    this.post = g();
    const shaper = this.track(ctx.createWaveShaper());
    shaper.curve = saturationCurve(1);
    shaper.oversample = '2x';
    const tame = this.track(ctx.createBiquadFilter());
    tame.type = 'lowpass';
    tame.frequency.value = 5200;
    const sum = g();
    this.volume = g();
    this.echoSend = g();
    this.gloopSend = g();

    this.input.connect(this.dry).connect(sum);
    this.input.connect(this.pre).connect(shaper).connect(tame).connect(this.post).connect(this.wet).connect(sum);

    let tail: AudioNode = sum;
    if (typeof ctx.createStereoPanner === 'function') {
      const pan = this.track(ctx.createStereoPanner());
      pan.pan.value = PAN[monster];
      sum.connect(pan);
      tail = pan;
    }
    tail.connect(this.volume);
    this.volume.connect(buses.master);
    this.volume.connect(this.echoSend).connect(buses.echo);
    this.volume.connect(this.gloopSend).connect(buses.gloop);

    this.wiggleLfo = ctx.createOscillator();
    this.wiggleLfo.frequency.value = 5.5;
    this.wiggle = g();
    this.wiggle.gain.value = 0;
    this.wiggleLfo.connect(this.wiggle);
    this.wiggleLfo.start();
    this.nodes.push(this.wiggleLfo);

    this.setFx(fx, true);
    this.setVolume(volume, true);
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  private set(param: AudioParam, value: number, immediate: boolean) {
    if (immediate) param.value = value;
    else param.setTargetAtTime(value, this.ctx.currentTime, 0.04);
  }

  setFx(fx: FxLevels, immediate = false) {
    const chomp = clamp(fx.chomper, 0, 1);
    this.set(this.dry.gain, 1 - chomp * 0.9, immediate);
    this.set(this.wet.gain, chomp, immediate);
    this.set(this.pre.gain, 1 + chomp * 10, immediate);
    this.set(this.post.gain, 0.55 / (1 + chomp * 0.6), immediate);
    this.set(this.echoSend.gain, clamp(fx.echo, 0, 1) * 0.8, immediate);
    this.set(this.gloopSend.gain, clamp(fx.gloop, 0, 1) * 0.9, immediate);
    this.baseWiggle = clamp(fx.wiggle, 0, 1);
    this.applyWiggle(immediate);
  }

  /** Shaking a monster adds wobble on top of the Wiggle buddy while it lasts. */
  setWiggleBoost(v: number) {
    this.wiggleBoost = clamp(v, 0, 1);
    this.applyWiggle(false);
  }

  private applyWiggle(immediate: boolean) {
    const w = Math.max(this.baseWiggle, this.wiggleBoost);
    this.set(this.wiggle.gain, w * 55, immediate);
    this.set(this.wiggleLfo.frequency, 4.5 + w * 3.5, immediate);
  }

  setVolume(v: number, immediate = false) {
    this.set(this.volume.gain, clamp(v, 0, 1), immediate);
  }

  dispose() {
    try {
      this.wiggleLfo.stop();
    } catch {
      /* not started */
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];
  }
}
