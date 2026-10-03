// Beat Hop (the step grid on the back of the Lab keys), for Boom:
//   the flip and the grid face (rows, Little/Maker), the first stone starting the
//   loop from its own beat, stones heard on the beat (catch-up scheduling, previews
//   on sixteenth lines), swipes and wand bursts as one undo step, no recording under
//   the grid (a take ends as one step when the grid appears), Blocks rows and
//   'loop-created', drum takes stored exactly on the grid, the tidy magnet (both
//   faces), keyboard use, entry points (Make a beat, Blocks, Coach), the beat you can
//   see (beam, hopper, key-panel pulse), and review regressions: rows that never vanish
//   under a finger, sliding taps (real touch), two fingers as one undo step, no doubled
//   hits from the wand while playing, previews after Stop/Play, the face kept across
//   monsters, keyboard focus (flip, drum pictures, the '+' tray), ruler taps, high
//   contrast; then target sizes at four screen sizes with up to 8 drums (extra drums
//   fold behind '+N' and keep playing) and axe on the whole page.
// Usage: node scripts/e2e-steps.mjs [url]
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

/** A fresh app (its own storage), awake, hints off unless asked. */
async function openApp(viewport = { width: 1024, height: 768 }, settings = {}, { touch = false } = {}) {
  const ctx = await browser.newContext(touch ? { viewport, isMobile: true, hasTouch: true } : { viewport });
  // Count imperative animations on the key panel's beat light and the hopper.
  await ctx.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.__anims = { light: 0, hopper: 0, keys: 0, stone: 0 };
    Element.prototype.animate = function (frames, opts) {
      if (this.classList?.contains('beat-light')) window.__anims.light++;
      if (this.classList?.contains('stone')) window.__anims.stone++;
      if (this.classList?.contains('hopper')) window.__anims.hopper++;
      if (this.classList?.contains('keys')) window.__anims.keys++;
      return animate.call(this, frames, opts);
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  if (touch) await page.touchscreen.tap(viewport.width / 2, viewport.height / 2);
  else await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(() => window.__monster.studio.debug().state === 'running');
  await page.evaluate(async (settings) => {
    const M = window.__monster;
    M.actions.updateSettings({ hints: false, motion: 'full', ...settings });
    const st = M.studio;
    const eng = st.engine;
    const ac = st.audioContext;
    const edits = await import('/src/model/edits.ts');
    const steps = await import('/src/magic/steps.ts');
    const grooves = await import('/src/magic/grooves.ts');
    const monsters = await import('/src/model/monsters.ts');
    const T = {
      trig: [],
      on: [],
      sched: [],
      events: [],
      edits,
      steps,
      grooves,
      monsters,
      reset() {
        T.trig = [];
        T.on = [];
        T.sched = [];
        T.events = [];
      },
      now: () => ac.currentTime,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      until: (time) =>
        new Promise((resolve) => {
          const poll = () => (ac.currentTime >= time ? resolve() : setTimeout(poll, 1));
          poll();
        }),
      track: (monster) => M.getState().project.tracks.find((t) => t.monster === monster),
      notes: (monster) => {
        const t = T.track(monster);
        return t?.clips.find((c) => c.id === t.activeClipId)?.notes ?? [];
      },
      sig: (notes) =>
        notes
          .map((n) => `${n.step}@${n.beat}`)
          .sort()
          .join(' '),
    };
    // Live sounds (auditions, drum pictures, the ruler) start voices at once.
    const noteOn = eng.noteOn.bind(eng);
    eng.noteOn = (req) => {
      T.on.push({ ch: req.channelId, pad: req.pad, at: ac.currentTime });
      return noteOn(req);
    };
    const trigger = eng.trigger.bind(eng);
    eng.trigger = (req, when, dur) => {
      T.trig.push({ ch: req.channelId, pad: req.pad, when, at: ac.currentTime, beat: st.transport.playing ? st.transport.beatAt(when) : null });
      return trigger(req, when, dur);
    };
    const schedule = st.schedule.bind(st);
    st.schedule = (e, when) => {
      if (e.note) T.sched.push({ absBeat: e.absBeat, id: e.note.id, step: e.note.step, ch: e.channelId, at: ac.currentTime });
      return schedule(e, when);
    };
    M.bus.onStudioEvent((e) => T.events.push(e.type));
    /** Replace Boom's loop (stopped, no sound). */
    T.setBoom = (notes) => {
      const boom = T.track('boom').id;
      M.studio.stepEdit(boom, (p) => edits.replaceLoopNotes(p, boom, notes), { col: 0, preview: 'none' });
      M.studio.stop();
    };
    T.n = (step, beat, id = `x${step}_${beat}`) => ({ id, beat, step, dur: 0.5, vel: 0.8, tone: 0 });
    T.rows = () => [...document.querySelectorAll('.step-grid .drum-row')].map((r) => Number(r.dataset.pad));
    window.__t = T;
  }, settings);
  return { ctx, page };
}

/** A fresh song in `mode`, Boom in the spotlight, on the keys or the grid. */
async function fresh(page, mode, face = 'grid', kind = 'blank') {
  await page.evaluate(
    async ({ mode, face, kind }) => {
      const M = window.__monster;
      M.studio.stop();
      M.actions.updateSettings({ ageMode: mode });
      await M.actions.newSong(kind);
      M.actions.selectTrack(M.getState().project.tracks.find((t) => t.monster === 'boom').id);
      M.actions.setLabView(face);
      window.__t.reset();
    },
    { mode, face, kind },
  );
  await page.waitForTimeout(250);
}

const stoneAt = (page, pad, col) => page.locator(`.step-grid .stone[data-pad="${pad}"][data-col="${col}"]`);
const center = async (page, pad, col) => {
  const b = await stoneAt(page, pad, col).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const tapStone = async (page, pad, col) => {
  const [x, y] = await center(page, pad, col);
  await page.mouse.click(x, y);
};
const S = (page) => page.evaluate(() => window.__monster.getState());
const boomNotes = (page) => page.evaluate(() => window.__t.notes('boom').map((n) => [n.beat, n.step]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
const multipleOf = (b, g) => Math.abs(b / g - Math.round(b / g)) < 1e-9;

const { ctx, page } = await openApp();

// ── 1. The flip button and the grid face ────────────────────────────────────
await fresh(page, 'little', 'keys');
await page.evaluate(() => window.__monster.actions.selectTrack(window.__t.track('bloop').id));
await page.waitForTimeout(150);
check('no flip button for a melodic monster (its grid comes later)', (await page.locator('.surface-flip').count()) === 0);
await page.evaluate(() => window.__monster.actions.selectTrack(window.__t.track('boom').id));
await page.waitForTimeout(150);
const flipBefore = await page.locator('.surface-flip').getAttribute('aria-pressed');
await page.locator('.surface-flip').click();
await page.waitForTimeout(200);
const little = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.step-grid .drum-row')].map((r) => Number(r.dataset.pad)),
  stones: document.querySelectorAll('.step-grid .stone').length,
  keys: document.querySelectorAll('.keys').length,
  pressed: document.querySelector('.surface-flip')?.getAttribute('aria-pressed'),
  view: document.querySelector('.lab')?.dataset.view,
  appView: document.querySelector('.app')?.dataset.labview,
  numbers: document.querySelectorAll('.ruler-num').length,
  stars: document.querySelectorAll('.ruler-star').length,
}));
check(
  'Little: the flip shows Boom\'s grid: tiny cymbal, snappy drum, big drum × 8 beats, and the keys are gone',
  JSON.stringify(little.rows) === '[2,1,0]' && little.stones === 24 && little.keys === 0 && little.view === 'grid' && little.appView === 'grid',
  JSON.stringify(little),
);
check('the flip button is a toggle (aria-pressed false → true)', flipBefore === 'false' && little.pressed === 'true');
check('the ruler: a star on each bar start, no numbers for Little Monsters', little.stars === 2 && little.numbers === 0);
await fresh(page, 'maker', 'grid');
const maker = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.step-grid .drum-row')].map((r) => Number(r.dataset.pad)),
  numbers: [...document.querySelectorAll('.ruler-num')].map((n) => n.textContent).join(''),
}));
check('Maker: four rows (cymbal, clap, snappy, big drum) and beat numbers 1–8', JSON.stringify(maker.rows) === '[2,3,1,0]' && maker.numbers === '12345678', JSON.stringify(maker));
await fresh(page, 'little', 'grid', 'band');
const bandRows = await page.evaluate(() => [...document.querySelectorAll('.step-grid .drum-row')].map((r) => Number(r.dataset.pad)));
check('a drum the loop already plays gets its own row (the band clap)', JSON.stringify(bandRows) === '[2,3,1,0]', JSON.stringify(bandRows));
const bandStates = await page.evaluate(() => [...document.querySelectorAll('.step-grid .stone[data-pad="0"]')].map((s) => s.dataset.state).join(','));
check('the band kick shows on the beat, and its "ands" as partly lit stones', bandStates === 'one,custom,one,off,one,custom,one,off', bandStates);

