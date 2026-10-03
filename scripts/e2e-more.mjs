// Second end-to-end pass: names on the keys, Monster Blocks, Sound Painting,
// Add Monster, Mimic (with a fake microphone), the grown-up gate, an
// accessibility gate (axe-core on every screen), and WAV export.
import { existsSync, readFileSync } from 'node:fs';
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

// ── Names on the keys ──────────────────────────────────────────────────────
// A sticker's text is its letter plus a drawn sharp/flat (data-acc), or a do-re-mi syllable.
const stickers = (sel = '.keys .key-name') =>
  page.$$eval(sel, (els) => els.map((e) => e.textContent + (e.dataset.acc === 'sharp' ? '♯' : e.dataset.acc === 'flat' ? '♭' : '')).join(' '));
const settings = (patch) => page.evaluate((p) => window.__monster.actions.updateSettings(p), patch);
const spotlight = (monster) =>
  page.evaluate((m) => {
    const st = window.__monster.getState();
    window.__monster.setState({ selectedTrackId: st.project.tracks.find((t) => t.monster === m).id });
  }, monster);
await spotlight('bloop');
await page.waitForTimeout(100);
check('Lab keys wear letter stickers', (await stickers()) === 'C D E G A C D E', await stickers());
const bloopLabels = await page.$$eval('.keys .key', (els) => els.map((e) => e.getAttribute('aria-label')));
check('keys say their names out loud', bloopLabels[2] === 'Bloop: E' && bloopLabels[5] === 'Bloop: C (higher)', `${bloopLabels[2]} / ${bloopLabels[5]}`);
// Every sticker sits inside its key and clear of the glyph staircase (phone and tablet).
for (const [w, h] of [
  [844, 390],
  [1024, 768],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const boxes = await page.$$eval('.keys .key', (keys) =>
    keys.map((k) => {
      const r = (el) => el.getBoundingClientRect();
      const key = r(k);
      const name = r(k.querySelector('.key-name'));
      const glyph = r(k.querySelector('.glyph-stair'));
      const inside = name.left >= key.left - 0.5 && name.right <= key.right + 0.5 && name.top >= key.top && name.bottom <= key.bottom;
      const apart = glyph.bottom <= name.top || glyph.top >= name.bottom || glyph.right <= name.left || glyph.left >= name.right;
      return inside && apart && name.height >= 20;
    }),
  );
  check(`stickers sit inside the keys, clear of the pictures (${w}x${h})`, boxes.length === 8 && boxes.every(Boolean), boxes.join(','));
}
await page.setViewportSize({ width: 1024, height: 768 });
await settings({ highContrast: true });
await page.waitForTimeout(100);
const hc = await page.$eval('.keys .key-name', (e) => {
  const cs = getComputedStyle(e);
  return { bg: cs.backgroundColor, ink: cs.color, outline: cs.outlineStyle };
});
check('high contrast gives solid outlined stickers', hc.bg === 'rgb(255, 255, 255)' && hc.ink === 'rgb(11, 13, 48)' && hc.outline === 'solid', JSON.stringify(hc));
await settings({ highContrast: false, noteNames: 'solfege' });
await page.waitForTimeout(100);
check('do re mi starts on do', (await stickers()) === 'do re mi so la do re mi', await stickers());
await settings({ noteNames: 'off' });
await page.waitForTimeout(100);
check('"None" leaves pictures only', (await page.locator('.keys .key-name').count()) === 0 && (await page.locator('.keys .glyph-stair').count()) === 8);
await settings({ noteNames: 'letters' });
await spotlight('boom');
await page.waitForTimeout(100);
check('Boom has no letters (Little: no drum words either)', (await page.locator('.keys .key-name').count()) === 0 && (await page.locator('.keys .pad-name').count()) === 0);
await settings({ ageMode: 'maker' });
await page.waitForTimeout(150);
const words = await page.locator('.keys .pad-name').allTextContents();
check('Monster Makers see drum words on Boom', words.join(' ') === 'kick snare hat clap bongo crash bell boing', words.join(' '));
check('drum words keep the friendly spoken names', (await page.locator('.keys .key').first().getAttribute('aria-label')) === 'Big drum');
const boomPadColours = (await page.$$eval('.keys .key', (els) => els.map((e) => e.style.getPropertyValue('--k')))).join(' ');
await spotlight('bloop');
await page.locator('.t-magic').click();
await page.waitForTimeout(150);
const moodNotes = await page.$$eval('.mood', (els) =>
  els.map((e) => [e.dataset.scale, [...e.querySelectorAll('.mood-note')].map((n) => n.textContent + (n.querySelector('.acc[data-dir="flat"]') ? '♭' : n.querySelector('.acc[data-dir="sharp"]') ? '♯' : '')).join(' ')]),
);
const mystery = moodNotes.find(([id]) => id === 'pentatonicMinor');
check('each mood is tagged with its scale', moodNotes.map(([id]) => id).join(',') === 'pentatonicMajor,pentatonicMinor,major,minor,blues,chromatic');
check('Monster Magic shows the notes of each mood', mystery?.[1] === 'C E♭ F G B♭', mystery?.[1]);
await page.locator('.mood[data-scale="pentatonicMinor"]').click();
await page.waitForTimeout(150);
check('a new mood re-letters the keys', (await stickers()) === 'C E♭ F G B♭ C E♭ F', await stickers());
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(100);
check('undo brings the old letters back', (await S()).project.scale === 'pentatonicMajor' && (await stickers()) === 'C D E G A C D E', await stickers());
// "None" in Maker mode: no drum words and no notes under the moods either.
await settings({ noteNames: 'off' });
await spotlight('boom');
await page.waitForTimeout(100);
const offWords = await page.locator('.keys .pad-name').count();
await page.locator('.t-magic').click();
await page.waitForTimeout(150);
const offMoods = await page.locator('.mood .mood-notes').count();
const moodsShown = await page.locator('.mood').count();
await page.keyboard.press('Escape');
check('"None" in Maker mode hides drum words and mood notes', offWords === 0 && offMoods === 0 && moodsShown === 6, `${offWords} words, ${offMoods} mood notes`);
await settings({ noteNames: 'letters' });
await spotlight('bloop');
await settings({ ageMode: 'little' });
await page.waitForTimeout(100);

// Sparkles where the finger lands: a few per key at most, gone quickly, none with calm motion.
const keysBox = await page.locator('.keys').boundingBox();
const glide = async () => {
  await page.mouse.move(keysBox.x + 10, keysBox.y + keysBox.height * 0.4);
  await page.mouse.down();
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(keysBox.x + keysBox.width - 10, keysBox.y + keysBox.height * 0.5, { steps: 12 });
    await page.mouse.move(keysBox.x + 10, keysBox.y + keysBox.height * 0.4, { steps: 12 });
  }
};
await glide();
const sparkle = await page.$$eval('.keys .key', (keys) => ({
  bursts: keys.map((k) => k.querySelectorAll('.key-burst').length),
  sparks: document.querySelectorAll('.keys .key-spark').length,
  catches: [...document.querySelectorAll('.key-burst, .key-spark')].some((e) => getComputedStyle(e).pointerEvents !== 'none'),
}));
await page.mouse.up();
check('a glissando sprinkles sparks where the finger goes', sparkle.sparks > 0 && Math.max(...sparkle.bursts) <= 3 && !sparkle.catches, sparkle.bursts.join(','));
// One tap: sparks big enough to see, still bright mid-flight, and the burst clipped to its own key.
await page.waitForTimeout(600);
const tapKey = await page.locator('.keys .key').nth(5).boundingBox();
await page.mouse.move(tapKey.x + tapKey.width / 2, tapKey.y + tapKey.height * 0.45);
await page.mouse.down();
await page.waitForTimeout(120);
const tap = await page.evaluate(() => {
  const key = document.querySelectorAll('.keys .key')[5];
  const kr = key.getBoundingClientRect();
  const clip = key.querySelector('.key-burst');
  const cr = clip?.getBoundingClientRect();
  const sparks = [...key.querySelectorAll('.key-spark')].map((s) => ({ w: s.offsetWidth, o: Number(getComputedStyle(s).opacity) }));
  return {
    clipped: !!cr && getComputedStyle(clip).overflow === 'hidden' && Math.abs(cr.left - kr.left) < 1 && Math.abs(cr.right - kr.right) < 1,
    size: Math.min(...sparks.map((s) => s.w)),
    bright: sparks.every((s) => s.o === 1),
  };
});
await page.mouse.up();
check('a tap sparkles inside its own key, big and bright', tap.clipped && tap.size >= 10 && tap.bright, JSON.stringify(tap));
await page.waitForTimeout(600);
check('sparks clear up after the touch', (await page.locator('.key-burst').count()) === 0 && (await page.locator('.keys .key[data-down="true"]').count()) === 0);
await settings({ motion: 'reduce' });
await glide();
const calmSparks = await page.locator('.key-burst').count();
await page.mouse.up();
await settings({ motion: 'system' });
check('calm motion: no sparks', calmSparks === 0);

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

