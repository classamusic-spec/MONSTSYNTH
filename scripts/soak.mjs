// Stability soak: loop the full band with every effect on for a minute while a
// "child" hammers keys; check voices stay bounded and memory does not grow.
// Then the same again on Beat Hop: a full Monster Maker drum grid at 140 bpm
// while the child keeps tapping stones.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const seconds = Number(process.argv[3] || 60);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
await page.mouse.click(512, 384);
await page.evaluate(async () => {
  const m = window.__monster;
  await m.actions.newSong('band');
  const s = m.getState();
  m.setState({ project: { ...s.project, tracks: s.project.tracks.map((t) => ({ ...t, fx: { echo: 0.8, gloop: 0.8, chomper: 0.4, wiggle: 0.4 } })) }, settings: { ...s.settings, hints: false } });
  m.studio.play();
});
const heap = () => page.evaluate(() => { window.gc?.(); return performance.memory?.usedJSHeapSize ?? 0; });
await page.waitForTimeout(3000);
const h0 = await heap();
const keys = await page.locator('.keys').boundingBox();
let maxVoices = 0;
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < seconds * 1000) {
  const k = i++ % 8;
  await page.mouse.move(keys.x + (keys.width / 8) * (k + 0.5), keys.y + keys.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(90);
  if (i % 20 === 0) maxVoices = Math.max(maxVoices, (await page.evaluate(() => window.__monster.studio.debug().voices)));
}
await page.evaluate(() => window.__monster.studio.stop());
await page.waitForTimeout(4000);
const h1 = await heap();
const d = await page.evaluate(() => window.__monster.studio.debug());
console.log(JSON.stringify({ taps: i, maxVoices, voicesAfterStop: d.voices, held: d.held, heapStartMB: (h0 / 1048576).toFixed(1), heapEndMB: (h1 / 1048576).toFixed(1), errors }));

// Beat Hop: every beat holds four drums (doubles), the band plays along at 140 bpm.
await page.evaluate(async () => {
  const m = window.__monster;
  const { writeCell } = await import('/src/magic/steps.ts');
  m.actions.updateSettings({ ageMode: 'maker' });
  await m.actions.newSong('band');
  const s = m.getState();
  const boom = s.project.tracks.find((t) => t.monster === 'boom');
  let clip = { ...boom.clips.find((c) => c.id === boom.activeClipId), notes: [] };
  for (let c = 0; c < 8; c++) {
    for (let k = 0; k < 4; k++) {
      clip = writeCell(clip, { step: (c + k * 2) % 8, col: c, target: 'double', lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5, maxNotes: 160 }).clip;
    }
  }
  m.setState({ project: { ...s.project, tempo: 140, tracks: s.project.tracks.map((t) => (t.id === boom.id ? { ...t, clips: [clip], activeClipId: clip.id } : t)) } });
  m.actions.selectTrack(boom.id);
  m.actions.setLabView('grid');
  m.studio.play();
});
await page.waitForTimeout(2000);
const g0 = await heap();
const grid = await page.locator('.step-grid .grid-rows').boundingBox();
let gridMax = 0;
let taps = 0;
const tg = Date.now();
while (Date.now() - tg < seconds * 1000) {
  const k = taps++;
  await page.mouse.click(grid.x + grid.width * (0.15 + ((k * 0.37) % 0.85)), grid.y + grid.height * (0.12 + ((k * 0.61) % 0.8)));
  await page.waitForTimeout(120);
  if (taps % 20 === 0) gridMax = Math.max(gridMax, await page.evaluate(() => window.__monster.studio.debug().voices));
}
await page.evaluate(() => window.__monster.studio.stop());
await page.waitForTimeout(4000);
const g1 = await heap();
const gd = await page.evaluate(() => window.__monster.studio.debug());
console.log(JSON.stringify({ grid: true, taps, maxVoices: gridMax, voicesAfterStop: gd.voices, held: gd.held, heapStartMB: (g0 / 1048576).toFixed(1), heapEndMB: (g1 / 1048576).toFixed(1), errors }));
await browser.close();
