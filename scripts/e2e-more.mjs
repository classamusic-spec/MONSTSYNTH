// Second end-to-end pass: Monster Blocks, Sound Painting, Add Monster, Mimic
// (with a fake microphone), the grown-up gate, and WAV export.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
await page.mouse.click(512, 384);
await page.waitForTimeout(400);
const S = () => page.evaluate(() => window.__monster.getState());

// Start from the Monster Band starter.
await page.locator('.dock-btn[data-screen="songs"]').click();
await page.locator('.song-band').click();
await page.waitForTimeout(300);
let s = await S();
check('starter band song opens in the Lab', s.screen === 'lab' && s.project.tracks.every((t) => t.clips[0]?.notes.length > 0));

// ── Monster Blocks ─────────────────────────────────────────────────────────
await page.locator('.dock-btn[data-screen="blocks"]').click();
await page.waitForTimeout(300);
const bloopId = (await S()).project.tracks[0].id;
const cell = (col) => page.locator(`.block[data-row="${bloopId}"][data-col="${col}"]`);
const before = (await S()).project.arrangement.rows[bloopId];
const firstOn = before.findIndex(Boolean);
await cell(firstOn).click();
s = await S();
check('tapping a block removes it', s.project.arrangement.rows[bloopId][firstOn] === null);
await page.getByRole('button', { name: 'Undo' }).click();
s = await S();
check('undo brings the block back', !!s.project.arrangement.rows[bloopId][firstOn]);

// Swipe-fill empty cells 0..2 in one gesture (one undo step).
const emptyBefore = (await S()).project.arrangement.rows[bloopId].slice(0, 3).filter((c) => !c).length;
const b0 = await cell(0).boundingBox();
const b2 = await cell(2).boundingBox();
const pastBefore = (await S()).past.length;
await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
await page.mouse.down();
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 8 });
await page.mouse.up();
s = await S();
check('swipe fills a row', s.project.arrangement.rows[bloopId].slice(0, 3).every(Boolean), `${emptyBefore} were empty`);
check('the swipe is a single undo step', s.past.length === pastBefore + 1, `${s.past.length - pastBefore} steps`);

// Drag a block to an empty spot.
await page.evaluate((id) => {
  const st = window.__monster.getState();
  const rows = { ...st.project.arrangement.rows, [id]: ['c', null, null, null, null, null, null, null].map((v) => (v ? st.project.tracks[0].activeClipId : null)) };
  window.__monster.setState({ project: { ...st.project, arrangement: { ...st.project.arrangement, rows } } });
}, bloopId);
await page.waitForTimeout(100);
const a = await cell(0).boundingBox();
const d = await cell(5).boundingBox();
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
await page.mouse.down();
await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 10 });
await page.mouse.up();
s = await S();
check('dragging moves a block', !s.project.arrangement.rows[bloopId][0] && !!s.project.arrangement.rows[bloopId][5]);

// Magic arrange + play the song to the finale.
await page.locator('.t-magic').click();
s = await S();
const filledCols = s.project.arrangement.rows[bloopId].filter(Boolean).length;
check('Monster Magic arranges the song', filledCols > 0);
await page.evaluate(() => {
  const st = window.__monster.getState();
  window.__monster.setState({ project: { ...st.project, tempo: 140, arrangement: { ...st.project.arrangement, length: 2, rows: Object.fromEntries(Object.entries(st.project.arrangement.rows).map(([k, v]) => [k, v.slice(0, 2)])) } } });
});
await page.locator('.t-play').click();
await page.waitForTimeout(500);
check('song mode plays', (await S()).transport.playing && (await S()).transport.mode === 'song');
await page.waitForSelector('.finale', { timeout: 12000 }).then(() => check('the song ends with a finale', true)).catch(() => check('the song ends with a finale', false));
check('playback stops after the song', !(await S()).transport.playing);

