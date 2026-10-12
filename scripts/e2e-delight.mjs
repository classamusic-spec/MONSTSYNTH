// The Lab stage's little delights, end to end: tickle time (poke a monster
// again and again and it giggles, then laughs), the musical sky (the bare
// night sky and the moon ring bells), the costume poof and Chomper's chomp.
// iPad 1024x768, phone 844x390 and upright 820x1180; reduced motion; axe.
// Usage: node scripts/e2e-delight.mjs [url] [screenshot-dir]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const shots = process.argv[3] || null;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

/** Every Web Animation the app starts, by id (Cheer and the scenes name theirs). */
function hookAnimations() {
  window.__anims = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    const props = Array.isArray(frames) ? [...new Set(frames.flatMap((f) => Object.keys(f)))] : Object.keys(frames ?? {});
    const cls = this.getAttribute?.('class') ?? '';
    window.__anims.push({ id: opts && typeof opts === 'object' ? (opts.id ?? '') : '', props, cls, t: performance.now() });
    return animate.call(this, frames, opts);
  };
}

async function open({ viewport = { width: 1024, height: 768 }, reducedMotion = 'no-preference', mode = 'little' } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  await ctx.addInitScript(hookAnimations);
  const page = await ctx.newPage();
  const tag = `${viewport.width}x${viewport.height}`;
  page.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(500);
  await page.evaluate(async (mode) => {
    const M = window.__monster;
    M.setState({ settings: { ...M.getState().settings, ageMode: mode } });
    await M.actions.newSong('band');
    M.studio.stop();
    window.__ev = [];
    window.__notes = [];
    M.bus.onStudioEvent((e) => window.__ev.push({ ...e, t: performance.now() }));
    M.bus.onNote((v) => window.__notes.push({ ...v, t: performance.now() }));
  }, mode);
  // Let the wake-up hello and its bounce finish.
  await page.waitForTimeout(900);
  return { ctx, page };
}

const S = (page) => page.evaluate(() => window.__monster.getState());
const shot = async (page, name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));
const dbg = (page) => page.evaluate(() => window.__monster.studio.delightDebug());
const mark = (page) => page.evaluate(() => performance.now());
const events = (page, since = 0) => page.evaluate((since) => window.__ev.filter((e) => e.type === 'tickle' && e.t >= since), since);
const notes = (page, since = 0) => page.evaluate((since) => window.__notes.filter((n) => n.t >= since), since);
const anims = (page, prefix, since = 0) => page.evaluate(([p, since]) => window.__anims.filter((a) => a.id.startsWith(p) && a.t >= since), [prefix, since]);
const trackOf = (page, monster) => page.evaluate((m) => window.__monster.getState().project.tracks.find((t) => t.monster === m)?.id, monster);
const tickleAttr = (page, monster) => page.evaluate((m) => document.querySelector(`.pod[data-monster="${m}"]`)?.dataset.tickle ?? null, monster);
/** The project and its history, to prove a delight changed nothing. */
const snapshot = (page) =>
  page.evaluate(() => {
    const s = window.__monster.getState();
    const { modifiedAt, ...p } = s.project;
    void modifiedAt;
    return { project: JSON.stringify(p), past: s.past.length, future: s.future.length, selected: s.selectedTrackId };
  });

/** Where to poke a monster now (the row reflows as the spotlight moves, so measure every time). */
async function spot(page, monster, rel = 0.72) {
  const b = await page.locator(`.pod[data-monster="${monster}"] .pod-hit`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height * rel };
}

/** `n` quick pokes on a monster (each a new finger: down and up), `gap` ms apart. */
async function poke(page, monster, n, gap = 110, rel = 0.72) {
  for (let i = 0; i < n; i++) {
    const p = await spot(page, monster, rel);
    await page.mouse.click(p.x + (i % 2 ? 4 : -4), p.y);
    if (i < n - 1) await page.waitForTimeout(gap);
  }
}

/** Wait until no monster is giggling or laughing (each case starts from calm). */
const settle = (page) => page.waitForFunction(() => window.__monster.studio.delightDebug().tickles === 0, null, { timeout: 5000 }).catch(() => null);

/** Points on the bare stage (where only the sky hears a touch), scanned on a grid. */
const skyPoints = (page) =>
  page.evaluate(() => {
    const st = document.querySelector('.stage').getBoundingClientRect();
    const out = [];
    for (let y = st.top + 6; y < st.bottom - 6; y += 8) {
      for (let x = st.left + 6; x < st.right - 6; x += 8) {
        const el = document.elementFromPoint(x, y);
        if (el?.classList.contains('stage-sky')) out.push({ x, y, fx: (x - st.left) / st.width, fy: (y - st.top) / st.height });
      }
    }
    return out;
  });

/** The moon's disc centre, and what a touch there lands on. */
const moonAt = (page) =>
  page.evaluate(() => {
    const disc = document.querySelector('.stage-moon .moon-disc circle').getBoundingClientRect();
    const x = disc.left + disc.width / 2;
    const y = disc.top + disc.height / 2;
    const el = document.elementFromPoint(x, y);
    return { x, y, r: disc.width / 2, hits: el?.getAttribute('class') ?? el?.tagName };
  });

