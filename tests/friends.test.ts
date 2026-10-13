import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/persistence', () => ({ scheduleSave: () => {} }));

import { recordNote } from '../src/model/edits';
import { activeClip, createProject } from '../src/model/project';
import type { NoteEvent } from '../src/model/types';
import { beginGroup, commit, getState, setProject, setState, undo } from '../src/store/store';
import { studio } from '../src/studio/studio';

// The Add Monster tray goes through studio.invite / studio.sendHome. No audio
// here (the studio is asleep, so the hello and bye-bye stay silent): these
// check the undo steps a child gets.

const opts = { grid: 0.5, isDrum: false, protectedIds: new Set<string>() };
const note = (id: string, beat: number): NoteEvent => ({ id, beat, step: 2, dur: 0.5, vel: 0.8, tone: 0 });
const trackOf = (monster: string) => getState().project.tracks.find((t) => t.monster === monster);

/** A take in progress, as studio.startRecording leaves it (it needs audio to start for real). */
function openTake() {
  (studio as unknown as { session: unknown }).session = {
    token: beginGroup('record'),
    recent: new Map(),
    lastActivityBeat: 0,
    notes: 0,
    firstLoopFor: new Set(),
    click: false,
    lastHit: new Map(),
  };
  setState({ transport: { ...getState().transport, recording: true } });
}

beforeEach(() => {
  setProject(createProject({ seed: 5 }));
  setState({ guide: null });
});

describe('monster friends through the studio', () => {
  it('sending a monster home mid-take ends the take first: two steps, and one Undo brings only the monster back', () => {
    const bloop = trackOf('bloop')!.id;
    const boom = trackOf('boom')!;
    const past = getState().past.length;
    openTake();
    commit((p) => recordNote(p, bloop, note('t1', 0), opts), { undoable: false });
    commit((p) => recordNote(p, bloop, note('t2', 1), opts), { undoable: false });
    expect(studio.sendHome(boom.id)).toBe(true);
    expect(getState().transport.recording).toBe(false);
    expect(trackOf('boom')).toBeUndefined();
    expect(getState().past).toHaveLength(past + 2);
    expect(undo()).toBe(true);
    expect(trackOf('boom')?.id).toBe(boom.id);
    expect(getState().project.tracks.findIndex((t) => t.id === boom.id)).toBe(1);
    expect(activeClip(trackOf('boom')!)).toEqual(activeClip(boom));
    expect(activeClip(trackOf('bloop')!)!.notes.map((n) => n.id)).toEqual(['t1', 't2']);
  });

  it('inviting mid-take also ends the take first (two steps)', () => {
    const past = getState().past.length;
    openTake();
    commit((p) => recordNote(p, trackOf('bloop')!.id, note('t1', 0), opts), { undoable: false });
    const puff = studio.invite('puff');
    expect(puff).toBe(trackOf('puff')?.id);
    expect(getState().transport.recording).toBe(false);
    expect(getState().past).toHaveLength(past + 2);
    undo();
    expect(trackOf('puff')).toBeUndefined();
    expect(activeClip(trackOf('bloop')!)!.notes).toHaveLength(1);
  });

  it('a monster already on stage is not invited twice', () => {
    const past = getState().past.length;
    expect(studio.invite('bloop')).toBeNull();
    expect(getState().past).toHaveLength(past);
  });

  it('the last monster on stage stays', () => {
    for (const m of ['boom', 'grumble', 'spark']) expect(studio.sendHome(trackOf(m)!.id)).toBe(true);
    const past = getState().past.length;
    expect(studio.sendHome(trackOf('bloop')!.id)).toBe(false);
    expect(getState().project.tracks.map((t) => t.monster)).toEqual(['bloop']);
    expect(getState().past).toHaveLength(past);
  });

  it('the monster the first-beat guide teaches on stays while the guide runs', () => {
    const boom = trackOf('boom')!.id;
    setState({ guide: { kind: 'first-beat', trackId: boom, projectId: getState().project.id } });
    const past = getState().past.length;
    expect(studio.sendHome(boom)).toBe(false);
    expect(trackOf('boom')?.id).toBe(boom);
    expect(getState().past).toHaveLength(past);
    // Everyone else can still go home.
    expect(studio.sendHome(trackOf('spark')!.id)).toBe(true);
    setState({ guide: null });
    expect(studio.sendHome(boom)).toBe(true);
  });
});
