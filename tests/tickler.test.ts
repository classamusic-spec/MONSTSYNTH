import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/persistence', () => ({ scheduleSave: () => {} }));

import { TICKLE } from '../src/magic/tickle';
import { createProject } from '../src/model/project';
import { getState, setProject, setState } from '../src/store/store';
import { Tickler, type TickleHost } from '../src/studio/tickle';
import { emitStudioEvent, onStudioEvent, type StudioEvent } from '../src/studio/visualBus';

// The studio side of tickle time (src/studio/tickle.ts), against the real store,
// with a pretend studio and pretend clocks: when the laugh is heard, when it is
// only a silent shake, and when everything calms down and goes quiet.

type TickleEvent = Extract<StudioEvent, { type: 'tickle' }>;

class FakeHost implements TickleHost {
  ready = true;
  lessonPlaying = false;
  micBusy = false;
  chirps: string[] = [];
  hushes = 0;
  chirp(monster: string, kind: string) {
    this.chirps.push(`${monster}:${kind}`);
  }
  hushLaughs() {
    this.hushes++;
  }
}

const little = TICKLE.little;
let host: FakeHost;
let tickler: Tickler;
let events: TickleEvent[];
let off: () => void;

const trackOf = (monster: string) => getState().project.tracks.find((t) => t.monster === monster)!.id;
const phases = (id?: string) => events.filter((e) => !id || e.trackId === id).map((e) => e.phase);

/** `n` quick pokes on a monster, 100 ms apart (the clock moves on with them). */
function poke(id: string, n: number, gap = 100) {
  for (let i = 0; i < n; i++) {
    if (i) vi.advanceTimersByTime(gap);
    tickler.tap(id, performance.now());
  }
}

/** Poke until the giggles, then wait for the laugh. */
function laugh(id: string) {
  poke(id, little.taps);
  vi.advanceTimersByTime(little.quietMs + 20);
  return events.filter((e) => e.trackId === id && e.phase === 'laugh').at(-1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  setProject(createProject({ seed: 5 }));
  setState({
    screen: 'lab',
    overlay: null,
    guide: null,
    resting: false,
    transport: { playing: false, recording: false, armed: false, mode: 'loop' },
    settings: { ...getState().settings, ageMode: 'little' },
  });
  host = new FakeHost();
  tickler = new Tickler(host);
  events = [];
  off = onStudioEvent((e) => {
    if (e.type === 'tickle') events.push(e);
  });
});

afterEach(() => {
  off();
  tickler.resetAll();
  vi.useRealTimers();
});

describe('the Tickler: when the laugh is heard', () => {
  it('quick pokes give the giggles; quiet gives a laugh in the monster’s voice; then calm', () => {
    const id = trackOf('bloop');
    const l = laugh(id);
    expect(phases(id).slice(0, 2)).toEqual(['giggly', 'laugh']);
    expect(l).toMatchObject({ sound: true, level: 1 });
    expect(host.chirps).toEqual(['bloop:giggle']);
    expect(tickler.laughs).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(phases(id).at(-1)).toBe('calm');
    expect(tickler.active).toBe(0);
  });

  it('level 2: "wheee" and the bigger laugh', () => {
    const id = trackOf('bloop');
    laugh(id);
    vi.advanceTimersByTime(1000);
    const l = laugh(id);
    expect(l).toMatchObject({ sound: true, level: 2 });
    expect(host.chirps.slice(1)).toEqual(['bloop:wheee', 'bloop:laugh']);
  });

  const silent: [string, () => void][] = [
    ['a grown-up panel is open', () => setState({ overlay: 'parent' })],
    ['the first-beat guide runs', () => setState({ guide: { kind: 'first-beat', trackId: trackOf('boom'), projectId: getState().project.id } })],
    ['the band plays', () => setState({ transport: { ...getState().transport, playing: true } })],
    ['a lesson plays', () => (host.lessonPlaying = true)],
    ['Mimic’s microphone listens', () => (host.micBusy = true)],
    ['the sound is not ready', () => (host.ready = false)],
  ];
  for (const [when, set] of silent) {
    it(`while ${when}, the laugh is a silent shake (the face still shows)`, () => {
      set();
      const id = trackOf('bloop');
      const l = laugh(id);
      expect(l).toMatchObject({ sound: false });
      expect(host.chirps).toEqual([]);
      expect(tickler.laughs).toBe(0);
      vi.advanceTimersByTime(2000);
      expect(phases(id).at(-1)).toBe('calm');
    });
  }

  it('Monster Makers see the giggles but never hear a laugh', () => {
    setState({ settings: { ...getState().settings, ageMode: 'maker' } });
    const id = trackOf('boom');
    poke(id, TICKLE.maker.taps);
    vi.advanceTimersByTime(500);
    expect(events.find((e) => e.phase === 'laugh')).toMatchObject({ sound: false });
    expect(host.chirps).toEqual([]);
  });
});

