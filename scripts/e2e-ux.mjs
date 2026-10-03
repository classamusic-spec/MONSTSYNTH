// UX essentials: no dead ends, sound and celebration on every key moment,
// keyboard and switch access, and "make it a song" in one tap.
//   1. An empty song: Play / Space / Magic answer with a "huh?" and a pointer,
//      never a silent loop, a false finale or an empty undo step.
//   2. Monster Blocks is heard: pressing a block plays it (and writes nothing),
//      taking it away pops, filling sings and then plays the loop placed.
//   3. A song kept from Learn keeps its phrases through Magic and gap filling.
//   4. A first loop is cheered: a dot waits on the Blocks button until Blocks
//      is visited, and when the take ends the monster jumps and sparkles and its
//      badge pops (never mid-take). Waking up, every monster bounces with its hello.
//   5. Keyboards: Tab reaches every Lab key, Enter plays; Blocks has one tab
//      stop, arrows move, Enter fills or clears, Shift+arrow moves a block.
//   6. Make it a song: two loops in Little mode → the song button (clear of
//      Record, Surprise, Undo and Play) → Blocks, playing an arranged song;
//      one Undo takes it back. Blocks' Magic replays from block 1.
//   7. Reduced motion: no blinking, no echo ghosts, glows instead of jumps.
//   8. Upright tablets: the answer's bubble never hides what the hand points at.
// Usage: node scripts/e2e-ux.mjs [url]   (the dev server must be running)
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

/** Every Web Animation started (its id and the properties it moves), recorded from the first frame. */
function hookAnimations() {
  window.__anims = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    const props = Array.isArray(frames) ? [...new Set(frames.flatMap((f) => Object.keys(f)))] : Object.keys(frames ?? {});
    window.__anims.push({ id: opts && typeof opts === 'object' ? (opts.id ?? '') : '', props });
    return animate.call(this, frames, opts);
  };
}

async function openApp({ viewport = { width: 1024, height: 768 }, reducedMotion = 'no-preference', wake = true } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  await ctx.addInitScript(hookAnimations);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  if (wake) {
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await page.waitForTimeout(500);
  }
  return { ctx, page };
}

const S = (page) => page.evaluate(() => window.__monster.getState());
const dbg = (page) => page.evaluate(() => window.__monster.studio.debug());
const anims = (page, prefix) => page.evaluate((p) => window.__anims.filter((a) => a.id.startsWith(p)), prefix);
const resetAnims = (page) => page.evaluate(() => (window.__anims = []));
/** The coach's hand sits on the centre of this element. */
const handOn = (page, selector) =>
  page.evaluate((selector) => {
    const hand = document.querySelector('.coach-hand');
    const el = document.querySelector(selector);
    if (!hand || !el) return false;
    const r = el.getBoundingClientRect();
    return Math.abs(parseFloat(hand.style.left) - (r.left + r.width / 2)) < 2 && Math.abs(parseFloat(hand.style.top) - (r.top + r.height / 2)) < 2;
  }, selector);
/** Nothing covers this element's centre (bubbles and the hand let touches through, so a covering bubble shows here). */
const uncovered = (page, selector) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const b = document.querySelector('.bubble')?.getBoundingClientRect();
    const clear = !b || b.right <= r.left || r.right <= b.left || b.bottom <= r.top || r.bottom <= b.top;
    return !!top && (top === el || el.contains(top)) && clear;
  }, selector);
/** Count "nothing-to-play" answers from now on. */
const countNothing = (page) =>
  page.evaluate(() => {
    window.__nothing = 0;
    window.__monster.bus.onStudioEvent((e) => e.type === 'nothing-to-play' && window.__nothing++);
  });
const nothing = (page) => page.evaluate(() => window.__nothing);
/** Remember every sequenced sound from now on (which channel it played on). */
const spy = (page) =>
  page.evaluate(() => {
    window.__trig = [];
    const eng = window.__monster.studio.engine;
    if (eng.__spied) return;
    eng.__spied = true;
    const trigger = eng.trigger.bind(eng);
    eng.trigger = (req, when, dur) => {
      window.__trig.push(req.channelId);
      return trigger(req, when, dur);
    };
  });
