import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/persistence', () => ({ scheduleSave: () => {} }));

import { cycleFx, recordNote, setTempo } from '../src/model/edits';
import { createProject } from '../src/model/project';
import type { NoteEvent, Project } from '../src/model/types';
import { beginGroup, commit, endGroup, getState, redo, setProject, undo } from '../src/store/store';

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