async function axeLab(page, label) {
  await page.addScriptTag({ content: readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
  await page.waitForTimeout(300);
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(', ')}`);
  });
  check(`axe: no violations on ${label}`, found.length === 0, found.join(' | '));
}

// ── 1. Tickle time on an iPad (Little Monsters) ──────────────────────────────
{
  const { ctx, page } = await open();
  const boom = await trackOf(page, 'boom');
  const before = await snapshot(page);
  let t0 = await mark(page);
  await poke(page, 'boom', 4);
  await page.waitForTimeout(40);
  check('four quick pokes are just notes (no giggles yet)', (await tickleAttr(page, 'boom')) === null && (await events(page, t0)).length === 0);
  await poke(page, 'boom', 1);
  await page.waitForTimeout(60);
  const ev1 = await events(page, t0);
  check('the fifth quick poke on Boom gives the giggles (^ ^ face)', (await tickleAttr(page, 'boom')) === '1' && ev1.some((e) => e.phase === 'giggly' && e.trackId === boom && e.level === 1));
  await poke(page, 'boom', 2, 120);
  const laughT = await mark(page);
  check('more pokes while giggling pop bubbles and jiggle', (await anims(page, 'tickle-bubble', t0)).length >= 1 && (await anims(page, 'tickle-jiggle', t0)).length >= 2);
  await page.waitForTimeout(220); // the face's fade-in (the laugh waits 450 ms)
  const face = await page.evaluate(() => {
    const pod = document.querySelector('.pod[data-monster="boom"]');
    const op = (sel) => Math.max(...[...pod.querySelectorAll(sel)].map((el) => +getComputedStyle(el).opacity));
    return { happy: op('.m-eye-happy'), cheek: op('.m-cheek'), grin: op('.m-mouth-open'), lid: getComputedStyle(pod.querySelector('.m-lid')).transform };
  });
  check('…happy ^ ^ eyes, rosy cheeks and a grin (never the sleeping face)', face.happy > 0.9 && face.cheek > 0.9 && face.grin > 0.9, JSON.stringify(face));
  await shot(page, 'tickle-giggly-ipad');
  const tapped = (await notes(page, t0)).filter((n) => n.trackId === boom && n.source === 'live').length;
  check('every poke still plays its note', tapped === 7, `${tapped} notes for 7 pokes`);
  // Watch the drum pads while Boom laughs (the band is stopped: only a laugh could light them).
  let padGlow = 0;
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(50);
    padGlow += await page.locator('.key[data-glow="true"]').count();
  }
  const ev2 = await events(page, t0);
  const laugh = ev2.find((e) => e.phase === 'laugh');
  const laughNotes = (await notes(page, laughT)).filter((n) => n.trackId === boom && n.source === 'laugh');
  check('when the poking stops, Boom laughs out loud (a chuckle on its own drums)', !!laugh && laugh.sound === true && laugh.level === 1 && laughNotes.length >= 4, `${laughNotes.length} laugh notes, ${JSON.stringify(laugh)}`);
  const laughSprites = await page.evaluate((t) => window.__anims.filter((a) => a.t > t && /note-sprite/.test(a.cls) && !/tickle-bubble/.test(a.cls)).length, laughT + 150);
  check('…the laugh shows on its face only: no drum pad lights up, no note sprites fly over the ^ ^', padGlow === 0 && laughSprites === 0, `${padGlow} pad glows, ${laughSprites} sprites`);
  check('the laugh steps down: snappy drum, bongos tuned lower, tiny cymbal', laughNotes.length >= 4 && laughNotes[0].step === 1 && laughNotes.at(-1).step === 2);
  check('…and the studio counts one laugh', (await dbg(page)).laughs === 1);
  await page.waitForTimeout(350);
  check('the face goes back with a happy blink', (await tickleAttr(page, 'boom')) === null && (await anims(page, 'tickle-blink', t0)).length >= 1 && (await events(page, t0)).some((e) => e.phase === 'calm'));
  // Level 2: tickled again soon after the laugh.
  const t2 = await mark(page);
  await poke(page, 'boom', 5, 100);
  await page.waitForTimeout(60);
  const lvl2 = await events(page, t2);
  check('tickled again soon after a laugh: level 2', lvl2.some((e) => e.phase === 'giggly' && e.level === 2) && (await tickleAttr(page, 'boom')) === '2');
  await page.waitForTimeout(700);
  const big = (await events(page, t2)).find((e) => e.phase === 'laugh');
  const hop = await anims(page, 'tickle-hop', t2);
  check('level 2: a "wheee" squash-hop (no spin) and a bigger laugh', !!big && big.level === 2 && big.sound && hop.length === 1 && hop[0].props.includes('translate') && !hop[0].props.includes('rotate'), JSON.stringify(big));
  await shot(page, 'tickle-wheee-ipad');
  await page.waitForTimeout(1500);
  const wheeeNotes = (await notes(page, t2)).filter((n) => n.trackId === boom && n.source === 'laugh');
  check('…its bigger laugh is longer than the first', wheeeNotes.length > laughNotes.length, `${wheeeNotes.length} vs ${laughNotes.length} notes`);
  // After the top level: a rest of plain notes.
  const t3 = await mark(page);
  await poke(page, 'boom', 6, 90);
  await page.waitForTimeout(700);
  check('after level 2 Boom rests: quick pokes are plain notes for a while', (await events(page, t3)).length === 0 && (await tickleAttr(page, 'boom')) === null && (await dbg(page)).laughs === 2);
  const after = await snapshot(page);
  check('tickling changes nothing in the song: no edit, no undo step', after.project === before.project && after.past === before.past && after.future === before.future);
  check('…and the Coach never pointed at Beat Hop for the tickling', (await page.locator('.coach-hand').count()) === 0);
  // Deliberate drumming (Boom's keys) still earns that hint: tickling did not use it up.
  const handOnFlip = () =>
    page.evaluate(() => {
      const h = document.querySelector('.coach-hand');
      const f = document.querySelector('.surface-flip')?.getBoundingClientRect();
      return !!h && !!f && Math.abs(parseFloat(h.style.left) - (f.left + f.width / 2)) < 3;
    });
  let hand = false;
  let presses = 0;
  while (!hand && presses < 10) {
    await page.keyboard.press('a');
    presses++;
    await page.waitForTimeout(250);
    hand = await handOnFlip();
  }
  check('…but real drumming still gets the Beat Hop hint (not used up by tickling)', hand, `after ${presses} drum keys`);
  // A slow rhythm, two monsters at once, and a long drag never giggle.
  await settle(page);
  const t4 = await mark(page);
  await poke(page, 'bloop', 7, 640);
  await page.waitForTimeout(600);
  check('a slow tap rhythm never giggles', (await events(page, t4)).length === 0 && (await tickleAttr(page, 'bloop')) === null);
  await settle(page);
  const t5 = await mark(page);
  for (let i = 0; i < 8; i++) {
    const p = await spot(page, i % 2 ? 'spark' : 'grumble');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(600);
  const both = (await notes(page, t5)).filter((n) => n.source === 'live').map((n) => n.monster[0]).join('');
  check('two monsters keep separate counts (4 + 4 quick pokes: no giggles)', (await events(page, t5)).length === 0 && both === 'gsgsgsgs', both);
  await settle(page);
  await page.waitForTimeout(2100); // past the window of the pokes above
  const g = await page.locator('.pod[data-monster="grumble"] .pod-hit').boundingBox();
  const t6 = await mark(page);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height * 0.8);
  await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(g.x + g.width / 2 + (i % 2 ? 20 : -20), g.y + g.height * (0.8 - i * 0.012));
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  check('a long drag and shake on a monster is one contact (no giggles)', (await events(page, t6)).length === 0);
  // A touch timestamp on another clock (an epoch time, as older WebKit gave) never leaves a monster stuck giggling.
  await settle(page);
  await page.waitForTimeout(2100);
  const t7 = await mark(page);
  await page.evaluate(async () => {
    const M = window.__monster;
    const id = M.getState().project.tracks.find((t) => t.monster === 'spark').id;
    for (let i = 0; i < 5; i++) {
      M.studio.tickle(id, Date.now());
      await new Promise((ok) => setTimeout(ok, 90));
    }
  });
  await page.waitForTimeout(2600);
  const clock = (await events(page, t7)).map((e) => e.phase);
  check('a touch time from another clock still giggles, laughs and calms (never stuck)', clock[0] === 'giggly' && clock.includes('laugh') && clock.at(-1) === 'calm' && (await tickleAttr(page, 'spark')) === null, clock.join(','));
  await page.waitForTimeout(1800);
  const end = await page.evaluate(() => window.__monster.studio.debug());
  check('no stuck voices after all that tickling', end.held === 0 && end.live === 0, `${end.held} held, ${end.live} live`);
  await ctx.close();
}

// ── 1a. Drumming is not tickling ─────────────────────────────────────────────
{
  const { ctx, page } = await open();
  const boom = await trackOf(page, 'boom');
  const t0 = await mark(page);
  // A steady beat on Boom's body, about 3 a second for 5 s.
  await poke(page, 'boom', 18, 280, 0.5);
  const ev = await events(page, t0);
  const phases = ev.map((e) => e.phase);
  check('steady drumming on Boom: the giggles come, then calm by themselves (no laugh in the beat)', phases[0] === 'giggly' && !phases.includes('laugh') && ev.some((e) => e.phase === 'calm' && e.drumming && e.trackId === boom), phases.join(','));
  check('…the face is back to normal while the drumming goes on', (await tickleAttr(page, 'boom')) === null);
  await page.waitForTimeout(400);
  const hand = await page.evaluate(() => {
    const h = document.querySelector('.coach-hand');
    const f = document.querySelector('.surface-flip')?.getBoundingClientRect();
    return !!h && !!f && Math.abs(parseFloat(h.style.left) - (f.left + f.width / 2)) < 3;
  });
  check('…and drumming on Boom’s body still earns the Beat Hop hint', hand);
  check('…no laugh was ever heard', (await dbg(page)).laughs === 0);
  await ctx.close();
}

// ── 1b. Real touch: two fingers mashing one monster both count ──────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`touch: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`touch: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 512, y: 384, id: 1 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__ev = [];
    window.__monster.bus.onStudioEvent((e) => window.__ev.push({ ...e, t: performance.now() }));
    const spark = window.__monster.getState().project.tracks.find((t) => t.monster === 'spark');
    window.__monster.actions.selectTrack(spark.id);
  });
  await page.waitForTimeout(500);
  const b = await page.locator('.pod[data-monster="spark"] .pod-hit').boundingBox();
  const y = b.y + b.height * 0.75;
  // Three two-finger mashes: six new fingers in about a second.
  for (let i = 0; i < 3; i++) {
    await touch('touchStart', [{ x: b.x + b.width * 0.3, y, id: 1 }]);
    await touch('touchStart', [{ x: b.x + b.width * 0.3, y, id: 1 }, { x: b.x + b.width * 0.7, y, id: 2 }]);
    await page.waitForTimeout(50);
    await touch('touchEnd', []);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(60);
  const ev = await page.evaluate(() => window.__ev.filter((e) => e.type === 'tickle').map((e) => e.phase));
  check('real touch: two fingers mashing one monster both count (6 contacts: the giggles)', ev.includes('giggly'), ev.join(','));
  // Pinches are one contact each: three quick squish-and-stretches never giggle.
  await page.waitForFunction(() => window.__monster.studio.delightDebug().tickles === 0, null, { timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(2100);
  const gr = await page.locator('.pod[data-monster="grumble"] .pod-hit').boundingBox();
  const cx = gr.x + gr.width / 2;
  const gy = gr.y + gr.height * 0.7;
  const p0 = await page.evaluate(() => window.__ev.length);
  for (let i = 0; i < 3; i++) {
    await touch('touchStart', [{ x: cx - 20, y: gy, id: 1 }]);
    await touch('touchStart', [{ x: cx - 20, y: gy, id: 1 }, { x: cx + 20, y: gy, id: 2 }]);
    for (let k = 1; k <= 4; k++) {
      await touch('touchMove', [{ x: cx - 20 - k * 8, y: gy, id: 1 }, { x: cx + 20 + k * 8, y: gy, id: 2 }]);
      await page.waitForTimeout(25);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(700);
  const pinched = await page.evaluate((p0) => window.__ev.slice(p0).filter((e) => e.type === 'tickle').map((e) => e.phase), p0);
  check('real touch: three quick pinches are three contacts (no giggles, no laugh)', pinched.length === 0, pinched.join(','));
  // A hold (a drum roll) is one contact, however long: rolls one after another never giggle.
  await page.waitForFunction(() => window.__monster.studio.delightDebug().tickles === 0, null, { timeout: 5000 }).catch(() => null);
  const boom = await page.locator('.pod[data-monster="boom"] .pod-hit').boundingBox();
  const n0 = await page.evaluate(() => window.__ev.length);
  for (let i = 0; i < 6; i++) {
    await touch('touchStart', [{ x: boom.x + boom.width / 2, y: boom.y + boom.height * 0.85, id: 1 }]);
    await page.waitForTimeout(450);
    await touch('touchEnd', []);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);
  const held = await page.evaluate((n0) => window.__ev.slice(n0).filter((e) => e.type === 'tickle').length, n0);
  const d = await page.evaluate(() => window.__monster.studio.debug());
  check('real touch: holds (drum rolls) never count as tickles, and stop cleanly', held === 0 && d.rolls === 0 && d.held === 0 && d.live === 0, `${held} tickle events, ${d.rolls} rolls`);
  await ctx.close();
}

// ── 2. The laugh is never heard over the band or in a take ───────────────────
{
  const { ctx, page } = await open();
  // Recording: a poke is only a note in the take. Nothing tickles at all.
  await page.evaluate(() => window.__monster.studio.startRecording());
  await page.waitForTimeout(200);
  const recording = (await S(page)).transport.recording;
  let t0 = await mark(page);
  await poke(page, 'boom', 7, 100);
  await page.waitForTimeout(800);
  check('while recording, quick pokes are just notes: no giggles, no laugh', recording && (await events(page, t0)).length === 0 && (await tickleAttr(page, 'boom')) === null && (await dbg(page)).laughs === 0);
  await page.evaluate(() => {
    window.__monster.studio.stopRecording();
    window.__monster.studio.undo();
    window.__monster.studio.stop();
  });
  // Armed (Record pressed with nothing playing): the same.
  await page.evaluate(async () => {
    await window.__monster.actions.newSong('blank');
    window.__monster.studio.startRecording();
  });
  await page.waitForTimeout(150);
  const armed = (await S(page)).transport.armed;
  t0 = await mark(page);
  await poke(page, 'bloop', 6, 100);
  await page.waitForTimeout(800);
  check('while armed, quick pokes never giggle or laugh', armed && (await events(page, t0)).length === 0 && (await dbg(page)).laughs === 0);
  await page.evaluate(async () => {
    window.__monster.studio.stop();
    await window.__monster.actions.newSong('band');
  });
  await page.waitForTimeout(300);
  // The band playing: the face may show, the laugh stays silent.
  await page.evaluate(() => window.__monster.studio.play());
  await page.waitForTimeout(300);
  t0 = await mark(page);
  await poke(page, 'grumble', 5, 100);
  await page.waitForTimeout(60);
  check('while the band plays, the giggly face may still show', (await tickleAttr(page, 'grumble')) === '1');
  await page.waitForTimeout(700);
  const silent = (await events(page, t0)).find((e) => e.phase === 'laugh');
  check('…but the laugh is silent over the band', !!silent && silent.sound === false && (await dbg(page)).laughs === 0, JSON.stringify(silent));
  await page.waitForTimeout(1200);
  check('…and the face calms down again', (await tickleAttr(page, 'grumble')) === null);
  await page.evaluate(() => window.__monster.studio.stop());
  // A laugh already ringing stops when Record (or Play) is pressed: nothing of it sounds in the take or over the band.
  /** The laugh's voices, once it starts (sequenced voices that will still ring: nothing else plays). */
  const laughVoices = () =>
    page.evaluate(async () => {
      const M = window.__monster;
      const studio = M.studio;
      const at = await new Promise((ok) => {
        const off = M.bus.onStudioEvent((e) => {
          if (e.type === 'tickle' && e.phase === 'laugh') {
            off();
            ok(e);
          }
        });
      });
      await new Promise((ok) => setTimeout(ok, 60));
      const now = studio.ctx.currentTime;
      window.__laughV = studio.engine.voices.filter((v) => v.sequenced && v.endTime > now + 0.15);
      return { level: at.level, sound: at.sound, voices: window.__laughV.length };
    });
  const stillRinging = () =>
    page.evaluate(() => {
      const now = window.__monster.studio.ctx.currentTime;
      return window.__laughV.filter((v) => v.endTime > now + 0.1).length;
    });
  for (const [what, act] of [
    ['Record', () => window.__monster.studio.startRecording()],
    ['Play', () => window.__monster.studio.play()],
  ]) {
    await settle(page);
    await page.waitForTimeout(300);
    const pending = laughVoices();
    await poke(page, 'bloop', 6, 100);
    const l = await pending;
    await page.evaluate(act);
    await page.waitForTimeout(80);
    const left = await stillRinging();
    const flags = (await S(page)).transport;
    check(`${what} pressed mid-laugh: the laugh stops at once (none of it in the ${what === 'Record' ? 'take' : 'band'})`, l.sound && l.voices >= 2 && left === 0 && (what === 'Record' ? flags.recording : flags.playing), `${l.voices} laugh voices, ${left} still ringing`);
    if (what === 'Record') check('…and the face calms with it', (await tickleAttr(page, 'bloop')) === null);
    await page.evaluate(() => {
      window.__monster.studio.stopRecording();
      window.__monster.studio.stop();
    });
    const s = await S(page);
    if (s.past.length) await page.evaluate(() => window.__monster.studio.undo());
  }
  await ctx.close();
}

// ── 3. The musical sky and the moon, on every stage shape ────────────────────
for (const [w, h, name] of [
  [1024, 768, 'iPad'],
  [844, 390, 'phone'],
  [820, 1180, 'upright iPad'],
]) {
  const { ctx, page } = await open({ viewport: { width: w, height: h } });
  const tall = h >= 560;
  // The moon: one consistent target, wherever it sits.
  const moon = await moonAt(page);
  check(`${name}: a touch on the moon lands on the moon`, moon.hits === 'moon-hit', `${moon.hits}`);
  let before = await snapshot(page);
  let t0 = await mark(page);
  await page.mouse.click(moon.x, moon.y);
  await page.waitForTimeout(250);
  const moonNotes = await notes(page, t0);
  check(
    `${name}: tapping the moon rings a soft low bell (and plays no monster)`,
    moonNotes.length === 2 && moonNotes.every((n) => n.source === 'sky' && n.trackId === null && n.monster === 'spark') && moonNotes[0].step < 0,
    moonNotes.map((n) => `${n.source}:${n.monster}:${n.step}`).join(' '),
  );
  check(`${name}: the moon glows and shows a winking face`, (await anims(page, 'moon-glow', t0)).length === 1 && (await anims(page, 'moon-face', t0)).length === 1 && (await anims(page, 'moon-wink', t0)).length === 1);
  if (name === 'iPad') await shot(page, 'sky-moon-ipad');
  await page.waitForTimeout(1500);
  // Mashing the moon: it winks every time, but rings only now and then (never a pile of bells).
  t0 = await mark(page);
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(moon.x + (i % 2 ? 3 : -3), moon.y);
    await page.waitForTimeout(70);
  }
  const mashed = (await notes(page, t0)).filter((n) => n.source === 'sky').length / 2;
  const winks = (await anims(page, 'moon-glow', t0)).length;
  check(`${name}: mashing the moon winks every time but rings only a few bells`, winks === 12 && mashed >= 2 && mashed <= 4, `${winks} glows, ${mashed} bells for 12 taps`);
  // Just outside the moon's touch circle, inside a monster's column, the monster plays.
  const beside = await page.evaluate(() => {
    const hit = document.querySelector('.stage-moon .moon-hit').getBoundingClientRect();
    const x = hit.left - 6;
    const y = hit.top + hit.height / 2;
    const el = document.elementFromPoint(x, y);
    const pod = el?.closest?.('.pod');
    return { x, y, track: pod?.dataset.track ?? null, monster: pod?.dataset.monster ?? null, r: hit.width / 2 };
  });
  if (beside.track) {
    await page.waitForTimeout(400);
    t0 = await mark(page);
    await page.mouse.click(beside.x, beside.y);
    await page.waitForTimeout(80);
    const played = (await notes(page, t0)).filter((n) => n.trackId === beside.track && n.source === 'live').length;
    check(`${name}: right beside the moon, ${beside.monster} keeps its touch (moon circle ${Math.round(beside.r)} px)`, played === 1 && (tall || beside.r <= 24), `${played} notes`);
  }
  await page.waitForTimeout(600);
  before = await snapshot(page);
  // The bare sky.
  const pts = await skyPoints(page);
  check(`${name}: some bare sky is left for the sky to hear`, pts.length > 0, `${pts.length} points`);
  const stars = await page.evaluate(() => [...document.querySelectorAll('.sky-star')].filter((s) => s.getBoundingClientRect().width > 0).length);
  check(`${name}: extra stars only where the sky is open (${tall ? 'tablets: 3' : 'phones: none'})`, stars === (tall ? 3 : 0), `${stars}`);
  if (tall) {
    // Every extra star sits on bare sky, so it rings when touched.
    const open = await page.evaluate(() =>
      [...document.querySelectorAll('.sky-star')].every((s) => {
        const r = s.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.classList.contains('stage-sky');
      }),
    );
    check(`${name}: every extra star sits on the open sky`, open);
  }
  if (pts.length) {
    const p = pts[Math.floor(pts.length / 2)];
    t0 = await mark(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
    const one = await notes(page, t0);
    const spark = await page.locator('.sky-spark').count();
    check(`${name}: a tap on the bare sky rings one Spark bell with a sparkle`, one.length === 1 && one[0].source === 'sky' && one[0].monster === 'spark' && spark >= 1, one.map((n) => `${n.source}:${n.step}`).join(' '));
    const after = await snapshot(page);
    check(`${name}: sky bells change nothing: same song, no undo step, same spotlight`, after.project === before.project && after.past === before.past && after.selected === before.selected);
    // Higher on screen is higher: the highest and lowest bare points in one column.
    const cols = new Map();
    for (const q of pts) {
      const k = Math.round(q.x / 16);
      cols.set(k, [...(cols.get(k) ?? []), q]);
    }
    const col = [...cols.values()].sort((a, b) => b[b.length - 1].y - b[0].y - (a[a.length - 1].y - a[0].y))[0];
    const top = col[0];
    const low = col[col.length - 1];
    if (low.y - top.y > 60) {
      const steps = [];
      for (const q of [low, top]) {
        await page.waitForTimeout(120);
        const t = await mark(page);
        await page.mouse.click(q.x, q.y);
        await page.waitForTimeout(60);
        steps.push((await notes(page, t)).find((n) => n.source === 'sky')?.step);
      }
      check(`${name}: higher on screen is a higher bell`, steps[1] > steps[0], `low ${steps[0]} → high ${steps[1]} (${Math.round(low.y - top.y)} px apart)`);
    }
  }
  if (tall) {
    // A sweep along the open band: a twinkly run, never a machine gun.
    const band = pts.filter((q) => q.fy < 0.14 && q.fx > 0.3 && q.fx < 0.92);
    const y = band.length ? band[Math.floor(band.length / 2)].y : null;
    if (y !== null) {
      const xs = band.filter((q) => Math.abs(q.y - y) < 1).map((q) => q.x);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      await page.waitForTimeout(150);
      t0 = await mark(page);
      await page.mouse.move(x0, y);
      await page.mouse.down();
      for (let i = 1; i <= 40; i++) {
        await page.mouse.move(x0 + ((x1 - x0) * i) / 40, y);
        await page.waitForTimeout(6);
      }
      const sweepT = (await mark(page)) - t0;
      const sparks = await page.locator('.sky-spark').count();
      await page.mouse.up();
      const run = (await notes(page, t0)).filter((n) => n.source === 'sky').map((n) => n.step);
      const rising = run.every((s, i) => i === 0 || s >= run[i - 1]);
      check(`${name}: a sweep along the sky plays a rising twinkly run`, run.length >= 3 && rising && new Set(run).size >= 3, run.join(','));
      check(`${name}: …at most one bell per 70 ms, and at most 12 sparkles`, run.length <= Math.ceil(sweepT / 70) + 1 && sparks <= 12, `${run.length} bells in ${Math.round(sweepT)} ms, ${sparks} sparkles`);
      if (name === 'upright iPad') await shot(page, 'sky-sweep-upright');
    }
  }
  // Pods keep every tap (also just under their tops, and on phones under the moon's column).
  t0 = await mark(page);
  const pods = await page.evaluate(() =>
    [...document.querySelectorAll('.pod')].map((pod) => {
      const r = pod.querySelector('.pod-hit').getBoundingClientRect();
      return { id: pod.dataset.track, x: r.left + r.width / 2, y: r.top + r.height * 0.7, topX: r.left + r.width * 0.25, topY: r.top + 6 };
    }),
  );
  let reached = 0;
  let topReached = 0;
  for (const p of pods) {
    let t = await mark(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
    if ((await notes(page, t)).some((n) => n.trackId === p.id && n.source === 'live')) reached++;
    await page.waitForTimeout(500);
    t = await mark(page);
    await page.mouse.click(p.topX, p.topY);
    await page.waitForTimeout(60);
    if ((await notes(page, t)).some((n) => n.trackId === p.id && n.source === 'live')) topReached++;
    await page.waitForTimeout(500);
  }
  check(`${name}: every monster still plays when touched (body and the top of its column)`, reached === pods.length && topReached === pods.length, `${reached}/${pods.length} bodies, ${topReached}/${pods.length} tops`);
  // The + seat and the costume toy keep their taps too.
  await page.locator('.add-seat').click();
  await page.waitForTimeout(150);
  check(`${name}: the + seat still opens the tray`, (await S(page)).overlay === 'tray');
  await page.evaluate(() => window.__monster.actions.setOverlay(null));
  await page.waitForTimeout(200);
  // While a take records, the sky only sparkles (its bells would never be in the loop).
  if (pts.length) {
    await page.evaluate(() => window.__monster.studio.startRecording());
    await page.waitForTimeout(150);
    const p = pts[0];
    t0 = await mark(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
    const hushed = (await notes(page, t0)).filter((n) => n.source === 'sky').length;
    check(`${name}: while recording, the sky is hushed (sparkles only)`, hushed === 0 && (await anims(page, 'sky-', t0)).length >= 1);
    await page.evaluate(() => {
      window.__monster.studio.stopRecording();
      window.__monster.studio.stop();
    });
  }
  if (name === 'iPad') await axeLab(page, 'the Lab with the musical sky');
  await ctx.close();
}

// ── 4. Costume poof (all three stage shapes) ─────────────────────────────────
for (const [w, h, name] of [
  [1024, 768, 'iPad'],
  [844, 390, 'phone'],
  [820, 1180, 'upright iPad'],
]) {
  const { ctx, page } = await open({ viewport: { width: w, height: h } });
  await page.evaluate(() => {
    const M = window.__monster;
    M.actions.selectTrack(M.getState().project.tracks.find((t) => t.monster === 'boom').id);
  });
  await page.waitForTimeout(400);
  const costume = page.locator('.tool-costume:visible').first();
  const seen = [];
  let clipped = 0;
  let oldHat = 0;
  let hats = 0;
  for (let i = 0; i < 4; i++) {
    const t0 = await mark(page);
    await costume.click();
    // Pause the hat in mid-drop: it must never poke out of the stage's top edge.
    const drop = await page.evaluate(async () => {
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const hat = document.querySelector('.pod[data-monster="boom"] [id$="-figure"] .m-hat');
      const a = hat?.getAnimations().find((x) => x.id === 'poof-hat');
      const stageTop = document.querySelector('.stage').getBoundingClientRect().top;
      if (!a) return { hat: !!hat, top: null, stageTop };
      a.pause();
      let top = Infinity;
      for (const ms of [60, 100, 160]) {
        a.currentTime = ms;
        top = Math.min(top, hat.getBoundingClientRect().top);
      }
      a.play();
      return { hat: true, top, stageTop };
    });
    if (drop.top !== null && drop.top < drop.stageTop - 1) clipped++;
    if (drop.top !== null) hats++;
    await page.waitForTimeout(60);
    const smoke = await anims(page, 'poof-smoke', t0);
    const hop = await anims(page, 'poof-hop', t0);
    const old = await anims(page, 'poof-oldhat', t0);
    if (old.length) oldHat++;
    seen.push(`${(await S(page)).project.tracks.find((t) => t.monster === 'boom').preset}:${smoke.length}/${hop.length}${drop.hat ? '+hat' : ''}${old.length ? '+off' : ''}`);
    if (i === 0) await shot(page, `poof-${name.replace(' ', '-')}`);
    await page.waitForTimeout(700);
  }
  check(`${name}: each costume change puffs smoke and hops`, seen.every((s) => /:\d+\/1/.test(s) && !/:0\//.test(s)), seen.join(' '));
  check(`${name}: the new hat drops in and lands (3 hats), never out of the stage`, hats === 3 && clipped === 0, `${hats} drops, ${clipped} clipped`);
  check(`${name}: back to no hat: the old hat flies off and pops`, oldHat === 1);
  await page.waitForTimeout(300);
  check(`${name}: the poof leaves nothing behind`, (await page.locator('.poof-puff, .poof-oldhat').count()) === 0);
  await ctx.close();
}

// ── 5. Chomper chomps (Monster Maker) ────────────────────────────────────────
{
  const { ctx, page } = await open({ mode: 'maker' });
  await page.evaluate(() => {
    const M = window.__monster;
    const s = M.getState();
    const id = s.project.tracks.find((t) => t.monster === 'bloop').id;
    M.setState({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, fx: { ...t.fx, chomper: 0.4 } } : t)) } });
    M.actions.selectTrack(id);
  });
  await page.waitForTimeout(400);
  let t0 = await mark(page);
  await poke(page, 'bloop', 1);
  await page.waitForTimeout(80);
  check('Chomper bites on every note (jaw snap and squash), no crumbs at "a little"', (await anims(page, 'chomp-jaw', t0)).length === 1 && (await anims(page, 'chomp', t0)).some((a) => a.id === 'chomp') && (await page.locator('.chomp-crumb').count()) === 0);
  await page.evaluate(() => {
    const M = window.__monster;
    const s = M.getState();
    M.setState({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.monster === 'bloop' ? { ...t, fx: { ...t.fx, chomper: 0.8 } } : t)) } });
  });
  await page.waitForTimeout(200);
  t0 = await mark(page);
  let most = 0;
  const b = await page.locator('.pod[data-monster="bloop"] .pod-hit').boundingBox();
  for (let i = 0; i < 10; i++) {
    await page.mouse.click(b.x + b.width / 2, b.y + b.height * (0.5 + (i % 3) * 0.1));
    most = Math.max(most, await page.locator('.chomp-crumb').count());
    await page.waitForTimeout(70);
  }
  check('at "a lot" each bite drops crumbs, never more than 6 at once', most >= 2 && most <= 6, `${most} crumbs at most`);
  await shot(page, 'chomper-maker');
  // Loop notes chomp too: the band plays Bloop's loop.
  await page.evaluate(() => window.__monster.studio.play());
  t0 = await mark(page);
  await page.waitForTimeout(1500);
  const loopChomps = (await anims(page, 'chomp-jaw', t0)).length;
  await page.evaluate(() => window.__monster.studio.stop());
  check('…and on every note its loop plays', loopChomps >= 2, `${loopChomps} bites in 1.5 s`);
  await page.waitForTimeout(800);
  check('crumbs never pile up', (await page.locator('.chomp-crumb').count()) === 0);
  // Monster Makers see the giggles but no laugh is ever heard (fast drumming is not a tickle).
  t0 = await mark(page);
  await poke(page, 'boom', 8, 90);
  await page.waitForTimeout(60);
  check('Monster Maker: eight quick pokes show the giggles', (await tickleAttr(page, 'boom')) === '1');
  await page.waitForTimeout(800);
  const mk = (await events(page, t0)).find((e) => e.phase === 'laugh');
  check('…but the laugh stays silent for Monster Makers', !!mk && mk.sound === false && (await dbg(page)).laughs === 0);
  await ctx.close();
}

// ── 6. Reduced motion: a glow instead, the sound stays ───────────────────────
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  let t0 = await mark(page);
  await poke(page, 'spark', 6, 100);
  await page.waitForTimeout(800);
  const moved = (await anims(page, 'tickle-', t0)).filter((a) => a.id !== 'tickle-glow');
  check('reduced motion: the giggly face and the laugh, no jiggle, bubbles or hop', (await events(page, t0)).some((e) => e.phase === 'giggly') && moved.length === 0 && (await anims(page, 'tickle-glow', t0)).length >= 1 && (await dbg(page)).laughs === 1, moved.map((a) => a.id).join(','));
  await page.waitForTimeout(1200);
  t0 = await mark(page);
  await page.locator('.tool-costume:visible').first().click();
  await page.waitForTimeout(120);
  check('reduced motion: a costume change glows (no smoke, hop or drop)', (await anims(page, 'poof-glow', t0)).length === 1 && (await anims(page, 'poof-smoke', t0)).length === 0 && (await anims(page, 'poof-hop', t0)).length === 0);
  const pts = await skyPoints(page);
  t0 = await mark(page);
  await page.mouse.click(pts[0].x, pts[0].y);
  await page.waitForTimeout(80);
  check('reduced motion: the sky still rings, with a soft glow and no flying sparkle', (await notes(page, t0)).some((n) => n.source === 'sky') && (await anims(page, 'sky-glow', t0)).length === 1 && (await anims(page, 'sky-spark', t0)).length === 0 && (await anims(page, 'sky-flare', t0)).length === 0);
  const moon = await moonAt(page);
  t0 = await mark(page);
  await page.mouse.click(moon.x, moon.y);
  await page.waitForTimeout(80);
  check('reduced motion: the moon rings and glows, without the boing or the wink', (await notes(page, t0)).length === 2 && (await anims(page, 'moon-glow', t0)).length === 1 && (await anims(page, 'moon-boing', t0)).length === 0 && (await anims(page, 'moon-wink', t0)).length === 0);
  await ctx.close();
}

// ── 6b. Playing the sky is playing: the "tap a key" hand stays away ───────────
{
  const { ctx, page } = await open();
  const moon = await moonAt(page);
  const pts = await skyPoints(page);
  for (let i = 0; i < 6; i++) {
    const p = i % 2 ? moon : pts[(i * 7) % pts.length];
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(400);
  check('ringing the sky and the moon in a fresh Lab: no "tap a key" hand', (await page.locator('.coach-hand').count()) === 0);
  await ctx.close();
}

// ── 6c. Real touch: a two-hand slap on the sky rings both hands ──────────────
{
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`slap: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`slap: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 410, y: 590, id: 1 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    await window.__monster.actions.newSong('band');
    window.__monster.studio.stop();
    window.__notes = [];
    window.__monster.bus.onNote((v) => window.__notes.push(v));
  });
  await page.waitForTimeout(900);
  const pts = await skyPoints(page);
  const a = pts.reduce((m, p) => (p.x < m.x ? p : m), pts[0]);
  const b = pts.reduce((m, p) => (p.x > m.x ? p : m), pts[0]);
  await touch('touchStart', [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }]);
  await page.waitForTimeout(60);
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const rang = await page.evaluate(() => window.__notes.filter((n) => n.source === 'sky').length);
  check('real touch: a two-hand slap on the sky rings a bell for each hand', rang === 2 && b.x - a.x > 200, `${rang} bells, hands ${Math.round(b.x - a.x)} px apart`);
  await ctx.close();
}

// ── 7. Nothing runs while nobody touches ─────────────────────────────────────
{
  const { ctx, page } = await open();
  await page.waitForTimeout(1500);
  const idle = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.stage-sky, .stage-moon'))
      .map((a) => a.animationName ?? a.id),
  );
  check('the sky and the moon run no animation while nobody touches them', idle.length === 0, idle.join(','));
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