// ── 2. The first stone starts the loop from its own beat ────────────────────
await fresh(page, 'little', 'grid');
const armed = await page.evaluate(() => window.__monster.studio.debug().gridAutoStart);
await tapStone(page, 0, 3);
const started = await page.evaluate(() => {
  const st = window.__monster.studio;
  const d = st.debug();
  return { playing: d.playing, beat: d.beat, first: window.__t.sched[0] };
});
check('the grid arms auto-start when it opens', armed === true);
check(
  'stopped: tapping big drum on beat 4 starts the loop from beat 4, and that stone is the first sound',
  started.playing && Math.abs(started.beat - 3) < 0.15 && started.first?.absBeat === 3 && started.first?.step === 0,
  `beat ${started.beat.toFixed(3)}, first ${JSON.stringify(started.first)}`,
);

// ── 3. Stones play on the beat, and pop when they sound ─────────────────────
await tapStone(page, 0, 0);
await tapStone(page, 1, 1);
await page.waitForTimeout(200);
const popped = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let seen = false;
      const obs = new MutationObserver(() => {
        if (document.querySelector('.step-grid .stone-ring')) seen = true;
      });
      obs.observe(document.querySelector('.step-grid'), { subtree: true, childList: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(seen);
      }, 5200);
    }),
);
const three = await boomNotes(page);
check('three taps store big drum on 1 and 4, snappy drum on 2, at exact beats', JSON.stringify(three) === '[[0,0],[1,1],[3,0]]', JSON.stringify(three));
const heardOnGrid = await page.evaluate(() => {
  const boom = window.__t.track('boom').id;
  const hits = window.__t.sched.filter((s) => s.ch === boom);
  return { n: hits.length, offGrid: hits.filter((h) => Math.abs(h.absBeat - Math.round(h.absBeat)) > 1e-9).length };
});
check('every loop hit of the grid lands exactly on a beat', heardOnGrid.n >= 4 && heardOnGrid.offGrid === 0, JSON.stringify(heardOnGrid));
check('a stone pops (ring) when its note sounds', popped);

// ── 4. Catch-up: a stone added inside the scheduled window plays this pass ──
const catchUp = await page.evaluate(async () => {
  const T = window.__t;
  const M = window.__monster;
  const st = M.studio;
  const boom = T.track('boom').id;
  // Wait until the transport has handed out the next beat line while it is still ahead of us.
  for (let i = 0; i < 400; i++) {
    const d = st.debug();
    const line = Math.ceil(d.beat);
    if (line - d.beat > 0.02 && line < d.scheduledUntil - 0.01) {
      const col = ((line % 8) + 8) % 8;
      const cell = T.steps.cellState(T.notes('boom'), 3, col, 8);
      if (cell === 'off') {
        const w = { step: 3, col, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 };
        T.reset();
        st.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, w), { col, preview: 'tap' });
        await T.sleep(400);
        const at = T.trig.filter((x) => x.ch === boom && x.pad === 3);
        return { line, scheduledUntil: d.scheduledUntil, now: d.beat, hits: at.map((x) => x.beat) };
      }
    }
    await T.sleep(3);
  }
  return null;
});
check(
  'catch-up: a clap added for a beat already handed out plays in this very pass, once',
  !!catchUp && catchUp.hits.length === 1 && Math.abs(catchUp.hits[0] - catchUp.line) < 1e-6,
  JSON.stringify(catchUp),
);

// ── 5. Previews while playing wait for the next sixteenth line ──────────────
const preview = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  const boom = T.track('boom').id;
  const d = st.debug();
  // A snappy drum two to four beats ahead, where there is none yet.
  const col = [3, 4, 2].map((k) => (Math.floor(d.beat) + k) % 8).find((c) => T.steps.cellState(T.notes('boom'), 1, c, 8) === 'off');
  const w = { step: 1, col, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 };
  const before = st.debug().lastPreview;
  const nowBeat = st.debug().beat;
  st.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, w), { col, preview: 'tap' });
  const p = st.debug().lastPreview;
  return { changed: p !== before, beat: p?.beat, nowBeat, aligned: p ? Math.abs(p.when - st.transport.timeAt(p.beat)) < 1e-9 : false };
});
check(
  'a preview while playing lands on a sixteenth line, at most a sixteenth (plus a hair) ahead',
  preview.changed && preview.beat % 0.25 === 0 && preview.beat > preview.nowBeat && preview.beat - preview.nowBeat <= 0.31 && preview.aligned,
  JSON.stringify(preview),
);
await page.evaluate(() => window.__monster.studio.stop());

// ── 6. A swipe is one undo step ─────────────────────────────────────────────
await fresh(page, 'little', 'grid');
await page.evaluate(() => window.__monster.studio.play());
const pastBefore = (await S(page)).past.length;
{
  const [x0, y] = await center(page, 2, 0);
  const [x7] = await center(page, 2, 7);
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(x0 + ((x7 - x0) * i) / 14, y, { steps: 2 });
  await page.mouse.up();
}
await page.waitForTimeout(150);
const swiped = await page.evaluate(() => window.__t.notes('boom').filter((n) => n.step === 2).length);
const pastAfter = (await S(page)).past.length;
await page.evaluate(() => window.__monster.studio.undo());
await page.waitForTimeout(100);
const afterUndo = await page.evaluate(() => window.__t.notes('boom').length);
check('a swipe across the tiny cymbal row lights 8 doubles (16 hits)', swiped === 16, `${swiped}`);
check('the whole swipe is one undo step', pastAfter - pastBefore === 1 && afterUndo === 0, `${pastAfter - pastBefore} step(s), ${afterUndo} left`);
await page.evaluate(() => window.__monster.studio.stop());

// Erase swipe: starting on a lit stone erases what the finger crosses.
await page.evaluate(() => {
  const T = window.__t;
  const st = window.__monster.studio;
  const boom = T.track('boom').id;
  st.stop();
  for (const col of [0, 1, 2, 3]) {
    const w = { step: 0, col, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 };
    st.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, w), { col, preview: 'none' });
  }
  st.stop();
});
{
  const [x0, y] = await center(page, 0, 0);
  const [x3] = await center(page, 0, 3);
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x3, y, { steps: 8 });
  await page.mouse.up();
}
await page.waitForTimeout(120);
check('a swipe that starts on a lit stone erases the stones it crosses', (await boomNotes(page)).length === 0, JSON.stringify(await boomNotes(page)));

// ── Little: a tap on a lit stone turns it off; Maker cycles one → double → off ─
await fresh(page, 'little', 'grid');
await page.evaluate(() => window.__monster.studio.stop());
await tapStone(page, 1, 2);
await tapStone(page, 1, 2);
check('Little: tapping a lit stone turns it off', (await boomNotes(page)).length === 0);
await tapStone(page, 2, 5);
check('Little: the tiny cymbal turns on as a double (tss-tss)', JSON.stringify(await boomNotes(page)) === '[[5,2],[5.5,2]]', JSON.stringify(await boomNotes(page)));
await fresh(page, 'maker', 'grid');
await page.evaluate(() => window.__monster.studio.stop());
const cycle = [];
for (let i = 0; i < 3; i++) {
  await tapStone(page, 0, 6);
  cycle.push(await stoneAt(page, 0, 6).getAttribute('data-state'));
}
check('Maker: a stone cycles one → double → off (two pips for a double)', cycle.join(',') === 'one,double,off', cycle.join(','));
// A partly lit stone (a hit on the "and") becomes the row default.
await page.evaluate(() => {
  const T = window.__t;
  const boom = T.track('boom').id;
  window.__monster.studio.stepEdit(boom, (p) => T.edits.replaceLoopNotes(p, boom, [{ id: 'and1', beat: 1.5, step: 0, dur: 0.5, vel: 0.7, tone: 0 }]), { col: 1, preview: 'none' });
  window.__monster.studio.stop();
});
await page.waitForTimeout(80);
const partState = await stoneAt(page, 0, 1).getAttribute('data-state');
await tapStone(page, 0, 1);
check('a partly lit stone becomes a whole one on the beat', partState === 'custom' && JSON.stringify(await boomNotes(page)) === '[[1,0]]', `${partState} → ${JSON.stringify(await boomNotes(page))}`);

