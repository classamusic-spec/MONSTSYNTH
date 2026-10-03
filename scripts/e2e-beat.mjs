// Beat accuracy: drums always land on the beat. Checks the record path (armed
// takes, drum snap, bounce filter, touch timestamps), what is heard (flam guard,
// the whole-take click, grid-locked rolls, the finale on the downbeat), the
// transport (no bursts after a stall, visuals in time order, resting frames) and
// a few guards (one undo per take, keyboard keys only for visible pads).
// Usage: node scripts/e2e-beat.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
await page.mouse.click(512, 384);
await page.waitForFunction(() => window.__monster.studio.debug().state === 'running');

// In-page helpers: spies on the engine, and waiting for exact audio-clock times.
await page.evaluate(async () => {
  const M = window.__monster;
  const st = M.studio;
  const eng = st.engine;
  const ac = st.audioContext;
  const { inputCompensation } = await import('/src/audio/context.ts');
  // The app's own visual bus (a fresh import could be a different module instance after HMR).
  const { onFrame, emitNote } = M.bus;
  const T = {
    trig: [],
    on: [],
    sched: [],
    frames: 0,
    lastFrame: null,
    comp: () => inputCompensation(ac),
    now: () => ac.currentTime,
    reset() {
      T.trig = [];
      T.on = [];
      T.sched = [];
    },
    /** Resolve once the audio clock reaches `time`. */
    until: (time) =>
      new Promise((resolve) => {
        const poll = () => (ac.currentTime >= time ? resolve() : setTimeout(poll, 1));
        poll();
      }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    track: (monster) => M.getState().project.tracks.find((t) => t.monster === monster),
    notes: (monster) => {
      const t = T.track(monster);
      return t?.clips.find((c) => c.id === t.activeClipId)?.notes ?? [];
    },
    /** A finger that lands so the child *heard* it at transport beat `beat` + `late` seconds. */
    async tapHeard(monster, step, beat, late = 0, holdMs = 60) {
      const target = st.transport.timeAt(beat) + T.comp() + late;
      await T.until(target);
      const id = st.press(T.track(monster).id, step, { vel: 0.8 });
      setTimeout(() => st.release(id), holdMs);
      return id;
    },
    emitNote,
  };
  const trigger = eng.trigger.bind(eng);
  eng.trigger = (req, when, dur) => {
    T.trig.push({
      ch: req.channelId,
      pad: req.pad,
      midi: req.midi?.[0],
      when,
      at: ac.currentTime,
      beat: st.transport.playing ? st.transport.beatAt(when) : null,
      solo: st.rollTransport.playing ? st.rollTransport.beatAt(when) : null,
    });
    return trigger(req, when, dur);
  };
  // The transport's callbacks call studio.schedule at call time, so this sees every event with its beat.
  const schedule = st.schedule.bind(st);
  st.schedule = (e, when) => {
    if (e.note) T.sched.push({ absBeat: e.absBeat, when, at: ac.currentTime, ideal: st.transport.timeAt(e.absBeat) });
    return schedule(e, when);
  };
  const noteOn = eng.noteOn.bind(eng);
  eng.noteOn = (req, when) => {
    T.on.push({ ch: req.channelId, pad: req.pad, t: ac.currentTime, beat: st.transport.playing ? st.transport.beatAt(ac.currentTime) : null });
    return noteOn(req, when);
  };
  onFrame((p) => {
    T.frames++;
    T.lastFrame = { playing: p.playing };
  });
  window.__t = T;
});

/** A fresh blank (or band) song in the given mode, with `monster` on the keys. */
async function fresh(mode, monster, kind = 'blank') {
  await page.evaluate(
    async ({ mode, monster, kind }) => {
      const M = window.__monster;
      M.studio.stop();
      M.actions.updateSettings({ ageMode: mode });
      await M.actions.newSong(kind);
      const t = M.getState().project.tracks.find((x) => x.monster === monster);
      if (t) M.actions.selectTrack(t.id);
      window.__t.reset();
    },
    { mode, monster, kind },
  );
  await page.waitForTimeout(150);
}

const multipleOf = (b, g) => Math.abs(b / g - Math.round(b / g)) < 1e-9;

// ── 1. Armed take: every note measured the same way as the first ───────────
await fresh('maker', 'bloop');
const armed = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.startRecording();
  const spb = 60 / window.__monster.getState().project.tempo;
  const start = T.now() + 0.1;
  const bloop = T.track('bloop').id;
  for (let k = 0; k < 4; k++) {
    await T.until(start + k * spb);
    const id = st.press(bloop, 2 + k, { vel: 0.8 });
    setTimeout(() => st.release(id), 80);
  }
  await T.sleep(200);
  st.stopRecording();
  return T.notes('bloop').map((n) => n.beat).sort((a, b) => a - b);
});
check(
  'an armed take stores notes played one beat apart at 0, 1, 2, 3',
  armed.length === 4 && armed.every((b, i) => Math.abs(b - i) <= 0.02),
  armed.map((b) => b.toFixed(3)).join(' '),
);