// Magic arrange (heard at once, from block 1) + play the song to the finale.
await page.locator('.t-magic').click();
await page.waitForTimeout(150);
s = await S();
const filledCols = s.project.arrangement.rows[bloopId].filter(Boolean).length;
check('Monster Magic arranges the song', filledCols > 0);
const magicBeat = await page.evaluate(() => window.__monster.studio.debug().beat);
check('…and plays it at once from block 1', s.transport.playing && s.transport.mode === 'song' && magicBeat < 1, `beat ${magicBeat.toFixed(2)}`);
await page.locator('.t-play').click();
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
// The ribbon flashes the lane that sounds while the painting plays.
await page.evaluate(() => {
  window.__ribbonFlashes = 0;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    if (this.matches?.('.paint-ribbon i')) window.__ribbonFlashes++;
    return animate.apply(this, args);
  };
});
await page.locator('.t-play').click();
await page.waitForTimeout(2500);
await page.locator('.t-play').click();
const flashes = await page.evaluate(() => window.__ribbonFlashes);
check('the ribbon flashes the lanes that sound', flashes >= 3, `${flashes} flashes`);
await page.locator('.paint-tool').nth(2).click();
await page.mouse.move(c.x + c.width * 0.35, c.y + c.height * 0.5);
await page.mouse.down();
await page.mouse.move(c.x + c.width * 0.36, c.y + c.height * 0.52, { steps: 3 });
await page.mouse.up();
s = await S();
check('the eraser removes it', s.project.painting.strokes.length === strokesBefore);
// Lane names and the colour ribbon follow the real lanes, and never take a touch.
check('paint lanes are named low to high', (await stickers('.paint-lane-name')) === 'C D E G A C D E', await stickers('.paint-lane-name'));
const lanesOk = await page.evaluate(async () => {
  const { laneForY } = await import('/src/magic/painting.ts');
  const c = document.querySelector('.paint-canvas').getBoundingClientRect();
  const lines = [...document.querySelectorAll('.paint-lanes span')].map((l) => (l.getBoundingClientRect().top - c.top) / c.height);
  const names = [...document.querySelectorAll('.paint-lane-name')].map((n, lane) => {
    const r = n.getBoundingClientRect();
    return laneForY((r.top + r.height / 2 - c.top) / c.height) === lane;
  });
  const ribbon = document.querySelector('.paint-ribbon i').getBoundingClientRect();
  const label = document.querySelector('.paint-lane-name').getBoundingClientRect();
  const under = [document.elementFromPoint(ribbon.x + ribbon.width / 2, ribbon.y + ribbon.height / 2), document.elementFromPoint(label.x + label.width / 2, label.y + label.height / 2)];
  return {
    lines: lines.length === 7 && lines.every((y) => laneForY(y - 0.004) !== laneForY(y + 0.004)),
    names: names.every(Boolean),
    touch: under.every((el) => el?.tagName === 'CANVAS'),
  };
});
check('lane lines sit where the pitch changes', lanesOk.lines);
check('each lane name sits in its own lane', lanesOk.names);
check('the ribbon and names never catch a touch', lanesOk.touch);
const ribbonFits = await page.evaluate(() => {
  // Each colour starts exactly where its lane starts (the lane lines).
  const c = document.querySelector('.paint-canvas').getBoundingClientRect();
  const lines = [...document.querySelectorAll('.paint-lanes span')].map((l) => l.getBoundingClientRect().top - c.top).sort((a, b) => a - b);
  const tops = [...document.querySelectorAll('.paint-ribbon i')].map((i) => i.getBoundingClientRect().top - c.top).sort((a, b) => a - b).slice(1);
  return tops.every((t, i) => Math.abs(t - lines[i]) < 1);
});
check('the colour ribbon lines up with the lanes', ribbonFits);
const brushBefore = (await S()).paint.brush;
await page.locator('.swatch[data-brush="boom"]').click();
check('the Boom brush paints drums, so no lane names', (await page.locator('.paint-lane-name').count()) === 0 && (await page.locator('.paint-ribbon i').count()) === 8);
const boomRibbon = await page.$$eval('.paint-ribbon i', (els) => els.map((e) => e.style.getPropertyValue('--k')).join(' '));
check("Boom's lanes wear its drum pads' colours", boomRibbon === boomPadColours, boomRibbon);
await page.evaluate((b) => window.__monster.actions.setPaintBrush(b), brushBefore);
await settings({ noteNames: 'off' });
await page.waitForTimeout(80);
check('"None" hides the lane names too', (await page.locator('.paint-lane-name').count()) === 0);
await settings({ noteNames: 'letters' });

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
check('Mimic singing with its own voice shows letters', (await stickers()) === 'C D E G A C D E', await stickers());
const voice = page.locator('.voice-btn');
const vb = await voice.boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForFunction(() => window.__monster.getState().project.tracks.find((t) => t.monster === 'mimic')?.sampleId, null, { timeout: 5000 }).catch(() => null);
s = await S();
check('Mimic records and keeps a voice sample', !!s.project.tracks.find((t) => t.monster === 'mimic')?.sampleId);
check('a recorded voice has no letters (it sings at the child\'s own pitch)', (await page.locator('.keys .key-name').count()) === 0 && (await page.locator('.keys .glyph-stair').count()) === 8);

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