// A full beat says no: a fifth drum in one beat is refused and nothing is taken away.
const full = await page.evaluate(async () => {
  const T = window.__t;
  const boom = T.track('boom').id;
  const notes = [0, 1, 2, 3].map((pad) => ({ id: `f${pad}`, beat: 4, step: pad, dur: 0.5, vel: 0.8, tone: 0 }));
  window.__monster.studio.stepEdit(boom, (p) => T.edits.replaceLoopNotes(p, boom, notes), { col: 4, preview: 'none' });
  window.__monster.studio.stop();
  return T.sig(T.notes('boom'));
});
await page.locator('.grid-add-head').click();
await page.waitForTimeout(150);
const pickerPads = await page.locator('.grid-picker .picker-pad').count();
await page.locator('.grid-picker .picker-pad').first().click();
await page.waitForTimeout(150);
const addedPad = await page.evaluate(() => Number([...document.querySelectorAll('.step-grid .drum-row')].map((r) => r.dataset.pad).find((p) => !['0', '1', '2', '3'].includes(p))));
const stoneAnims = await page.evaluate(() => window.__anims.stone);
await tapStone(page, addedPad, 4);
await page.waitForTimeout(60);
const wobble = await page.evaluate((a0) => ({ anims: window.__anims.stone - a0, sig: window.__t.sig(window.__t.notes('boom')) }), stoneAnims);
check("Maker '+': a picker of the drums without a row (4), and picking one adds its row", pickerPads === 4 && addedPad >= 4, `${pickerPads} pads, row ${addedPad}`);
check('a fifth drum in one beat wobbles "no" and nothing is taken away', wobble.anims > 0 && wobble.sig === full, JSON.stringify(wobble));

// ── 7. The wand: three taps, three grooves, one Undo back ───────────────────
await fresh(page, 'little', 'grid');
await tapStone(page, 0, 0);
await tapStone(page, 1, 6);
await page.evaluate(() => window.__monster.studio.stop());
const own = await page.evaluate(() => window.__t.sig(window.__t.notes('boom')));
const wand = [];
for (let i = 0; i < 3; i++) {
  await page.locator('.t-surprise').click();
  await page.waitForTimeout(120);
  wand.push(await page.evaluate(() => ({ sig: window.__t.sig(window.__t.notes('boom')), playing: window.__monster.studio.debug().playing })));
}
const cascade = await page.evaluate(() => [...document.querySelectorAll('.step-grid .stone-face')].some((f) => f.getAnimations().length > 0));
await page.evaluate(() => window.__monster.studio.undo());
await page.waitForTimeout(100);
const back = await page.evaluate(() => window.__t.sig(window.__t.notes('boom')));
check('each wand tap stamps a different groove (and starts the loop)', new Set([own, ...wand.map((w) => w.sig)]).size === 4 && wand.every((w) => w.playing), wand.map((w) => w.sig.split(' ').length).join(','));
check('wand grooves pop in left to right', cascade);
check('one Undo after three wand taps brings back the child\'s own beat', back === own, back);
const wandStart = await page.evaluate(async () => {
  const st = window.__monster.studio;
  st.stop();
  window.__t.reset();
  document.querySelector('.t-surprise').click();
  return { beat: st.debug().beat, first: window.__t.sched[0]?.absBeat };
});
check('the wand starts a stopped loop from beat 1', wandStart.first === 0 && Math.abs(wandStart.beat) < 0.15, JSON.stringify(wandStart));
await page.evaluate(() => window.__monster.studio.stop());

// ── 8. No recording under the grid ──────────────────────────────────────────
const noRec = await page.evaluate(async () => {
  const M = window.__monster;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
  await new Promise((r) => setTimeout(r, 50));
  const afterKey = M.getState().transport;
  M.studio.startRecording();
  const afterCall = M.getState().transport;
  return {
    rec: document.querySelectorAll('.t-rec').length,
    wand: document.querySelectorAll('.t-magic.t-surprise').length,
    label: document.querySelector('.t-surprise .t-label')?.textContent,
    key: afterKey.recording || afterKey.armed,
    call: afterCall.recording || afterCall.armed,
  };
});
check("under the grid, Record's place holds the Surprise wand", noRec.rec === 0 && noRec.wand === 1 && noRec.label === 'Surprise', JSON.stringify(noRec));
check('R and startRecording() do nothing under the grid', !noRec.key && !noRec.call);

// ── 9. The grid appearing mid-take ends the take as one undo step ───────────
await fresh(page, 'little', 'keys', 'band');
const take = await page.evaluate(async () => {
  const M = window.__monster;
  const T = window.__t;
  const st = M.studio;
  const boom = T.track('boom').id;
  const before = { past: M.getState().past.length, sig: T.sig(T.notes('boom')) };
  st.startRecording();
  await T.sleep(250);
  for (const pad of [4, 5, 4]) {
    st.hit(boom, pad, { vel: 0.8 });
    await T.sleep(260);
  }
  document.querySelector('.surface-flip').click();
  await T.sleep(100);
  const t = M.getState().transport;
  const after = { past: M.getState().past.length, sig: T.sig(T.notes('boom')), recording: t.recording || t.armed };
  st.undo();
  await T.sleep(50);
  return { before, after, undone: T.sig(T.notes('boom')) };
});
check('flipping to the grid stops the take', !take.after.recording && take.after.sig !== take.before.sig);
check('…and the take (with its notes) is exactly one undo step', take.after.past - take.before.past === 1 && take.undone === take.before.sig, `${take.after.past - take.before.past} step(s)`);
await page.evaluate(() => window.__monster.studio.stop());

// ── 10. Blocks: the first stone fills Boom's row, and 'loop-created' fires ──
await fresh(page, 'little', 'grid');
const rowBefore = await page.evaluate(() => {
  const s = window.__monster.getState();
  return s.project.arrangement.rows[window.__t.track('boom').id].filter(Boolean).length;
});
await tapStone(page, 0, 0);
await page.waitForTimeout(80);
const filled = await page.evaluate(() => {
  const s = window.__monster.getState();
  const t = window.__t.track('boom');
  return { row: s.project.arrangement.rows[t.id].filter((c) => c === t.activeClipId).length, events: window.__t.events };
});
check('the first stone fills Boom\'s whole Blocks row', rowBefore === 0 && filled.row === 8, `${rowBefore} → ${filled.row}`);
check("the first stone tells the app a loop was made ('loop-created')", filled.events.includes('loop-created'), filled.events.join(','));
await page.locator('.dock-btn[data-screen="blocks"]').click();
await page.waitForTimeout(250);
const blocksRow = await page.evaluate(() => document.querySelectorAll('.block-row[data-monster="boom"] .block[data-on="true"]').length);
check('Monster Blocks shows the grid-made loop in Boom\'s row', blocksRow === 8, `${blocksRow}`);
// An empty row's monster picture opens its grid (here Bloop has a loop, Boom none yet).
await page.evaluate(async () => {
  const M = window.__monster;
  const T = window.__t;
  M.studio.stop();
  await M.actions.newSong('blank');
  const bloop = T.track('bloop').id;
  M.studio.stepEdit(bloop, (p) => T.edits.replaceLoopNotes(p, bloop, [{ id: 'b1', beat: 0, step: 2, dur: 0.5, vel: 0.8, tone: 0 }]), { col: 0, preview: 'none' });
  M.studio.stop();
  M.actions.setScreen('blocks');
});
await page.waitForTimeout(250);
await page.locator('.block-row[data-monster="boom"] .row-avatar').click();
await page.waitForTimeout(250);
const routed = await page.evaluate(() => {
  const s = window.__monster.getState();
  return { screen: s.screen, view: s.labView, boom: s.selectedTrackId === window.__t.track('boom').id, grid: !!document.querySelector('.step-grid') };
});
check("Boom's empty Blocks row opens Boom's grid in the Lab", routed.screen === 'lab' && routed.view === 'grid' && routed.boom && routed.grid, JSON.stringify(routed));

