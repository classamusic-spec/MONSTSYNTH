import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/persistence', () => ({ scheduleSave: () => {} }));

import { GROOVES, grooveNotes } from '../src/magic/grooves';
import type { CellWrite } from '../src/magic/steps';
import { addMonster, cycleFx, recordNote, removeMonster, replaceLoopNotes, setCellEdit, setTempo, tidyLoop } from '../src/model/edits';
import { activeClip, createProject } from '../src/model/project';
import type { NoteEvent, Project } from '../src/model/types';
import { beginGroup, commit, endGroup, getState, labFace, redo, setProject, setState, undo } from '../src/store/store';

const note = (id: string, beat: number): NoteEvent => ({ id, beat, step: 2, dur: 0.5, vel: 0.8, tone: 0 });
const opts = { grid: 0.5, isDrum: false, protectedIds: new Set<string>() };
const bloop = () => getState().project.tracks[0].id;
const notesOf = (p: Project) => p.tracks[0].clips[0]?.notes.length ?? 0;

beforeEach(() => {
  setProject(createProject({ seed: 3 }));
});

describe('undo groups (a take is one step)', () => {
  it('folds edits made during a take into the take', () => {
    const before = getState().project;
    const t = bloop();
    const token = beginGroup('record');
    commit((p) => recordNote(p, t, note('a', 0), opts), { undoable: false });
    commit((p) => cycleFx(p, t, 'echo'));
    commit((p) => recordNote(p, t, note('b', 2), opts), { undoable: false });
    endGroup(token);
    const s = getState();
    expect(s.past).toHaveLength(1);
    expect(notesOf(s.project)).toBe(2);
    expect(s.project.tracks[0].fx.echo).toBeGreaterThan(0);
    expect(undo()).toBe(true);
    expect(getState().project.tracks).toBe(before.tracks);
    expect(getState().past).toHaveLength(0);
    // Redo brings the whole take back too.
    expect(redo()).toBe(true);
    expect(notesOf(getState().project)).toBe(2);
    expect(getState().project.tracks[0].fx.echo).toBeGreaterThan(0);
  });

  it('leaves no step for an empty take', () => {
    const token = beginGroup('record');
    endGroup(token);
    expect(getState().past).toHaveLength(0);
  });

  it('keeps a take with only a costume or effect change as one step', () => {
    const before = getState().project;
    const token = beginGroup('record');
    commit((p) => cycleFx(p, bloop(), 'gloop'));
    commit((p) => cycleFx(p, bloop(), 'gloop'));
    endGroup(token);
    expect(getState().past).toHaveLength(1);
    undo();
    expect(getState().project.tracks).toBe(before.tracks);
  });

  it('makes edits undoable again once the take is over', () => {
    const token = beginGroup('record');
    commit((p) => recordNote(p, bloop(), note('a', 0), opts), { undoable: false });
    endGroup(token);
    commit((p) => cycleFx(p, bloop(), 'echo'));
    expect(getState().past).toHaveLength(2);
  });

  it('closes an open group on undo, so later edits are their own steps', () => {
    beginGroup('record');
    commit((p) => recordNote(p, bloop(), note('a', 0), opts), { undoable: false });
    undo();
    commit((p) => cycleFx(p, bloop(), 'echo'));
    expect(getState().past).toHaveLength(1);
  });
});

describe('monster friends (the Add Monster tray)', () => {
  it('sending a monster home is one undo step that brings it back in its seat with its loop', () => {
    const spark = () => getState().project.tracks.find((t) => t.monster === 'spark');
    commit((p) => recordNote(p, spark()!.id, note('s', 1), opts));
    const before = getState().project;
    const id = spark()!.id;
    expect(commit((p) => removeMonster(p, id))).toBe(true);
    expect(spark()).toBeUndefined();
    expect(getState().past).toHaveLength(2);
    expect(undo()).toBe(true);
    const back = getState().project;
    expect(back.tracks).toBe(before.tracks);
    expect(back.bench).toBe(before.bench);
    expect(back.arrangement).toBe(before.arrangement);
    expect(activeClip(spark()!)!.notes.map((n) => n.id)).toEqual(['s']);
    expect(back.tracks.findIndex((t) => t.id === id)).toBe(before.tracks.findIndex((t) => t.id === id));
  });

  it('once the take is closed (the studio ends it first), one Undo brings the monster back and keeps the take', () => {
    const token = beginGroup('record');
    commit((p) => recordNote(p, bloop(), note('a', 0), opts), { undoable: false });
    endGroup(token);
    const boom = getState().project.tracks.find((t) => t.monster === 'boom')!.id;
    commit((p) => removeMonster(p, boom));
    expect(getState().past).toHaveLength(2);
    undo();
    expect(getState().project.tracks.some((t) => t.id === boom)).toBe(true);
    expect(notesOf(getState().project)).toBe(1);
  });

  it('inviting all six (Little Monsters too) and sending one home are separate steps', () => {
    commit((p) => addMonster(p, 'puff'));
    commit((p) => addMonster(p, 'mimic'));
    expect(getState().project.tracks).toHaveLength(6);
    expect(getState().past).toHaveLength(2);
    const puff = getState().project.tracks.find((t) => t.monster === 'puff')!.id;
    commit((p) => removeMonster(p, puff));
    expect(getState().project.tracks).toHaveLength(5);
    undo();
    expect(getState().project.tracks.map((t) => t.monster)).toEqual(['bloop', 'boom', 'grumble', 'spark', 'puff', 'mimic']);
  });
});

