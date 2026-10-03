// Real touch events (no autoplay bypass): first tap unlocks audio, touch keys,
// glissando, monster squish drag, multi-finger chord, hold-to-roll, performance
// under CPU throttle, and Beat Hop's stones (rapid multi-finger taps and a paint
// swipe under CPU throttle, and taps that slide a little).
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const browser = await chromium.launch(); // default autoplay policy: a real gesture is required
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const dbg = () => page.evaluate(() => window.__monster.studio.debug());
const tap = async (x, y, hold = 60) => {
  await touch('touchStart', [{ x, y, id: 1 }]);
  await page.waitForTimeout(hold);
  await touch('touchEnd', []);
};

// 1. First tap on the sleeping monsters unlocks audio with the normal autoplay policy.
await tap(422, 195);
await page.waitForTimeout(400);
let d = await dbg();
check('first tap wakes monsters and unlocks audio (no autoplay bypass)', d.state === 'running', d.state);

// 2. Touch a key.
const keys = await page.locator('.keys').boundingBox();
const kx = (i) => keys.x + (keys.width / 8) * (i + 0.5);
const ky = keys.y + keys.height / 2;
await touch('touchStart', [{ x: kx(3), y: ky, id: 1 }]);
await page.waitForTimeout(120);
const lvl = (await dbg()).level;
const down = await page.locator('.key').nth(3).getAttribute('data-down');
await touch('touchEnd', []);
check('touching a key sounds and presses it', lvl > 0.005 && down === 'true', `rms ${lvl.toFixed(3)}`);

// 3. Glissando: slide a finger across all keys.
const seen = new Set();
page.on('console', () => {});
await page.evaluate(() => {
  window.__gliss = [];
  window.__monster.getState();
});
await touch('touchStart', [{ x: kx(0), y: ky, id: 1 }]);
for (let i = 0; i <= 7; i++) {
  await touch('touchMove', [{ x: kx(i), y: ky, id: 1 }]);
  await page.waitForTimeout(40);
  const downs = await page.$$eval('.key', (els) => els.map((e) => e.getAttribute('data-down')));
  seen.add(downs.indexOf('true'));
}
await touch('touchEnd', []);
await page.waitForTimeout(100);
const stuck = await page.$$eval('.key', (els) => els.filter((e) => e.getAttribute('data-down') === 'true').length);
check('glissando plays every key it slides over', seen.size >= 8, `keys ${[...seen].sort().join(',')}`);
check('no key stays stuck after the slide', stuck === 0);

// 4. Three-finger chord.
await touch('touchStart', [{ x: kx(0), y: ky, id: 1 }, { x: kx(2), y: ky, id: 2 }, { x: kx(4), y: ky, id: 3 }]);
await page.waitForTimeout(80);
const chordDown = await page.$$eval('.key', (els) => els.filter((e) => e.getAttribute('data-down') === 'true').length);
await touch('touchEnd', []);
check('three fingers play a chord', chordDown === 3, `${chordDown} keys down`);

// 5. Squish the monster: drag up on Bloop changes pitch, release frees the note.
const pod = await page.locator('.pod[data-selected="true"] .pod-hit').boundingBox();
const px = pod.x + pod.width / 2;
await touch('touchStart', [{ x: px, y: pod.y + pod.height * 0.8, id: 1 }]);
for (let i = 1; i <= 10; i++) {
  await touch('touchMove', [{ x: px + i * 3, y: pod.y + pod.height * (0.8 - i * 0.06), id: 1 }]);
  await page.waitForTimeout(25);
}
const stretched = await page.locator('.pod[data-selected="true"] .squish').evaluate((el) => el.style.getPropertyValue('--drag-y'));
await touch('touchEnd', []);
await page.waitForTimeout(700);
const after = await dbg();
check('dragging up on a monster stretches it', Number(stretched) > 1.05, `drag-y ${stretched}`);
check('releasing the monster releases its note (no stuck voice)', after.held === 0 && after.live === 0, `${after.held} held, ${after.live} live`);