// ── 11. Drum takes on the keys are stored exactly on the grid ───────────────
for (const [mode, grid] of [
  ['little', 0.5],
  ['maker', 0.25],
]) {
  await fresh(page, mode, 'keys', 'band');
  const beats = await page.evaluate(async () => {
    const T = window.__t;
    const st = window.__monster.studio;
    const { inputCompensation } = await import('/src/audio/context.ts');
    const boom = T.track('boom').id;
    st.startRecording();
    await T.sleep(100);
    const base = Math.ceil(st.transport.beatAt(T.now())) + 1;
    const lates = [0.02, 0.05, 0.08, 0.11, 0.03, 0.07];
    for (let k = 0; k < lates.length; k++) {
      await T.until(st.transport.timeAt(base + k) + inputCompensation(st.audioContext) + lates[k]);
      const id = st.press(boom, 4 + (k % 2), { vel: 0.8 });
      setTimeout(() => st.release(id), 50);
    }
    await T.sleep(120);
    st.stopRecording();
    st.stop();
    return T.notes('boom').filter((n) => n.step >= 4).map((n) => n.beat);
  });
  check(`${mode}: Boom taps 20–110 ms late are stored on exact grid beats`, beats.length === 6 && beats.every((b) => multipleOf(b, grid)), beats.join(' '));
}

// ── 12. The tidy magnet ─────────────────────────────────────────────────────
await fresh(page, 'little', 'keys');
await page.evaluate(() => window.__monster.actions.selectTrack(window.__t.track('bloop').id));
await page.waitForTimeout(100);
const noMagnet = await page.locator('.surface-tidy').count();
const offGrid = [
  { id: 'o1', beat: 0.97, step: 2, dur: 0.5, vel: 0.8, tone: 0 },
  { id: 'o2', beat: 2.26, step: 4, dur: 0.5, vel: 0.8, tone: 0 },
  { id: 'o3', beat: 7.9, step: 5, dur: 0.5, vel: 0.8, tone: 0 },
];
await page.evaluate((notes) => {
  const T = window.__t;
  const bloop = T.track('bloop').id;
  window.__monster.studio.stepEdit(bloop, (p) => T.edits.replaceLoopNotes(p, bloop, notes), { col: 0, preview: 'none' });
  window.__monster.studio.stop();
}, offGrid);
await page.waitForTimeout(150);
const magnet = await page.locator('.surface-tidy').count();
const pastM = (await S(page)).past.length;
await page.locator('.surface-tidy').click();
await page.waitForTimeout(150);
const tidied = await page.evaluate(() => window.__t.notes('bloop').map((n) => [n.id, n.beat]));
const pastT = (await S(page)).past.length;
const magnetAfter = await page.locator('.surface-tidy').count();
await page.evaluate(() => window.__monster.studio.undo());
await page.waitForTimeout(100);
const untidied = await page.evaluate(() => window.__t.notes('bloop').map((n) => n.beat));
check('the magnet appears only when a loop has notes off the grid (keys face, a melodic monster)', noMagnet === 0 && magnet === 1);
check('the magnet pulls every note onto the grid, keeping ids (late notes wrap to beat 1)', JSON.stringify(tidied) === '[["o1",1],["o2",2.5],["o3",0]]' && magnetAfter === 0, JSON.stringify(tidied));
check('tidying is one undo step', pastT - pastM === 1 && JSON.stringify(untidied) === JSON.stringify(offGrid.map((n) => n.beat)), `${pastT - pastM}; ${untidied.join(',')}`);
// On the grid face too: hits played a little early or late slide into their slots.
await fresh(page, 'little', 'grid');
await page.evaluate(() => {
  const T = window.__t;
  const boom = T.track('boom').id;
  window.__monster.studio.stepEdit(boom, (p) => T.edits.replaceLoopNotes(p, boom, [{ id: 'k1', beat: 1.76, step: 0, dur: 0.5, vel: 0.8, tone: 0 }, { id: 'k2', beat: 4.2, step: 1, dur: 0.5, vel: 0.8, tone: 0 }]), { col: 0, preview: 'none' });
  window.__monster.studio.stop();
});
await page.waitForTimeout(120);
const gridMagnet = await page.locator('.step-grid').evaluate((g) => !!g.closest('.surface').querySelector('.surface-tidy'));
await page.locator('.surface-tidy').click();
await page.waitForTimeout(60);
const flipping = await page.evaluate(() => ({ flip: document.querySelector('.step-grid').dataset.flip, moving: [...document.querySelectorAll('.step-grid .stone-face')].some((f) => f.getAnimations().length > 0) }));
check('the magnet sits beside the grid too, and stones slide to their slots', gridMagnet && flipping.flip === 'true' && flipping.moving, JSON.stringify(flipping));
check('…onto the eighth grid (a late big drum crosses into the next beat)', JSON.stringify(await boomNotes(page)) === '[[2,0],[4,1]]', JSON.stringify(await boomNotes(page)));

// ── Keyboard: arrows move between stones (not monsters), Enter taps, ⇧G flips ─
await fresh(page, 'little', 'grid');
await page.evaluate(() => window.__monster.studio.stop());
const kb = await page.evaluate(async () => {
  const M = window.__monster;
  const sel = M.getState().selectedTrackId;
  const first = document.querySelector('.step-grid .stone[tabindex="0"]');
  first.focus();
  const key = (k, extra = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  key('ArrowRight');
  await new Promise((r) => setTimeout(r, 30));
  key('ArrowRight');
  await new Promise((r) => setTimeout(r, 30));
  key('ArrowUp');
  await new Promise((r) => setTimeout(r, 30));
  const at = document.activeElement;
  key('Enter');
  await new Promise((r) => setTimeout(r, 60));
  const notes = window.__t.notes('boom').map((n) => [n.beat, n.step]);
  const tabbable = document.querySelectorAll('.step-grid .stone[tabindex="0"]').length;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true }));
  await new Promise((r) => setTimeout(r, 60));
  const view = M.getState().labView;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true }));
  await new Promise((r) => setTimeout(r, 60));
  return {
    first: [first.dataset.pad, first.dataset.col],
    at: [at.dataset.pad, at.dataset.col],
    sameMonster: M.getState().selectedTrackId === sel,
    notes,
    tabbable,
    view,
    back: M.getState().labView,
    role: document.querySelector('.step-grid .grid-rows').getAttribute('role'),
  };
});
check('keyboard: focus starts on big drum beat 1 and arrows move between stones (one tab stop)', kb.first.join() === '0,0' && kb.at.join() === '1,2' && kb.tabbable === 1 && kb.role === 'grid', JSON.stringify(kb));
check('arrows inside the grid never switch monsters; Enter lights the stone', kb.sameMonster && JSON.stringify(kb.notes) === '[[2,1]]', JSON.stringify(kb.notes));
check('⇧G flips the keys over and back', kb.view === 'keys' && kb.back === 'grid', `${kb.view} → ${kb.back}`);

// ── The beat you can see: beam, hopper, key-panel pulse ─────────────────────
await fresh(page, 'little', 'grid', 'band');
await page.evaluate(() => window.__monster.studio.play());
const seen = await page.evaluate(async () => {
  const g = document.querySelector('.step-grid');
  const cols = new Set();
  const hop0 = window.__anims.hopper;
  for (let i = 0; i < 40; i++) {
    cols.add(g.dataset.now);
    await new Promise((r) => setTimeout(r, 60));
  }
  const beam = document.querySelector('.grid-beam');
  return { cols: [...cols].filter((c) => c !== '-1').length, hops: window.__anims.hopper - hop0, beam: getComputedStyle(beam).opacity, nowDot: !!document.querySelector('.ruler-slot[data-now="true"]') };
});
check('the playhead beam walks the beats and the ruler dot grows', seen.cols >= 3 && Number(seen.beam) > 0.5 && seen.nowDot, JSON.stringify(seen));
check('the mini monster hops along the ruler on the beat', seen.hops >= 3, `${seen.hops} hops`);
await page.evaluate(() => window.__monster.actions.setLabView('keys'));
const pulses = await page.evaluate(async () => {
  const l0 = window.__anims.light;
  const k0 = window.__anims.keys;
  await new Promise((r) => setTimeout(r, 2600));
  return { light: window.__anims.light - l0, keys: window.__anims.keys - k0 };
});
check('the key panel breathes on every beat (stronger on bar starts)', pulses.light >= 3 && pulses.keys >= 1, JSON.stringify(pulses));
await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'reduce' }));
const quiet = await page.evaluate(async () => {
  const l0 = window.__anims.light;
  window.__monster.actions.setLabView('grid');
  await new Promise((r) => setTimeout(r, 200));
  const h0 = window.__anims.hopper;
  window.__monster.actions.setLabView('keys');
  await new Promise((r) => setTimeout(r, 1500));
  const light = window.__anims.light - l0;
  window.__monster.actions.setLabView('grid');
  await new Promise((r) => setTimeout(r, 1500));
  return { light, hops: window.__anims.hopper - h0, hopper: getComputedStyle(document.querySelector('.hopper')).display };
});
check('reduced motion: no key pulse, no hops (a ring marks the beat)', quiet.light === 0 && quiet.hops === 0 && quiet.hopper === 'none', JSON.stringify(quiet));
await page.evaluate(() => {
  window.__monster.actions.updateSettings({ motion: 'full' });
  window.__monster.studio.stop();
});

