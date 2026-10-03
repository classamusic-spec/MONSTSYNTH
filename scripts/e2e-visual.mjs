// Visual layout and motion checks at phone (844×390), tablet (1024×768) and
// portrait (820×1180) sizes, in Monster Maker mode with the band song:
//   Lab stage   — loop badges in a row under the monsters (never over a face, still
//                 tappable: tap = sleep, hold = clear; finger-sized on phones), the add
//                 seat above the hills, the moon clear of it, the toys toolbar, one name
//                 tag, notes rising (bright, clear of the head, in the key's colour), the
//                 band bobbing on the beat (not the sleeping or soloed-out monsters)
//   Blocks      — round dots, beat lines, filling a block is heard, the playing block
//                 filling up, the playhead star
//   Song covers — a picture per song (copies keep it) that stays inside its card and
//                 off the monsters, with 1 to 6 monsters
//   Panels      — mood grid 3×2, tray rows of 6 (landscape) or 3 (portrait), opaque
//                 Parent Space with switches, transport labels on one baseline
// Then: small phones (667×375, 568×320) for the tray, moon and notes; an iPad mini
// (1133×744) for covers; reduced motion from the system; and the Coach's "try
// Record" hand, which must never point at the Blocks magic wand.
// Usage: node scripts/e2e-visual.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const VIEWS = [
  { name: 'phone', width: 844, height: 390 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'portrait', width: 820, height: 1180 },
];

