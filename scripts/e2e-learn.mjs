// Song lessons end to end: pick a song, listen, play it back (with a slip),
// earn stars, hear it with the band, keep it as a Monster Blocks song. Also the
// key names on the lesson keys and the coloured note tags over the words.
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
const settings = (patch) => page.evaluate((p) => window.__monster.actions.updateSettings(p), patch);
/** WCAG contrast of an element's text against its own background. */
const contrastOf = (els) =>
  els.map((e) => {
    const lum = (c) => {
      const [r, g, b] = c
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map((v) => {
          v = Number(v) / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(e);
    const [hi, lo] = [lum(cs.color), lum(cs.backgroundColor)].sort((a, b) => b - a);
    return { ratio: (hi + 0.05) / (lo + 0.05), opacity: Number(cs.opacity) };
  });

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
const sungTag = await page
  .waitForFunction(() => document.querySelector('.lesson-word[data-now="true"] .word-note'), null, { timeout: 4000 })
  .then(() => true)
  .catch(() => false);
check('while the teacher sings, the sounding word lights its tag', sungTag);
await shot('learn-listen-tablet');

// Little mode starts with Magic help on; switch it off to play for real.
const helper = page.locator('.lesson-helper');
check('Magic help starts on for little monsters', (await helper.getAttribute('aria-pressed')) === 'true');
await helper.click();
await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase === 'play', null, { timeout: 8000 });
check('then it is your turn', (await phase()) === 'play');
const nextKey = async () => page.locator('.lesson-key[data-next="true"]').first();
const firstNext = await (await nextKey()).getAttribute('aria-label');
check('the next key glows', firstNext === 'E, play this one', firstNext);
await shot('learn-play-tablet');
const stickers = () =>
  page.$$eval('.lesson-key .key-name', (els) => els.map((e) => e.textContent + (e.dataset.acc === 'sharp' ? '♯' : e.dataset.acc === 'flat' ? '♭' : '')).join(' '));
check('lesson keys wear note names', (await stickers()) === 'C D E F G A B C', await stickers());
check("lesson keys climb with the teacher's pictures", (await page.locator('.lesson-key .glyph-stair').count()) === 8 && (await page.locator('.lesson-key-num').count()) === 0);
// Every syllable stands under a tag in its key's colour (and name).
const tags = await page.$$eval('.lesson-word .word-note', (els) => els.map((e) => e.textContent));
check('every word has a note tag', tags.join(' ') === 'E D C E D C', tags.join(' '));
const tagMatch = await page.evaluate(() => {
  const tag = document.querySelector('.lesson-word[data-state="next"] .word-note');
  const key = document.querySelector('.lesson-key[data-next="true"]');
  const k = (el) => getComputedStyle(el).getPropertyValue('--k').trim();
  return { same: !!tag && !!key && k(tag) === k(key) && tag.textContent === key.querySelector('.key-name').textContent, tag: tag && k(tag) };
});
check('the next tag has the next key\'s colour and name', tagMatch.same, tagMatch.tag);
const rows = await page.$$eval('.lesson-word', (els) => new Set(els.map((e) => e.offsetTop)).size);
check('"Hot cross buns, hot cross buns" stays on one row on an iPad', rows === 1, `${rows} rows`);
// Frozen at the top of their pulses, the lit tag's white ring stays clear of the "Your turn!" cue.
const cueGap = await page.evaluate(() => {
  const tag = document.querySelector('.lesson-word[data-state="next"] .word-note');
  const cue = document.querySelector('.lesson-cue');
  for (const [el, peak] of [
    [tag, '-0.5s'],
    [cue, '-0.6s'],
  ]) {
    el.style.animationDelay = peak;
    el.style.animationPlayState = 'paused';
  }
  const gap = tag.getBoundingClientRect().top - 3 - cue.getBoundingClientRect().bottom;
  for (const el of [tag, cue]) el.style.animationDelay = el.style.animationPlayState = '';
  return gap;
});
check('the pulsing next tag never covers the cue', cueGap >= 0, `${cueGap.toFixed(1)}px`);
// Upcoming tags are never faded: the dark ink keeps at least 4.5:1 on every key colour.
const todo = await page.$$eval('.lesson-word[data-state="todo"] .word-note', contrastOf);
const purple = await page.$eval('.lesson-word[data-state="todo"] .word-note', (e, fn) => {
  e.style.setProperty('--k', 'var(--key-6)');
  const out = new Function(`return (${fn})`)()([e])[0];
  e.style.removeProperty('--k');
  return out;
}, contrastOf.toString());
check(
  'upcoming note tags stay readable (≥ 4.5:1, not faded)',
  todo.length === 5 && [...todo, purple].every((t) => t.ratio >= 4.5 && t.opacity === 1),
  [...todo, purple].map((t) => t.ratio.toFixed(1)).join(' '),
);
// High contrast outlines every key, but a keyboard-focused key keeps the chunky focus ring.
await settings({ highContrast: true });
await page.locator('.lesson-key').nth(1).focus();
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
const ring = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  const other = getComputedStyle(document.querySelectorAll('.lesson-key')[3]);
  return { visible: el.matches('.lesson-key:focus-visible'), width: cs.outlineWidth, color: cs.outlineColor, other: other.outlineColor };
});
check(
  'high contrast keeps the keyboard focus ring on a lesson key',
  ring.visible && ring.width === '4px' && ring.color === 'rgb(255, 224, 102)' && ring.other !== ring.color,
  JSON.stringify(ring),
);
await page.evaluate(() => document.activeElement?.blur());
await settings({ highContrast: false });

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
check('the stars panel replaces the words', (await page.locator('.lesson-bubble').evaluate((e) => getComputedStyle(e).visibility)) === 'hidden');
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
const word = await page.locator('.lesson-word[data-state="next"] .word-text').textContent();
check('with Magic help any key plays the right note', word === 'kle', `next word "${word}"`);