// ── Make a beat (Songs shelf) ───────────────────────────────────────────────
await page.locator('.dock-btn[data-screen="songs"]').click();
await page.waitForTimeout(250);
await page.locator('.song-beat').click();
await page.waitForTimeout(500);
const beat = await page.evaluate(() => {
  const s = window.__monster.getState();
  const g = document.querySelector('.step-grid');
  return {
    screen: s.screen,
    boom: s.project.tracks.find((t) => t.id === s.selectedTrackId)?.monster,
    empty: g?.dataset.empty,
    invite: [...document.querySelectorAll('.stone[data-invite="true"]')].map((el) => `${el.dataset.pad}:${el.dataset.col}`).join(' '),
    shimmer: getComputedStyle(document.querySelector('.stone[data-invite="true"] .stone-socket')).animationName,
    wand: document.querySelector('.t-surprise')?.dataset.invite,
  };
});
check("'Make a beat' opens a new song on Boom's grid", beat.screen === 'lab' && beat.boom === 'boom' && beat.empty === 'true', JSON.stringify(beat));
check('…where the big drum stones on 1 and 5 shimmer and the wand sparkles', beat.invite === '0:0 0:4' && beat.shimmer === 'stone-invite' && beat.wand === 'true', JSON.stringify(beat));
await tapStone(page, 0, 4);
await page.waitForTimeout(120);
const stopped = await page.evaluate(() => ({ empty: document.querySelector('.step-grid').dataset.empty, wand: document.querySelector('.t-surprise').dataset.invite }));
check('the invitation stops with the first stone', stopped.empty === 'false' && stopped.wand === 'false');
await page.evaluate(() => window.__monster.studio.stop());

// ── Pulse: under the grid, a tick keeps time until Boom has a loop ──────────
const ticks = await page.evaluate(async () => {
  const M = window.__monster;
  const T = window.__t;
  await M.actions.newSong('band');
  const boom = T.track('boom').id;
  M.studio.stepEdit(boom, (p) => T.edits.replaceLoopNotes(p, boom, []), { col: 0, preview: 'none' });
  M.actions.selectTrack(boom);
  M.actions.setLabView('grid');
  await T.sleep(100);
  M.studio.play();
  T.reset();
  await T.sleep(1300);
  const empty = T.trig.filter((x) => x.ch === 'metronome').length;
  const kick = { step: 0, col: 0, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 };
  M.studio.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, kick), { col: 0, preview: 'none' });
  T.reset();
  await T.sleep(1300);
  const withBeat = T.trig.filter((x) => x.ch === 'metronome').length;
  M.studio.stop();
  return { empty, withBeat };
});
check('under the grid a soft tick keeps the beat until Boom has a loop', ticks.empty >= 1 && ticks.withBeat === 0, JSON.stringify(ticks));