// ── Accessibility gate: axe-core finds nothing on any screen ───────────────
// Lab (keys face), Blocks, Paint, Songs, the Learn shelf, a lesson, the Add
// Monster tray, the Monster Magic panel and Parent Space. (Beat Hop's grid face
// is scanned by e2e-steps.) Any violation fails the run.
const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);
if (!existsSync(axePath)) {
  check('axe-core is installed for the accessibility gate (npm i -D axe-core)', false);
} else {
  await page.addScriptTag({ content: readFileSync(axePath, 'utf8') });
  const M = (fn, arg) => page.evaluate(fn, arg);
  const axe = async (label) => {
    await page.waitForTimeout(400);
    const found = await page.evaluate(async () => {
      const r = await window.axe.run(document.body, { resultTypes: ['violations'] });
      return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(', ')}`);
    });
    check(`axe: no violations on ${label}`, found.length === 0, found.join(' | '));
  };
  await axe('Parent Space');
  await M(() => window.__monster.actions.setOverlay(null));
  await M(() => {
    window.__monster.actions.setLabView('keys');
    window.__monster.actions.setScreen('lab');
  });
  await axe('the Lab (keys)');
  await M(() => window.__monster.actions.setOverlay('tray'));
  await axe('the Add Monster tray');
  await M(() => window.__monster.actions.setOverlay('magic'));
  await axe('the Monster Magic panel');
  await M(() => window.__monster.actions.setOverlay(null));
  await M(() => window.__monster.actions.setScreen('blocks'));
  await axe('Monster Blocks');
  await M(() => window.__monster.actions.setScreen('paint'));
  await axe('Sound Painting');
  await M(() => window.__monster.actions.setScreen('songs'));
  await axe('the Songs shelf');
  await M(() => window.__monster.actions.setScreen('learn'));
  await axe('the Learn shelf');
  await page.locator('.lesson-shelf button').first().click();
  await axe('a lesson');
  await page.locator('.lesson-bar .lesson-btn').first().click();
  await M(() => window.__monster.actions.setScreen('lab'));
}

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