// 5b. Hold Boom: a roll on the beat grid; letting go stops it (nothing keeps running).
const boomPod = await page.locator('.pod[data-monster="boom"] .pod-hit').boundingBox();
const bx = boomPod.x + boomPod.width / 2;
const by = boomPod.y + boomPod.height * 0.85;
await page.evaluate(() => {
  const eng = window.__monster.studio.engine;
  window.__rollHits = 0;
  if (!eng.__countHits) {
    eng.__countHits = true;
    const trigger = eng.trigger.bind(eng);
    eng.trigger = (req, when, dur) => {
      if (req.pad === 0) window.__rollHits++;
      return trigger(req, when, dur);
    };
  }
});
await touch('touchStart', [{ x: bx, y: by, id: 1 }]);
await page.waitForTimeout(1100);
const rolling = await dbg();
const rollHits = await page.evaluate(() => window.__rollHits);
await touch('touchEnd', []);
await page.waitForTimeout(250);
const hitsAtRelease = await page.evaluate(() => window.__rollHits);
await page.waitForTimeout(500);
const rollEnd = await dbg();
const hitsLater = await page.evaluate(() => window.__rollHits);
check('holding Boom rolls on its own clock', rolling.rolls === 1 && rolling.soloRoll && rollHits >= 2, `${rollHits} hits`);
check(
  'letting go of Boom stops the roll (no roll, no clock, no stuck voice)',
  rollEnd.rolls === 0 && !rollEnd.soloRoll && hitsLater === hitsAtRelease && rollEnd.live === 0 && rollEnd.held === 0,
  `${rollEnd.rolls} rolls, ${hitsLater - hitsAtRelease} late hits`,
);

// 6. Performance with a 4× slower CPU: band playing, frames and audio keep going.
await page.evaluate(async () => {
  await window.__monster.actions.newSong('band');
});
await page.waitForTimeout(300);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.evaluate(() => window.__monster.studio.play());
const perf = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const t0 = last;
      const step = (now) => {
        times.push(now - last);
        last = now;
        if (now - t0 < 4000) requestAnimationFrame(step);
        else {
          times.sort((a, b) => a - b);
          const p95 = times[Math.floor(times.length * 0.95)];
          resolve({ frames: times.length, p95, max: times[times.length - 1] });
        }
      };
      requestAnimationFrame(step);
    }),
);
const beatAfter = (await dbg()).beat;
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
check('animation stays smooth-ish on a 4× slower CPU', perf.p95 < 40, `${perf.frames} frames in 4 s, p95 ${perf.p95.toFixed(1)} ms, max ${perf.max.toFixed(0)} ms`);
check('the transport keeps time under load', beatAfter > 5, `beat ${beatAfter.toFixed(2)} after ~4.3 s`);

// 7. Long playback: voices stay bounded (no leaks).
const counts = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1000);
  counts.push((await dbg()).voices);
}
await page.evaluate(() => window.__monster.studio.stop());
await page.waitForTimeout(400);
const end = await dbg();
check('voice count stays bounded while looping', Math.max(...counts) <= 30, `max ${Math.max(...counts)}`);
check('stopping silences every scheduled voice', end.voices === 0, `${end.voices} left`);

