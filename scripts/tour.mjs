// Visual tour of every screen for design review.
// Usage: node scripts/tour.mjs [url] [outDir] [viewName]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const outDir = process.argv[3] || 'screenshots/tour';
const only = process.argv[4] || '';
mkdirSync(outDir, { recursive: true });

const VIEWS = [
  { name: 'phone', width: 844, height: 390 },
  { name: 'ipad', width: 1024, height: 768 },
  { name: 'portrait', width: 820, height: 1180 },
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const v of VIEWS) {
  if (only && v.name !== only) continue;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(v.width / 2, v.height / 2);
  await page.waitForTimeout(400);
  const shot = async (n) => page.screenshot({ path: `${outDir}/${v.name}-${n}.png` });

  // Songs shelf → Monster Band
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(300);
  await shot('1-songs-empty');
  await page.locator('.song-band').click();
  await page.waitForTimeout(500);
  await page.locator('.t-play').click();
  await page.waitForTimeout(1100);
  await shot('2-lab-band-playing');
  await page.locator('.t-play').click();

  // Beat Hop: Boom's grid (Little Monster), playing.
  await page.locator('.pod[data-monster="boom"] .pod-hit').click();
  await page.waitForTimeout(300);
  await page.locator('.surface-flip').click();
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(1300);
  await shot('2b-grid-little-playing');
  await page.locator('.t-play').click();
  await page.locator('.surface-flip').click();
  await page.waitForTimeout(200);

  // Blocks
  await page.locator('.dock-btn[data-screen="blocks"]').click();
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(2500);
  await shot('3-blocks-playing');
  await page.locator('.t-play').click();

  // Paint: draw a rainbow wave and some stars
  await page.locator('.dock-btn[data-screen="paint"]').click();
  await page.waitForTimeout(400);
  const c = await page.locator('.paint-canvas').boundingBox();
  const draw = async (pts) => {
    await page.mouse.move(c.x + pts[0][0] * c.width, c.y + pts[0][1] * c.height);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(c.x + x * c.width, c.y + y * c.height, { steps: 6 });
    await page.mouse.up();
  };
  await page.locator('.swatch[data-brush="rainbow"]').click();
  const wave = Array.from({ length: 24 }, (_, i) => [0.05 + i * 0.038, 0.5 - 0.3 * Math.sin(i / 3.2)]);
  await draw(wave);
  await page.locator('.swatch[data-brush="grumble"]').click();
  await draw([[0.05, 0.9], [0.45, 0.9]]);
  await page.locator('.paint-tool').nth(1).click();
  await page.locator('.swatch[data-brush="spark"]').click();
  await draw([[0.6, 0.2], [0.7, 0.15], [0.8, 0.25], [0.9, 0.12]]);
  await page.waitForTimeout(300);
  await shot('4-paint');

  // Lab tray + Maker mode + magic panel
  await page.locator('.dock-btn[data-screen="lab"]').click();
  await page.waitForTimeout(300);
  await page.locator('.add-seat').click();
  await page.waitForTimeout(400);
  await shot('5-tray');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__monster.actions.updateSettings({ ageMode: 'maker' }));
  await page.waitForTimeout(300);
  await shot('6-lab-maker');
  // Beat Hop in Monster Maker: beat numbers, the "+" for more drums, a wand groove.
  await page.locator('.pod[data-monster="boom"] .pod-hit').click();
  await page.waitForTimeout(300);
  await page.locator('.surface-flip').click();
  await page.waitForTimeout(300);
  await page.locator('.t-surprise').click();
  await page.waitForTimeout(1200);
  await shot('6b-grid-maker-wand');
  await page.locator('.t-play').click();
  // All eight drums: as many rows as fit at a finger's size, the rest folded behind
  // '+N' (phones and iPad landscape), with the tray open.
  await page.evaluate(async () => {
    const m = window.__monster;
    const edits = await import('/src/model/edits.ts');
    const boom = m.getState().selectedTrackId;
    const notes = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((pad, i) => Array.from({ length: 8 - i }, (_, k) => ({ id: `t${pad}_${k}`, beat: (k * 3 + pad) % 8, step: pad, dur: 0.5, vel: 0.8, tone: 0 })));
    m.studio.stepEdit(boom, (p) => edits.replaceLoopNotes(p, boom, notes), { col: 0, preview: 'none' });
    m.studio.stop();
  });
  await page.waitForTimeout(300);
  await shot('6c-grid-maker-eight-drums');
  const more = page.locator('.grid-add').filter({ visible: true });
  if (await more.count()) {
    await more.first().click();
    await page.waitForTimeout(350);
    await shot('6d-grid-maker-more-drums-tray');
    await page.locator('.picker-close').click();
  }
  await page.locator('.surface-flip').click();
  await page.waitForTimeout(200);
  await page.locator('.t-magic').click();
  await page.waitForTimeout(400);
  await shot('7-magic-panel');
  await page.keyboard.press('Escape');

  // Parent space
  await page.evaluate(() => window.__monster.actions.setOverlay('parent'));
  await page.waitForTimeout(400);
  await shot('8-parent');
  await page.keyboard.press('Escape');

  // Make a beat: a new song that opens on Boom's empty grid (the first stones shimmer).
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(300);
  await page.locator('.song-beat').click();
  await page.waitForTimeout(700);
  await shot('8b-make-a-beat');

  // Songs shelf with songs: each saved song wears a picture from its name
  // (and a song kept from Learn keeps its Learn picture).
  await page.evaluate(async () => {
    const m = window.__monster;
    for (const name of ['The Zippy Banana', 'Cosmic Spaceship', 'Hot Cross Buns']) {
      await m.actions.newSong('blank');
      await m.actions.renameSong(m.getState().project.id, name);
    }
  });
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(400);
  await shot('9-songs');
  if (errors.length) console.log(v.name, 'ERRORS:\n' + errors.join('\n'));
  await ctx.close();
}
await browser.close();
console.log('tour done');