// ── The Coach (hints on, a fresh session) ──────────────────────────────────
{
  const coach = await openApp({ width: 1024, height: 768 }, { hints: true });
  const cp = coach.page;
  // Opening straight onto the grid: after 3 s of quiet the hand points at the first big-drum stone.
  await cp.evaluate(async () => {
    const M = window.__monster;
    await M.actions.newSong('beat');
  });
  const handOn = (selector) =>
    cp.evaluate((selector) => {
      const hand = document.querySelector('.coach-hand');
      const el = document.querySelector(selector);
      if (!hand || !el) return false;
      const r = el.getBoundingClientRect();
      return Math.abs(parseFloat(hand.style.left) - (r.left + r.width / 2)) < 2 && Math.abs(parseFloat(hand.style.top) - (r.top + r.height / 2)) < 2;
    }, selector);
  await cp.waitForTimeout(3300);
  check("Coach: on Beat Hop the first hint points at the first big-drum stone", await handOn(".step-grid .stone[data-pad='0'][data-col='0']"));
  // Drumming on Boom's keys (8 hits, no Record): the hand points at the flip button.
  await cp.evaluate(async () => {
    const M = window.__monster;
    M.actions.setLabView('keys');
    const boom = window.__t.track('boom').id;
    for (let i = 0; i < 8; i++) {
      M.studio.hit(boom, i % 3, { vel: 0.8 });
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await cp.waitForTimeout(150);
  check('Coach: 8 Boom hits without recording → the hand points at the flip button', await handOn('.surface-flip'));
  // Stones placed after Stop: the hand shows Play (once).
  await cp.evaluate(() => {
    window.__monster.actions.setLabView('grid');
    window.__monster.studio.stop();
  });
  await cp.waitForTimeout(150);
  for (const col of [0, 2, 4, 6]) await tapStone(cp, 0, col);
  await cp.waitForTimeout(150);
  check('Coach: four stones placed after Stop → the hand points at Play', await handOn('.t-play'));
  // That first stone made Boom's first loop: a moment later the hand points at another monster.
  await cp.waitForTimeout(4300);
  check('Coach: a loop made on the grid → the hand points at another monster (add a layer)', await handOn('.pod:not([data-selected="true"]) .pod-hit'));
  // Lots of grid sounds (stones, drum pictures) never count as playing the keys:
  // after them, playing the keys still leads to the Record hint.
  await cp.evaluate(async () => {
    const M = window.__monster;
    const boom = window.__t.track('boom').id;
    for (let i = 0; i < 20; i++) {
      M.studio.auditionStep(boom, i % 3, 0.6);
      await new Promise((r) => setTimeout(r, 30));
    }
    M.actions.setLabView('keys');
    for (let i = 0; i < 8; i++) {
      M.studio.hit(boom, i % 3, { vel: 0.8 });
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  await cp.waitForTimeout(150);
  check('Coach: grid sounds are not keys playing: 8 more hits on the keys (16 in all) → the hand points at Record', await handOn('.t-rec[data-state]'));
  await coach.ctx.close();
}

// ── Rows never vanish under a finger ────────────────────────────────────────
// Little has no clap row of its own: it shows because the loop has claps. Erasing
// them all (one swipe) keeps the row, so the swipe never slides onto the snares.
await fresh(page, 'little', 'grid');
await page.evaluate(() => {
  const T = window.__t;
  T.setBoom([T.n(3, 0), T.n(3, 2), T.n(3, 4), T.n(1, 1), T.n(1, 3), T.n(1, 5), T.n(1, 7), T.n(0, 0)]);
});
await page.waitForTimeout(150);
const stickyBefore = await page.evaluate(() => window.__t.rows().join());
const pastSticky = (await S(page)).past.length;
{
  const [x0, y] = await center(page, 3, 0);
  const [x7] = await center(page, 3, 7);
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(x0 + ((x7 - x0) * i) / 14, y, { steps: 2 });
  await page.mouse.up();
}
await page.waitForTimeout(120);
const sticky = await page.evaluate(() => ({ rows: window.__t.rows().join(), sig: window.__t.sig(window.__t.notes('boom')) }));
const pastSticky2 = (await S(page)).past.length;
await page.evaluate(() => window.__monster.studio.undo());
await page.waitForTimeout(100);
const stickyUndo = await page.evaluate(() => window.__t.sig(window.__t.notes('boom')));
check(
  'erasing every clap with one swipe keeps the clap row, and the snares under it are untouched',
  stickyBefore === '2,3,1,0' && sticky.rows === '2,3,1,0' && sticky.sig === '0@0 1@1 1@3 1@5 1@7',
  `${stickyBefore} → ${sticky.rows}; ${sticky.sig}`,
);
check('…as one undo step that brings the claps back', pastSticky2 - pastSticky === 1 && stickyUndo === '0@0 1@1 1@3 1@5 1@7 3@0 3@2 3@4', stickyUndo);
// The band's only clap (a partly lit stone on the last "and"): two taps put it out, and its row stays.
await fresh(page, 'little', 'grid', 'band');
await page.evaluate(() => window.__monster.studio.stop());
await tapStone(page, 3, 7);
await tapStone(page, 3, 7);
await page.waitForTimeout(100);
const clapOff = await page.evaluate(() => ({ rows: window.__t.rows().join(), claps: window.__t.notes('boom').filter((n) => n.step === 3).length, snares: window.__t.notes('boom').filter((n) => n.step === 1).length }));
// …and a swipe from there to the left erases only on its own row.
const bandSnares = clapOff.snares;
await tapStone(page, 3, 7);
{
  const [x7, y] = await center(page, 3, 7);
  const [x4] = await center(page, 3, 4);
  await page.mouse.move(x7, y);
  await page.mouse.down();
  await page.mouse.move(x4, y, { steps: 10 });
  await page.mouse.up();
}
await page.waitForTimeout(100);
const clapSwipe = await page.evaluate(() => ({ rows: window.__t.rows().join(), snares: window.__t.notes('boom').filter((n) => n.step === 1).length, claps: window.__t.notes('boom').filter((n) => n.step === 3).length }));
check('two taps put out the band clap, and its row stays where it was', clapOff.rows === '2,3,1,0' && clapOff.claps === 0, JSON.stringify(clapOff));
check('an erase swipe from the clap on beat 8 leftwards never touches the snares', clapSwipe.rows === '2,3,1,0' && clapSwipe.snares === bandSnares && clapSwipe.claps === 0, JSON.stringify(clapSwipe));

// ── Taps that slide a little are still taps (real touch, the smallest phone) ─
{
  const tApp = await openApp({ width: 667, height: 375 }, {}, { touch: true });
  const tp = tApp.page;
  const cdp = await tApp.ctx.newCDPSession(tp);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const drift = async (pad, col, from, dx, dy) => {
    const b = await stoneAt(tp, pad, col).boundingBox();
    const x = from === 'right' ? b.x + b.width - 2 : b.x + b.width / 2;
    const y = from === 'bottom' ? b.y + b.height - 2 : from === 'top' ? b.y + 2 : b.y + b.height / 2;
    await touch('touchStart', [{ x, y, id: 1 }]);
    await tp.waitForTimeout(30);
    await touch('touchMove', [{ x: x + dx, y: y + dy, id: 1 }]);
    await tp.waitForTimeout(30);
    await touch('touchEnd', []);
    await tp.waitForTimeout(80);
  };
  const sigOf = () => tp.evaluate(() => window.__t.sig(window.__t.notes('boom')));
  const slop = {};
  await fresh(tp, 'little', 'grid');
  await tp.evaluate(() => window.__monster.studio.stop());
  await drift(1, 2, 'right', 6, 0);
  slop.right = await sigOf();
  await fresh(tp, 'little', 'grid');
  await tp.evaluate(() => window.__monster.studio.stop());
  await drift(1, 2, 'bottom', 0, 5);
  slop.down = await sigOf();
  await fresh(tp, 'little', 'grid');
  await tp.evaluate(() => window.__monster.studio.stop());
  await drift(1, 2, 'top', 0, -5);
  slop.up = await sigOf();
  check('a tap 2 px from a stone\'s edge that slides 5–6 px lights only that stone', slop.right === '1@2' && slop.down === '1@2' && slop.up === '1@2', JSON.stringify(slop));
  await fresh(tp, 'maker', 'grid');
  await tp.evaluate(() => window.__t.setBoom([window.__t.n(1, 2), window.__t.n(1, 3)]));
  await tp.waitForTimeout(120);
  await drift(1, 2, 'right', 6, 0);
  const cyc = await sigOf();
  check('Maker: a sliding tap on a lit stone still cycles it to a double, and its neighbour stays', cyc === '1@2 1@2.5 1@3', cyc);
  // A real swipe still paints, and two fingers painting together are one undo step.
  await fresh(tp, 'little', 'grid');
  await tp.evaluate(() => window.__monster.studio.stop());
  const p0 = await tp.evaluate(() => window.__monster.getState().past.length);
  const h0 = await stoneAt(tp, 2, 0).boundingBox();
  const h3 = await stoneAt(tp, 2, 3).boundingBox();
  const k4 = await stoneAt(tp, 0, 4).boundingBox();
  const k7 = await stoneAt(tp, 0, 7).boundingBox();
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const [ax, ay] = mid(h0);
  const [ax3] = mid(h3);
  const [bx, by] = mid(k4);
  const [bx7] = mid(k7);
  await touch('touchStart', [{ x: ax, y: ay, id: 1 }, { x: bx, y: by, id: 2 }]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: ax + ((ax3 - ax) * i) / 12, y: ay, id: 1 }, { x: bx + ((bx7 - bx) * i) / 12, y: by, id: 2 }]);
    await tp.waitForTimeout(12);
  }
  await touch('touchEnd', []);
  await tp.waitForTimeout(120);
  const two = await tp.evaluate((p0) => ({ steps: window.__monster.getState().past.length - p0, sig: window.__t.sig(window.__t.notes('boom')) }), p0);
  check(
    'two fingers painting at once (hats 1–4, big drum 5–8) make one undo step',
    two.steps === 1 && two.sig === '0@4 0@5 0@6 0@7 2@0 2@0.5 2@1 2@1.5 2@2 2@2.5 2@3 2@3.5',
    JSON.stringify(two),
  );
  await tApp.ctx.close();
}

// ── The wand while playing never doubles a hit ──────────────────────────────
await fresh(page, 'little', 'grid', 'band');
await page.evaluate(() => window.__monster.studio.play());
await page.waitForTimeout(300);
const wandKick = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  const boom = T.track('boom').id;
  // Wait until the next loop start (every groove has a big drum there) is already
  // handed out to the engine, then stamp a new groove.
  for (let i = 0; i < 4000; i++) {
    const d = st.debug();
    const next = Math.ceil(d.beat / 8 + 1e-6) * 8;
    if (next - d.beat > 0.01 && next < d.scheduledUntil - 0.005) {
      const queued = T.trig.filter((x) => x.ch === boom && x.pad === 0 && Math.abs(x.beat - next) < 1e-6).length;
      st.gridWand(boom);
      await T.sleep(400);
      const when = st.transport.timeAt(next);
      return { next, queued, kicks: T.trig.filter((x) => x.ch === boom && x.pad === 0 && Math.abs(x.when - when) < 0.03).length };
    }
    await T.sleep(2);
  }
  return null;
});
check('a wand tap just before beat 1 (its big drum already queued) plays one big drum, not two', !!wandKick && wandKick.queued === 1 && wandKick.kicks === 1, JSON.stringify(wandKick));
const wandBurst = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  const boom = T.track('boom').id;
  T.reset();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20; i++) {
    st.gridWand(boom);
    await T.sleep(60 + rnd() * 340);
  }
  await T.sleep(300);
  const hits = T.trig.filter((x) => x.ch === boom).sort((a, b) => a.pad - b.pad || a.when - b.when);
  let doubles = 0;
  for (let i = 1; i < hits.length; i++) if (hits[i].pad === hits[i - 1].pad && Math.abs(hits[i].when - hits[i - 1].when) < 0.002) doubles++;
  return { hits: hits.length, doubles };
});
check('20 wand taps while playing: no drum ever sounds twice at once', wandBurst.hits > 20 && wandBurst.doubles === 0, JSON.stringify(wandBurst));
await page.evaluate(() => window.__monster.studio.stop());

// ── A preview after Stop and Play again is not skipped ──────────────────────
await fresh(page, 'little', 'grid');
const replay = await page.evaluate(async () => {
  const T = window.__t;
  const st = window.__monster.studio;
  const boom = T.track('boom').id;
  T.setBoom([T.n(0, 0)]);
  const snare = (target) => ({ step: 1, col: 6, target, lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5 });
  const run = async () => {
    st.play();
    await T.until(st.transport.timeAt(1.05));
    st.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, snare('one')), { col: 6, preview: 'tap' });
    const p = st.debug().lastPreview;
    st.stop();
    st.stepEdit(boom, (p) => T.edits.setCellEdit(p, boom, snare('off')), { col: 6, preview: 'none' });
    await T.sleep(100);
    return p;
  };
  const a = await run();
  const b = await run();
  return { a, b };
});
check('after Stop and Play, the same early tap is previewed again', replay.a?.beat === 1.25 && replay.b?.beat === 1.25 && replay.b.when > replay.a.when, JSON.stringify(replay));

