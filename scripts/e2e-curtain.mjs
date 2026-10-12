// The song payoff: the curtain call, end to end.
//   1. While a song plays in Monster Blocks, each row's monster head sings its
//      own notes (and never another row's); a dense row is throttled; painting
//      notes light the painting's row; a sleeping row's preview never wakes it.
//   2. The finale bows the row heads: they hop one by one in row order, then bow
//      together (sleeping monsters and monsters with no blocks just watch).
//   3. A wordless ending: clapping hands and an "again" sparkle (no title on
//      screen; a status line for screen readers), the audience claps on its own
//      channel, "again" replays the song from the top, goes at the next touch or
//      by itself, and never covers or blocks the transport or the dock.
//   4. A demo ends the same way (stars too); an empty song still has no finale;
//      leaving Blocks or pressing Play ends the curtain call at once.
//   5. Reduced motion: glows, no hops or bows, still hands, no star rain.
//   6. iPad 1024×768, phone 844×390, upright 820×1180; axe on Blocks during the
//      finale; smooth under a 4× slower CPU; no console errors.
// Usage: node scripts/e2e-curtain.mjs [url] [screenshot-dir]
import { existsSync, readFileSync } from 'node:fs';
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

/** Every Web Animation started: its id, delay, the row it is in, what it moves, and the song's beat. */
function hookAnimations() {
  window.__anims = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const props = Array.isArray(frames) ? [...new Set(frames.flatMap((f) => Object.keys(f)))] : Object.keys(frames ?? {});
    const st = window.__monster?.studio;
    const ctx = st?.audioContext;
    const beat = st?.transport?.playing && ctx ? st.transport.beatAt(ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)) : null;
    window.__anims.push({
      id: o.id ?? '',
      delay: o.delay ?? 0,
      row: this.closest?.('.block-row')?.getAttribute('data-track') ?? null,
      pod: this.closest?.('.pod')?.getAttribute('data-track') ?? null,
      body: !!this.matches?.('.m-body'),
      cls: this.getAttribute?.('class') ?? '',
      props: props.filter((p) => p !== 'offset' && p !== 'easing' && p !== 'composite'),
      beat,
      t: performance.now(),
    });
    return animate.call(this, frames, opts);
  };
}

async function open({ viewport = { width: 1024, height: 768 }, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  await ctx.addInitScript(hookAnimations);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(500);
  // Remember every sound the engine is asked to play (channel, drum pad, velocity, time).
  await page.evaluate(() => {
    const eng = window.__monster.studio.engine;
    window.__trig = [];
    const trigger = eng.trigger.bind(eng);
    eng.trigger = (req, when, dur) => {
      window.__trig.push({ ch: req.channelId, pad: req.pad, vel: req.vel, when });
      return trigger(req, when, dur);
    };
    window.__finale = [];
    window.__monster.bus.onStudioEvent((e) => e.type === 'finale' && window.__finale.push(performance.now()));
  });
  return { ctx, page };
}

const S = (page) => page.evaluate(() => window.__monster.getState());
const shot = async (page, name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));
const resetLogs = (page) => page.evaluate(() => ((window.__anims = []), (window.__trig = []), (window.__finale = [])));
const anims = (page) => page.evaluate(() => window.__anims);

/**
 * The Monster Band song, arranged by hand: `cols` says which blocks each monster
 * plays (by monster kind), `sleeping` puts monsters to sleep. Opens Blocks.
 */
