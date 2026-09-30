import { clamp } from '../dsp';
import type { VoicePatch } from '../presets';
import { Fader, NodeBag, velocityGain, type Voice, type VoiceHost, type VoiceParams } from './base';

// Mimic's sampler: plays the child's recorded sound faster (higher) or slower
// (lower). The whole recording always plays, even for the quickest tap, so a
// recorded "ba-na-na" never gets cut down to "ba".

export class SamplerVoice implements Voice {
  readonly startTime: number;
  endTime: number;
  sequenced: boolean;
  onEnded: (() => void) | null = null;
  private bag = new NodeBag();
  private amp: GainNode;
  private fader: Fader;

  constructor(
    readonly channelId: string,
    host: VoiceHost,
    buffer: AudioBuffer,
    patch: VoicePatch,
    params: VoiceParams,
    when: number,
    sequenced: boolean,
  ) {
    const { ctx } = host;
    this.startTime = when;
    this.sequenced = sequenced;
    const semis = patch.semis + params.bend;
    const rate = Math.pow(2, semis / 12);

    const src = this.bag.source(ctx.createBufferSource());
    src.buffer = buffer;
    src.playbackRate.value = rate;
    this.bag.modulate(host.wiggle, src.detune);

    const tone = this.bag.add(ctx.createBiquadFilter());
    tone.type = 'lowpass';
    tone.frequency.value = clamp(7000 * Math.pow(2, params.tone * 1.5), 800, 18000);

    this.amp = this.bag.add(ctx.createGain());
    const peak = patch.gain * velocityGain(params.vel);
    this.amp.gain.setValueAtTime(0, when);
    this.amp.gain.linearRampToValueAtTime(peak, when + 0.005);

    if (patch.robot > 0) {
      // Ring modulation: multiply the voice by a low sine → classic robot voice.
      const dry = this.bag.add(ctx.createGain());
      dry.gain.value = 1 - patch.robot * 0.85;
      const ring = this.bag.add(ctx.createGain());
      ring.gain.value = 0;
      const lfo = this.bag.source(ctx.createOscillator());
      lfo.frequency.value = 72;
      const depth = this.bag.add(ctx.createGain());
      depth.gain.value = patch.robot * 1.6;
      lfo.connect(depth).connect(ring.gain);
      src.connect(dry).connect(tone);
      src.connect(ring).connect(tone);
    } else {
      src.connect(tone);
    }
    this.fader = new Fader(ctx, this.bag);
    tone.connect(this.amp).connect(this.fader.node).connect(host.dest);

    const length = buffer.duration / rate;
    const releaseAt = when + Math.max(0.02, length - 0.03);
    this.amp.gain.setValueAtTime(peak, releaseAt);
    this.amp.gain.linearRampToValueAtTime(0, releaseAt + 0.03);
    this.endTime = releaseAt + 0.05;
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