const trig = (page) => page.evaluate(() => window.__trig);
const clipsJson = (page) => page.evaluate(() => JSON.stringify(window.__monster.getState().project.tracks.map((t) => t.clips)));
const trackId = (page, monster) => page.evaluate((m) => window.__monster.getState().project.tracks.find((t) => t.monster === m).id, monster);
const cellCenter = async (page, rowId, col) => {
  const b = await page.locator(`.block[data-row="${rowId}"][data-col="${col}"]`).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const rects = (page, selectors) =>
  page.evaluate(
    (sels) =>
      sels.map((q) => {
        const el = document.querySelector(q);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { q, l: r.left, r: r.right, t: r.top, b: r.bottom };
      }),
    selectors,
  );
const overlap = (a, b) => !!a && !!b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
/** Record a few notes on a monster from the computer keyboard (A S D F G H J K). */
async function recordKeys(page, monster, keys) {
  await page.evaluate((m) => {
    const s = window.__monster.getState();
    window.__monster.actions.selectTrack(s.project.tracks.find((t) => t.monster === m).id);
  }, monster);
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Record a loop' }).click();
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(260);
  }
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.waitForTimeout(100);
}

// ── 1. An empty song has no dead ends ──────────────────────────────────────
{
  const { ctx, page } = await openApp();
  await page.evaluate(() => window.__monster.actions.newSong('blank'));
  await page.waitForTimeout(300);
  await countNothing(page);
  await page.locator('.t-play').click();
  await page.waitForTimeout(150);
  let s = await S(page);
  const d = await dbg(page);
  check('Lab: Play on an empty song stays stopped (no silent loop)', !s.transport.playing && !d.playing);
  check('…the monster on the keys says "huh?" at once', d.voices > 0 && (await nothing(page)) === 1, `${d.voices} voices`);
  check('…a bubble says what to do', (await page.locator('.bubble').textContent())?.includes('Record a loop first'));
  await page.waitForTimeout(100);
  check('…and the hand points at Record (even though it is not the first hint)', await handOn(page, '.t-rec'));
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  check('the Space bar gets the same answer, every time', !(await S(page)).transport.playing && (await nothing(page)) === 2);

  await page.locator('.dock-btn[data-screen="blocks"]').click();
  await page.waitForTimeout(250);
  await page.locator('.t-play').click();
  await page.waitForTimeout(150);
  check('Blocks: Play on an empty song stays stopped', !(await S(page)).transport.playing);
  check('…and the hand points at the screen\'s own "Go to the Lab", where loops are made', await handOn(page, '.blocks-empty .btn-primary'));
  const arrangementBefore = JSON.stringify((await S(page)).project.arrangement);
  await page.locator('.t-magic').click();
  const finale = await page
    .waitForSelector('.finale', { timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  s = await S(page);
  check('Blocks: Magic on nothing changes nothing and adds no undo step', s.past.length === 0 && JSON.stringify(s.project.arrangement) === arrangementBefore && !s.transport.playing);
  check('no "You made a song!" for a song with nothing in it', !finale);
  check('Magic on nothing answers too', (await nothing(page)) === 4);

  // Loops, but every block taken away: the hand shows an empty block of a monster with a loop.
  await page.evaluate(async () => {
    const M = window.__monster;
    await M.actions.newSong('band');
    const st = M.getState();
    const rows = Object.fromEntries(Object.entries(st.project.arrangement.rows).map(([k, v]) => [k, v.map(() => null)]));
    M.setState({ project: { ...st.project, arrangement: { ...st.project.arrangement, rows } } });
    M.actions.setScreen('blocks');
  });
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(150);
  check('Blocks with loops but no blocks: Play stays stopped and the hand points at an empty block', !(await S(page)).transport.playing && (await handOn(page, '.block-row[data-empty="false"][data-sleeping="false"] .block[data-on="false"]')));
  // Every monster asleep in the Lab: the hand points at a sleeping loop badge.
  await page.evaluate(() => {
    const M = window.__monster;
    const st = M.getState();
    M.setState({ project: { ...st.project, tracks: st.project.tracks.map((t) => ({ ...t, sleeping: true })) } });
    M.actions.setScreen('lab');
  });
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(150);
  check('Lab with every monster asleep: Play stays stopped and the hand points at a loop badge to wake', !(await S(page)).transport.playing && (await handOn(page, '.loop-badge[data-sleeping="true"]')));
  await ctx.close();
}

// ── 1b. Arming Record is not a dead end: no "huh?" ─────────────────────────
{
  const { ctx, page } = await openApp();
  await page.evaluate(() => window.__monster.actions.newSong('blank'));
  await page.waitForTimeout(300);
  await spy(page);
  await page.getByRole('button', { name: 'Record a loop' }).click();
  await page.waitForTimeout(300);
  const armed = (await S(page)).transport.armed;
  const sounds = await trig(page);
  check('arming Record shows "Play something!" without the "huh?" chirp', armed && (await page.locator('.bubble').textContent())?.includes('Play something') && sounds.length === 0, sounds.join(' '));
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await spy(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  check('…while "Nothing to undo" still wonders "huh?" (two notes)', (await trig(page)).length === 2);
  await ctx.close();
}

// ── 2. Monster Blocks is heard, and never writes a note ────────────────────
{
  const { ctx, page } = await openApp();
  await page.evaluate(async () => {
    await window.__monster.actions.newSong('band');
    window.__monster.actions.setScreen('blocks');
  });
  await page.waitForTimeout(400);
  const bloop = await trackId(page, 'bloop');
  const clips0 = await clipsJson(page);
  const row0 = (await S(page)).project.arrangement.rows[bloop];
  const col = row0.findIndex(Boolean);
  const [x, y] = await cellCenter(page, bloop, col);
  await spy(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const t0 = Date.now();
  let pressed = await dbg(page);
  while (!(pressed.voices > 0 && pressed.auditioning) && Date.now() - t0 < 350) pressed = await dbg(page);
  const pressSounds = await trig(page);
  check('holding a block plays its loop (after a short rest, well under 350 ms)', pressed.voices > 0 && pressed.auditioning, `${pressed.voices} voices after ${Date.now() - t0} ms`);
  check("…on Bloop's own preview channel (dressed like Bloop, never its loop's channel)", pressSounds.length > 0 && pressSounds.every((ch) => ch === 'preview:bloop'), pressSounds.join(' '));
  await spy(page);
  await page.mouse.up();
  await page.waitForTimeout(60);
  const released = await dbg(page);
  const pop = await trig(page);
  let s = await S(page);
  check('lifting takes the block away with a pop from Bloop (the preview stops)', s.project.arrangement.rows[bloop][col] === null && !released.auditioning && pop.length === 2 && pop.every((ch) => ch === bloop), pop.join(' '));
  await page.evaluate(() => window.__monster.studio.undo());
  await page.waitForTimeout(100);
  // A quick tap only pops: no cut-off fragment of the loop first.
  await spy(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const tapped = await trig(page);
  s = await S(page);
  check('a quick tap on a block is one clean pop (no preview first)', s.project.arrangement.rows[bloop][col] === null && tapped.length === 2 && tapped.every((ch) => ch === bloop), tapped.join(' '));
  await page.evaluate(() => window.__monster.studio.undo());
  await page.waitForTimeout(100);

  // Tap an empty spot: a hello note at once, then the loop placed there plays.
  await page.evaluate((id) => {
    const M = window.__monster;
    const st = M.getState();
    M.setState({ project: { ...st.project, arrangement: { ...st.project.arrangement, rows: { ...st.project.arrangement.rows, [id]: st.project.arrangement.rows[id].map(() => null) } } } });
    window.__live = 0;
    M.bus.onNote((n) => n.source === 'live' && n.trackId === id && window.__live++);
  }, bloop);
  await page.waitForTimeout(150);
  const [ex, ey] = await cellCenter(page, bloop, 2);
  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.waitForTimeout(60);
  const helloLive = await page.evaluate(() => window.__live);
  await page.mouse.up();
  await page.waitForTimeout(60);
  const afterFill = await dbg(page);
  s = await S(page);
  const active = s.project.tracks.find((t) => t.id === bloop).activeClipId;
  check('tapping an empty spot fills it with the loop and sings hello at once', s.project.arrangement.rows[bloop][2] === active && helloLive === 1);
  check('…and the loop placed there plays when the finger lifts', afterFill.auditioning && afterFill.voices > 0);
  // Drag a block: it lands with a hello.
  const [dx, dy] = await cellCenter(page, bloop, 5);
  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.mouse.move(dx, dy, { steps: 8 });
  const liveBeforeDrop = await page.evaluate(() => window.__live);
  await page.mouse.up();
  await page.waitForTimeout(60);
  s = await S(page);
  check('a dragged block lands with a hello', s.project.arrangement.rows[bloop][5] === active && !s.project.arrangement.rows[bloop][2] && (await page.evaluate(() => window.__live)) === liveBeforeDrop + 1);
  check('no Blocks touch ever writes a note into a loop', (await clipsJson(page)) === clips0);
  // While the band plays, the song is what you hear: no preview on top of it.
  await page.locator('.t-play').click();
  await page.waitForTimeout(200);
  const [px, py] = await cellCenter(page, bloop, 5);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const duringSong = await dbg(page);
  await page.mouse.move(px + 200, py, { steps: 4 });
  await page.mouse.up();
  check('pressing a block while the song plays adds no preview on top', !duringSong.auditioning && duringSong.playing);
  await page.locator('.t-play').click();
  await ctx.close();
}

// ── 3. A song kept from Learn keeps its phrases ────────────────────────────
{
  const { ctx, page } = await openApp();
  await page.evaluate(async () => {
    const { TEACH_SONGS } = await import('/src/magic/lessons.ts');
    await window.__monster.actions.saveLessonAsSong(TEACH_SONGS.find((s) => s.id === 'twinkle'));
  });
  await page.waitForTimeout(400);
  const spark = await trackId(page, 'spark');
  const distinct = async () => new Set((await S(page)).project.arrangement.rows[spark].filter(Boolean)).size;
  check('a kept Twinkle has three melody phrases in Blocks', (await S(page)).screen === 'blocks' && (await distinct()) === 3);
  let keeps = true;
  for (let i = 0; i < 4; i++) {
    await page.locator('.t-magic').click();
    await page.waitForTimeout(120);
    keeps &&= (await distinct()) >= 3;
  }
  check('Magic never collapses the tune to its first phrase (4 taps)', keeps);
  await page.locator('.t-play').click();
  await page.waitForTimeout(100);
  // Take a phrase away and put it back: the gap continues the tune from the left.
  const row = (await S(page)).project.arrangement.rows[spark];
  const c = row.findIndex((v, i) => i > 0 && v && row[i - 1] && row[i - 1] !== v);
  const [x, y] = await cellCenter(page, spark, c);
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
  const refilled = (await S(page)).project.arrangement.rows[spark][c];
  check('a gap in a learned tune is filled with the phrase to its left', c > 0 && refilled === row[c - 1], `block ${c + 1}`);
  await ctx.close();
}

// ── 4. A first loop is cheered; waking up bounces ──────────────────────────
{
  const { ctx, page } = await openApp();
  const pods = await page.locator('.stage .pod').count();
  const bounces = (await anims(page, 'hello-bounce')).length;
  check('waking up: every monster bounces with its hello', pods >= 4 && bounces === pods, `${bounces} bounces, ${pods} monsters`);
  await page.evaluate(() => window.__monster.actions.newSong('blank'));
  await page.waitForTimeout(300);
  await resetAnims(page);
  check('no dot on Blocks before a loop exists', (await page.locator('.dock-btn[data-screen="blocks"][data-new]').count()) === 0);
  await page.getByRole('button', { name: 'Record a loop' }).click();
  await page.keyboard.press('d');
  await page.waitForTimeout(250);
  const dot = await page.locator('.dock-btn[data-screen="blocks"][data-new="bloop"] .dock-new').count();
  check("the first recorded note on Bloop puts Bloop's dot on the Blocks button", dot === 1);
  check('no cheering mid-take (the child is still playing)', (await anims(page, 'cheer-')).length === 0);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.waitForTimeout(200);
  const cheer = (await anims(page, 'cheer-')).map((a) => a.id);
  check('when the take ends the monster jumps, sparkles and glows, and its loop badge pops', ['cheer-jump', 'cheer-spark', 'cheer-glow', 'cheer-pop'].every((id) => cheer.includes(id)), [...new Set(cheer)].join(' '));
  // Every cheer animation moves only transform and opacity (the compositor's work, never a repaint).
  const heavy = (await anims(page, 'cheer-')).filter((a) => a.props.some((p) => !['transform', 'translate', 'scale', 'rotate', 'opacity', 'offset', 'easing', 'composite'].includes(p)));
  check('cheering animates transform and opacity only', heavy.length === 0, heavy.map((a) => `${a.id}:${a.props}`).join(' '));
  // A loop made on Beat Hop's grid (no take) is cheered at once.
  await resetAnims(page);
  await page.evaluate(() => {
    const M = window.__monster;
    const boom = M.getState().project.tracks.find((t) => t.monster === 'boom').id;
    M.actions.selectTrack(boom);
    M.actions.setLabView('grid');
    M.studio.gridWand(boom);
  });
  await page.waitForTimeout(200);
  check('a loop made on the grid is cheered at once', (await anims(page, 'cheer-jump')).length === 1);
  await page.evaluate(() => {
    window.__monster.studio.stop();
    window.__monster.actions.setLabView('keys');
  });
  await page.locator('.dock-btn[data-screen="blocks"]').click();
  await page.waitForTimeout(200);
  check('visiting Blocks clears the dot', (await page.locator('.dock-btn[data-screen="blocks"][data-new]').count()) === 0 && (await S(page)).newBlocks.length === 0);
  // A loop that turns up while Blocks is open is right there: no dot for it.
  await page.evaluate(() => {
    const M = window.__monster;
    M.actions.markNewBlock(M.getState().project.tracks[1].id);
  });
  check('a dot is never added while Blocks is open', (await S(page)).newBlocks.length === 0);
  await ctx.close();
}

// ── 5. Keyboards and switches ──────────────────────────────────────────────
{
  const { ctx, page } = await openApp();
  await page.evaluate(async () => {
    const M = window.__monster;
    await M.actions.newSong('band');
    M.actions.selectTrack(M.getState().project.tracks.find((t) => t.monster === 'bloop').id);
  });
  await page.waitForTimeout(300);
  // Tab walk: every key of the Lab is a stop.
  await page.evaluate(() => document.activeElement?.blur());
  const reached = new Set();
  for (let i = 0; i < 60 && reached.size < 8; i++) {
    await page.keyboard.press('Tab');
    const k = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.matches('.keys .key') ? [...el.parentElement.children].indexOf(el) : -1;
    });
    if (k >= 0) reached.add(k);
  }
  check('a Tab walk on the Lab reaches all 8 keys', reached.size === 8, [...reached].join(','));
  const keyTag = await page.evaluate(() => document.querySelector('.keys .key').tagName);
  const clips0 = await clipsJson(page);
  await page.locator('.keys .key').nth(2).focus();
  await page.keyboard.press('Enter');
  let level = 0;
  const t0 = Date.now();
  while (level <= 0.005 && Date.now() - t0 < 200) level = (await dbg(page)).level;
  check('Enter on key 3 plays it (the meter rises)', keyTag === 'BUTTON' && level > 0.005, `rms ${level.toFixed(4)}`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const afterSpace = await S(page);
  check('Space on a key plays the key (and does not start the band)', !afterSpace.transport.playing && (await dbg(page)).voices > 0);
  check('playing keys without Record writes nothing', (await clipsJson(page)) === clips0);
  const label = await page.locator('.keys .key').nth(2).getAttribute('aria-label');
  check('keys keep their spoken names', label === 'Bloop: E', label);

  // Blocks: one tab stop; arrows move; Enter fills or clears; Shift+arrow moves a block.
  const bloop = await trackId(page, 'bloop');
  await page.evaluate((id) => {
    const M = window.__monster;
    const st = M.getState();
    const clip = st.project.tracks.find((t) => t.id === id).activeClipId;
    const row = st.project.arrangement.rows[id].map((_, i) => (i === 0 ? clip : null));
    M.setState({ project: { ...st.project, arrangement: { ...st.project.arrangement, rows: { ...st.project.arrangement.rows, [id]: row } } } });
    M.actions.setScreen('blocks');
  }, bloop);
  await page.waitForTimeout(300);
  const stops = await page.locator('.blocks-grid .block[tabindex="0"]').count();
  check('Blocks: all the blocks are one tab stop', stops === 1);
  await page.locator(`.block[data-row="${bloop}"][data-col="0"]`).focus();
  const past0 = (await S(page)).past.length;
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(80);
  let s = await S(page);
  const focused = () => page.evaluate(() => [document.activeElement?.dataset.row, Number(document.activeElement?.dataset.col)]);
  check('Shift+→ carries a block along its row (focus follows)', !s.project.arrangement.rows[bloop][0] && !!s.project.arrangement.rows[bloop][1] && (await focused())[1] === 1 && s.past.length === past0 + 1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  check('arrows move between blocks', (await focused())[1] === 3 && (await page.locator('.blocks-grid .block[tabindex="0"]').count()) === 1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  s = await S(page);
  const filledKey = await dbg(page);
  check('Enter on an empty spot of a looped row fills it (and plays it)', !!s.project.arrangement.rows[bloop][3] && filledKey.auditioning);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  check('Enter on a block clears it', !(await S(page)).project.arrangement.rows[bloop][3]);
  await page.keyboard.press('ArrowDown');
  const down = await focused();
  check('↓ moves to the next monster, same block', down[0] !== bloop && down[1] === 3);
  check('the keyboard never writes a note either', (await clipsJson(page)) === clips0);
  // No loops at all: the blocks hide under the empty card, so Tab skips them for "Go to the Lab".
  await page.evaluate(async () => {
    await window.__monster.actions.newSong('blank');
    window.__monster.actions.setScreen('blocks');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.activeElement?.blur());
  let walk = '';
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    walk = await page.evaluate(() => (document.activeElement?.matches('.block') ? 'block' : document.activeElement?.matches('.blocks-empty .btn-primary') ? 'go' : ''));
    if (walk) break;
  }
  check('empty Blocks: a Tab walk reaches "Go to the Lab" without landing on a hidden block', walk === 'go', walk);
  await ctx.close();
}

// ── 6. Make it a song (Little Monsters) ────────────────────────────────────
for (const viewport of [
  { width: 1024, height: 768 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
]) {
  const tag = `${viewport.width}×${viewport.height}`;
  const { ctx, page } = await openApp({ viewport });
  await page.evaluate(() => window.__monster.actions.newSong('blank'));
  await page.waitForTimeout(300);
  await recordKeys(page, 'bloop', ['a', 'd', 'g', 'd']);
  check(`${tag}: one loop, no song button yet`, (await page.locator('.t-song').count()) === 0);
  // A re-take on the same monster is still one loop: no song hint is spent on it.
  await page.waitForTimeout(1300);
  await recordKeys(page, 'bloop', ['g', 'd', 'a', 'd']);
  await page.waitForTimeout(1300);
  check(`${tag}: two takes on one monster: no song button, no hand on Blocks`, (await page.locator('.t-song').count()) === 0 && !(await handOn(page, '.dock-btn[data-screen="blocks"]')));
  await recordKeys(page, 'boom', ['a', 's', 'a', 's']);
  check(`${tag}: two monsters with loops bring the song button`, (await page.locator('.t-song').count()) === 1);
  const r = await rects(page, ['.t-play', '.t-rec', '.t-small:not(.t-song)', '.t-song']);
  check(`${tag}: the song button is clear of Play, Record and Undo, and on screen`, r.every(Boolean) && !overlap(r[3], r[0]) && !overlap(r[3], r[1]) && !overlap(r[3], r[2]) && r[3].b <= viewport.height && r[3].r <= viewport.width);
  const face = await page.locator('.t-song .t-face').boundingBox();
  check(`${tag}: the song button is a primary-sized target (≥ 52 px)`, face.width >= 52 && face.height >= 52, `${face.width.toFixed(0)}×${face.height.toFixed(0)}`);
  await page.waitForTimeout(1300);
  check(`${tag}: after the second monster's loop the hand points at the song button`, await handOn(page, '.t-song'));
  // Under Beat Hop's grid, the Surprise wand has Record's place: still no collision.
  await page.evaluate(() => window.__monster.actions.setLabView('grid'));
  await page.waitForTimeout(250);
  const g = await rects(page, ['.t-surprise', '.t-song']);
  check(`${tag}: …and clear of the Surprise wand on the grid`, g.every(Boolean) && !overlap(g[0], g[1]));
  await page.evaluate(() => window.__monster.actions.setLabView('keys'));
  await page.waitForTimeout(150);
  let s = await S(page);
  const flat = JSON.stringify(s.project.arrangement.rows);
  const past0 = s.past.length;
  await page.locator('.t-song').click();
  await page.waitForTimeout(250);
  s = await S(page);
  const d = await dbg(page);
  const boom = s.project.tracks.find((t) => t.monster === 'boom').id;
  check(`${tag}: one tap → Blocks, playing the song from block 1`, s.screen === 'blocks' && s.transport.playing && s.transport.mode === 'song' && d.beat < 1, `beat ${d.beat.toFixed(2)}`);
  check(`${tag}: the song is arranged (not the flat fill), starting on the beat`, JSON.stringify(s.project.arrangement.rows) !== flat && !!s.project.arrangement.rows[boom][0]);
  check(`${tag}: one undo step`, s.past.length === past0 + 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(100);
  check(`${tag}: one Undo takes the arrangement back`, JSON.stringify((await S(page)).project.arrangement.rows) === flat);
  // Blocks' Magic: every tap is heard from block 1.
  await page.waitForTimeout(1200);
  const before = (await dbg(page)).beat;
  await page.locator('.t-magic').click();
  await page.waitForTimeout(150);
  const magic = await dbg(page);
  s = await S(page);
  check(`${tag}: Blocks' Magic replays the new song from block 1`, before > 1.5 && magic.beat < 1 && s.transport.playing && s.transport.mode === 'song', `${before.toFixed(2)} → ${magic.beat.toFixed(2)}`);
  await page.locator('.t-play').click();
  await ctx.close();
}

// ── 7. Reduced motion: glows instead of jumps, no blinking, no ghosts ──────
{
  const full = await openApp();
  const blinkingFull = await full.page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'blink' && a.playState === 'running').length);
  await full.ctx.close();
  const { ctx, page } = await openApp({ reducedMotion: 'reduce' });
  const wakeAnims = await page.evaluate(() => window.__anims.filter((a) => a.id.startsWith('hello') || a.id.startsWith('cheer')));
  check('waking with reduced motion: glows, no bounce', wakeAnims.length > 0 && wakeAnims.every((a) => a.id === 'cheer-glow'));
  const blinking = await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'blink' && a.playState === 'running').length);
  check('no blinking with reduced motion', blinkingFull > 0 && blinking === 0, `${blinkingFull} → ${blinking}`);
  await page.evaluate(async () => {
    const M = window.__monster;
    await M.actions.newSong('blank');
    const st = M.getState();
    M.setState({ project: { ...st.project, tracks: st.project.tracks.map((t, i) => (i === 0 ? { ...t, fx: { ...t.fx, echo: 0.8 } } : t)) } });
  });
  await page.waitForTimeout(300);
  check('no echo ghosts with reduced motion', await page.evaluate(() => [...document.querySelectorAll('.pod .m-echoes')].length > 0 && [...document.querySelectorAll('.pod .m-echoes')].every((e) => getComputedStyle(e).display === 'none')));
  await resetAnims(page);
  await page.getByRole('button', { name: 'Record a loop' }).click();
  await page.keyboard.press('d');
  await page.waitForTimeout(250);
  const dotAnim = await page.evaluate(() => {
    const dot = document.querySelector('.dock-new');
    return dot ? getComputedStyle(dot).animationName : 'missing';
  });
  check('the Blocks dot stays still with reduced motion', dotAnim === 'none', dotAnim);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.waitForTimeout(200);
  const cheer = await anims(page, 'cheer-');
  const moving = cheer.filter((a) => a.props.some((p) => ['transform', 'translate', 'scale', 'rotate'].includes(p)));
  check('a first loop with reduced motion: a glow, and no transform animation', cheer.some((a) => a.id === 'cheer-glow') && moving.length === 0, cheer.map((a) => a.id).join(' '));
  await ctx.close();
}

// ── 8. Upright tablets: the bubble never hides the hand's target ───────────
{
  const viewport = { width: 820, height: 1180 };
  const { ctx, page } = await openApp({ viewport });
  await page.evaluate(() => window.__monster.actions.newSong('blank'));
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(200);
  check('820×1180 Lab: the empty-Play hand points at Record, and nothing covers it', (await handOn(page, '.t-rec')) && (await uncovered(page, '.t-rec')));
  check('820×1180 Lab: the bubble sits below the dock', await page.evaluate(() => document.querySelector('.bubble').getBoundingClientRect().top >= document.querySelector('.dock').getBoundingClientRect().bottom));
  await page.locator('.dock-btn[data-screen="blocks"]').click();
  await page.waitForTimeout(300);
  await page.locator('.t-play').click();
  await page.waitForTimeout(200);
  check('820×1180 Blocks: the empty-Play hand points at "Go to the Lab", and nothing covers it', (await handOn(page, '.blocks-empty .btn-primary')) && (await uncovered(page, '.blocks-empty .btn-primary')));
  check('820×1180 Blocks: …and the dock stays uncovered too', await uncovered(page, '.dock-btn[data-screen="lab"]'));
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