async function bandSong(page, { cols, sleeping = [], tempo = 160, length = null, paint = null }) {
  await page.evaluate(async ({ cols, sleeping, tempo, length, paint }) => {
    const M = window.__monster;
    M.studio.stop();
    await M.actions.newSong('band');
    const p = M.getState().project;
    const n = length ?? p.arrangement.length;
    const rows = {};
    for (const t of p.tracks) rows[t.id] = Array.from({ length: n }, (_, c) => ((cols[t.monster] ?? []).includes(c) ? t.activeClipId : null));
    let painting = p.painting;
    if (paint) {
      painting = { strokes: [{ id: 's1', kind: 'line', brush: paint.brush, points: [0.05, 0.5, 0.3, 0.3, 0.6, 0.6, 0.95, 0.4], weight: 0.9 }], sleeping: false };
      rows.paint = Array.from({ length: n }, (_, c) => (paint.cols.includes(c) ? 'paint' : null));
    }
    const tracks = p.tracks.map((t) => ({ ...t, sleeping: sleeping.includes(t.monster) }));
    M.setState({ project: { ...p, tempo, tracks, painting, arrangement: { ...p.arrangement, length: n, rows } } });
    M.actions.setScreen('blocks');
  }, { cols, sleeping, tempo, length, paint });
  await page.waitForTimeout(300);
}

const ids = (page) => page.evaluate(() => Object.fromEntries(window.__monster.getState().project.tracks.map((t) => [t.monster, t.id])));
const rect = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
  }, sel);
const overlap = (a, b) => !!a && !!b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, b) => !!a && !!b && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;
/** Text a sighted child would see in the curtain call (the screen-reader line is clipped away). */
const visibleText = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.finale, .curtain')]
      .map((el) => el.innerText.trim())
      .join('')
      .trim(),
  );
const waitFinale = (page, timeout = 15000) => page.waitForFunction(() => window.__finale.length > 0, null, { timeout }).then(() => true).catch(() => false);
/** Milliseconds since the song ended. */
const sinceFinale = (page) => page.evaluate(() => performance.now() - window.__finale[0]);
const waitSince = async (page, ms) => {
  const left = ms - (await sinceFinale(page));
  if (left > 0) await page.waitForTimeout(left);
};