// ── 2. Drum snap: late taps land exactly on the beat, in both modes ────────
for (const [mode, lates, grid] of [
  // Late by up to 0.23 beat in Little (magnet 0.3) and 0.06 beat in Maker (magnet 0.1) at 100 bpm.
  ['little', [0.03, 0.08, 0.12, 0.14, 0.06, 0.1, 0.11], 0.5],
  ['maker', [0.01, 0.03, 0.035, 0.02, 0.025, 0, 0.11], 0.25],
]) {
  await fresh(mode, 'boom');
  const beats = await page.evaluate(async (lates) => {
    const T = window.__t;
    const st = window.__monster.studio;
    st.startRecording();
    await T.until(T.now() + 0.05);
    const boom = T.track('boom').id;
    const id = st.press(boom, 0, { vel: 0.8 });
    setTimeout(() => st.release(id), 60);
    for (let k = 1; k <= lates.length; k++) await T.tapHeard('boom', k % 2, k, lates[k - 1]);
    await T.sleep(150);
    st.stopRecording();
    return T.notes('boom').map((n) => n.beat).sort((a, b) => a - b);
  }, lates);
  const expected = mode === 'little' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7.25];
  check(
    `${mode}: late drum taps are stored exactly on the beat (exact grid multiples)`,
    JSON.stringify(beats) === JSON.stringify(expected) && beats.every((b) => multipleOf(b, grid)),
    beats.join(' '),
  );
}

// ── 3. Touch timestamps: the handler running late does not make notes late ─
await fresh('maker', 'bloop');
const stamped = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.startRecording();
  const bloop = T.track('bloop').id;
  await T.until(T.now() + 0.05);
  // The handler always runs 70 ms after the finger landed; the event's timeStamp says so.
  const lag = 0.07;
  let id = st.press(bloop, 0, { vel: 0.8 }, { at: performance.now() - lag * 1000 });
  setTimeout(() => st.release(id), 60);
  for (let k = 1; k <= 3; k++) {
    await T.until(st.transport.timeAt(k) + T.comp() + lag);
    id = st.press(bloop, k, { vel: 0.8 }, { at: performance.now() - lag * 1000 });
    setTimeout(() => st.release(id), 60);
  }
  await T.sleep(120);
  st.stopRecording();
  return T.notes('bloop').map((n) => n.beat).sort((a, b) => a - b);
});
check(
  'touch timestamps take the handler delay out of recorded timing',
  stamped.length === 4 && stamped.every((b, i) => Math.abs(b - i) <= 0.02),
  stamped.map((b) => b.toFixed(3)).join(' '),
);

// ── 4. Bounce filter: a finger bouncing on a drum is one hit ───────────────
await fresh('little', 'boom');
const bounce = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.startRecording();
  await T.until(T.now() + 0.05);
  const boom = T.track('boom').id;
  const first = st.press(boom, 0, { vel: 0.8 });
  setTimeout(() => st.release(first), 60);
  // Two snare taps 50 ms apart, straddling the edge between beat 1 and its "and".
  const spb = 60 / window.__monster.getState().project.tempo;
  const t1 = st.transport.timeAt(1.25) + T.comp();
  await T.until(t1);
  const a = st.press(boom, 1, { vel: 0.8 });
  setTimeout(() => st.release(a), 30);
  await T.until(t1 + 0.05);
  const b = st.press(boom, 1, { vel: 0.8 });
  setTimeout(() => st.release(b), 30);
  await T.sleep(120);
  st.stopRecording();
  return {
    snares: T.notes('boom').filter((n) => n.step === 1).map((n) => n.beat),
    heard: T.on.filter((o) => o.pad === 1).length,
    gap: (0.05 / spb).toFixed(3),
  };
});
check(
  'a bouncy double tap records one drum hit (both taps still sound)',
  bounce.snares.length === 1 && bounce.snares[0] === 1 && bounce.heard === 2,
  `snares at ${bounce.snares.join(',')}; ${bounce.heard} heard; gap ${bounce.gap} beat`,
);

