// Everyone can join, fair Learn stars, and a Learn screen that answers every touch.
//   · Little Monsters can invite Puff and Mimic: six on stage, every invite heard
//   · six monsters fit the stage on iPad, a phone and an upright tablet (no
//     clipping, no overlap, finger-sized pods and keys)
//   · sending a monster home says bye-bye (sound + motion) and one Undo brings
//     it back with its loop, also in the middle of a take; the last one stays
//   · Mimic's sleeping ears are a picture (and so is its bubble)
//   · a perfect lesson with Magic help on earns three stars; wrong keys that
//     help fixed lower the stars, never below one
//   · tapping the teacher sings the next note you need (never a try) with
//     happy ^ ^ eyes, tapping a word sings its note in its own colour, and
//     neither talks over (or stutters) the teacher's own phrase
//   · with all six on stage the + seat shows the friends; the first-beat
//     guide's Boom stays while it teaches
//   · axe on the tray and a lesson, and no console errors
// Usage: node scripts/e2e-join.mjs [url] [screenshot-dir]
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
const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url);

async function open(viewport = { width: 1024, height: 768 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForTimeout(450);
  // A Little Monster with the Monster Band song (four monsters, each with a loop).
  await page.evaluate(async () => {
    const m = window.__monster;
    m.actions.updateSettings({ ageMode: 'little', hints: false, micAllowed: false, motion: 'full' });
    await m.actions.newSong('band');
    m.actions.setScreen('lab');
  });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const S = (page) => page.evaluate(() => window.__monster.getState());
const shot = async (page, name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));
/** The loudest the output gets over the next `ms` (starts at once). */
const peak = (page, ms = 1200) =>
  page.evaluate(async (ms) => {
    let p = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      p = Math.max(p, window.__monster.studio.debug().level ?? 0);
      await new Promise((r) => setTimeout(r, 25));
    }
    return p;
  }, ms);
/** Remember every sound the engine plays from now on (channel, first pitch or drum pad). */
const spy = (page) =>
  page.evaluate(() => {
    window.__trig = [];
    const eng = window.__monster.studio.engine;
    if (eng.__joinSpy) return;
    eng.__joinSpy = true;
    const trigger = eng.trigger.bind(eng);
    eng.trigger = (req, when, dur) => {
      window.__trig.push({ ch: req.channelId, midi: req.midi?.[0] ?? null, pad: req.pad, when });
      return trigger(req, when, dur);
    };
  });
const trig = (page) => page.evaluate(() => window.__trig);
/** Remember every note the monsters show from now on (the visual bus). */
const listen = (page) =>
  page.evaluate(() => {
    window.__notes = [];
    if (window.__joinNotes) return;
    window.__joinNotes = true;
    window.__monster.bus.onNote((v) => window.__notes.push({ m: v.monster, step: v.step, src: v.source, track: v.trackId, id: v.noteId ?? null }));
  });
const heard = (page) => page.evaluate(() => window.__notes);
const animIds = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? [el, ...el.querySelectorAll('*')].flatMap((e) => e.getAnimations().map((a) => a.id)).filter(Boolean) : [];
  }, selector);
const trackOf = (page, monster) =>
  page.evaluate((m) => {
    const p = window.__monster.getState().project;
    const i = p.tracks.findIndex((t) => t.monster === m);
    const t = p.tracks[i];
    return t ? { id: t.id, index: i, notes: JSON.stringify(t.clips.find((c) => c.id === t.activeClipId)?.notes ?? []) } : null;
  }, monster);
const spotlight = (page, monster) =>
  page.evaluate((m) => {
    const s = window.__monster.getState();
    window.__monster.actions.selectTrack(s.project.tracks.find((t) => t.monster === m).id);
  }, monster);