// ── 1. The row heads sing their own notes ──────────────────────────────────
{
  const { ctx, page } = await open();
  // Block 1: Boom alone. Block 2: Bloop alone. Grumble and Spark have blocks later only.
  await bandSong(page, { cols: { boom: [0], bloop: [1], grumble: [3], spark: [3] }, tempo: 150, length: 4 });
  const id = await ids(page);
  await resetLogs(page);
  await page.evaluate(() => window.__monster.studio.play());
  await page.waitForTimeout(6500); // two blocks at 150 bpm: 6.4 s
  await page.evaluate(() => window.__monster.studio.stop());
  const a = (await anims(page)).filter((x) => x.beat !== null && x.row && !x.id.startsWith('curtain'));
  const inBlock = (row, from, to) => a.filter((x) => x.row === row && x.beat >= from && x.beat < to).length;
  check('block 1: Boom’s row head moves on its notes', inBlock(id.boom, 0.25, 7.5) >= 4, `${inBlock(id.boom, 0.25, 7.5)} animations`);
  check('block 1: Bloop, Grumble and Spark (no block here) stay still', inBlock(id.bloop, 0.5, 7.5) + inBlock(id.grumble, 0, 16) + inBlock(id.spark, 0, 16) === 0);
  check('block 2: Bloop’s row head sings when its block comes', inBlock(id.bloop, 8.5, 15.5) >= 4, `${inBlock(id.bloop, 8.5, 15.5)} animations`);
  check('block 2: Boom (no block 2) is quiet again', inBlock(id.boom, 8.5, 15.5) === 0);
  const bodies = a.filter((x) => x.row === id.boom && x.body);
  check('the head itself moves (its body squashes), not only its eyes', bodies.length >= 2 && bodies.every((x) => x.props.includes('transform')));
  await shot(page, 'curtain-1-singing-ipad');

  // A dense row (sixteenth hi-hats at 180 bpm, 83 ms apart) is throttled: about every other note.
  await page.evaluate(() => {
    const M = window.__monster;
    const p = M.getState().project;
    const boom = p.tracks.find((t) => t.monster === 'boom');
    const notes = Array.from({ length: 32 }, (_, i) => ({ id: `h${i}`, beat: i * 0.25, step: 2, dur: 0.1, vel: 0.6, tone: 0 }));
    const clip = { id: 'hats', lengthBeats: 8, notes };
    const rows = Object.fromEntries(Object.keys(p.arrangement.rows).map((k) => [k, [k === boom.id ? 'hats' : null]]));
    M.setState({ project: { ...p, tempo: 180, tracks: p.tracks.map((t) => (t.id === boom.id ? { ...t, clips: [...t.clips, clip] } : t)), arrangement: { ...p.arrangement, length: 1, rows } } });
    window.__boomNotes = 0;
    M.bus.onNote((v) => v.trackId === boom.id && window.__boomNotes++);
  });
  await page.waitForTimeout(200);
  await resetLogs(page);
  await page.evaluate(() => window.__monster.studio.play());
  await page.waitForTimeout(2900);
  await page.evaluate(() => window.__monster.studio.stop());
  const dense = await page.evaluate((boom) => ({ notes: window.__boomNotes, reacts: window.__anims.filter((x) => x.row === boom && x.body).length }), id.boom);
  check('a dense hi-hat row reacts about every other note, never on every one', dense.notes >= 24 && dense.reacts >= dense.notes * 0.3 && dense.reacts <= dense.notes * 0.7, `${dense.reacts} reactions for ${dense.notes} notes`);

  // A sleeping row stays asleep, even when its block is previewed; an awake row's preview sings.
  await bandSong(page, { cols: { boom: [0], bloop: [0], grumble: [0], spark: [0] }, sleeping: ['spark'], length: 2 });
  Object.assign(id, await ids(page));
  await resetLogs(page);
  await page.evaluate((id) => {
    const p = window.__monster.getState().project;
    window.__monster.studio.audition(id.spark, p.tracks.find((t) => t.id === id.spark).activeClipId);
  }, id);
  await page.waitForTimeout(1200);
  const sleepy = (await anims(page)).filter((x) => x.row === id.spark).length;
  await resetLogs(page);
  await page.evaluate((id) => {
    const p = window.__monster.getState().project;
    window.__monster.studio.audition(id.bloop, p.tracks.find((t) => t.id === id.bloop).activeClipId);
  }, id);
  await page.waitForTimeout(1200);
  const awake = (await anims(page)).filter((x) => x.row === id.bloop).length;
  check('a sleeping monster’s preview never opens its eyes; an awake one sings its preview', sleepy === 0 && awake > 0, `asleep ${sleepy}, awake ${awake}`);
  // Taking a block away: the monster's "pop" moves its head.
  await resetLogs(page);
  const cell = await rect(page, `.block[data-row="${id.grumble}"][data-col="0"]`);
  await page.mouse.click(cell.l + cell.w / 2, cell.t + cell.h / 2);
  await page.waitForTimeout(400);
  const popped = (await anims(page)).filter((x) => x.row === id.grumble).length;
  check('taking a block away: its monster goes “pop” and its head moves', popped > 0 && !(await S(page)).project.arrangement.rows[id.grumble][0], `${popped}`);

  // Painting notes light the painting's row, even in Bloop's voice (paintChannel borrows Bloop's track).
  await bandSong(page, { cols: { boom: [1], bloop: [1] }, length: 2, tempo: 160, paint: { brush: 'bloop', cols: [0] } });
  Object.assign(id, await ids(page));
  await resetLogs(page);
  await page.evaluate(() => window.__monster.studio.play());
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__monster.studio.stop());
  const pa = (await anims(page)).filter((x) => x.beat !== null && x.beat < 7.5);
  check('painting notes pulse the painting’s row, never Bloop’s (whose voice they borrow)', pa.filter((x) => x.row === 'paint' && x.id === 'row-sing').length > 0 && pa.filter((x) => x.row === id.bloop).length === 0, `${pa.filter((x) => x.row === 'paint').length} paint, ${pa.filter((x) => x.row === id.bloop).length} bloop`);
  await ctx.close();
}