const overlap = (a, b, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
/** The top 70% of a monster's drawing: eyes, mouth, antennae. */
const face = (art) => ({ x: art.x, y: art.y, w: art.w, h: art.h * 0.7 });
const r1 = (n) => Math.round(n);
const uniq = (list) => new Set(list).size;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

/** A fresh app (own storage), awake, in Monster Maker with the band song on the Lab. */
async function openApp(v, { ctxOpts = {}, settings = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, ...ctxOpts });
  // Count the imperative beat animations by id (finished ones leave getAnimations()).
  await ctx.addInitScript(() => {
    const animate = Element.prototype.animate;
    window.__anims = [];
    Element.prototype.animate = function (frames, opts) {
      if (opts && typeof opts === 'object' && opts.id) window.__anims.push({ id: opts.id, monster: this.closest?.('.pod')?.dataset.monster ?? null });
      return animate.call(this, frames, opts);
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${v.name}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${v.name}: ${m.text()}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(v.width / 2, v.height / 2);
  await page.waitForTimeout(300);
  await page.evaluate(async (settings) => {
    const m = window.__monster;
    m.actions.updateSettings({ ageMode: 'maker', hints: false, motion: 'full', ...settings });
    await m.actions.newSong('band');
    m.actions.setScreen('lab');
  }, settings);
  await page.waitForTimeout(600);
  return { ctx, page };
}

/** The Add Monster tray: rows of `perRow`, and every card fully on screen (no scrolling to find a monster). */
async function trayCheck(page, label, perRow) {
  await page.evaluate(() => window.__monster.actions.setOverlay('tray'));
  await page.waitForTimeout(450);
  const cards = await page.$$eval('.tray-card', (els) => {
    const sheet = els[0].closest('.sheet').getBoundingClientRect();
    return els.map((e) => {
      const b = e.getBoundingClientRect();
      const shown = Math.max(0, Math.min(b.bottom, sheet.bottom, innerHeight) - Math.max(b.top, sheet.top, 0)) * Math.max(0, Math.min(b.right, sheet.right, innerWidth) - Math.max(b.left, sheet.left, 0));
      return { top: Math.round(b.top), seen: shown / (b.width * b.height) };
    });
  });
  const rows = [...cards.reduce((m, c) => m.set(c.top, (m.get(c.top) ?? 0) + 1), new Map()).values()];
  const want = Array.from({ length: Math.ceil(cards.length / perRow) }, () => perRow);
  check(`${label}: the tray shows ${want.join('+')} monsters per row`, rows.join('+') === want.join('+'), rows.join('+'));
  const hidden = cards.filter((c) => c.seen < 0.95);
  check(`${label}: every monster in the tray is fully on screen`, hidden.length === 0, cards.map((c) => c.seen.toFixed(2)).join(' '));
  await page.evaluate(() => window.__monster.actions.setOverlay(null));
  await page.waitForTimeout(150);
}

/** The moon (and its glow) keeps to the open sky: never behind the add seat. */
async function moonCheck(page, label) {
  const m = await page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    return { moon: box(document.querySelector('.stage-moon')), seat: box(document.querySelector('.add-seat')), stage: box(document.querySelector('.stage')) };
  });
  check(`${label}: the moon is in the open sky, clear of the add seat`, !overlap(m.moon, m.seat) && inside(m.moon, m.stage), `moon ${r1(m.moon.x)}–${r1(m.moon.x + m.moon.w)}, seat ${r1(m.seat.x)}`);
}

/**
 * A note sprite's flight, paused at moments along the way: it must be clearly
 * visible for most of it, and (on tall stages) rise clear of the singer's head,
 * or (on short ones) stay on the stage.
 */
async function spriteCheck(page, label, tall) {
  const f = await page.evaluate(async () => {
    const m = window.__monster;
    m.studio.hit(m.getState().selectedTrackId, 4, {}, { record: false });
    await new Promise((r) => setTimeout(r, 40));
    const pod = document.querySelector('.pod[data-selected="true"]');
    const sp = [...pod.querySelectorAll('.note-sprite')].pop();
    const a = sp?.getAnimations()[0];
    if (!a) return null;
    a.pause();
    const dur = a.effect.getComputedTiming().duration;
    // The drawn monster (not its invisible echoes, sparkles or open mouth).
    const shapes = [...pod.querySelectorAll('.squish .monster-svg :is(path, ellipse, circle, rect)')].filter(
      (e) => !e.closest('[class*="m-echo"], .m-sparkles, defs, .m-mouth-open') && e.getBoundingClientRect().height > 0,
    );
    const artTop = Math.min(...shapes.map((e) => e.getBoundingClientRect().top));
    const at = (t) => {
      a.currentTime = t;
      const b = sp.getBoundingClientRect();
      return { op: +getComputedStyle(sp).opacity, top: b.top, bottom: b.bottom };
    };
    const out = { dur, artTop, stageTop: document.querySelector('.stage').getBoundingClientRect().top, t150: at(150), t300: at(300), t70: at(dur * 0.7) };
    a.finish();
    return out;
  });
  if (!f) {
    check(`${label}: a played note sends up a sprite`, false);
    return;
  }
  check(
    `${label}: a note sprite stays bright for most of its flight`,
    f.t150.op >= 0.9 && f.t300.op >= 0.8 && f.t70.op >= 0.8 && f.dur >= 700 && f.dur <= 900,
    `${f.dur}ms, opacity ${f.t150.op.toFixed(2)} / ${f.t300.op.toFixed(2)} / ${f.t70.op.toFixed(2)}`,
  );
  if (tall) check(`${label}: …and rises clear of the singer's head`, f.t70.bottom <= f.artTop + 2, `bottom ${r1(f.t70.bottom)}, head ${r1(f.artTop)}`);
  else check(`${label}: …and stays on the stage`, f.t70.top >= f.stageTop - 1, `top ${r1(f.t70.top)}, stage ${r1(f.stageTop)}`);
}

/** Saved songs with 1, 2, 5 and 6 monsters (and a second, differently coloured Hot Cross Buns). */
async function addFakeSongs(page) {
  await page.evaluate(() => {
    const m = window.__monster;
    const s = m.getState();
    const all = ['bloop', 'boom', 'grumble', 'spark', 'puff', 'mimic'];
    const fake = [
      ['Rocket Party', 1],
      ['Long Wobbly Rocket', 2],
      ['Big Choir', 5],
      ['Six Banana', 6],
      ['Hot Cross Buns', 4],
    ].map(([name, n], i) => ({ ...s.songs[0], id: `fake-${i}`, name, hue: 20 + i * 67, seed: i, monsters: all.slice(0, n), filled: all.slice(0, Math.max(1, n - 1)) }));
    m.setState({ songs: [...fake, ...s.songs] });
  });
}

/** Every cover: picture and monsters inside the card, and nothing sitting on a monster. */
async function coverCheck(page, label) {
  const covers = await page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    return [...document.querySelectorAll('.song-card .portrait')].map((p) => {
      const backdrop = p.querySelector('.cover-sticker .cover-art > rect');
      const id = backdrop?.getAttribute('fill')?.match(/url\(#(.+)\)/)?.[1] ?? null;
      return {
        name: p.closest('.song-card').querySelector('.song-name')?.textContent ?? '',
        portrait: box(p),
        picture: p.querySelector('.cover-sticker')?.dataset.picture ?? null,
        sticker: p.querySelector('.cover-sticker') ? box(p.querySelector('.cover-sticker')) : null,
        monsters: [...p.querySelectorAll('.portrait-monster')].map(box),
        ribbon: p.querySelector('.starter-ribbon') ? box(p.querySelector('.starter-ribbon')) : null,
        // The backdrop gradient this cover really shows (ids must be unique to show the song's own colour).
        bg: id ? { unique: document.querySelectorAll(`[id="${id}"]`).length === 1, stop: getComputedStyle(document.getElementById(id).querySelector('stop')).stopColor } : null,
        learnBgHidden: [...p.querySelectorAll('.cover-sticker > .song-art > rect')].every((r) => getComputedStyle(r).display === 'none'),
      };
    });
  });
  const spill = covers.flatMap((c) => [c.sticker, ...c.monsters].filter(Boolean).filter((b) => !inside(b, c.portrait)).map(() => c.name || 'starter'));
  check(`${label}: every cover picture stays inside its card`, covers.length >= 8 && spill.length === 0, [...new Set(spill)].join(', '));
  const crowded = covers.filter((c) => c.monsters.some((m) => (c.ribbon && overlap(c.ribbon, m)) || (c.sticker && overlap(c.sticker, m, 2))));
  check(`${label}: ribbons and stickers never sit on a monster (1 to 6 monsters)`, crowded.length === 0, crowded.map((c) => `${c.name} (${c.monsters.length})`).join(', '));
  return covers;
}

for (const v of VIEWS) {
  const tall = v.height >= 560;
  const landscape = v.width > v.height;
  const { ctx, page } = await openApp(v);
  const S = () => page.evaluate(() => window.__monster.getState());
  const anims = (id) => page.evaluate((id) => window.__anims.filter((a) => a.id === id), id);
  const resetAnims = () => page.evaluate(() => (window.__anims.length = 0));
  /** Counts the beats the band actually played (as the screen sees them) from now on. */
  const countBeats = () =>
    page.evaluate(() => {
      window.__beats = new Set();
      window.__monster.bus.onFrame((p) => p.playing && p.beat >= 0 && window.__beats.add(Math.floor(p.beat)));
    });
  const beatsSeen = () => page.evaluate(() => window.__beats.size);

  // A few saved songs with picture nouns (and one kept from Learn, one a grown-up
  // named, and grown-up copies of two of them).
  await page.evaluate(async () => {
    const m = window.__monster;
    for (const name of ['The Zippy Banana', 'Cosmic Spaceship', "Boom's Sleepy Lullaby", 'Hot Cross Buns', 'Grandma and me']) {
      await m.actions.newSong('blank');
      await m.actions.renameSong(m.getState().project.id, name);
    }
    for (const name of ['The Zippy Banana', 'Hot Cross Buns']) await m.actions.duplicateSong(m.getState().songs.find((x) => x.name === name).id);
    await m.actions.newSong('band');
    const s = m.getState();
    m.setState({ project: { ...s.project, tempo: 100 } });
    m.actions.setScreen('lab');
  });
  await page.waitForTimeout(700);

  // ── Lab stage layout ─────────────────────────────────────────────────────
  const geo = await page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const hits = (el) => {
      const b = el.getBoundingClientRect();
      const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!at && el.contains(at);
    };
    const stage = document.querySelector('.stage');
    const pods = [...stage.querySelectorAll('.pod')].map((pod) => {
      const svg = pod.querySelector('.monster-svg').getBoundingClientRect();
      const s = Math.min(svg.width, svg.height); // xMidYMax meet: the drawing is the bottom square
      const badge = pod.querySelector('.loop-badge');
      const name = pod.querySelector('.pod-name');
      return {
        monster: pod.dataset.monster,
        selected: pod.dataset.selected === 'true',
        art: { x: svg.left + (svg.width - s) / 2, y: svg.bottom - s, w: s, h: s },
        badge: badge ? box(badge) : null,
        badgeHit: badge ? hits(badge) : false,
        name: shown(name) ? box(name) : null,
      };
    });
    const seat = document.querySelector('.add-seat');
    const tools = document.querySelector('.stage-tools');
    // A badge's reach: a near miss beside it still lands on it; just above it is the monster.
    const first = stage.querySelector('.pod');
    const badge = first.querySelector('.loop-badge').getBoundingClientRect();
    const reach = {
      side: document.elementFromPoint(badge.left - 8, badge.top + badge.height / 2)?.closest('.loop-badge') === first.querySelector('.loop-badge'),
      below: document.elementFromPoint(badge.left + badge.width / 2, badge.bottom + 3)?.closest('.loop-badge') === first.querySelector('.loop-badge'),
      above: document.elementFromPoint(badge.left + badge.width / 2, badge.top - 9)?.closest('.pod-hit') === first.querySelector('.pod-hit'),
    };
    return {
      reach,
      stage: box(stage),
      pods,
      seat: { box: box(seat), position: getComputedStyle(seat).position, hit: hits(seat) },
      tools: shown(tools) ? { box: box(tools), scrollW: tools.scrollWidth, clientW: tools.clientWidth, buttons: [...tools.querySelectorAll('.tool-btn')].map(box) } : null,
      surfaceTools: shown(document.querySelector('.surface-tools')),
    };
  });
  const withBadge = geo.pods.filter((p) => p.badge);
  check(`${v.name}: every band monster has a loop badge`, withBadge.length === 4, `${withBadge.length}`);
  const onFace = withBadge.flatMap((p) => geo.pods.filter((q) => overlap(p.badge, face(q.art))).map((q) => `${p.monster} badge on ${q.monster}`));
  check(`${v.name}: loop badges never cover a monster's face`, onFace.length === 0, onFace.join(', '));
  const offCentre = withBadge.filter((p) => Math.abs(p.badge.x + p.badge.w / 2 - (p.art.x + p.art.w / 2)) > p.art.w * 0.2);
  check(`${v.name}: each badge is centred under its own monster`, offCentre.length === 0, offCentre.map((p) => p.monster).join(', '));
  const ys = withBadge.map((p) => p.badge.y);
  check(`${v.name}: badges make one row along the ground`, Math.max(...ys) - Math.min(...ys) <= 2, ys.map(r1).join(','));
  check(`${v.name}: every badge is the touch target at its centre`, withBadge.every((p) => p.badgeHit));
  if (!tall) check(`${v.name}: small badges are finger-sized targets (the monster still plays just above)`, geo.reach.side && geo.reach.below && geo.reach.above, JSON.stringify(geo.reach));
  check(`${v.name}: the add seat stands in front of the hills`, geo.seat.position === 'relative' && geo.seat.hit && inside(geo.seat.box, geo.stage), geo.seat.position);
  await moonCheck(page, v.name);
  if (tall) {
    const t = geo.tools;
    check(`${v.name}: the toys toolbar sits on the stage without overflowing`, !!t && t.scrollW <= t.clientW && t.buttons.every((b) => inside(b, geo.stage)), t ? `${t.scrollW}/${t.clientW}` : 'hidden');
    const covered = t ? geo.pods.filter((p) => t.buttons.some((b) => overlap(b, face(p.art)))).map((p) => p.monster) : [];
    check(`${v.name}: the toys never cover a monster's face`, covered.length === 0, covered.join(', '));
  } else {
    check(`${v.name}: phones keep the toys beside the keys`, !geo.tools && geo.surfaceTools);
  }
  const named = geo.pods.filter((p) => p.name);
  check(`${v.name}: only the spotlight monster wears a name tag`, named.length === 1 && named[0].selected, named.map((p) => p.monster).join(','));
  if (named[0]) {
    check(`${v.name}: the name tag is on the stage`, inside(named[0].name, geo.stage));
    if (tall) {
      const hidden = geo.pods.filter((p) => overlap(named[0].name, face(p.art), 2)).map((p) => p.monster);
      check(`${v.name}: the name tag floats clear of every face`, hidden.length === 0, hidden.join(', '));
      check(`${v.name}: the name tag clears the toys`, !geo.tools || geo.tools.buttons.every((b) => !overlap(b, named[0].name)));
    }
  }

  // The seat opens the tray when touched.
  const seatC = [geo.seat.box.x + geo.seat.box.w / 2, geo.seat.box.y + geo.seat.box.h / 2];
  await page.mouse.click(seatC[0], seatC[1]);
  await page.waitForTimeout(200);
  check(`${v.name}: tapping the add seat opens the tray`, (await S()).overlay === 'tray');

  // ── Tray rows ────────────────────────────────────────────────────────────
  await page.evaluate(() => window.__monster.actions.setOverlay(null));
  await page.waitForTimeout(150);
  await trayCheck(page, v.name, landscape ? 6 : 3);

  // ── Loop badges still work where they now stand ──────────────────────────
  const badgeAt = () =>
    page.evaluate(() => {
      const b = document.querySelector('.pod[data-monster="spark"] .loop-badge')?.getBoundingClientRect();
      return b ? [b.left + b.width / 2, b.top + b.height / 2] : null;
    });
  const sparkTrack = async () => (await S()).project.tracks.find((t) => t.monster === 'spark');
  const press = async (xy, ms) => {
    await page.mouse.move(xy[0], xy[1]);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  let at = await badgeAt();
  await press(at, 80);
  const slept = (await sparkTrack()).sleeping;
  at = await badgeAt();
  await press(at, 80);
  check(`${v.name}: tap a badge → its loop sleeps, tap again → it wakes`, slept === true && (await sparkTrack()).sleeping === false);
  await press(at, 1250);
  const gone = (await badgeAt()) === null;
  await page.evaluate(() => window.__monster.studio.undo());
  await page.waitForTimeout(200);
  check(`${v.name}: hold a badge → the loop is cleared, undo brings it back`, gone && (await badgeAt()) !== null);

  // ── Transport labels share a baseline ────────────────────────────────────
  const labels = await page.$$eval('.transport .t-label', (els) =>
    els.filter((e) => e.getClientRects().length).map((e) => ({ bottom: e.getBoundingClientRect().bottom, row: !!e.closest('.transport-row') })),
  );
  const spread = (list) => (list.length ? Math.max(...list) - Math.min(...list) : 0);
  const rowLabels = labels.filter((l) => l.row).map((l) => l.bottom);
  check(`${v.name}: Undo and Redo labels line up`, spread(rowLabels) <= 1, rowLabels.map(r1).join(','));
  if (!landscape) {
    const all = labels.map((l) => l.bottom);
    check(`${v.name}: every transport label sits on one baseline`, all.length >= 4 && spread(all) <= 1, all.map(r1).join(','));
  }

  // ── Monster Magic moods: two rows of three, each with its colour ─────────
  await page.evaluate(() => window.__monster.actions.setOverlay('magic'));
  await page.waitForTimeout(400);
  const moods = await page.$$eval('.mood', (els) =>
    els.map((e) => ({ top: Math.round(e.getBoundingClientRect().top), left: Math.round(e.getBoundingClientRect().left), stripe: getComputedStyle(e).borderLeftColor, w: getComputedStyle(e).borderLeftWidth })),
  );
  check(
    `${v.name}: the moods form a 3×2 grid`,
    moods.length === 6 && uniq(moods.map((m) => m.top)) === 2 && uniq(moods.map((m) => m.left)) === 3,
    `${uniq(moods.map((m) => m.top))} rows × ${uniq(moods.map((m) => m.left))} columns`,
  );
  check(`${v.name}: every mood has its own colour stripe`, uniq(moods.map((m) => m.stripe)) === 6 && moods.every((m) => m.w === '6px'), moods.map((m) => m.stripe).join(' '));
  await page.evaluate(() => window.__monster.actions.setOverlay(null));

  // ── Parent Space: opaque, with switches ──────────────────────────────────
  await page.evaluate(() => window.__monster.actions.setOverlay('parent'));
  await page.waitForTimeout(400);
  const ps = await page.evaluate(() => {
    const scrim = document.querySelector('.ps-scrim');
    const cs = getComputedStyle(scrim);
    const [a, b] = [...document.querySelectorAll('.ps-section')].map((e) => e.getBoundingClientRect());
    const gap = document.elementFromPoint(a.left + a.width / 2, (a.bottom + b.top) / 2);
    const toggle = getComputedStyle(document.querySelector('.ps-toggle input'));
    const radio = getComputedStyle(document.querySelector('.ps-choice input'));
    return {
      image: cs.backgroundImage,
      color: cs.backgroundColor,
      gapIsParent: !!gap?.closest('.ps-scrim'),
      toggle: `${toggle.appearance} ${toggle.width}`,
      radio: `${radio.appearance} ${radio.borderRadius}`,
    };
  });
  const translucent = /rgba\([^)]*,\s*0?\.\d+\)|transparent/.test(ps.image) || (!ps.image.includes('gradient') && !/rgb\(/.test(ps.color));
  check(`${v.name}: Parent Space is opaque (the Lab never shows through)`, ps.image.includes('linear-gradient') && !translucent && ps.gapIsParent, ps.image);
  check(`${v.name}: Parent Space uses switches and round radios`, ps.toggle === 'none 52px' && ps.radio === 'none 50%', `${ps.toggle} / ${ps.radio}`);
  await page.evaluate(() => window.__monster.actions.setOverlay(null));
  await page.waitForTimeout(200);

  // ── Notes rise from the singer, bright and clear of its head ─────────────
  await spriteCheck(page, v.name, tall);
  await page.waitForTimeout(100);

  // ── Delight on the stage (once, on the tablet) ───────────────────────────
  if (v.name === 'tablet') {
    const sel = '.pod[data-selected="true"] .note-sprite';
    const key = await page.locator('.keys .key').nth(3).boundingBox();
    await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
    await page.mouse.down();
    const appeared = await page.waitForFunction((sel) => document.querySelectorAll(sel).length >= 1, sel, { timeout: 400 }).then(() => true, () => false);
    await page.mouse.up();
    check('a played note floats up from the singing monster', appeared);
    await page.waitForTimeout(1000);
    check('…and is gone within a second', (await page.locator(sel).count()) === 0);

    const maxSprites = await page.evaluate(async () => {
      const m = window.__monster;
      const id = m.getState().selectedTrackId;
      let max = 0;
      for (let i = 0; i < 30; i++) {
        m.studio.hit(id, i % 8, {}, { record: false });
        await new Promise((r) => setTimeout(r, 15));
        max = Math.max(max, document.querySelectorAll('.pod[data-selected="true"] .note-sprite').length);
      }
      return max;
    });
    await page.waitForTimeout(1100);
    const left = await page.locator('.note-sprite').count();
    check('a flurry of notes stays light (at most 8 sprites per monster)', maxSprites >= 4 && maxSprites <= 8 && left === 0, `max ${maxSprites}, ${left} left after`);

    // A note wears the colour of the key that played it; a drum, the colour of its pad.
    const colours = await page.evaluate(async () => {
      const m = window.__monster;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const norm = (c) => {
        const e = document.createElement('i');
        e.style.color = c;
        document.body.append(e);
        const out = getComputedStyle(e).color;
        e.remove();
        return out;
      };
      const track = (monster) => m.getState().project.tracks.find((t) => t.monster === monster);
      const sprite = async (monster, step) => {
        m.studio.hit(track(monster).id, step, {}, { record: false });
        await wait(40);
        const all = document.querySelectorAll(`.pod[data-monster="${monster}"] .note-sprite`);
        return all.length ? getComputedStyle(all[all.length - 1]).color : null;
      };
      const bloop = await sprite('bloop', 4);
      m.actions.selectTrack(track('boom').id);
      await wait(150);
      const boom = await sprite('boom', 3);
      const pad = norm(getComputedStyle(document.querySelectorAll('.keys .key')[3]).getPropertyValue('--k').trim());
      m.actions.selectTrack(track('bloop').id);
      await wait(150);
      return { bloop, bloopKey: norm('var(--key-4)'), boom, pad, key3: norm('var(--key-3)') };
    });
    check('a note sprite is the colour of its key', !!colours.bloop && colours.bloop === colours.bloopKey, `${colours.bloop} vs ${colours.bloopKey}`);
    check("a drum's sprite is the colour of its pad", !!colours.boom && colours.boom === colours.pad && colours.pad !== colours.key3, `${colours.boom} vs pad ${colours.pad}`);
    await page.waitForTimeout(900);

    // The band bobs on the beat; a sleeping monster and the spotlight one do not.
    await page.evaluate(() => {
      const m = window.__monster;
      const s = m.getState();
      m.setState({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.monster === 'grumble' ? { ...t, sleeping: true } : t)) } });
    });
    await page.waitForTimeout(100);
    await resetAnims();
    await countBeats();
    await page.evaluate(() => window.__monster.studio.play());
    await page.waitForTimeout(2400);
    await page.evaluate(() => window.__monster.studio.stop());
    const bobs = await anims('beat-bob');
    const beats = await beatsSeen();
    const count = (m) => bobs.filter((b) => b.monster === m).length;
    check(
      'looping monsters bob once on every beat',
      beats >= 3 && count('boom') === beats && count('spark') === beats,
      `${beats} beats: boom ${count('boom')}, spark ${count('spark')}`,
    );
    check('sleeping and spotlight monsters do not bob', count('grumble') === 0 && count('bloop') === 0, `grumble ${count('grumble')}, bloop ${count('bloop')}`);

    // A solo leaves the others silent: they stand still too.
    const setSolo = (on) =>
      page.evaluate((on) => {
        const m = window.__monster;
        const s = m.getState();
        m.setState({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.monster === 'boom' ? { ...t, solo: on } : t)) } });
      }, on);
    await setSolo(true);
    await page.waitForTimeout(100);
    await resetAnims();
    await countBeats();
    await page.evaluate(() => window.__monster.studio.play());
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.__monster.studio.stop());
    const soloBobs = await anims('beat-bob');
    const soloBeats = await beatsSeen();
    const soloCount = (m) => soloBobs.filter((b) => b.monster === m).length;
    check('a monster left out by a solo does not bob', soloBeats >= 2 && soloCount('boom') === soloBeats && soloCount('spark') === 0, `${soloBeats} beats: boom ${soloCount('boom')}, spark ${soloCount('spark')}`);
    await setSolo(false);

    // Reduced motion: no sprites, no bobbing.
    await page.waitForFunction(() => !document.querySelector('.note-sprite'), null, { timeout: 2000 }).catch(() => null);
    await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'reduce' }));
    await page.waitForTimeout(100);
    await resetAnims();
    await page.evaluate(async () => {
      const m = window.__monster;
      for (let i = 0; i < 5; i++) {
        m.studio.hit(m.getState().selectedTrackId, i, {}, { record: false });
        await new Promise((r) => setTimeout(r, 40));
      }
      m.studio.play();
    });
    await page.waitForTimeout(80);
    const reducedSprites = await page.locator('.note-sprite').count();
    await page.waitForTimeout(1400);
    await page.evaluate(() => window.__monster.studio.stop());
    check('reduced motion: no note sprites and no bobbing', reducedSprites === 0 && (await anims('beat-bob')).length === 0, `${reducedSprites} sprites`);
    await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'full' }));
    await page.waitForTimeout(400);
  }

  // ── Monster Blocks ───────────────────────────────────────────────────────
  {
    await page.locator('.dock-btn[data-screen="blocks"]').click();
    await page.waitForTimeout(300);
    const thumbs = await page.evaluate(() => {
      const drums = [...document.querySelectorAll('.block-row[data-monster="boom"] .thumb-note')];
      const notes = [...document.querySelectorAll('.block-row[data-monster="bloop"] .thumb-note')];
      const px = (el) => parseFloat(getComputedStyle(el).strokeWidth);
      return {
        dots: drums.length > 0 && drums.every((l) => l.getAttribute('x1') === l.getAttribute('x2') && l.getAttribute('stroke-linecap') === 'round'),
        fixed: [...drums, ...notes].every((l) => getComputedStyle(l).vectorEffect === 'non-scaling-stroke'),
        widths: [...drums, ...notes].map(px),
        beatLines: [...document.querySelectorAll('.thumb')].every((t) => t.querySelectorAll('.thumb-beat').length >= 7),
      };
    });
    check(`${v.name}: drum marks are round dots that never stretch`, thumbs.dots && thumbs.fixed);
    check(
      `${v.name}: marks stay a readable size`,
      thumbs.widths.length > 0 && thumbs.widths.every((w) => w >= 3 && w <= 9),
      `${r1(Math.min(...thumbs.widths) * 10) / 10}–${r1(Math.max(...thumbs.widths) * 10) / 10}px`,
    );
    check(`${v.name}: every block shows its beats`, thumbs.beatLines);

    // Filling a block is heard: a swipe across Bloop's empty blocks sings a little scale.
    await page.evaluate(() => {
      window.__heard = [];
      window.__monster.bus.onNote((n) => n.source === 'live' && window.__heard.push({ monster: n.monster, step: n.step }));
    });
    const empties = await page.$$eval('.block-row[data-monster="bloop"] .block[data-on="false"]', (els) =>
      els.slice(0, 3).map((e) => {
        const b = e.getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2, Number(e.dataset.col)];
      }),
    );
    await page.mouse.move(empties[0][0], empties[0][1]);
    await page.mouse.down();
    for (const [x, y] of empties.slice(1)) await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const heard = await page.evaluate(() => window.__heard);
    const filled = await page.$$eval('.block-row[data-monster="bloop"] .block', (els, cols) => cols.every((c) => els[c]?.dataset.on === 'true'), empties.map((e) => e[2]));
    check(
      `${v.name}: filling blocks plays the row's monster (a swipe climbs the scale)`,
      filled && heard.length === empties.length && heard.every((h, i) => h.monster === 'bloop' && h.step === empties[i][2] % 8),
      heard.map((h) => `${h.monster}:${h.step}`).join(' '),
    );
    await page.evaluate(() => window.__monster.studio.undo());
    await page.waitForTimeout(200);
    check(`${v.name}: one undo takes the whole swipe back`, (await page.locator('.block-row[data-monster="bloop"] .block[data-on="true"]').count()) === 5);

    await resetAnims();
    await countBeats();
    await page.locator('.t-play').click();
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(100);
      samples.push(
        await page.evaluate(() => {
          const grid = document.querySelector('.blocks-grid');
          return {
            col: Number(grid.dataset.col),
            inCol: parseFloat(grid.style.getPropertyValue('--in-col')),
            cells: [...new Set([...grid.querySelectorAll('[data-cell][data-now="true"]')].map((e) => e.dataset.col))],
            nums: grid.querySelectorAll('.col-num[data-now="true"]').length,
          };
        }),
      );
    }
    await page.locator('.t-play').click();
    const playing = samples.filter((s) => s.col >= 0);
    const values = playing.map((s) => s.inCol);
    const rising = playing.every((s, i) => i === 0 || s.col !== playing[i - 1].col || s.inCol >= playing[i - 1].inCol);
    check(
      `${v.name}: the playing block fills up as its loop goes by (--in-col)`,
      playing.length >= 15 && values.every((x) => x >= 0 && x <= 1) && uniq(values) >= 8 && rising,
      `${uniq(values)} steps, ${values[0]}→${values[values.length - 1]}`,
    );
    check(`${v.name}: exactly one column is playing`, playing.every((s) => s.nums === 1 && s.cells.length === 1 && Number(s.cells[0]) === s.col));
    const hops = (await anims('bead-hop')).length;
    const beats = await beatsSeen();
    check(`${v.name}: the playhead star hops once on every beat`, beats >= 3 && hops === beats, `${hops} hops, ${beats} beats`);
  }

  // ── Song covers ──────────────────────────────────────────────────────────
  await addFakeSongs(page);
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(400);
  const covers = await coverCheck(page, v.name);
  const pic = (name) => covers.find((c) => c.name === name)?.picture;
  check(
    `${v.name}: songs wear pictures from their names`,
    pic('The Zippy Banana') === 'banana' && pic('Cosmic Spaceship') === 'rocket' && pic("Boom's Sleepy Lullaby") === 'moon' && !!pic('Grandma and me'),
    covers.map((c) => `${c.name}=${c.picture}`).join(', '),
  );
  check(`${v.name}: a song kept from Learn keeps its Learn picture`, pic('Hot Cross Buns') === 'buns');
  check(`${v.name}: a copied song keeps its picture`, pic('The Zippy Banana (copy)') === 'banana' && pic('Hot Cross Buns (copy)') === 'buns', `${pic('The Zippy Banana (copy)')}, ${pic('Hot Cross Buns (copy)')}`);
  const buns = covers.filter((c) => c.name === 'Hot Cross Buns');
  check(
    `${v.name}: every cover shows its own colour (two Hot Cross Buns, two colours)`,
    covers.every((c) => !c.sticker || (c.bg?.unique && c.learnBgHidden)) && buns.length === 2 && buns[0].bg.stop !== buns[1].bg.stop,
    buns.map((c) => c.bg?.stop).join(' / '),
  );

  await ctx.close();
}