const axe = async (page, label) => {
  if (!existsSync(axePath)) {
    check('axe-core is installed for the accessibility gate (npm i -D axe-core)', false);
    return;
  }
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: readFileSync(axePath, 'utf8') });
  await page.waitForTimeout(400);
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(', ')}`);
  });
  check(`axe: no violations on ${label}`, found.length === 0, found.join(' | '));
};

// ── 1. Little Monsters: Puff and Mimic join a stage of four ─────────────────
{
  const { ctx, page } = await open();
  let s = await S(page);
  check('a new Little song starts with four monsters', s.settings.ageMode === 'little' && s.project.tracks.length === 4);
  await page.locator('.add-seat').click();
  await page.waitForTimeout(450);
  const seats = await page.$$eval('.tray .seats span', (els) => els.map((e) => e.dataset.on));
  check('the tray shows six seats, four taken', seats.length === 6 && seats.filter((x) => x === 'true').length === 4, seats.join(','));
  const words = await page.$$eval('.tray-card', (els) => els.map((e) => e.getAttribute('aria-label')).join(' | '));
  check('no card says the stage is full', !/full/i.test(words), words);
  for (const m of ['puff', 'mimic']) {
    const before = (await S(page)).past.length;
    await page.locator(`.tray-card[data-monster="${m}"]`).click();
    const anims = await animIds(page, `.tray-card[data-monster="${m}"]`);
    const level = await peak(page);
    s = await S(page);
    const t = s.project.tracks.find((x) => x.monster === m);
    check(`Little: tapping ${m} invites it on stage, onto the keys, as one undo step`, !!t && s.selectedTrackId === t.id && s.past.length === before + 1);
    check(`…${m} is heard (hello) and its card hops`, level > 0.01 && anims.includes('tray-hello'), `peak ${level.toFixed(3)}, ${anims.join(',')}`);
  }
  s = await S(page);
  check('six monsters on stage in Little mode', s.project.tracks.map((t) => t.monster).join(',') === 'bloop,boom,grumble,spark,puff,mimic');
  const seats6 = await page.$$eval('.tray .seats span', (els) => els.filter((e) => e.dataset.on === 'true').length);
  check('the seat dots show six of six', seats6 === 6 && (await page.locator('.tray .seats').getAttribute('aria-label')) === '6 of 6 places on stage used');
  await shot(page, 'join-tray-six');
  await axe(page, 'the Add Monster tray (Little, six on stage)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('six pods on the Lab stage', (await page.locator('.stage .pod').count()) === 6);
  const seat = await page.evaluate(() => {
    const b = document.querySelector('.add-seat');
    return { full: b.dataset.full, label: b.getAttribute('aria-label'), paths: b.querySelectorAll('svg path').length };
  });
  check('with all six on stage, the + seat shows the friends instead (no "+" promising more)', seat.full === 'true' && seat.label === 'Monster friends' && seat.paths >= 2, JSON.stringify(seat));
  await ctx.close();
}

// ── 2. Six monsters fit: iPad, phone, upright tablet ───────────────────────
const inside = (a, b, tol = 1) => a.l >= b.l - tol && a.r <= b.r + tol && a.t >= b.t - tol && a.b <= b.b + tol;
const overlap = (a, b, tol = 1) => a.l < b.r - tol && b.l < a.r - tol && a.t < b.b - tol && b.t < a.b - tol;
for (const [label, width, height] of [
  ['iPad 1024x768', 1024, 768],
  ['phone 844x390', 844, 390],
  ['upright 820x1180', 820, 1180],
]) {
  const { ctx, page } = await open({ width, height });
  await page.evaluate(() => {
    const m = window.__monster;
    m.studio.invite('puff');
    m.studio.invite('mimic');
  });
  for (const monster of ['bloop', 'mimic']) {
    await spotlight(page, monster);
    await page.waitForTimeout(700);
    const g = await page.evaluate(() => {
      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height };
      };
      const stageEl = document.querySelector('.stage');
      const cs = getComputedStyle(stageEl);
      const outer = box(stageEl);
      const stage = { ...outer, l: outer.l + parseFloat(cs.borderLeftWidth), r: outer.r - parseFloat(cs.borderRightWidth), t: outer.t + parseFloat(cs.borderTopWidth), b: outer.b - parseFloat(cs.borderBottomWidth) };
      const pods = [...stageEl.querySelectorAll('.pod')].map((p) => {
        const svg = p.querySelector('.monster-svg').getBoundingClientRect();
        const s = Math.min(svg.width, svg.height); // xMidYMax meet: the drawing is the bottom square
        return {
          monster: p.dataset.monster,
          pod: box(p),
          hit: box(p.querySelector('.pod-hit')),
          art: { l: svg.left + (svg.width - s) / 2, r: svg.left + (svg.width + s) / 2, t: svg.bottom - s, b: svg.bottom, w: s },
          badge: p.querySelector('.loop-badge') ? box(p.querySelector('.loop-badge')) : null,
        };
      });
      return {
        stage,
        pods,
        seat: box(document.querySelector('.add-seat')),
        keys: [...document.querySelectorAll('.surface .keys .key')].map(box),
        voice: document.querySelector('.voice-btn') ? box(document.querySelector('.voice-btn')) : null,
      };
    });
    const tag = `${label}, ${monster} on the keys`;
    const clipped = g.pods.filter((p) => !inside(p.art, g.stage) || !inside(p.pod, g.stage) || (p.badge && !inside(p.badge, g.stage))).map((p) => p.monster);
    check(`${tag}: all six monsters (and badges) stand inside the stage`, g.pods.length === 6 && clipped.length === 0, clipped.join(','));
    const clash = [];
    g.pods.forEach((a, i) =>
      g.pods.slice(i + 1).forEach((b) => {
        if (overlap(a.pod, b.pod) || overlap(a.art, b.art, 2)) clash.push(`${a.monster}/${b.monster}`);
      }),
    );
    const seatClash = g.pods.filter((p) => overlap(p.pod, g.seat)).map((p) => p.monster);
    check(`${tag}: no monster overlaps another or the + seat`, clash.length === 0 && seatClash.length === 0 && inside(g.seat, g.stage), [...clash, ...seatClash].join(','));
    const thinnest = Math.min(...g.pods.map((p) => p.hit.w));
    const smallestArt = Math.min(...g.pods.map((p) => p.art.w));
    check(`${tag}: every monster is a finger-sized target`, thinnest >= 44 && smallestArt >= 40, `pods ≥ ${thinnest.toFixed(0)} px, art ≥ ${smallestArt.toFixed(0)} px`);
    const kw = Math.min(...g.keys.map((k) => k.w));
    const kh = Math.min(...g.keys.map((k) => k.h));
    check(`${tag}: eight big keys`, g.keys.length === 8 && kw >= 48 && kh >= 100, `keys ${kw.toFixed(0)}×${kh.toFixed(0)} px${g.voice ? `, ears ${g.voice.w.toFixed(0)} px` : ''}`);
    await shot(page, `join-six-${width}x${height}-${monster}`);
  }
  await ctx.close();
}

// ── 3. Going home says bye-bye; one Undo brings it back ────────────────────
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    window.__monster.studio.invite('puff');
    window.__monster.studio.invite('mimic');
  });
  await page.waitForTimeout(300);
  const spark = await trackOf(page, 'spark');
  const past0 = (await S(page)).past.length;
  await page.locator('.add-seat').click();
  await page.waitForTimeout(450);
  await spy(page);
  await page.locator('.tray-card[data-monster="spark"]').click();
  const anims = await animIds(page, '.tray-card[data-monster="spark"]');
  const level = await peak(page);
  let s = await S(page);
  const bye = (await trig(page)).filter((t) => t.ch === 'paint:spark');
  check(
    'tapping a monster on stage sends it home to the bench with its loop (one step)',
    !s.project.tracks.some((t) => t.monster === 'spark') && s.project.bench.some((b) => b.track.id === spark.id) && s.past.length === past0 + 1,
  );
  check(
    '…it sings bye-bye (two notes falling) and its card waves',
    bye.length === 2 && bye[0].midi > bye[1].midi && bye[1].when - bye[0].when > 0.1 && level > 0.01 && anims.includes('tray-bye'),
    `${bye.map((b) => b.midi).join('→')}, peak ${level.toFixed(3)}, ${anims.join(',')}`,
  );
  check('…and its card now offers to invite it again', (await page.locator('.tray-card[data-monster="spark"]').getAttribute('aria-label')).includes('Tap to invite'));
  await shot(page, 'join-bye');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('…and the stage has a + seat again', (await page.locator('.add-seat').getAttribute('data-full')) === 'false' && (await page.locator('.add-seat').getAttribute('aria-label')) === 'Add Monster');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(250);
  s = await S(page);
  const back = await trackOf(page, 'spark');
  check(
    'one Undo brings it back to its seat with the same loop',
    !!back && back.id === spark.id && back.index === spark.index && back.notes === spark.notes && s.past.length === past0 && (await page.locator('.stage .pod').count()) === 6,
    JSON.stringify({ id: back?.id === spark.id, index: back?.index, same: back?.notes === spark.notes }),
  );

  // In the middle of a take: the take ends first, so Undo brings back only the monster.
  const bloopNotes = (await trackOf(page, 'bloop')).notes;
  await spotlight(page, 'bloop');
  await page.getByRole('button', { name: 'Record a loop' }).click();
  await page.waitForTimeout(400);
  for (const step of [0, 4, 7]) {
    await page.evaluate((k) => {
      const m = window.__monster;
      m.studio.hit(m.getState().selectedTrackId, k);
    }, step);
    await page.waitForTimeout(260);
  }
  const taking = (await S(page)).transport.recording;
  const pastTake = (await S(page)).past.length;
  const boom = await trackOf(page, 'boom');
  await page.locator('.add-seat').click();
  await page.waitForTimeout(400);
  await page.locator('.tray-card[data-monster="boom"]').click();
  await page.waitForTimeout(150);
  s = await S(page);
  const tookNotes = (await trackOf(page, 'bloop')).notes;
  check(
    'mid-take: sending a monster home ends the take first (the take and the goodbye are two steps)',
    taking && !s.transport.recording && !s.project.tracks.some((t) => t.monster === 'boom') && s.past.length === pastTake + 1 && tookNotes !== bloopNotes,
    `recording ${taking}→${s.transport.recording}, steps ${pastTake}→${s.past.length}`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__monster.studio.undo());
  await page.waitForTimeout(200);
  const boomBack = await trackOf(page, 'boom');
  check(
    '…one Undo brings it back with its loop and keeps the take',
    !!boomBack && boomBack.id === boom.id && boomBack.notes === boom.notes && (await trackOf(page, 'bloop')).notes === tookNotes,
  );
  await page.evaluate(() => window.__monster.studio.stop());
  await page.waitForTimeout(300);

  // Everyone but Bloop goes home; then Bloop, the last one, stays and sings.
  await page.locator('.add-seat').click();
  await page.waitForTimeout(400);
  for (const m of ['boom', 'grumble', 'spark', 'puff', 'mimic']) {
    await page.locator(`.tray-card[data-monster="${m}"]`).click();
    await page.waitForTimeout(120);
  }
  s = await S(page);
  check('five quick goodbyes leave Bloop alone (each its own step)', s.project.tracks.map((t) => t.monster).join() === 'bloop' && s.project.bench.length === 5);
  const alone = await page.locator('.tray-card[data-monster="bloop"]').getAttribute('aria-label');
  // Let the goodbyes (and their echoes) fade, so what is heard next is Bloop.
  await page.waitForTimeout(1500);
  await page.locator('.tray-card[data-monster="bloop"]').click();
  const singAnims = await animIds(page, '.tray-card[data-monster="bloop"]');
  const singLevel = await peak(page);
  s = await S(page);
  check(
    'the last monster on stage stays: a tap makes it bounce and sing',
    s.project.tracks.length === 1 && alone.includes('Tap to hear it') && singAnims.includes('tray-sing') && singLevel > 0.01,
    `peak ${singLevel.toFixed(3)}, ${singAnims.join(',')}`,
  );
  const dots = await page.$$eval('.tray .seats span', (els) => `${els.filter((e) => e.dataset.on === 'true').length}/${els.length}`);
  check('the seat dots show one of six', dots === '1/6', dots);

  // Reduced motion: no waving, a soft glow; the goodbye still sounds.
  await page.locator('.tray-card[data-monster="puff"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'reduce' }));
  await page.locator('.tray-card[data-monster="puff"]').click();
  const calm = await page.evaluate(() => {
    const card = document.querySelector('.tray-card[data-monster="puff"]');
    return { anims: card.querySelector('.tray-art').getAnimations().filter((a) => a.id.startsWith('tray-')).length, glow: card.dataset.glow };
  });
  const calmLevel = await peak(page, 900);
  check('reduced motion: a goodbye glows instead of waving, and still sounds', calm.anims === 0 && calm.glow === 'true' && calmLevel > 0.01, JSON.stringify({ ...calm, peak: calmLevel.toFixed(3) }));
  await ctx.close();
}

// ── 3b. The first-beat guide's Boom stays while it teaches ─────────────────
{
  const { ctx, page } = await open();
  await page.evaluate(() => window.__monster.actions.startFirstBeat());
  await page.waitForTimeout(600);
  const guide = (await S(page)).guide;
  await page.locator('.add-seat').click();
  await page.waitForTimeout(450);
  const label = await page.locator('.tray-card[data-monster="boom"]').getAttribute('aria-label');
  const past0 = (await S(page)).past.length;
  await page.locator('.tray-card[data-monster="boom"]').click();
  const anims = await animIds(page, '.tray-card[data-monster="boom"]');
  const level = await peak(page, 900);
  const s = await S(page);
  check(
    'during “My first beat”, Boom stays on stage: a tap makes it bounce and play, and the guide goes on',
    !!guide && s.guide?.trackId === guide.trackId && s.project.tracks.some((t) => t.id === guide.trackId) && s.past.length === past0 && anims.includes('tray-sing') && level > 0.01 && /Tap to hear it/.test(label),
    `${label}; peak ${level.toFixed(3)}, ${anims.join(',')}`,
  );
  await ctx.close();
}

// ── 4. Mimic's sleeping ears are a picture ─────────────────────────────────
{
  const { ctx, page } = await open();
  await page.evaluate(() => window.__monster.studio.invite('mimic'));
  await spotlight(page, 'mimic');
  await page.waitForTimeout(400);
  const lock = await page.evaluate(() => {
    const b = document.querySelector('.voice-btn');
    return {
      locked: b?.dataset.locked,
      icons: b?.querySelectorAll('.lock-picture svg').length,
      ear: !!b?.querySelector('.lock-ear'),
      text: b?.innerText.trim(),
      label: b?.getAttribute('aria-label'),
    };
  });
  check('locked ears show a picture (an ear asleep and a grown-up), no words', lock.locked === 'true' && lock.icons === 3 && lock.ear && lock.text === '' && /grown-up/.test(lock.label), JSON.stringify(lock));
  await page.locator('.voice-btn').dispatchEvent('pointerdown');
  await page.waitForSelector('.bubble', { timeout: 2000 }).catch(() => null);
  const bubble = await page.evaluate(() => {
    const b = document.querySelector('.bubble');
    return { pics: b?.querySelectorAll('.bubble-picture svg').length ?? 0, words: b?.textContent ?? '', face: !!b?.querySelector('.bubble-face') };
  });
  const huh = await peak(page, 900);
  check(
    'pressing them pops a picture bubble (an ear, a grown-up) with Mimic’s “huh?”',
    bubble.pics === 2 && bubble.face && /grown-up/.test(bubble.words) && huh > 0.01,
    `${bubble.pics} pictures, “${bubble.words}”, peak ${huh.toFixed(3)}`,
  );
  await shot(page, 'join-mimic-ears');
  await ctx.close();
}

// ── 5. Learn: fair stars ──────────────────────────────────────────────────
const phase = (page) => page.locator('.lesson').getAttribute('data-phase');
const waitPhase = (page, ph, timeout = 12000) => page.waitForFunction((p) => document.querySelector('.lesson')?.dataset.phase === p, ph, { timeout }).then(() => true).catch(() => false);
const nextKey = (page) => page.$$eval('.lesson-key', (els) => els.findIndex((e) => e.dataset.next === 'true'));
const doneStars = (page) => page.$$eval('.lesson-done .lesson-star[data-on="true"]', (els) => els.length);
/** Play a lesson to the end: `wrong(n)` says whether press number n hits a wrong key; `between` runs at each cheer. */
async function playThrough(page, wrong = () => false, between = async () => {}) {
  let presses = 0;
  let wrongs = 0;
  let cheers = 0;
  for (let guard = 0; guard < 400; guard++) {
    const ph = await phase(page);
    if (ph === 'done') break;
    if (ph === 'cheer') {
      await between(++cheers);
      await page.waitForFunction(() => document.querySelector('.lesson')?.dataset.phase !== 'cheer', null, { timeout: 4000 }).catch(() => null);
      continue;
    }
    if (ph === 'play') {
      const k = await nextKey(page);
      if (k >= 0) {
        const miss = wrong(presses);
        await page.locator('.lesson-key').nth(miss ? (k + 3) % 8 : k).dispatchEvent('pointerdown');
        presses++;
        if (miss) wrongs++;
        await page.waitForTimeout(90);
        continue;
      }
    }
    await page.waitForTimeout(120);
  }
  return { presses, wrongs, done: (await phase(page)) === 'done' };
}
{
  const { ctx, page } = await open();
  await page.locator('.dock-btn[data-screen="learn"]').click();
  await page.locator('.lesson-card[data-song="hot-cross-buns"]').click();
  check('Magic help is on for a Little Monster', (await page.locator('.lesson-helper').getAttribute('aria-pressed')) === 'true');
  await waitPhase(page, 'play');
  const perfect = await playThrough(page);
  await page.waitForTimeout(900);
  let s = await S(page);
  check(
    'a perfect run with Magic help on earns three stars',
    perfect.done && perfect.presses === 17 && (await doneStars(page)) === 3 && s.settings.lessonStars['hot-cross-buns'] === 3,
    `${perfect.presses} presses, ${await doneStars(page)} stars`,
  );
  await shot(page, 'join-learn-three-stars');

  // Four keys that help had to fix: two stars.
  await page.getByRole('button', { name: 'Again', exact: true }).click();
  await waitPhase(page, 'play');
  const four = await playThrough(page, (n) => n < 4);
  await page.waitForTimeout(300);
  check('four wrong keys that Magic help fixed: two stars (the song still plays right)', four.done && four.presses === 17 && four.wrongs === 4 && (await doneStars(page)) === 2, `${four.wrongs} fixed, ${await doneStars(page)} stars`);

  // Every key wrong, help carries the whole song: still a star, never zero.
  await page.getByRole('button', { name: 'Again', exact: true }).click();
  await waitPhase(page, 'play');
  const all = await playThrough(page, () => true);
  await page.waitForTimeout(300);
  s = await S(page);
  check(
    'help fixing every key still earns one star (and the best stays kept)',
    all.done && all.wrongs === 17 && (await doneStars(page)) === 1 && s.settings.lessonStars['hot-cross-buns'] === 3,
    `${all.wrongs} fixed, ${await doneStars(page)} star(s)`,
  );
  await ctx.close();
}

// ── 6. Learn answers every touch: the teacher and the words ────────────────
{
  const { ctx, page } = await open();
  await page.locator('.dock-btn[data-screen="learn"]').click();
  await page.locator('.lesson-card[data-song="hot-cross-buns"]').click();
  await page.waitForTimeout(300);
  await page.locator('.lesson-helper').click(); // help off: a tap that counted would be a slip
  await listen(page);
  const teacherAt = async () => {
    const b = await page.locator('.lesson-teacher').boundingBox();
    return [b.x + b.width / 2, b.y + b.height * 0.55];
  };
  const live = async () => (await heard(page)).filter((n) => n.src === 'live' && n.m === 'bloop');

  // While the teacher sings its phrase, a tap is motion only: it never talks over it.
  check('the lesson starts by listening', (await phase(page)) === 'listen');
  await page.mouse.click(...(await teacherAt()));
  await page.waitForTimeout(150);
  const wordBox = await page.locator('.lesson-word[data-i="2"]').boundingBox();
  await page.mouse.click(wordBox.x + wordBox.width / 2, wordBox.y + wordBox.height / 2);
  await page.waitForTimeout(150);
  const during = await page.evaluate(() => ({ playing: window.__monster.studio.lessonPlaying, phase: document.querySelector('.lesson').dataset.phase }));
  const squishListen = await animIds(page, '.lesson-teacher');
  check(
    'during the teacher’s phrase, teacher and word taps move but never sing over it',
    (await live()).length === 0 && during.playing && during.phase === 'listen' && squishListen.includes('teacher-squish'),
    JSON.stringify({ ...during, notes: (await live()).length }),
  );

  await waitPhase(page, 'play');
  await page.evaluate(() => (window.__notes = []));
  const need = await nextKey(page);
  const nextWord = () => page.$eval('.lesson-word[data-state="next"]', (e) => e.dataset.i);
  const word0 = await nextWord();
  await page.mouse.click(...(await teacherAt()));
  await page.waitForTimeout(120);
  const sung = await live();
  const anims = await animIds(page, '.lesson-teacher');
  check(
    'tapping the teacher sings the next note you need, in its voice',
    sung.length === 1 && sung[0].step === need && sung[0].track === null && anims.includes('teacher-squish') && anims.includes('teacher-giggle'),
    `need ${need}, sung ${sung.map((n) => n.step).join(',')}; ${anims.filter((a) => a.startsWith('teacher')).join(',')}`,
  );
  const face = await page.evaluate(() => {
    const t = document.querySelector('.lesson-teacher');
    const lids = [...t.querySelectorAll('.m-lid')].flatMap((l) => l.getAnimations().map((a) => a.id));
    return { eyes: t.querySelectorAll('.m-eye').length, happy: t.querySelectorAll('.m-eye > .m-giggle-eye').length, lidGiggles: lids.filter((id) => id === 'teacher-giggle').length };
  });
  check('…with happy ^ ^ eyes over its own (never sleepy, half-closed lids)', face.eyes > 0 && face.happy === face.eyes && face.lidGiggles === 0, JSON.stringify(face));
  check('…and it is not a try: the same key and word are still next', (await nextKey(page)) === need && (await nextWord()) === word0 && (await phase(page)) === 'play');
  await shot(page, 'join-learn-teacher');

  // A burst of taps is one hint, not a machine gun.
  await page.waitForTimeout(350);
  await page.evaluate(() => (window.__notes = []));
  const t0 = Date.now();
  const at = await teacherAt();
  for (let i = 0; i < 8; i++) await page.mouse.click(...at);
  const span = Date.now() - t0;
  await page.waitForTimeout(100);
  const burst = (await live()).length;
  check('eight quick taps on the teacher sing at most once per 0.3 s', burst >= 1 && burst <= Math.floor(span / 300) + 1, `${burst} notes in ${span} ms`);
  const pile = await page.evaluate(() => {
    const t = document.querySelector('.lesson-teacher');
    return { eyes: t.querySelectorAll('.m-eye').length, faces: t.querySelectorAll('.m-giggle-eye').length, giggles: document.getAnimations().filter((a) => a.id === 'teacher-giggle').length };
  });
  check('…and the giggles never pile up (one happy face per eye at most)', pile.faces <= pile.eyes && pile.giggles <= pile.eyes, JSON.stringify(pile));

  // Keyboard and switch users: the teacher is a button.
  await page.waitForTimeout(350);
  await page.evaluate(() => (window.__notes = []));
  await page.locator('.lesson-teacher').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const keyed = await live();
  check('Enter on the teacher sings the hint too', keyed.length === 1 && keyed[0].step === need, keyed.map((n) => n.step).join(','));
  await page.evaluate(() => document.activeElement?.blur());

  // A word sings its own note (Hot cross *buns* = do), and is not a try either.
  await page.waitForTimeout(200);
  await page.evaluate(() => (window.__notes = []));
  const buns = await page.locator('.lesson-word[data-i="2"]').boundingBox();
  await page.mouse.click(buns.x + buns.width / 2, buns.y + buns.height / 2);
  await page.waitForTimeout(80);
  const wordNotes = await live();
  const hop = await animIds(page, '.lesson-word[data-i="2"]');
  const lit = await page.$eval('.lesson-word[data-i="2"]', (e) => e.dataset.tapped);
  check(
    'tapping a word makes it hop and sing its own note',
    wordNotes.length === 1 && wordNotes[0].step === 0 && hop.includes('word-hop') && lit === 'true',
    `${wordNotes.map((n) => n.step).join(',')}; ${hop.join(',')}`,
  );
  const look = await page.evaluate(() => {
    const w = document.querySelector('.lesson-word[data-i="2"]');
    const n = document.querySelector('.lesson-word[data-state="next"]');
    const keys = [...document.querySelectorAll('.lesson-key')];
    return {
      peek: keys[0].dataset.peek,
      lit: keys.filter((k) => k.dataset.glow === 'true').length,
      sameColour: getComputedStyle(w.querySelector('.word-text')).color === getComputedStyle(n.querySelector('.word-text')).color,
      ring: /rgb\(255, 255, 255\)/.test(getComputedStyle(w.querySelector('.word-note')).boxShadow),
    };
  });
  check(
    '…in its own key colour (never looking like the word to play next), and only the picture on its key pops',
    look.peek === 'true' && look.lit === 0 && !look.sameColour && !look.ring,
    JSON.stringify(look),
  );
  check('…and the lesson does not move on', (await nextKey(page)) === need && (await nextWord()) === word0);
  await page.waitForTimeout(300);
  await axe(page, 'a lesson (after teacher and word taps)');

  // Reduced motion: the teacher glows instead of squishing, and still sings.
  await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'reduce' }));
  await page.waitForTimeout(350);
  await page.evaluate(() => (window.__notes = []));
  await page.mouse.click(...(await teacherAt()));
  await page.waitForTimeout(60);
  const calm = await page.evaluate(() => ({
    squish: document.querySelector('.lesson-teacher .monster-svg').getAnimations().filter((a) => a.id === 'teacher-squish').length,
    glow: document.querySelector('.lesson-teacher').dataset.tapped,
  }));
  check('reduced motion: a tapped teacher glows (no squish) and still sings', calm.squish === 0 && calm.glow === 'true' && (await live()).length === 1, JSON.stringify(calm));
  await page.evaluate(() => window.__monster.actions.updateSettings({ motion: 'full' }));

  // A palm resting on the stage while a finger plays a key: one sound, not two.
  await page.waitForTimeout(350);
  await page.evaluate(() => (window.__notes = []));
  await page.evaluate((k) => {
    const opts = { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, button: 0 };
    document.querySelectorAll('.lesson-key')[k].dispatchEvent(new PointerEvent('pointerdown', opts));
    document.querySelector('.lesson-teacher').dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 8, isPrimary: false }));
  }, (need + 2) % 8);
  await page.waitForTimeout(120);
  const palm = await live();
  check('a palm on the stage while a finger plays a key: only the key sounds', palm.length === 1 && palm[0].step === (need + 2) % 8, palm.map((n) => n.step).join(','));

  // Play the song through, tapping the teacher at the cheer: it sings the next
  // phrase's first note; just before the teacher sings that phrase, it does not.
  let cheerHint = null;
  let lateHint = null;
  const run = await playThrough(
    page,
    () => false,
    async (n) => {
      if (n !== 1) return;
      const t0 = Date.now();
      await page.waitForTimeout(60); // a moment after the last key (not a palm)
      await page.evaluate(() => (window.__notes = []));
      await page.mouse.click(...(await teacherAt()));
      await page.waitForTimeout(80);
      cheerHint = (await live()).map((x) => x.step);
      await page.waitForTimeout(Math.max(0, 950 - (Date.now() - t0)));
      await page.evaluate(() => (window.__notes = []));
      await page.mouse.click(...(await teacherAt()));
      await page.waitForTimeout(80);
      lateHint = (await live()).map((x) => x.step);
    },
  );
  await page.waitForTimeout(900);
  check('between phrases, the teacher hints the next phrase’s first note (“One” = do)', JSON.stringify(cheerHint) === '[0]', JSON.stringify(cheerHint));
  check('…but not just before it sings that phrase (no stuttered first note)', JSON.stringify(lateHint) === '[]', JSON.stringify(lateHint));
  check(
    'a dozen teacher and word taps never counted: help off, one real slip, three stars',
    run.done && run.presses === 17 && (await doneStars(page)) === 3,
    `${run.presses} presses, ${await doneStars(page)} stars`,
  );
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
