// Third end-to-end pass: edge cases found in code review, kept as regression
// checks. Feedback sounds never land in a loop, redo survives an empty take,
// focus loss never leaves a note stuck, rest time locks every way to play,
// leaving the Lab ends a take, and a Mimic recording shared by a copied song
// survives deleting the original (and is cleaned up once nothing uses it).
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
const debug = () => page.evaluate(() => window.__monster.studio.debug());
const bloopNotes = () =>
  page.evaluate(() => {
    const t = window.__monster.getState().project.tracks.find((x) => x.monster === 'bloop');
    return t?.clips[0]?.notes.length ?? 0;
  });
const button = (name) => page.getByRole('button', { name, exact: true });
const sampleStored = (id) =>
  page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open('monster-synth');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('samples', 'readonly').objectStore('samples').get(id);
          get.onsuccess = () => {
            resolve(get.result !== undefined);
            db.close();
          };
          get.onerror = () => {
            resolve(false);
            db.close();
          };
        };
      }),
    id,
  );

// ── Feedback sounds (effect buddies) are heard but never recorded ──────────
await page.evaluate(() => {
  const s = window.__monster.getState();
  window.__monster.actions.selectTrack(s.project.tracks.find((t) => t.monster === 'bloop').id);
});
await button('Record a loop').click();
await page.keyboard.press('a');
await page.waitForTimeout(300);
let s = await S();
const takeNotes = await bloopNotes();
check('a key press starts the take', s.transport.recording && takeNotes === 1, `${takeNotes} note`);
await page.locator('.tool-btn:not(.tool-costume):visible').first().click();
await page.waitForTimeout(400);
check('tapping an effect buddy while recording adds no note', (await bloopNotes()) === takeNotes, `${await bloopNotes()} notes`);
await button('Stop recording').click();
await button('Stop').click();

// ── Redo survives a take where nothing was played ──────────────────────────
await button('Undo').click();
s = await S();
const redoBefore = s.future.length;
await button('Record a loop').click();
await page.waitForTimeout(200);
await button('Stop recording').click();
s = await S();
check('redo survives an empty take', redoBefore > 0 && s.future.length === redoBefore, `${redoBefore} → ${s.future.length}`);
// (The Redo button is a Monster Maker extra; the action is the same.)
await page.evaluate(() => window.__monster.studio.redo());
check('redo still works after it', (await bloopNotes()) === takeNotes);

// ── Losing focus never leaves a note stuck ─────────────────────────────────
await page.keyboard.down('s');
await page.waitForTimeout(100);
const during = await debug();
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForTimeout(100);
const after = await debug();
check('window blur releases a held key', during.live === 1 && after.live === 0 && after.held === 0, `live ${during.live} → ${after.live}, held ${after.held}`);
await page.keyboard.up('s');
await page.keyboard.down('s');
await page.waitForTimeout(60);
const again = await debug();
await page.keyboard.up('s');
check('the same key plays again after focus returns', again.live === 1);

// ── Rest time locks every way to play until a grown-up continues ───────────
// (With a loop in the song, Record starts the band at once, so stop it first.)
if ((await S()).transport.playing) await button('Stop').click();
await page.evaluate(() => window.__monster.setState({ resting: true }));
await page.waitForTimeout(150);
await page.keyboard.down('d');
await page.waitForTimeout(60);
const restKey = await debug();
await page.keyboard.up('d');
await page.keyboard.press('r');
await page.keyboard.press(' ');
await page.evaluate(() => window.__monster.studio.play());
await page.waitForTimeout(100);
s = await S();
check('rest time shows the sleepy band', await page.locator('.rest').isVisible());
check(
  'rest time blocks keys, record and play',
  restKey.live === 0 && !s.transport.playing && !s.transport.armed && !s.transport.recording,
  `live ${restKey.live}, playing ${s.transport.playing}, armed ${s.transport.armed}`,
);
await page.evaluate(() => window.__monster.actions.setOverlay('parent'));
await page.waitForTimeout(100);
await page.evaluate(() => window.__monster.actions.setOverlay(null));
await page.waitForTimeout(100);
s = await S();
check('closing Parent Space wakes the band', !s.resting && !(await page.locator('.rest').isVisible()));

// ── Leaving the Lab ends a take ────────────────────────────────────────────
await button('Record a loop').click();
s = await S();
const taking = s.transport.recording || s.transport.armed;
await page.locator('.dock-btn[data-screen="paint"]').click();
await page.waitForTimeout(150);
s = await S();
check('leaving the Lab ends the take', taking && !s.transport.armed && !s.transport.recording);
await page.locator('.dock-btn[data-screen="lab"]').click();
if ((await S()).transport.playing) await button('Stop').click();

// ── A Mimic recording shared by a copied song ──────────────────────────────
await page.evaluate(() => window.__monster.actions.updateSettings({ ageMode: 'maker', micAllowed: true }));
await page.waitForTimeout(150);
await page.locator('.add-seat').click();
await page.locator('.tray-card[data-monster="mimic"]').click();
await page.keyboard.press('Escape');
const vb = await page.locator('.voice-btn').boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page
  .waitForFunction(() => window.__monster.getState().project.tracks.find((t) => t.monster === 'mimic')?.sampleId, null, { timeout: 5000 })
  .catch(() => null);
s = await S();
const sampleId = s.project.tracks.find((t) => t.monster === 'mimic')?.sampleId;
const originalId = s.project.id;
check('Mimic keeps a recording', !!sampleId && (await sampleStored(sampleId)));

await page.evaluate((id) => window.__monster.actions.duplicateSong(id), originalId);
const copyId = (await S()).songs.find((m) => m.id !== originalId)?.id;
await page.evaluate((id) => window.__monster.actions.deleteSong(id), originalId);
await page.waitForTimeout(200);
s = await S();
const copyMimic = s.project.tracks.find((t) => t.monster === 'mimic');
check(
  'deleting a song keeps a recording its copy still uses',
  s.project.id === copyId && copyMimic?.sampleId === sampleId && (await sampleStored(sampleId)),
);

await page.evaluate((id) => window.__monster.actions.deleteSong(id), copyId);
await page.waitForTimeout(200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__monster?.getState().ready);
let gone = false;
for (let i = 0; i < 20 && !gone; i++) {
  await page.waitForTimeout(150);
  gone = !(await sampleStored(sampleId));
}
check('a recording no song uses is cleaned up on the next launch', gone);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