// ── 2–3. The curtain call: hop, bow, clap, again ───────────────────────────
for (const viewport of [
  { width: 1024, height: 768, name: 'ipad' },
  { width: 844, height: 390, name: 'phone' },
  { width: 820, height: 1180, name: 'upright' },
]) {
  const tag = `${viewport.width}×${viewport.height}`;
  const { ctx, page } = await open({ viewport });
  // Bloop and Boom play; Grumble sleeps (with blocks); Spark has no block: two performers.
  await bandSong(page, { cols: { bloop: [0], boom: [0], grumble: [0] }, sleeping: ['grumble'], length: 1, tempo: 170 });
  const id = await ids(page);
  await resetLogs(page);
  const t0 = await page.evaluate(() => window.__monster.studio.play());
  check(`${tag}: the song ends with a finale`, await waitFinale(page));
  await waitSince(page, 2000);
  const a = await anims(page);
  const hops = a.filter((x) => x.id === 'curtain-hop');
  const bows = a.filter((x) => x.id === 'curtain-bow');
  check(
    `${tag}: the performers hop one by one in row order (Bloop, then Boom)`,
    hops.length === 2 && hops[0].row === id.bloop && hops[1].row === id.boom && hops[1].delay > hops[0].delay,
    hops.map((h) => `${h.row}@${h.delay}`).join(' '),
  );
  check(
    `${tag}: …then bow together, after the last hop`,
    bows.length === 2 && new Set(bows.map((b) => b.row)).size === 2 && bows.every((b) => b.delay === bows[0].delay && b.delay > hops[1].delay),
    bows.map((b) => `${b.row}@${b.delay}`).join(' '),
  );
  check(`${tag}: a sleeping monster and one with no blocks just watch`, a.filter((x) => x.id.startsWith('curtain') && (x.row === id.grumble || x.row === id.spark)).length === 0);
  check(`${tag}: the hop and the bow move the whole head (composited), not parts inside it`, [...hops, ...bows].every((x) => x.cls.includes('monster-svg') && x.props.every((p) => ['translate', 'scale'].includes(p))));
  check(`${tag}: eyes close for the bow`, a.filter((x) => x.id === 'curtain-lids' && x.row === id.bloop).length > 0);
  check(`${tag}: stars rain for the song`, (await page.locator('.finale .confetti').count()) > 0);
  check(`${tag}: two clapping hands, and the old title is gone`, (await page.locator('.finale-clap svg .clap-l').count()) === 1 && (await page.locator('.finale-title').count()) === 0);
  await shot(page, `curtain-2-bow-${viewport.name}`);
  await waitSince(page, 3200);
  const again = page.locator('.curtain-again');
  check(`${tag}: a big “again” sparkle appears`, (await again.count()) === 1 && (await again.getAttribute('aria-label')) === 'Play the song again');
  check(`${tag}: nothing on screen needs reading`, (await visibleText(page)) === '' && (await page.getByText('You made a song!').count()) === 0);
  const status = await page.evaluate(() => {
    const s = document.querySelector('[role="status"].sr-only');
    const r = s?.getBoundingClientRect();
    return { text: s?.textContent ?? '', tiny: !!r && r.width <= 1 && r.height <= 1 };
  });
  check(`${tag}: …but screen readers hear it said`, status.text.length > 0 && status.tiny, status.text);
  // The applause: Boom's clap on the crowd's own channel, after the bow begins; no band channel is touched.
  const trig = await page.evaluate(() => window.__trig);
  const end = await page.evaluate(() => {
    const st = window.__monster.studio;
    return st.transport.timeAt(8);
  });
  const crowd = trig.filter((x) => x.ch === 'crowd');
  check(`${tag}: the audience claps (Boom’s clap, on its own channel, never louder than 0.5)`, crowd.length === 10 && crowd.every((x) => x.pad === 3 && x.vel <= 0.5 && x.when > end + 1), `${crowd.length} claps, first ${crowd.length ? (crowd[0].when - end).toFixed(2) : '-'} s after the end`);
  check(`${tag}: the sleeping monster is never heard, and no band monster plays after the finale`, trig.filter((x) => x.ch === id.grumble).length === 0 && trig.filter((x) => x.ch !== 'crowd' && x.when > end + 0.6).length === 0);
  // Layout: inside the screen's own area, clear of the dock and the transport.
  const r = {
    again: await rect(page, '.curtain-again'),
    hands: await rect(page, '.finale-clap'),
    screen: await rect(page, '.screen'),
    play: await rect(page, '.t-play'),
    magic: await rect(page, '.t-magic'),
    undo: await rect(page, '.t-small'),
    dock: await rect(page, '.dock'),
  };
  check(`${tag}: “again” and the hands sit over the song, clear of the dock and the transport`, inside(r.again, r.screen) && [r.play, r.magic, r.undo, r.dock].every((x) => !overlap(r.again, x) && !overlap(r.hands, x)), JSON.stringify({ again: r.again, screen: r.screen }));
  check(`${tag}: “again” is a big target (≥ 80 px)`, r.again.w >= 80 && r.again.h >= 80, `${r.again.w.toFixed(0)} px`);
  const reach = await page.evaluate(() =>
    ['.t-play', '.t-magic', '.dock-btn[data-screen="lab"]'].every((sel) => {
      const el = document.querySelector(sel);
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && (top === el || el.contains(top));
    }),
  );
  check(`${tag}: Play, Magic and the dock stay reachable during the curtain call`, reach);
  await shot(page, `curtain-3-again-${viewport.name}`);

  if (viewport.name === 'ipad') {
    // Accessibility gate during the finale.
    const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);
    if (!existsSync(axePath)) check('axe-core is installed for the accessibility gate', false);
    else {
      await page.addScriptTag({ content: readFileSync(axePath, 'utf8') });
      const found = await page.evaluate(async () => {
        const res = await window.axe.run(document.body, { resultTypes: ['violations'] });
        return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      });
      check('axe: no violations on Monster Blocks during the curtain call', found.length === 0, found.join(' | '));
    }
    // "Again" replays the song from the top, and the curtain call is gone at once.
    // (A finger's tap at its centre: it gently breathes, so it is never "stable" for a locator click.)
    const ar = await rect(page, '.curtain-again');
    const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.curtain-again'), { x: ar.l + ar.w / 2, y: ar.t + ar.h / 2 });
    check('“again” is on top of the blocks, where a finger lands', onTop);
    await resetLogs(page);
    await page.mouse.click(ar.l + ar.w / 2, ar.t + ar.h / 2);
    await page.waitForTimeout(150);
    const s = await S(page);
    const d = await page.evaluate(() => window.__monster.studio.debug());
    check('“again” plays the song again from the top', s.transport.playing && s.transport.mode === 'song' && d.beat < 1, `beat ${d.beat.toFixed(2)}`);
    await page.waitForTimeout(350);
    check('…and the curtain call is gone (no button, no stars, no bows left running)', (await page.locator('.curtain, .finale').count()) === 0 && (await page.evaluate(() => document.getAnimations().filter((x) => x.id.startsWith('curtain-')).length)) === 0);
    // That song ends too; this time a touch elsewhere sends "again" away, and the touch still does its job.
    check('the replayed song ends with its own curtain call', await waitFinale(page));
    await page.waitForFunction(() => !!document.querySelector('.curtain-again'), null, { timeout: 6000 });
    const cell = await rect(page, `.block[data-row="${id.bloop}"][data-col="0"]`);
    await page.mouse.click(cell.l + cell.w / 2, cell.t + cell.h / 2);
    await page.waitForTimeout(400);
    check('a touch elsewhere sends “again” away, and still does its own job (the block pops)', (await page.locator('.curtain-again').count()) === 0 && !(await S(page)).project.arrangement.rows[id.bloop][0]);
    await page.evaluate(() => window.__monster.studio.undo());
  }
  if (viewport.name === 'phone') {
    // Left alone, "again" waits several seconds, then goes by itself and leaves nothing behind.
    await waitSince(page, 9500);
    check('“again” is still there after several seconds', (await page.locator('.curtain-again').count()) === 1);
    await waitSince(page, 11800);
    const gone = await page.evaluate(() => {
      const play = document.querySelector('.t-play').getBoundingClientRect();
      const top = document.elementFromPoint(play.left + play.width / 2, play.top + play.height / 2);
      const screen = document.querySelector('.screen').getBoundingClientRect();
      const mid = document.elementFromPoint(screen.left + screen.width / 2, screen.top + screen.height * 0.66);
      return { curtain: !!document.querySelector('.curtain'), play: !!top?.closest('.t-play'), mid: !!mid?.closest('.blocks') };
    });
    check('…then goes by itself, leaving nothing in the way of Play or the blocks', !gone.curtain && gone.play && gone.mid, JSON.stringify(gone));
  }
  if (viewport.name === 'upright') {
    // Pressing Play mid-bow ends the curtain call at once and the song starts from block 1.
    await bandSong(page, { cols: { bloop: [0], boom: [0], spark: [0] }, length: 1, tempo: 170 });
    Object.assign(id, await ids(page));
    await resetLogs(page);
    await page.evaluate(() => window.__monster.studio.play());
    await waitFinale(page);
    await waitSince(page, 900);
    await page.locator('.t-play').click();
    await page.waitForTimeout(120);
    const running = await page.evaluate(() => document.getAnimations().filter((x) => x.id.startsWith('curtain-') && x.playState !== 'finished').length);
    const d = await page.evaluate(() => window.__monster.studio.debug());
    check('Play mid-bow: the curtain call stops at once and the song starts from block 1', running === 0 && (await page.locator('.curtain, .finale').count()) === 0 && d.playing && d.beat < 1, `${running} curtain animations, beat ${d.beat.toFixed(2)}`);
    await page.evaluate(() => window.__monster.studio.stop());
    // Leaving Blocks right after the song ends: no bows, no claps, nothing left over.
    await resetLogs(page);
    await page.evaluate(() => window.__monster.studio.play());
    await waitFinale(page);
    await page.evaluate(() => window.__monster.actions.setScreen('lab'));
    await page.waitForTimeout(3500);
    const left = await page.evaluate(() => ({ crowd: window.__trig.filter((x) => x.ch === 'crowd').length, curtain: !!document.querySelector('.curtain, .finale-clap, .curtain-again') }));
    check('leaving Blocks as the song ends: no applause, nothing left on screen', left.crowd === 0 && !left.curtain, JSON.stringify(left));
  }
  await ctx.close();
}

