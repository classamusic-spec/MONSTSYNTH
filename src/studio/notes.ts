import type { NoteRequest } from '../audio/engine';
import { TICK_PAD } from '../audio/voices/drums';
import { chordSteps, mimicSemitones, stepToMidi } from '../magic/scales';
import type { MonsterKind, Project } from '../model/types';

// Monster Magic → audio: turn a key press (scale step) into concrete pitches.

export interface Expression {
  vel: number;
  tone?: number;
  size?: number;
  bend?: number;
}

export function noteRequest(
  project: Pick<Project, 'scale' | 'key'>,
  monster: MonsterKind,
  channelId: string,
  step: number,
  expr: Expression,
): NoteRequest {
  const base = { channelId, vel: expr.vel, tone: expr.tone ?? 0, size: expr.size ?? 0, bend: expr.bend ?? 0, pad: 0 };
  switch (monster) {
    case 'boom':
      // Boom's eight drums only: a stored step can be up to 15, and the next pad is the metronome's tick.
      return { ...base, midi: [], pad: Math.min(TICK_PAD - 1, Math.max(0, step)) };
    case 'puff':
      return { ...base, midi: chordSteps(step).map((s) => stepToMidi(s, 'puff', project.scale, project.key)) };
    case 'mimic':
      return {
        ...base,
        midi: [stepToMidi(step, 'mimic', project.scale, project.key)],
        bend: (expr.bend ?? 0) + mimicSemitones(step, project.scale),
      };
    default:
      return { ...base, midi: [stepToMidi(step, monster, project.scale, project.key)] };
  }
}