// ── 5. Flam guard: re-playing a hit that is in the loop sounds once ────────
await fresh('little', 'boom');
const flam = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.startRecording();
  await T.until(T.now() + 0.05);
  const boom = T.track('boom').id;
  const first = st.press(boom, 0, { vel: 0.8 });
  setTimeout(() => st.release(first), 60);
  const kicksNear = (beat) =>
    T.trig.filter((x) => x.ch === boom && x.pad === 0 && Math.abs(x.beat - beat) < 0.15).length +
    T.on.filter((x) => x.ch === boom && x.pad === 0 && x.beat !== null && Math.abs(x.beat - beat) < 0.15).length;
  const tapAt = async (time) => {
    await T.until(time);
    const id = st.press(boom, 0, { vel: 0.8 });
    setTimeout(() => st.release(id), 60);
  };
  await tapAt(st.transport.timeAt(8) - 0.05);
  await tapAt(st.transport.timeAt(16) + 0.03);
  const liveBefore = T.on.filter((x) => x.pad === 0).length;
  await tapAt(st.transport.timeAt(24) - 0.15);
  const liveAfter = T.on.filter((x) => x.pad === 0).length;
  await T.sleep(200);
  st.stopRecording();
  st.stop();
  return { early: kicksNear(8), late: kicksNear(16), farSounds: liveAfter - liveBefore };
});
check(
  'a kick re-played 50 ms early or 30 ms late over the loop sounds once',
  flam.early === 1 && flam.late === 1,
  `beat 8: ${flam.early} kick(s), beat 16: ${flam.late}`,
);
check('a re-tap 150 ms away still sounds live', flam.farSounds === 1);

// ── 6. The click lasts the whole drum take, in its own woodblock voice ─────
await fresh('little', 'boom');
const click = await page.evaluate(async () => {
  const T = window.__t;
  const M = window.__monster;
  const st = M.studio;
  st.startRecording();
  await T.until(T.now() + 0.05);
  const boom = T.track('boom').id;
  const first = st.press(boom, 0, { vel: 0.8 });
  setTimeout(() => st.release(first), 60);
  let channelKept = true;
  for (let k = 1; k <= 16; k++) {
    await T.tapHeard('boom', k % 2, k, 0.02);
    if (k === 6) {
      // A costume change mid-take must not tear down the click's channel.
      document.querySelector('.tool-costume')?.click();
      await T.sleep(60);
      channelKept = st.engine.hasChannel('metronome');
    }
  }
  st.stopRecording();
  const ticks = T.trig.filter((x) => x.ch === 'metronome');
  const onBeat = (b) => ticks.some((x) => Math.abs(x.beat - b) < 1e-6);
  const missing = [];
  for (let b = 1; b <= 16; b++) if (!onBeat(b)) missing.push(b);
  return {
    missing,
    first: ticks.length ? ticks[0].beat : null,
    pads: [...new Set(ticks.map((x) => x.pad))],
    channelKept,
    visualsSorted: st.visuals.every((v, i, a) => i === 0 || a[i - 1].time <= v.time),
  };
});
check(
  'the click ticks on every beat of a drum take (beats 0–16)',
  click.missing.length === 0 && click.first !== null && click.first < 0.5,
  click.missing.length ? `missing ${click.missing.join(',')}` : `first at ${click.first?.toFixed(3)}`,
);
check('the click is the woodblock tick (pad 8), never a drum pad', click.pads.length === 1 && click.pads[0] === 8, `pads ${click.pads}`);
check('a costume change mid-take keeps the click channel', click.channelKept);