// ── 4. A demo ends the same way; an empty song has no finale ───────────────
{
  const { ctx, page } = await open();
  await page.evaluate(async () => {
    const M = window.__monster;
    await M.actions.openDemo('demo-disco-jellyfish');
    const p = M.getState().project;
    // Only the demo's last block, so the test is short (the copy stays untouched: no edit is committed).
    const n = p.arrangement.length;
    const rows = Object.fromEntries(Object.entries(p.arrangement.rows).map(([k, v]) => [k, v.slice(n - 1, n)]));
    M.setState({ project: { ...p, tempo: 170, arrangement: { ...p.arrangement, length: 1, rows } } });
  });
  await page.waitForTimeout(300);
  await resetLogs(page);
  await page.evaluate(() => window.__monster.studio.play());
  check('a demo ends with a finale too', await waitFinale(page));
  await waitSince(page, 900);
  check('…with the star rain (it celebrates the music) and the band hopping', (await page.locator('.finale .confetti').count()) > 0 && (await anims(page)).some((x) => x.id === 'curtain-hop'));
  await waitSince(page, 3300);
  check('…the clapping hands and the “again” sparkle, and no words', (await page.locator('.curtain-again').count()) === 1 && (await visibleText(page)) === '');
  await shot(page, 'curtain-4-demo');

  // An empty song: Play stays stopped, no finale, no applause.
  await page.evaluate(async () => {
    const M = window.__monster;
    M.studio.stop();
    await M.actions.newSong('blank');
    M.actions.setScreen('blocks');
  });
  await page.waitForTimeout(400);
  await resetLogs(page);
  await page.locator('.t-play').click();
  await page.waitForTimeout(3000);
  const empty = await page.evaluate(() => ({ finale: window.__finale.length, crowd: window.__trig.filter((x) => x.ch === 'crowd').length, shown: !!document.querySelector('.finale, .curtain') }));
  check('an empty song still has no finale (no bow, no claps, no “again”)', empty.finale === 0 && empty.crowd === 0 && !empty.shown, JSON.stringify(empty));
  await ctx.close();
}