// 8. Beat Hop under a 4× slower CPU: rapid two-finger stone taps and a paint swipe
//    while the band plays. Nothing sticks, every gesture lands, the playhead moves on.
await page.evaluate(async () => {
  const m = window.__monster;
  await m.actions.newSong('band');
  m.actions.selectTrack(m.getState().project.tracks.find((t) => t.monster === 'boom').id);
  m.actions.setLabView('grid');
});
await page.waitForTimeout(400);
const stone = async (pad, col) => {
  const b = await page.locator(`.step-grid .stone[data-pad="${pad}"][data-col="${col}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const boomSig = () =>
  page.evaluate(() => {
    const t = window.__monster.getState().project.tracks.find((x) => x.monster === 'boom');
    return t.clips.find((c) => c.id === t.activeClipId).notes.map((n) => `${n.step}@${n.beat}`).sort().join(' ');
  });
await page.evaluate(() => window.__monster.studio.play());
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const beat0 = (await dbg()).beat;
const sig0 = await boomSig();
// What the loop must be if every one of the 12 taps lands: each toggles its own stone
// (snappy drum beats 1–6, big drum beats 4–8 and 1), worked out with the grid's own rules.
const toggled = [];
for (let i = 0; i < 6; i++) toggled.push([1, i % 8], [0, (i + 3) % 8]);
const expectedSig = await page.evaluate(async (cells) => {
  const steps = await import('/src/magic/steps.ts');
  const { MODE_CAPS } = await import('/src/model/monsters.ts');
  const s = window.__monster.getState();
  const caps = MODE_CAPS[s.settings.ageMode];
  const t = s.project.tracks.find((x) => x.monster === 'boom');
  let clip = t.clips.find((c) => c.id === t.activeClipId);
  for (const [pad, col] of cells) {
    const target = steps.nextTarget(steps.cellState(clip.notes, pad, col, clip.lengthBeats), { states: caps.gridCellStates, rowDefault: caps.gridCellStates === 2 && pad === 2 ? 'double' : 'one' });
    clip = steps.writeCell(clip, { step: pad, col, target, lengthBeats: clip.lengthBeats, beatsPerBar: s.project.beatsPerBar, isDrum: true, columnCap: Infinity, dur: 0.5 }).clip;
  }
  return clip.notes.map((n) => `${n.step}@${n.beat}`).sort().join(' ');
}, toggled);
// Two fingers at once on different stones, again and again (each tap toggles its stone).
for (let i = 0; i < 6; i++) {
  const a = await stone(1, i % 8);
  const b = await stone(0, (i + 3) % 8);
  await touch('touchStart', [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }]);
  await page.waitForTimeout(30);
  await touch('touchEnd', []);
  await page.waitForTimeout(20);
}
const sigTaps = await boomSig();
// A paint swipe along the clap row: starting on an unlit stone lights every stone it crosses
// (the band's clap on the last "and" becomes a clap on the beat).
const past0 = await page.evaluate(() => window.__monster.getState().past.length);
const s0 = await stone(3, 0);
const s7 = await stone(3, 7);
await touch('touchStart', [{ x: s0.x, y: s0.y, id: 1 }]);
for (let i = 1; i <= 14; i++) {
  await touch('touchMove', [{ x: s0.x + ((s7.x - s0.x) * i) / 14, y: s0.y, id: 1 }]);
  await page.waitForTimeout(15);
}
await touch('touchEnd', []);
await page.waitForTimeout(300);
const painted = await page.evaluate(() => {
  const t = window.__monster.getState().project.tracks.find((x) => x.monster === 'boom');
  return t.clips.find((c) => c.id === t.activeClipId).notes.filter((n) => n.step === 3).map((n) => n.beat).sort((a, b) => a - b);
});
const past1 = await page.evaluate(() => window.__monster.getState().past.length);
const beat1 = (await dbg()).beat;
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.evaluate(() => window.__monster.studio.stop());
await page.waitForTimeout(500);
const gridEnd = await dbg();
const downLeft = await page.$$eval('.step-grid .stone[data-down="true"]', (els) => els.length);
check('Beat Hop: rapid two-finger stone taps all land (all 12 toggles) under a 4× slower CPU', sigTaps === expectedSig && sigTaps !== sig0, `${sig0.split(' ').length} → ${sigTaps.split(' ').length} hits (expected ${expectedSig.split(' ').length})`);
check('Beat Hop: a paint swipe lights the whole clap row as one undo step', painted.join(',') === '0,1,2,3,4,5,6,7' && past1 - past0 === 1, `${painted.join(',')}; ${past1 - past0} step(s)`);
check('Beat Hop: the playhead keeps moving while stones are tapped', beat1 - beat0 > 2, `${beat0.toFixed(2)} → ${beat1.toFixed(2)}`);
check('Beat Hop: no stuck voices, notes or pressed stones afterwards', gridEnd.held === 0 && gridEnd.live === 0 && downLeft === 0, `${gridEnd.held} held, ${gridEnd.live} live, ${downLeft} pressed`);

// 9. A small child's tap slides a little: a tap 2 px from a stone's edge that drifts
//    6 px across the gap (or 5 px down) still lights only that stone.
await page.evaluate(() => window.__monster.studio.stop());
const slid = [];
for (const [dx, dy, edge] of [
  [6, 0, 'right'],
  [0, 5, 'bottom'],
]) {
  await page.evaluate(async () => {
    const m = window.__monster;
    await m.actions.newSong('beat');
    m.studio.stop();
  });
  await page.waitForTimeout(250);
  const b = await page.locator('.step-grid .stone[data-pad="1"][data-col="2"]').boundingBox();
  const x = edge === 'right' ? b.x + b.width - 2 : b.x + b.width / 2;
  const y = edge === 'bottom' ? b.y + b.height - 2 : b.y + b.height / 2;
  await touch('touchStart', [{ x, y, id: 1 }]);
  await page.waitForTimeout(40);
  await touch('touchMove', [{ x: x + dx, y: y + dy, id: 1 }]);
  await page.waitForTimeout(40);
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  slid.push(await boomSig());
}
await page.evaluate(() => window.__monster.studio.stop());
check('Beat Hop: a tap that slides 5–6 px from a stone\'s edge lights that one stone only', slid.every((x) => x === '1@2'), slid.join(' | '));
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
