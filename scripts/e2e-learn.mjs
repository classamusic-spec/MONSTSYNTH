// Song lessons end to end: pick a song, listen, play it back (with a slip),
// earn stars, hear it with the band, keep it as a Monster Blocks song.
// Usage: node scripts/e2e-learn.mjs [url] [screenshot-dir]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const shots = process.argv[3] || null;
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
await page.waitForTimeout(400);
const S = () => page.evaluate(() => window.__monster.getState());
const phase = () => page.locator('.lesson').getAttribute('data-phase');
const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));

await page.locator('.dock-btn[data-screen="learn"]').click();
await page.waitForTimeout(300);
check('Learn shows the song shelf', (await page.locator('.lesson-card').count()) === 8, `${await page.locator('.lesson-card').count()} songs`);
await shot('learn-shelf-tablet');

await page.locator('.lesson-card[data-song="hot-cross-buns"]').click();
await page.waitForTimeout(250);
check('the teacher sings first', (await phase()) === 'listen');
let peak = 0;
for (let i = 0; i < 10; i++) {
  peak = Math.max(peak, (await page.evaluate(() => window.__monster.studio.debug().level)) ?? 0);
  await page.waitForTimeout(80);
}
check('the phrase is audible', peak > 0.01, `level ${peak.toFixed(3)}`);
await shot('learn-listen-tablet');

// Little mode starts with Magic help on; switch it off to play for real.
const helper = page.locator('.lesson-helper');
check('Magic help starts on for little monsters', (await helper.getAttribute('aria-pressed')) === 'true');
await helper.click();
await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase === 'play', null, { timeout: 8000 });
check('then it is your turn', (await phase()) === 'play');
const nextKey = async () => page.locator('.lesson-key[data-next="true"]').first();
const firstNext = await (await nextKey()).getAttribute('aria-label');
check('the next key glows', firstNext === 'Note 3, play this one', firstNext);
await shot('learn-play-tablet');

// One slip: the wrong key still plays, the right one is shown again.
await page.locator('.lesson-key').nth(7).dispatchEvent('pointerdown');
await page.waitForTimeout(60);
check('a wrong key shows the right one', (await page.locator('.lesson-key[data-hint="true"]').count()) === 1);

// Play the song through.
let presses = 0;
for (let guard = 0; guard < 200; guard++) {
  const ph = await phase();
  if (ph === 'done') break;
  if (ph === 'play') {
    const k = page.locator('.lesson-key[data-next="true"]');
    if ((await k.count()) === 1) {
      await k.dispatchEvent('pointerdown');
      presses++;
      await page.waitForTimeout(90);
      continue;
    }
  }
  await page.waitForTimeout(120);
}
const notes = 17;
check('the whole song can be played', (await phase()) === 'done' && presses === notes, `${presses} notes`);
await page.waitForTimeout(900);
await shot('learn-done-tablet');
let s = await S();
check('stars are kept', s.settings.lessonStars['hot-cross-buns'] === 3, JSON.stringify(s.settings.lessonStars));

await page.getByRole('button', { name: 'With the band' }).click();
await page.waitForTimeout(700);
peak = 0;
for (let i = 0; i < 10; i++) {
  peak = Math.max(peak, (await page.evaluate(() => window.__monster.studio.debug().level)) ?? 0);
  await page.waitForTimeout(80);
}
check('the band plays along', (await phase()) === 'band' && peak > 0.01, `level ${peak.toFixed(3)}`);
await page.getByRole('button', { name: 'Stop', exact: true }).click();
check('stopping the band returns to the stars', (await phase()) === 'done');

await page.getByRole('button', { name: 'Keep my song' }).click();
await page.waitForTimeout(500);
s = await S();
check(
  'keeping it makes a Monster Blocks song',
  s.screen === 'blocks' && s.project.name === 'Hot Cross Buns' && s.project.scale === 'major' && s.project.arrangement.length === 8,
);
check('it is on the song shelf', s.songs.some((m) => m.name === 'Hot Cross Buns'));
await page.getByRole('button', { name: 'Play the song' }).click();
await page.waitForTimeout(600);
s = await S();
check('the kept song plays in song mode', s.transport.playing && s.transport.mode === 'song');
await page.getByRole('button', { name: 'Stop', exact: true }).click();

// Magic help: any key plays the right note.
await page.locator('.dock-btn[data-screen="learn"]').click();
await page.locator('.lesson-card[data-song="twinkle"]').click();
await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase === 'play', null, { timeout: 10000 });
await page.locator('.lesson-key').nth(7).dispatchEvent('pointerdown');
await page.waitForTimeout(60);
const word = await page.locator('.lesson-word[data-state="next"]').textContent();
check('with Magic help any key plays the right note', word === 'kle', `next word "${word}"`);
await page.locator('.dock-btn[data-screen="lab"]').click();
await page.waitForTimeout(200);
check('no lesson keeps playing in the Lab', !(await page.evaluate(() => window.__monster.studio.lessonPlaying)));

if (shots) {
  for (const [w, h, tag] of [
    [844, 390, 'phone'],
    [820, 1180, 'portrait'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator('.dock-btn[data-screen="learn"]').click();
    await page.waitForTimeout(300);
    await shot(`learn-shelf-${tag}`);
    await page.locator('.lesson-card[data-song="old-macdonald"]').click();
    await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase === 'play', null, { timeout: 12000 }).catch(() => null);
    await shot(`learn-play-${tag}`);
    await page.getByRole('button', { name: 'Other songs' }).click();
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