await fresh('little', 'bloop', 'band');
const bandClick = await page.evaluate(async () => {
  const T = window.__t;
  window.__monster.studio.startRecording();
  await T.sleep(1500);
  window.__monster.studio.stop();
  return T.trig.filter((x) => x.ch === 'metronome').length;
});
check('no click over a song that already has a drum loop', bandClick === 0, `${bandClick} ticks`);

// ── 7. Visual queue order and stalls ───────────────────────────────────────
await fresh('little', 'bloop', 'band');
const stall = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.play();
  await T.sleep(800);
  // A preview queues visuals ahead of loop notes that are due earlier.
  st.preview(T.track('spark').id);
  await T.sleep(30);
  const sorted = st.visuals.every((v, i, a) => i === 0 || a[i - 1].time <= v.time);
  T.reset();
  // Block the main thread for 700 ms while the band plays.
  const end = performance.now() + 700;
  while (performance.now() < end) {
    /* busy */
  }
  await T.sleep(400);
  const band = T.sched;
  const late = band.filter((x) => x.when - x.ideal > 0.051).length;
  // A burst: notes from different beats played together at one instant.
  const clamped = new Map();
  for (const x of band.filter((x) => x.when - x.ideal > 0.001)) {
    const key = x.when.toFixed(4);
    clamped.set(key, (clamped.get(key) ?? new Set()).add(x.ideal.toFixed(4)));
  }
  st.stop();
  return { sorted, burst: Math.max(0, ...[...clamped.values()].map((v) => v.size)), late, n: band.length };
});
check('the visual queue stays in time order (preview during playback)', stall.sorted);
check(
  'after a 700 ms stall no note plays more than 50 ms late and no burst of notes piles up',
  stall.late === 0 && stall.burst <= 1 && stall.n > 0,
  `${stall.n} notes, ${stall.late} late, beats bunched at one instant: ${stall.burst}`,
);

// ── 8. Grid-locked rolls ───────────────────────────────────────────────────
await fresh('little', 'boom');
await page.evaluate(async () => {
  // A Bloop loop so the band can play without any drums.
  const T = window.__t;
  const st = window.__monster.studio;
  window.__monster.actions.selectTrack(T.track('bloop').id);
  st.startRecording();
  await T.until(T.now() + 0.05);
  const id = st.press(T.track('bloop').id, 2, { vel: 0.8 });
  setTimeout(() => st.release(id), 100);
  await T.sleep(300);
  st.stopRecording();
  st.stop();
  window.__monster.actions.selectTrack(T.track('boom').id);
});
for (const [mode, grid, tempo] of [
  ['little', 0.5, 100],
  ['maker', 0.25, 120],
]) {
  const roll = await page.evaluate(
    async ({ mode, tempo }) => {
      const T = window.__t;
      const M = window.__monster;
      const st = M.studio;
      M.actions.updateSettings({ ageMode: mode });
      M.setState({ project: { ...M.getState().project, tempo } });
      st.startRecording(); // the Bloop loop starts at once
      await T.sleep(700);
      T.reset();
      const boom = T.track('boom').id;
      // Start between grid lines, as a finger would.
      await T.until(st.transport.timeAt(Math.floor(st.transport.beatAt(T.now())) + 2.37));
      const startBeat = st.transport.beatAt(T.now());
      const id = st.startRoll(boom, 3, { vel: 0.8 });
      await T.sleep(2000);
      st.stopRoll(id);
      const released = T.now();
      await T.sleep(400);
      st.stopRecording();
      const hits = T.trig.filter((x) => x.ch === boom && x.pad === 3);
      const notes = T.notes('boom').filter((n) => n.step === 3).map((n) => n.beat);
      st.stop();
      return {
        beats: hits.map((x) => x.beat),
        startBeat,
        afterRelease: hits.filter((x) => x.when > released + 0.15).length,
        notes,
        rolls: st.debug().rolls,
      };
    },
    { mode, tempo },
  );
  const onGrid = roll.beats.every((b) => Math.abs(b / grid - Math.round(b / grid)) < 1e-6);
  const steps = roll.beats.slice(1).map((b, i) => +(b - roll.beats[i]).toFixed(6));
  const consecutive = steps.every((d) => Math.abs(d - grid) < 1e-6);
  const firstOk = roll.beats.length > 0 && roll.beats[0] > roll.startBeat && roll.beats[0] - roll.startBeat <= grid + 0.1;
  check(
    `${mode}: a held roll plays on consecutive grid lines (from the next line on)`,
    roll.beats.length >= 4 && onGrid && consecutive && firstOk,
    `${roll.beats.length} hits from ${roll.beats[0]?.toFixed(3)} (held at ${roll.startBeat.toFixed(3)})`,
  );
  const slots = roll.notes.map((b) => Math.round(b / grid));
  check(
    `${mode}: recorded roll hits sit exactly on grid beats, one per slot`,
    roll.notes.length >= 4 && roll.notes.every((b) => multipleOf(b, grid)) && new Set(slots).size === slots.length,
    roll.notes.join(' '),
  );
  check(`${mode}: letting go stops the roll`, roll.afterRelease === 0 && roll.rolls === 0);
}