// ── 5. Reduced motion ──────────────────────────────────────────────────────
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await bandSong(page, { cols: { bloop: [0], boom: [0], grumble: [0], spark: [0] }, length: 1, tempo: 170 });
  await resetLogs(page);
  await page.evaluate(() => window.__monster.studio.play());
  await waitFinale(page);
  await waitSince(page, 2100);
  const a = (await anims(page)).filter((x) => x.id.startsWith('curtain'));
  const moving = a.filter((x) => x.props.some((p) => ['transform', 'translate', 'scale', 'rotate'].includes(p)));
  const glows = a.filter((x) => x.id === 'curtain-glow');
  check('reduced motion: soft glows for every performer (twice: in turn, then together), no hops or bows', moving.length === 0 && glows.length === 8, `${glows.length} glows, ${moving.map((x) => x.id).join(' ')}`);
  check('reduced motion: no star rain, and the hands only fade in', (await page.locator('.finale .confetti').count()) === 0 && (await page.evaluate(() => getComputedStyle(document.querySelector('.finale-clap')).animationName)) === 'curtain-fade');
  await waitSince(page, 3300);
  check('reduced motion: “again” is there, still', (await page.locator('.curtain-again').count()) === 1 && (await page.evaluate(() => getComputedStyle(document.querySelector('.curtain-spark')).animationName)) === 'none');
  await shot(page, 'curtain-5-reduced');
  await ctx.close();
}

