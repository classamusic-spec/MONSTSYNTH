// End-to-end check of the core promise: touch → sound, record a loop, layer,
// play, undo, autosave. Usage: node scripts/e2e.mjs [url]
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);

const state = () => page.evaluate(() => {
  const s = window.__monster.getState();
  const d = window.__monster.studio.debug();
  const notes = Object.fromEntries(s.project.tracks.map((t) => [t.monster, (t.clips.find((c) => c.id === t.activeClipId)?.notes ?? []).length]));
  return { awake: s.awake, transport: s.transport, notes, past: s.past.length, projectId: s.project.id, debug: d, rows: s.project.arrangement.rows, tracks: s.project.tracks.map((t) => t.id) };
});

// 1. Wake
await page.mouse.click(512, 384);
await page.waitForTimeout(600);
let s = await state();
check('monsters wake and audio runs', s.awake && s.debug.state === 'running', s.debug.state);

// 2. Touch a key → sound
const keys = page.locator('.keys');
const box = await keys.boundingBox();
const keyX = (i, n = 8) => box.x + (box.width / n) * (i + 0.5);
const keyY = box.y + box.height / 2;
async function tap(i, hold = 120) {
  await page.mouse.move(keyX(i), keyY);
  await page.mouse.down();
  await page.waitForTimeout(hold);
  await page.mouse.up();
}
await page.mouse.move(keyX(2), keyY);
await page.mouse.down();
await page.waitForTimeout(150);
const level = await page.evaluate(() => window.__monster.studio.debug().level);
await page.mouse.up();
check('a key makes sound within 150 ms', level > 0.005, `rms ${level.toFixed(4)}`);

// 3. Record a loop on Bloop: first note starts the loop
await page.getByRole('button', { name: 'Record a loop' }).click();
s = await state();
check('record arms and waits for the first note', s.transport.armed === true);
for (const i of [0, 2, 4, 2, 5, 4]) {
  await tap(i, 140);
  await page.waitForTimeout(260);
}
s = await state();
check('first note starts the loop (recording + playing)', s.transport.recording && s.transport.playing);
check('notes land in Bloop\'s loop', s.notes.bloop >= 5, `${s.notes.bloop} notes`);
check('Bloop row auto-filled in Monster Blocks', s.rows[s.tracks[0]].every(Boolean));
await page.getByRole('button', { name: 'Stop recording' }).click();
s = await state();
check('recording stops, loop keeps playing', !s.transport.recording && s.transport.playing);
const pastAfterRec = s.past;

// 4. Layer: select Boom, record drums over the playing loop
await page.locator('.pod[data-monster="boom"] .pod-hit').click();
await page.waitForTimeout(200);
const boxDrums = await page.locator('.keys').boundingBox();
await page.getByRole('button', { name: 'Record a loop' }).click();
for (const i of [0, 1, 0, 1]) {
  await page.mouse.move(boxDrums.x + (boxDrums.width / 6) * (i + 0.5), boxDrums.y + boxDrums.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(400);
}
await page.getByRole('button', { name: 'Stop recording' }).click();
s = await state();
check('second layer (Boom) recorded in sync', s.notes.boom >= 3, `${s.notes.boom} hits`);

// 5. Playback makes sound on its own
await page.waitForTimeout(700);
const levels = [];
for (let i = 0; i < 10; i++) {
  levels.push(await page.evaluate(() => window.__monster.studio.debug().level));
  await page.waitForTimeout(90);
}
check('the loop plays back by itself', Math.max(...levels) > 0.005, `max rms ${Math.max(...levels).toFixed(4)}`);

// 6. Stop, then undo removes the last layer only
await page.getByRole('button', { name: 'Stop' }).first().click();
s = await state();
check('stop halts playback', !s.transport.playing);
await page.getByRole('button', { name: 'Undo' }).click();
s = await state();
check('undo removes the drum take', s.notes.boom === 0 && s.notes.bloop >= 5, JSON.stringify(s.notes));

// 7. Autosave survives a reload
await page.waitForTimeout(900);
const id = s.projectId;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
s = await state();
check('autosaved song reopens after reload', s.projectId === id && s.notes.bloop >= 5 && s.notes.boom === 0, JSON.stringify(s.notes));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
