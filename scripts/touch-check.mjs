// Real touch events (no autoplay bypass): first tap unlocks audio, touch keys,
// glissando, monster squish drag, multi-finger chord, hold-to-roll, performance
// under CPU throttle.
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
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