// ── 6. Smooth on a slow tablet: the band song in Blocks under a 4× slower CPU ─
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.touchscreen.tap(422, 195);
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const M = window.__monster;
    await M.actions.newSong('band');
    M.actions.setScreen('blocks');
  });
  await page.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(page);
  const measure = async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => window.__monster.studio.play());
    const perf = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          const t0 = last;
          const step = (now) => {
            times.push(now - last);
            last = now;
            if (now - t0 < 4000) requestAnimationFrame(step);
            else {
              times.sort((a, b) => a - b);
              resolve({ frames: times.length, p95: times[Math.floor(times.length * 0.95)] });
            }
          };
          requestAnimationFrame(step);
        }),
    );
    const d = await page.evaluate(() => window.__monster.studio.debug());
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate(() => window.__monster.studio.stop());
    return { ...perf, beat: d.beat };
  };
  let perf = await measure();
  let ok = perf.p95 < 40 && perf.beat > 5;
  if (!ok) {
    console.log(`(smoothness run 1: p95 ${perf.p95.toFixed(1)} ms, beat ${perf.beat.toFixed(2)}; measuring once more)`);
    await page.waitForTimeout(800);
    perf = await measure();
    ok = perf.p95 < 40 && perf.beat > 5;
  }
  check('the band song in Blocks stays smooth on a 4× slower CPU, and keeps time', ok, `${perf.frames} frames in 4 s, p95 ${perf.p95.toFixed(1)} ms, beat ${perf.beat.toFixed(2)}`);
  await page.waitForTimeout(1500);
  const voices = await page.evaluate(() => window.__monster.studio.debug());
  check('…and no voice is left sounding after Stop', voices.voices === 0 && voices.held === 0, `${voices.voices} voices`);
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