// Nothing playing: the roll runs on its own clock and follows the speed.
const solo = await page.evaluate(async () => {
  const T = window.__t;
  const M = window.__monster;
  const st = M.studio;
  M.actions.updateSettings({ ageMode: 'little' });
  M.setState({ project: { ...M.getState().project, tempo: 100 } });
  st.stop();
  T.reset();
  const boom = T.track('boom').id;
  const id = st.startRoll(boom, 2, { vel: 0.8 });
  await T.sleep(1500);
  M.setState({ project: { ...M.getState().project, tempo: 140 } });
  const changed = T.now();
  await T.sleep(1500);
  const soloOn = st.debug().soloRoll;
  st.stopRoll(id);
  const released = T.now();
  await T.sleep(300);
  const hits = T.trig.filter((x) => x.ch === boom && x.pad === 2).map((x) => x.when);
  const gaps = hits.slice(1).map((w, i) => w - hits[i]);
  const before = gaps.filter((_, i) => hits[i + 1] < changed - 0.15);
  const after = gaps.filter((_, i) => hits[i] > changed + 0.15);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  return {
    before: avg(before),
    after: avg(after),
    soloOn,
    soloAfter: st.debug().soloRoll,
    lateHits: hits.filter((w) => w > released + 0.15).length,
    recorded: T.notes('boom').filter((n) => n.step === 2).length,
  };
});
check(
  'a roll with nothing playing keeps eighths at the song speed and follows a speed change',
  Math.abs(solo.before - 0.3) < 0.003 && Math.abs(solo.after - 60 / 140 / 2) < 0.003 && solo.soloOn,
  `${(solo.before * 1000).toFixed(1)} ms → ${(solo.after * 1000).toFixed(1)} ms`,
);
check('letting go of a roll with nothing playing stops it (and records nothing)', solo.lateHits === 0 && !solo.soloAfter && solo.recorded === 0);

// ── 9. A take is one undo step, even with an effect tapped in the middle ───
await fresh('little', 'bloop');
const take = await page.evaluate(async () => {
  const T = window.__t;
  const M = window.__monster;
  const st = M.studio;
  const before = M.getState().past.length;
  const echoBefore = T.track('bloop').fx.echo;
  st.startRecording();
  await T.until(T.now() + 0.05);
  const bloop = T.track('bloop').id;
  let id = st.press(bloop, 2, { vel: 0.8 });
  setTimeout(() => st.release(id), 80);
  await T.sleep(400);
  document.querySelector('.tool-btn:not(.tool-costume)')?.click();
  await T.sleep(300);
  id = st.press(bloop, 4, { vel: 0.8 });
  setTimeout(() => st.release(id), 80);
  await T.sleep(300);
  st.stopRecording();
  st.stop();
  const steps = M.getState().past.length - before;
  const notes = T.notes('bloop').length;
  const echoDuring = T.track('bloop').fx.echo;
  st.undo();
  return { steps, notes, echoDuring, echoBefore, after: T.notes('bloop').length, echoAfter: T.track('bloop').fx.echo };
});
check(
  'a take with an effect tapped mid-way is one undo step',
  take.steps === 1 && take.notes === 2 && take.echoDuring !== take.echoBefore && take.after === 0 && take.echoAfter === take.echoBefore,
  JSON.stringify(take),
);