// ── Small phones held sideways: the whole tray, the moon, notes on the stage ──
for (const v of [
  { name: 'small phone', width: 667, height: 375 },
  { name: 'tiny phone', width: 568, height: 320 },
]) {
  const { ctx, page } = await openApp(v);
  await trayCheck(page, v.name, 6);
  await moonCheck(page, v.name);
  await spriteCheck(page, v.name, false);
  await ctx.close();
}

// ── iPad mini: songs with one or two monsters stand clear of the sticker ─────
{
  const v = { name: 'iPad mini', width: 1133, height: 744 };
  const { ctx, page } = await openApp(v);
  await addFakeSongs(page);
  await page.evaluate(() => window.__monster.actions.setScreen('songs'));
  await page.waitForTimeout(400);
  await coverCheck(page, v.name);
  await ctx.close();
}

// ── Reduced motion asked for by the system (motion setting left on "system") ─
{
  const v = { name: 'system reduced motion', width: 1024, height: 768 };
  const { ctx, page } = await openApp(v, { ctxOpts: { reducedMotion: 'reduce' }, settings: { motion: 'system' } });
  await page.evaluate(async () => {
    const m = window.__monster;
    for (let i = 0; i < 5; i++) {
      m.studio.hit(m.getState().selectedTrackId, i, {}, { record: false });
      await new Promise((r) => setTimeout(r, 40));
    }
    m.studio.play();
  });
  await page.waitForTimeout(60);
  const sprites = await page.locator('.note-sprite').count();
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__monster.studio.stop());
  const bobs = await page.evaluate(() => window.__anims.filter((a) => a.id === 'beat-bob').length);
  check(`${v.name}: no note sprites and no bobbing`, sprites === 0 && bobs === 0, `${sprites} sprites, ${bobs} bobs`);
  await ctx.close();
}