// ── The face is the child's choice: Boom's grid survives a visit to Bloop ────
await fresh(page, 'little', 'grid');
await page.locator(`.pod[data-track="${await page.evaluate(() => window.__t.track('bloop').id)}"] .pod-hit`).click();
await page.waitForTimeout(150);
const onBloop = await page.evaluate(() => ({ grid: !!document.querySelector('.step-grid'), keys: !!document.querySelector('.keys') }));
await page.locator(`.pod[data-track="${await page.evaluate(() => window.__t.track('boom').id)}"] .pod-hit`).click();
await page.waitForTimeout(150);
const backOnBoom = await page.evaluate(() => !!document.querySelector('.step-grid'));
check('grid → tap Bloop (its keys) → tap Boom: Boom\'s grid is back', !onBloop.grid && onBloop.keys && backOnBoom, JSON.stringify({ onBloop, backOnBoom }));
await page.evaluate(() => window.__monster.studio.stop());

// ── Keyboards: ⇧G held flips once, the flip keeps focus, drum pictures and the tray ─
const keyb = await page.evaluate(async () => {
  const M = window.__monster;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const v0 = M.getState().labView;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true }));
  for (let i = 0; i < 4; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true, repeat: true }));
  await wait(60);
  const held = M.getState().labView;
  M.actions.setLabView('grid');
  await wait(60);
  return { v0, held };
});
check('holding ⇧G flips once (key repeats are ignored)', keyb.v0 === 'grid' && keyb.held === 'keys', JSON.stringify(keyb));
await page.locator('.surface-flip').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const flipFocus = await page.evaluate(() => ({ view: window.__monster.getState().labView, focused: document.activeElement?.classList.contains('surface-flip') }));
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const flipFocus2 = await page.evaluate(() => ({ view: window.__monster.getState().labView, focused: document.activeElement?.classList.contains('surface-flip') }));
check('flipping from the keyboard keeps focus on the flip button (both ways)', flipFocus.view === 'keys' && flipFocus.focused && flipFocus2.view === 'grid' && flipFocus2.focused, JSON.stringify([flipFocus, flipFocus2]));
await page.evaluate(() => window.__monster.studio.stop());
const headKey = await page.evaluate(async () => {
  const T = window.__t;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.step-grid .stone[tabindex="0"]').focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await wait(40);
  const at = document.activeElement;
  T.reset();
  at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(60);
  const boom = T.track('boom').id;
  return { head: at.classList.contains('drum-head'), pad: at.dataset.pad, played: T.on.filter((x) => x.ch === boom).map((x) => x.pad), notes: T.notes('boom').length };
});
check('ArrowLeft from beat 1 reaches the drum picture, and Enter plays it (nothing written)', headKey.head && headKey.pad === '0' && headKey.played.join() === '0' && headKey.notes === 0, JSON.stringify(headKey));
await fresh(page, 'maker', 'grid');
await page.locator('.grid-add-head').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
const trayIn = await page.evaluate(() => ({ open: !!document.querySelector('.grid-picker'), inside: !!document.activeElement?.closest('.grid-picker') }));
await page.keyboard.press('Escape');
await page.waitForTimeout(120);
const trayOut = await page.evaluate(() => ({ open: !!document.querySelector('.grid-picker'), back: document.activeElement?.classList.contains('grid-add-head') }));
check("the '+' tray from a keyboard: focus moves in, Escape closes it and returns to '+'", trayIn.open && trayIn.inside && !trayOut.open && trayOut.back, JSON.stringify({ trayIn, trayOut }));

// ── Every touch answers: the ruler plays its beat, the mini monster jumps ───
await fresh(page, 'little', 'grid');
await page.evaluate(() => window.__t.setBoom([window.__t.n(0, 2), window.__t.n(1, 2)]));
await page.waitForTimeout(150);
const rulerTap = async (col) => {
  const b = await page.locator(`.ruler-slot[data-col="${col}"]`).boundingBox();
  await page.evaluate(() => window.__t.reset());
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(80);
  return page.evaluate(() => ({ pads: window.__t.on.filter((x) => x.ch === window.__t.track('boom').id).map((x) => x.pad).sort().join(), notes: window.__t.notes('boom').length }));
};
const hop0 = await page.evaluate(() => document.querySelector('.hopper').getAnimations().length);
const r2 = await rulerTap(2);
const hopping = await page.evaluate(() => document.querySelector('.hopper').getAnimations().length);
const r5 = await rulerTap(5);
check('tapping the ruler over beat 3 plays that beat\'s drums (nothing written); the mini monster jumps', r2.pads === '0,1' && r2.notes === 2 && hopping > hop0, JSON.stringify({ r2, hop0, hopping }));
check('…and over an empty beat, a soft tick', r5.pads === '2' && r5.notes === 2, JSON.stringify(r5));
const parked = await page.evaluate(() => {
  const h = document.querySelector('.hopper').getBoundingClientRect();
  const head = document.querySelector('.drum-head').getBoundingClientRect();
  const star = document.querySelector('.ruler-slot[data-col="0"]').getBoundingClientRect();
  return { overHeads: h.left + h.width / 2 < head.right, clearOfStar: h.right <= star.left + 1 };
});
check('stopped, the mini monster waits in the corner over the drum pictures (beat 1\'s star in view)', parked.overHeads && parked.clearOfStar, JSON.stringify(parked));

// ── A brand-new song in Monster Blocks can start on Boom's grid ─────────────
await page.evaluate(async () => {
  const M = window.__monster;
  M.studio.stop();
  await M.actions.newSong('blank');
  M.actions.setScreen('blocks');
});
await page.waitForTimeout(250);
await page.locator('.blocks-empty .blocks-empty-beat').click();
await page.waitForTimeout(250);
const fromEmpty = await page.evaluate(() => {
  const s = window.__monster.getState();
  return { screen: s.screen, boom: s.selectedTrackId === window.__t.track('boom').id, grid: !!document.querySelector('.step-grid'), armed: window.__monster.studio.debug().gridAutoStart };
});
check("an empty song's Blocks: Boom's button opens Boom's grid, ready for a first stone", fromEmpty.screen === 'lab' && fromEmpty.boom && fromEmpty.grid && fromEmpty.armed, JSON.stringify(fromEmpty));

// ── High contrast: outlined sockets, ringed stones ──────────────────────────
await fresh(page, 'little', 'grid');
await page.evaluate(() => window.__t.setBoom([window.__t.n(0, 0)]));
await page.evaluate(() => window.__monster.actions.updateSettings({ highContrast: true }));
await page.waitForTimeout(150);
const hc = await page.evaluate(() => {
  const socket = getComputedStyle(document.querySelector('.stone[data-state="off"] .stone-socket')).boxShadow;
  const lit = getComputedStyle(document.querySelector('.stone[data-state="one"] .stone-lit'));
  return { socketRing: /inset/.test(socket) && /2px/.test(socket), litRing: lit.outlineStyle === 'solid' && lit.outlineWidth === '2px' && lit.outlineColor === 'rgb(255, 255, 255)' };
});
await page.evaluate(() => window.__monster.actions.updateSettings({ highContrast: false }));
check('high contrast: every socket has an outline and lit stones a 2 px white ring', hc.socketRing && hc.litRing, JSON.stringify(hc));