// ── 10. Computer keyboard plays only the pads on screen ────────────────────
await fresh('little', 'boom');
const keyJ = async () => {
  await page.evaluate(() => window.__t.reset());
  await page.keyboard.down('j');
  await page.waitForTimeout(80);
  const r = await page.evaluate(() => ({ on: window.__t.on.map((o) => o.pad), live: window.__monster.studio.debug().live }));
  await page.keyboard.up('j');
  return r;
};
const littleJ = await keyJ();
check('Little mode: J plays nothing (only six drums on screen)', littleJ.on.length === 0 && littleJ.live === 0, JSON.stringify(littleJ));
await page.evaluate(() => window.__monster.actions.updateSettings({ ageMode: 'maker' }));
await page.waitForTimeout(100);
const makerJ = await keyJ();
check('Maker mode: J plays the seventh drum', makerJ.on.length === 1 && makerJ.on[0] === 6, JSON.stringify(makerJ));

// ── 11. Glows: repeated notes keep a key lit until the last glow ends ──────
const glowKept = await page.evaluate(async () => {
  const T = window.__t;
  const boom = T.track('boom').id;
  const key = document.querySelectorAll('.keys .key')[1];
  T.emitNote({ trackId: boom, monster: 'boom', step: 1, vel: 0.8, dur: 0.4, source: 'loop' });
  await T.sleep(250);
  T.emitNote({ trackId: boom, monster: 'boom', step: 1, vel: 0.8, dur: 0.4, source: 'loop' });
  await T.sleep(250);
  const mid = key.dataset.glow;
  await T.sleep(250);
  return { mid, end: key.dataset.glow };
});
check('a key glowing for repeated notes stays lit until the last one ends', glowKept.mid === 'true' && glowKept.end === 'false', JSON.stringify(glowKept));

// ── 12. Frames rest while stopped, and come back at once on play ───────────
const frames = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  st.stop();
  await T.sleep(900);
  const restStart = T.frames;
  await T.sleep(500);
  const resting = T.frames - restStart;
  st.play();
  await T.sleep(120);
  const playing = T.frames - restStart - resting;
  st.stop();
  await T.sleep(50);
  const stoppedFrame = T.lastFrame?.playing === false;
  return { resting, playing, stoppedFrame };
});
check(
  'frames rest while stopped, resume on play, and a final stopped frame is sent',
  frames.resting === 0 && frames.playing >= 3 && frames.stoppedFrame,
  JSON.stringify(frames),
);

// ── 13. The finale lands exactly on the last downbeat ──────────────────────
await fresh('little', 'bloop', 'band');
const finale = await page.evaluate(async () => {
  const T = window.__t;
  const M = window.__monster;
  const st = M.studio;
  const p = M.getState().project;
  // A one-block song at full speed keeps the wait short.
  M.setState({ project: { ...p, tempo: 140, arrangement: { ...p.arrangement, length: 1, rows: Object.fromEntries(Object.entries(p.arrangement.rows).map(([k, v]) => [k, v.slice(0, 1)])) } } });
  M.actions.setScreen('blocks');
  await T.sleep(100);
  let finaleEvent = false;
  const { onStudioEvent } = M.bus;
  const off = onStudioEvent((e) => e.type === 'finale' && (finaleEvent = true));
  T.reset();
  st.play();
  await T.sleep(4300);
  off();
  const end = st.transport.timeAt(8);
  const boom = T.track('boom').id;
  const spark = T.track('spark').id;
  const onEnd = T.trig.filter((x) => Math.abs(x.when - end) < 0.001);
  const pastEnd = T.trig.filter((x) => x.when > end + 0.001);
  M.actions.setScreen('lab');
  return {
    crash: onEnd.some((x) => x.ch === boom && x.pad === 5),
    kick: onEnd.some((x) => x.ch === boom && x.pad === 0),
    tada: onEnd.some((x) => x.ch === spark),
    pastEndAllTada: pastEnd.every((x) => x.ch === spark),
    finaleEvent,
    playing: M.getState().transport.playing,
  };
});
check(
  'the finale (crash, kick and ta-da) lands exactly on the last downbeat',
  finale.crash && finale.kick && finale.tada && finale.pastEndAllTada && finale.finaleEvent && !finale.playing,
  JSON.stringify(finale),
);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