// Old MacDonald is in D major: the keys read D E F♯ G A B C♯ D.
await page.getByRole('button', { name: 'Other songs' }).click();
await page.locator('.lesson-card[data-song="old-macdonald"]').click();
await page.waitForTimeout(250);
check('a song in D gets sharps', (await stickers()) === 'D E F♯ G A B C♯ D', await stickers());
const fsharp = await page.locator('.lesson-key').nth(2).getAttribute('aria-label');
check('sharps are spoken as words', fsharp.startsWith('F sharp'), fsharp);
check('black-key notes get the dark sticker', (await page.locator('.lesson-key .key-name[data-acc]').count()) === 2);
const tagAnimation = async () => page.evaluate(() => getComputedStyle(document.querySelector('.lesson-word[data-state="next"] .word-note')).animationName);
await page.locator('.lesson-helper').click();
await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase === 'play', null, { timeout: 12000 });
const pulse = await tagAnimation();
await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'reduce' }));
await page.waitForTimeout(80);
const calm = await tagAnimation();
check('the next tag pulses, but not with calm motion', pulse !== 'none' && calm === 'none', `${pulse} / ${calm}`);
// Do re mi follows the tune's home note: Old MacDonald comes home to G, so G is do.
await settings({ motion: 'system', noteNames: 'solfege' });
await page.waitForTimeout(80);
const solTags = await page.$$eval('.lesson-word .word-note', (els) => els.map((e) => e.textContent).join(' '));
check('Old MacDonald sings do do do so la la so', solTags === 'do do do so la la so', solTags);
await settings({ noteNames: 'off' });
await page.waitForTimeout(80);
check(
  '"None" keeps pictures and coloured tags, without names',
  (await page.locator('.lesson-key .key-name').count()) === 0 &&
    (await page.locator('.lesson-key .glyph-stair').count()) === 8 &&
    (await page.locator('.lesson-word .word-note').count()) > 0 &&
    (await page.$$eval('.lesson-word .word-note', (els) => els.every((e) => e.textContent === ''))),
);
await page.evaluate(() => window.__monster.actions.updateSettings({ noteNames: 'letters' }));

// An eager press right after a sung note: the teacher stops and no word stays lit.
await page.getByRole('button', { name: 'Other songs' }).click();
await page.locator('.lesson-card[data-song="hot-cross-buns"]').click();
await page.evaluate(async () => {
  const { onNote } = await import('/src/studio/visualBus.ts');
  await new Promise((resolve) => {
    let n = 0;
    const off = onNote((v) => {
      if (v.source !== 'loop' || !v.noteId?.startsWith('lesson:') || ++n < 4) return;
      off();
      // Between the note and the frame that lights its word.
      setTimeout(() => {
        document.querySelectorAll('.lesson-key')[2].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        resolve();
      }, 0);
    });
  });
});
await page.waitForTimeout(400);
const eager = await page.evaluate(() => ({
  phase: document.querySelector('.lesson').dataset.phase,
  lit: document.querySelectorAll('.lesson-word[data-now="true"]').length,
  next: document.querySelectorAll('.lesson-word[data-state="next"]').length,
}));
check('an eager press leaves only the next tag lit', eager.phase === 'play' && eager.lit === 0 && eager.next === 1, JSON.stringify(eager));