// ── Sound Painting ─────────────────────────────────────────────────────────
await page.locator('.dock-btn[data-screen="paint"]').click();
await page.waitForTimeout(300);
const c = await page.locator('.paint-canvas').boundingBox();
const strokesBefore = (await S()).project.painting.strokes.length;
await page.mouse.move(c.x + c.width * 0.1, c.y + c.height * 0.8);
await page.mouse.down();
await page.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.2, { steps: 20 });
await page.mouse.up();
s = await S();
check('drawing adds a stroke', s.project.painting.strokes.length === strokesBefore + 1);
const paintEvents = await page.evaluate(async () => {
  const { collectEvents } = await import('/src/magic/sequence.ts');
  const p = window.__monster.getState().project;
  return collectEvents(p, 0, p.loopBeats, { mode: 'loop' }).filter((e) => e.source === 'paint').length;
});
check('the painting becomes notes in the loop', paintEvents >= 3, `${paintEvents} notes`);
await page.locator('.paint-tool').nth(2).click();
await page.mouse.move(c.x + c.width * 0.35, c.y + c.height * 0.5);
await page.mouse.down();
await page.mouse.move(c.x + c.width * 0.36, c.y + c.height * 0.52, { steps: 3 });
await page.mouse.up();
s = await S();
check('the eraser removes it', s.project.painting.strokes.length === strokesBefore);

// ── Add Monster + Mimic with a (fake) microphone ───────────────────────────
await page.evaluate(() => window.__monster.actions.updateSettings({ ageMode: 'maker', micAllowed: true }));
await page.locator('.dock-btn[data-screen="lab"]').click();
await page.locator('.add-seat').click();
await page.locator('.tray-card[data-monster="puff"]').click();
await page.locator('.tray-card[data-monster="mimic"]').click();
await page.keyboard.press('Escape');
s = await S();
check('Puff and Mimic join the stage (Maker: 6 seats)', s.project.tracks.some((t) => t.monster === 'puff') && s.project.tracks.some((t) => t.monster === 'mimic'));
check('the newest monster is on the keys', s.project.tracks.find((t) => t.id === s.selectedTrackId)?.monster === 'mimic');
const voice = page.locator('.voice-btn');
const vb = await voice.boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForFunction(() => window.__monster.getState().project.tracks.find((t) => t.monster === 'mimic')?.sampleId, null, { timeout: 5000 }).catch(() => null);
s = await S();
check('Mimic records and keeps a voice sample', !!s.project.tracks.find((t) => t.monster === 'mimic')?.sampleId);

// Send Puff home; it comes back with its settings.
await page.locator('.add-seat').click();
await page.locator('.tray-card[data-monster="puff"]').click();
s = await S();
check('sending a monster home benches it', !s.project.tracks.some((t) => t.monster === 'puff') && s.project.bench.some((b) => b.track.monster === 'puff'));
await page.keyboard.press('Escape');

// ── Grown-up gate: hold both corners for 3 seconds ─────────────────────────
const tr = await page.locator('.corner-tr').boundingBox();
const bl = await page.locator('.corner-bl').boundingBox();
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const p1 = { x: tr.x + tr.width / 2, y: tr.y + tr.height / 2, id: 1 };
const p2 = { x: bl.x + bl.width / 2, y: bl.y + bl.height / 2, id: 2 };
await touch('touchStart', [p1]);
await touch('touchStart', [p1, p2]);
await page.waitForTimeout(1200);
check('the gate does not open early', (await S()).overlay !== 'parent');
await page.waitForTimeout(2200);
await touch('touchEnd', []);
check('holding both corners opens Parent Space', (await S()).overlay === 'parent');

// ── Export: render the song to WAV offline ─────────────────────────────────
const wav = await page.evaluate(async () => {
  const { exportSongWav } = await import('/src/studio/export.ts');
  const blob = await exportSongWav(window.__monster.getState().project);
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return { size: blob.size, riff: String.fromCharCode(...head.slice(0, 4)), wave: String.fromCharCode(...head.slice(8, 12)) };
});
check('export renders a WAV file', wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.size > 100000, `${(wav.size / 1024).toFixed(0)} KB`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