// ── The Coach's "try Record" hand: on Record in the Lab, never on the wand ──
{
  const v = { name: 'coach', width: 1024, height: 768 };
  const handOnScreen = () =>
    page.evaluate(() => {
      const h = document.querySelector('.coach-hand')?.getBoundingClientRect();
      return !!h && h.right > 0 && h.bottom > 0 && h.left < innerWidth && h.top < innerHeight;
    });
  // Lab: lots of playing and no recording → the hand points at Record (and leaves with the Lab).
  let { ctx, page } = await openApp(v, { settings: { hints: true } });
  const key = await page.locator('.keys .key').nth(2).boundingBox();
  for (let i = 0; i < 16; i++) {
    await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => !!document.querySelector('.coach-hand'), null, { timeout: 1500 }).catch(() => null);
  await page.waitForTimeout(100);
  const aim = await page.evaluate(() => {
    const h = document.querySelector('.coach-hand');
    const r = document.querySelector('.t-rec')?.getBoundingClientRect();
    return h && r ? Math.hypot(parseFloat(h.style.left) - (r.left + r.width / 2), parseFloat(h.style.top) - (r.top + r.height / 2)) : null;
  });
  check(`${v.name}: after lots of playing, the hand points at Record in the Lab`, aim !== null && aim < 2, `${aim === null ? 'no hand' : `${r1(aim)}px off`}`);
  await page.evaluate(() => window.__monster.actions.setScreen('blocks'));
  await page.waitForTimeout(300);
  check(`${v.name}: …and leaves when the Lab does (it never jumps onto the wand)`, !(await handOnScreen()));
  await ctx.close();

  // Blocks: filling blocks plays notes, but must never bring the hand onto the magic wand.
  ({ ctx, page } = await openApp(v, { settings: { hints: true } }));
  await page.evaluate(() => {
    const m = window.__monster;
    const s = m.getState();
    const rows = Object.fromEntries(Object.entries(s.project.arrangement.rows).map(([k, r]) => [k, r.map(() => null)]));
    m.setState({ project: { ...s.project, arrangement: { ...s.project.arrangement, rows } } });
    m.actions.setScreen('blocks');
    window.__handSeen = 0;
    new MutationObserver(() => {
      const h = document.querySelector('.coach-hand')?.getBoundingClientRect();
      if (h && h.right > 0 && h.bottom > 0) window.__handSeen++;
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  await page.waitForTimeout(300);
  const cells = await page.$$eval('.block[data-on="false"]', (els) =>
    els.slice(0, 20).map((e) => {
      const b = e.getBoundingClientRect();
      return [b.left + b.width / 2, b.top + b.height / 2];
    }),
  );
  let seen = 0;
  for (const [x, y] of cells) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(50);
    if (await handOnScreen()) seen++;
  }
  await page.waitForTimeout(300);
  const heard = await page.evaluate(() => window.__monster.getState().project.arrangement.rows);
  const filledCount = Object.values(heard).flat().filter(Boolean).length;
  seen += await page.evaluate(() => window.__handSeen);
  check(`${v.name}: filling ${filledCount} blocks never points the hand at the magic wand`, filledCount >= 17 && seen === 0, `${seen} sightings`);
  await ctx.close();
}

// ── Real fingers on a loop badge (a phone held sideways) ───────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`touch: ${e}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const hold = async ([x, y], ms) => {
    await touch('touchStart', [{ x, y, id: 1 }]);
    await page.waitForTimeout(ms);
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
  };
  await hold([422, 195], 60);
  await page.evaluate(async () => {
    const m = window.__monster;
    m.actions.updateSettings({ hints: false });
    await m.actions.newSong('band');
  });
  await page.waitForTimeout(600);
  const badge = () =>
    page.evaluate(() => {
      const b = document.querySelector('.pod[data-monster="boom"] .loop-badge')?.getBoundingClientRect();
      return b ? [b.left + b.width / 2, b.top + b.height / 2] : null;
    });
  const boom = () => page.evaluate(() => window.__monster.getState().project.tracks.find((t) => t.monster === 'boom'));
  const at = await badge();
  await hold(at, 80);
  const slept = (await boom()).sleeping;
  await hold(at, 80);
  check('touch: a finger tap on a badge puts the loop to sleep and wakes it', slept === true && (await boom()).sleeping === false);
  await hold(at, 1250);
  const cleared = (await badge()) === null;
  await page.evaluate(() => window.__monster.studio.undo());
  await page.waitForTimeout(200);
  check('touch: holding a badge clears the loop (undo restores it)', cleared && (await badge()) !== null);
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