// Learn keys: stickers inside the key and clear of the picture, also while pressed (phones).
for (const [w, h] of [
  [844, 390],
  [667, 375],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const measure = () =>
    page.$$eval('.lesson-key', (keys) =>
      keys.map((k) => {
        const key = k.getBoundingClientRect();
        const name = k.querySelector('.key-name').getBoundingClientRect();
        const pic = k.querySelector('.glyph-stair g').getBoundingClientRect();
        const inside = name.left >= key.left - 0.5 && name.right <= key.right + 0.5 && name.top >= key.top && name.bottom <= key.bottom;
        return inside ? Math.round((name.top - pic.bottom) * 10) / 10 : -99;
      }),
    );
  const rest = await measure();
  await page.$$eval('.lesson-key', (keys) => keys.forEach((k) => ((k.dataset.down = 'true'), (k.dataset.glow = 'true'))));
  await page.waitForTimeout(250);
  const pressed = await measure();
  await page.$$eval('.lesson-key', (keys) => keys.forEach((k) => ((k.dataset.down = 'false'), (k.dataset.glow = 'false'))));
  check(
    `lesson stickers sit inside the keys, clear of the pictures (${w}x${h})`,
    Math.min(...rest) >= 4 && Math.min(...pressed) > 0,
    `gap rest ${Math.min(...rest)}px, pressed ${Math.min(...pressed)}px`,
  );
}

// Upright tablets: the whole verse stays on the stage for every song (Row Row Row is the longest).
for (const [w, h] of [
  [768, 1024],
  [820, 1180],
]) {
  await page.setViewportSize({ width: w, height: h });
  if (await page.locator('.lesson').count()) await page.getByRole('button', { name: 'Other songs' }).click();
  await page.waitForTimeout(250);
  if (w === 820) {
    const shelf = await page.evaluate(() => {
      const el = document.querySelector('.lesson-shelf');
      const r = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll('.lesson-card')].map((c) => c.getBoundingClientRect());
      return {
        cols: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        fits: cards.every((c) => c.left >= r.left - 0.5 && c.right <= r.right + 0.5 && c.bottom <= r.bottom + 0.5),
      };
    });
    check('upright iPad: the songs sit in a 3-column shelf, nothing cut off', shelf.cols === 3 && shelf.fits, JSON.stringify(shelf));
  }
  const clipped = [];
  for (const id of await page.$$eval('.lesson-card', (els) => els.map((e) => e.dataset.song))) {
    await page.locator(`.lesson-card[data-song="${id}"]`).click();
    await page.waitForTimeout(120);
    await page.evaluate(() => window.__monster.studio.lessonStop());
    const fit = await page.evaluate(() => {
      const stage = document.querySelector('.lesson-stage');
      const r = stage.getBoundingClientRect();
      const cs = getComputedStyle(stage);
      const bottom = r.bottom - parseFloat(cs.borderBottomWidth);
      const words = [...document.querySelectorAll('.lesson-word .word-text')].map((e) => e.getBoundingClientRect().bottom);
      const keys = [...document.querySelectorAll('.lesson-key')].map((k) => {
        const kr = k.getBoundingClientRect();
        const nr = k.querySelector('.key-name').getBoundingClientRect();
        return nr.top >= kr.top && nr.bottom <= kr.bottom;
      });
      return { over: Math.max(...words) - bottom, cue: document.querySelector('.lesson-cue').getBoundingClientRect().top - r.top, keys: keys.every(Boolean) };
    });
    if (fit.over > 0 || fit.cue < 0 || !fit.keys) clipped.push(`${id} ${Math.round(fit.over)}px`);
    await page.getByRole('button', { name: 'Other songs' }).click();
    await page.waitForTimeout(60);
  }
  check(`upright tablet: every song's words fit on the stage (${w}x${h})`, clipped.length === 0, clipped.join(', '));
}
await page.setViewportSize({ width: 1024, height: 768 });

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