// ── 14. Sizes: every stone ≥ 44 px, flip ≥ 38 px, no sideways scroll ────────
const VIEWS = [
  { name: 'phone', width: 844, height: 390 },
  { name: 'small phone', width: 667, height: 375 },
  { name: 'iPad', width: 1024, height: 768 },
  { name: 'portrait', width: 820, height: 1180 },
];
/** Loops with more drums than the base rows: a wand groove (Robot: 6 drums), all 8 drums, and Little with all 6 of its drums. */
const LOOPS = [
  ['little', 'band', null],
  ['maker', 'band', null],
  ['maker', 'blank', 'robot'],
  ['maker', 'blank', 'all8'],
  ['little', 'blank', 'six'],
];
for (const v of VIEWS) {
  const app = await openApp({ width: v.width, height: v.height });
  const phone = v.height < 560;
  for (const [mode, kind, loop] of LOOPS) {
    await fresh(app.page, mode, 'grid', kind);
    if (loop) {
      await app.page.evaluate((loop) => {
        const T = window.__t;
        const g = T.grooves;
        if (loop === 'robot') return T.setBoom(g.grooveNotes(g.GROOVES.find((x) => x.id === 'robot'), { beatsPerBar: 4 }));
        const pads = loop === 'all8' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5];
        // Busier drums first (so the least used are the last pads).
        T.setBoom(pads.flatMap((p, i) => Array.from({ length: 8 - i }, (_, k) => T.n(p, k))));
      }, loop);
      await app.page.waitForTimeout(200);
    }
    const geo = await app.page.evaluate(() => {
      const T = window.__t;
      const box = (el) => el.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.step-grid .drum-row')];
      const stones = rows.map((r) => [...r.querySelectorAll('.stone')].map(box));
      // A stone's (and a drum picture's) hit area reaches halfway across each gap (maths hit-testing).
      let minW = Infinity;
      let minH = Infinity;
      stones.forEach((row, r) =>
        row.forEach((b, c) => {
          const left = c > 0 ? (row[c - 1].right + b.left) / 2 : b.left;
          const right = c < row.length - 1 ? (b.right + row[c + 1].left) / 2 : b.right;
          const top = r > 0 ? (stones[r - 1][c].bottom + b.top) / 2 : b.top;
          const bottom = r < stones.length - 1 ? (b.bottom + stones[r + 1][c].top) / 2 : b.bottom;
          minW = Math.min(minW, right - left);
          minH = Math.min(minH, bottom - top);
        }),
      );
      const heads = [...document.querySelectorAll('.drum-head')].map(box);
      const flip = box(document.querySelector('.surface-flip'));
      const surface = box(document.querySelector('.surface'));
      const grid = box(document.querySelector('.step-grid'));
      const stage = box(document.querySelector('.stage'));
      const inStage = (el) => {
        const b = box(el);
        return b.top >= stage.top - 0.5 && b.bottom <= stage.bottom + 0.5 && b.left >= stage.left - 0.5 && b.right <= stage.right + 0.5;
      };
      const caps = T.monsters.MODE_CAPS[window.__monster.getState().settings.ageMode];
      const t = T.track('boom');
      const all = T.steps.drumRows(t.clips.find((c) => c.id === t.activeClipId), caps.gridDrumRows, []).length;
      const chip = [...document.querySelectorAll('.grid-add')].find((b) => b.offsetParent !== null);
      return {
        minW,
        minH,
        head: Math.min(...heads.map((h) => h.width)),
        flip: Math.min(flip.width, flip.height),
        scroll: document.documentElement.scrollWidth - innerWidth,
        inside: grid.left >= surface.left - 1 && grid.right <= surface.right + 1 && grid.bottom <= surface.bottom + 1,
        stage: inStage(document.querySelector('.add-seat')) && [...document.querySelectorAll('.stage .loop-badge')].every(inStage),
        rows: rows.length,
        folded: all - rows.length,
        chip: chip ? { n: Number(chip.dataset.folded), size: Math.min(box(chip).width, box(chip).height) } : null,
      };
    });
    const chipOk = geo.folded === 0 ? !geo.chip || geo.chip.n === 0 : !!geo.chip && geo.chip.n === geo.folded && geo.chip.size >= (phone ? 38 : 44);
    check(
      `${v.name} ${mode} ${loop ?? kind}: stones and drum pictures ≥ 44 (${geo.rows} rows${geo.folded ? `, +${geo.folded} folded` : ''}), flip ≥ 38, inside the panel, stage seat and badges inside the stage, no sideways scroll`,
      geo.minW >= 44 && geo.minH >= 44 && geo.head >= 44 && geo.flip >= 38 && geo.scroll <= 0 && geo.inside && geo.stage && chipOk,
      `${geo.minW.toFixed(0)}×${geo.minH.toFixed(0)}, head ${geo.head.toFixed(0)}, flip ${geo.flip.toFixed(0)}, chip ${JSON.stringify(geo.chip)}, stage ${geo.stage}, scroll ${geo.scroll}`,
    );
    if (phone && loop === 'robot') {
      // On a phone the Robot groove folds one drum: it still plays, and picking it from the tray shows its row.
      const folded = await app.page.evaluate(async () => {
        const T = window.__t;
        const st = window.__monster.studio;
        const shown = T.rows();
        const hidden = [0, 1, 2, 6, 7].filter((p) => !shown.includes(p));
        T.reset();
        st.play();
        await T.sleep(5200);
        st.stop();
        return { hidden, played: hidden.every((p) => T.sched.some((x) => x.step === p)) };
      });
      const sideChip = app.page.locator('.surface-side .grid-add');
      await sideChip.click();
      await app.page.waitForTimeout(150);
      const trayPads = await app.page.evaluate(() => [...document.querySelectorAll('.grid-picker .picker-pad')].map((b) => `${b.getAttribute('aria-label')}:${b.dataset.has}`));
      await app.page.locator('.grid-picker .picker-pad[data-has="true"]').first().click();
      await app.page.waitForTimeout(200);
      const picked = await app.page.evaluate((hidden) => {
        const T = window.__t;
        const rows = T.rows();
        const lit = [...document.querySelectorAll(`.step-grid .stone[data-pad="${hidden[0]}"]`)].filter((s) => s.dataset.state !== 'off').length;
        return { rows, has: rows.includes(hidden[0]), lit, notes: T.notes('boom').filter((n) => n.step === hidden[0]).length };
      }, folded.hidden);
      check(`${v.name}: a folded drum keeps playing`, folded.hidden.length === 1 && folded.played, JSON.stringify(folded));
      check(
        `${v.name}: the '+1' tray lists it first (lit dot); picking it shows its row and stones, still 5 rows`,
        trayPads[0]?.endsWith(':true') && picked.has && picked.rows.length === 5 && picked.lit > 0,
        JSON.stringify({ trayPads, picked }),
      );
    }
  }
  // A tap in the gap between two stones still lands on one of them (no dead zones).
  const gap = await app.page.evaluate(() => {
    const a = document.querySelector('.step-grid .stone[data-pad="1"][data-col="1"]').getBoundingClientRect();
    const b = document.querySelector('.step-grid .stone[data-pad="1"][data-col="2"]').getBoundingClientRect();
    return [(a.right + b.left) / 2 - 1, a.top + a.height / 2];
  });
  const beforeGap = await app.page.evaluate(() => window.__t.notes('boom').length);
  await app.page.mouse.click(gap[0], gap[1]);
  await app.page.waitForTimeout(80);
  const afterGap = await app.page.evaluate(() => window.__t.notes('boom').length);
  check(`${v.name}: a tap in the gap between stones still lands on a stone`, afterGap !== beforeGap, `${beforeGap} → ${afterGap}`);
  // The keys face keeps its toys beside the keys on phones, and fits.
  await fresh(app.page, 'little', 'keys', 'band');
  const keysFit = await app.page.evaluate(() => {
    const side = document.querySelector('.surface-side').getBoundingClientRect();
    const surface = document.querySelector('.surface').getBoundingClientRect();
    const keys = [...document.querySelectorAll('.keys .key')].map((k) => k.getBoundingClientRect().width);
    return { inside: side.top >= surface.top - 1 && side.bottom <= surface.bottom + 1, key: Math.min(...keys), scroll: document.documentElement.scrollWidth - innerWidth };
  });
  check(`${v.name}: keys face: flip and toys fit beside the keys (keys ≥ 44 wide)`, keysFit.inside && keysFit.key >= 44 && keysFit.scroll <= 0, JSON.stringify(keysFit));
  await app.page.evaluate(() => window.__monster.studio.stop());
  await app.ctx.close();
}

// ── 15. Accessibility (axe-core, when installed) ────────────────────────────
const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);
if (existsSync(axePath)) {
  for (const vp of [
    { width: 1024, height: 768 },
    { width: 844, height: 390 },
  ]) {
    const a = await openApp(vp);
    await fresh(a.page, 'maker', 'grid', 'band');
    await a.page.locator('.grid-add').filter({ visible: true }).first().click();
    await a.page.waitForTimeout(150);
    await a.page.addScriptTag({ content: readFileSync(axePath, 'utf8') });
    const axe = await a.page.evaluate(async () => {
      const r = await window.axe.run(document.body, { resultTypes: ['violations'] });
      return { open: !!document.querySelector('.grid-picker'), v: r.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`) };
    });
    check(`axe-core ${vp.width}×${vp.height}: no violations on the whole page (grid face, '+' tray open, rail)`, axe.open && axe.v.length === 0, axe.v.join(' | '));
    await a.ctx.close();
  }
} else {
  console.log('SKIP  axe-core is not in node_modules: accessibility scan skipped');
}

check('no page errors', errors.length === 0, errors.join(' | '));
await ctx.close();
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
