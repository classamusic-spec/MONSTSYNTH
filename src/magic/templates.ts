import { newId } from '../model/ids';
import { createClip, createProject } from '../model/project';
import type { MonsterKind, NoteEvent, Project } from '../model/types';
import { magicArrange } from './arrange';
import { GROOVES, grooveNotes } from './grooves';

// ─────────────────────────────────────────────────────────────────────────────
// Starter songs. "Monster Band" gives very young children a finished groove to
// conduct: tap a monster's sleep badge to make it rest or join in.
// ─────────────────────────────────────────────────────────────────────────────

type N = [beat: number, step: number, dur?: number, vel?: number];

const n = ([beat, step, dur = 0.5, vel = 0.85]: N): NoteEvent => ({ id: newId('n'), beat, step, dur, vel, tone: 0 });

// Boom plays the wand's first groove ("stomp"), so there is one source of beats.
const BAND: Partial<Record<Exclude<MonsterKind, 'boom'>, N[]>> = {
  grumble: [
    [0, 0, 1], [1.5, 0, 0.5, 0.7], [2, 3, 1], [3.5, 2, 0.5, 0.7],
    [4, 4, 1], [5.5, 4, 0.5, 0.7], [6, 3, 1], [7, 2, 1],
  ],
  bloop: [
    [0, 2, 0.5], [0.5, 3, 0.5], [1, 4, 1], [2, 3, 0.5], [2.5, 2, 0.5], [3, 1, 1],
    [4, 2, 0.5], [4.5, 3, 0.5], [5, 5, 1], [6, 4, 0.5], [6.5, 3, 0.5], [7, 2, 1],
  ],
  spark: [
    [0.5, 5, 0.5, 0.6], [1.5, 7, 0.5, 0.55], [2.5, 6, 0.5, 0.6], [3.5, 4, 0.5, 0.55],
    [4.5, 5, 0.5, 0.6], [5.5, 7, 0.5, 0.55], [6.5, 6, 0.5, 0.6], [7.5, 7, 0.5, 0.5],
  ],
};

export function monsterBandProject(seed = Math.floor(Math.random() * 1e9)): Project {
  const project = createProject({ seed });
  project.tracks = project.tracks.map((t) => {
    const notes = t.monster === 'boom' ? grooveNotes(GROOVES[0], { beatsPerBar: project.beatsPerBar }) : BAND[t.monster]?.map(n).sort((a, b) => a.beat - b.beat);
    if (!notes) return t;
    const clip = createClip(project.loopBeats);
    clip.notes = notes;
    return { ...t, clips: [clip], activeClipId: clip.id };
  });
  project.arrangement = magicArrange(project, 0);
  return project;
}