describe('coalescing', () => {
  it('turns a slider drag into one step outside takes', () => {
    commit((p) => setTempo(p, 101), { coalesce: 'tempo' });
    commit((p) => setTempo(p, 104), { coalesce: 'tempo' });
    commit((p) => setTempo(p, 110), { coalesce: 'tempo' });
    expect(getState().past).toHaveLength(1);
    undo();
    expect(getState().project.tempo).toBe(100);
  });

  it('ignores edits that change nothing', () => {
    expect(commit((p) => setTempo(p, 100))).toBe(false);
    expect(getState().past).toHaveLength(0);
  });
});

describe('Beat Hop history', () => {
  const boom = () => getState().project.tracks.find((t) => t.monster === 'boom')!.id;
  const boomNotes = () => activeClip(getState().project.tracks.find((t) => t.monster === 'boom')!)?.notes ?? [];
  const cell = (step: number, col: number): CellWrite => ({ step, col, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 });

  it('a swipe (one coalesce key) is one undo step; separate taps are separate steps', () => {
    for (let c = 0; c < 8; c++) commit((p) => setCellEdit(p, boom(), cell(2, c)), { coalesce: 'grid-1-100' });
    expect(boomNotes()).toHaveLength(8);
    expect(getState().past).toHaveLength(1);
    undo();
    expect(boomNotes()).toHaveLength(0);
    commit((p) => setCellEdit(p, boom(), cell(0, 0)), { coalesce: 'grid-1-200' });
    commit((p) => setCellEdit(p, boom(), cell(0, 4)), { coalesce: 'grid-1-300' });
    expect(getState().past).toHaveLength(2);
  });

  it('a burst of wand taps is one step back to the child\'s own beat', () => {
    commit((p) => setCellEdit(p, boom(), cell(0, 2)));
    const own = boomNotes();
    for (const g of GROOVES.slice(0, 3)) commit((p) => replaceLoopNotes(p, boom(), grooveNotes(g, { beatsPerBar: 4 })), { coalesce: `wand:${boom()}` });
    expect(getState().past).toHaveLength(2);
    undo();
    expect(boomNotes()).toEqual(own);
  });

  it('tidying is one step, and tidying a tidy loop records nothing', () => {
    const t = getState().project.tracks[0].id;
    commit((p) => recordNote(p, t, note('a', 0.96), opts));
    commit((p) => tidyLoop(p, t, 0.5));
    expect(getState().past).toHaveLength(2);
    expect(commit((p) => tidyLoop(p, t, 0.5))).toBe(false);
    undo();
    expect(activeClip(getState().project.tracks[0])!.notes[0].beat).toBe(0.96);
  });

  it('shows the grid face for every monster (Boom\'s stones, a bead lane), but only for a loop of whole beats', () => {
    const s = getState();
    setState({ labView: 'grid', selectedTrackId: boom() });
    expect(labFace(getState())).toBe('grid');
    setState({ selectedTrackId: bloop() });
    expect(labFace(getState())).toBe('grid');
    // A loop that is not whole beats has no grid columns: the keys stay.
    const odd = { ...s.project, tracks: s.project.tracks.map((t, i) => (i === 0 ? { ...t, clips: [{ id: 'odd', lengthBeats: 6.5, notes: [] }], activeClipId: 'odd' } : t)) };
    setState({ project: odd });
    expect(labFace(getState())).toBe('keys');
    setState({ project: s.project, labView: 'keys', selectedTrackId: boom() });
    expect(labFace(getState())).toBe('keys');
  });
});