describe('the Tickler: nothing gets stuck', () => {
  it('while recording or armed, pokes never tickle', () => {
    for (const flags of [{ recording: true }, { armed: true }]) {
      setState({ transport: { playing: false, recording: false, armed: false, mode: 'loop', ...flags } });
      poke(trackOf('bloop'), 8);
      vi.advanceTimersByTime(1000);
      expect(events).toEqual([]);
    }
  });

  it('a sleeping monster keeps its closed eyes; put to sleep mid-giggle, it calms', () => {
    const id = trackOf('grumble');
    const sleep = (on: boolean) => setState({ project: { ...getState().project, tracks: getState().project.tracks.map((t) => (t.id === id ? { ...t, sleeping: on } : t)) } });
    sleep(true);
    poke(id, 6);
    expect(events).toEqual([]);
    sleep(false);
    vi.advanceTimersByTime(3000);
    poke(id, 5);
    expect(phases(id)).toEqual(['giggly']);
    sleep(true);
    expect(phases(id)).toEqual(['giggly', 'calm']);
    vi.advanceTimersByTime(2000);
    expect(phases(id)).toEqual(['giggly', 'calm']);
    expect(host.chirps).toEqual([]);
  });

  const resets: [string, () => void][] = [
    ['a take starts', () => emitStudioEvent({ type: 'record-start' })],
    ['the monsters rest', () => setState({ resting: true })],
    ['the age mode changes', () => setState({ settings: { ...getState().settings, ageMode: 'maker' } })],
    ['the Lab is left', () => setState({ screen: 'blocks' })],
  ];
  for (const [when, act] of resets) {
    it(`when ${when} mid-giggle: calm at once, no laugh later, and any laugh still ringing stops`, () => {
      const id = trackOf('spark');
      poke(id, 6);
      const hushes = host.hushes;
      act();
      expect(phases(id)).toEqual(['giggly', 'more', 'calm']);
      expect(host.hushes).toBeGreaterThan(hushes);
      vi.advanceTimersByTime(3000);
      expect(phases(id)).toEqual(['giggly', 'more', 'calm']);
      expect(host.chirps).toEqual([]);
      expect(tickler.active).toBe(0);
    });
  }

  it('a take starting mid-laugh stops the laugh and calms the face', () => {
    const id = trackOf('bloop');
    laugh(id);
    expect(host.chirps).toHaveLength(1);
    const hushes = host.hushes;
    emitStudioEvent({ type: 'record-start' });
    expect(host.hushes).toBe(hushes + 1);
    expect(phases(id).at(-1)).toBe('calm');
  });

  it('the band starting (or a panel opening) mid-laugh stops its sound; the face finishes its laugh', () => {
    const id = trackOf('bloop');
    laugh(id);
    let hushes = host.hushes;
    setState({ transport: { ...getState().transport, playing: true } });
    expect(host.hushes).toBe(hushes + 1);
    expect(phases(id).at(-1)).toBe('laugh');
    vi.advanceTimersByTime(2000);
    expect(phases(id).at(-1)).toBe('calm');
    setState({ transport: { ...getState().transport, playing: false } });
    vi.advanceTimersByTime(3000);
    laugh(id);
    hushes = host.hushes;
    setState({ overlay: 'parent' });
    expect(host.hushes).toBe(hushes + 1);
  });

  it('poking on and on is drumming: the face calms with no laugh, and the beat goes on as plain notes', () => {
    const id = trackOf('boom');
    // About 3 pokes a second for 10 s.
    poke(id, 30, 330);
    vi.advanceTimersByTime(2000);
    const p = phases(id);
    expect(p[0]).toBe('giggly');
    expect(p.at(-1)).toBe('calm');
    expect(p).not.toContain('laugh');
    expect(events.at(-1)).toMatchObject({ phase: 'calm', drumming: true });
    expect(host.chirps).toEqual([]);
    expect(tickler.active).toBe(0);
  });
});
