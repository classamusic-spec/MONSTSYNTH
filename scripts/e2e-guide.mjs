// "My first beat" guide and the demo songs, end to end.
// Usage: node scripts/e2e-guide.mjs [url] [screenshot-dir]
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
async function open(viewport = { width: 1024, height: 768 }, init) {
  const ctx = await browser.newContext({ viewport });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__monster?.getState().ready);
  return { ctx, page };
}
const S = (page) => page.evaluate(() => window.__monster.getState());
const shot = async (page, name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));

// ── Demo songs ─────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open();
  await page.mouse.click(512, 384);
  await page.waitForTimeout(400);
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(300);
  check('the shelf shows six demo songs', (await page.locator('.song-demo').count()) === 6);
  check('the shelf shows My first beat', (await page.locator('.song-first-beat').count()) === 1);
  await shot(page, 'songs-shelf');
  await page.locator('.song-demo[data-demo="demo-disco-jellyfish"]').click();
  await page.waitForTimeout(700);
  let s = await S(page);
  const firstId = s.project.id;
  check('a demo opens in Monster Blocks and plays as a song', s.screen === 'blocks' && s.transport.playing && s.transport.mode === 'song' && s.project.name === 'Disco Jellyfish');
  await shot(page, 'demo-blocks');
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.waitForTimeout(300);
  check('an untouched demo copy is not listed twice', (await page.locator('.song-card:not(.song-demo):not(.song-new):not(.song-band):not(.song-beat):not(.song-learn):not(.song-first-beat)', { hasText: 'Disco Jellyfish' }).count()) === 0);
  await page.locator('.song-demo[data-demo="demo-disco-jellyfish"]').click();
  await page.waitForTimeout(500);
  s = await S(page);
  check('opening the demo again reopens the same copy', s.project.id === firstId, `${firstId} vs ${s.project.id}`);
  await page.evaluate(() => window.__monster.studio.stop());
  await ctx.close();
}

// ── The guide, start to finish ─────────────────────────────────────────────
{
  const { ctx, page } = await open();
  await page.mouse.click(512, 384);
  await page.waitForTimeout(400);
  await page.locator('.dock-btn[data-screen="songs"]').click();
  await page.locator('.song-first-beat').click();
  await page.waitForTimeout(600);
  let s = await S(page);
  const boom = s.project.tracks.find((t) => t.monster === 'boom');
  check('the guide opens Boom’s stones', s.screen === 'lab' && s.labView === 'grid' && s.selectedTrackId === boom.id && s.guide?.kind === 'first-beat');
  await page.waitForTimeout(400);
  const ringOn = async (pad, col) =>
    page.evaluate(({ pad, col }) => {
      const ring = document.querySelector('.guide-ring');
      const stone = document.querySelector(`.step-grid .stone[data-pad="${pad}"][data-col="${col}"]`);
      if (!ring || ring.hidden || !stone) return false;
      const a = ring.getBoundingClientRect();
      const b = stone.getBoundingClientRect();
      return Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) < 6 && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 6;
    }, { pad, col });
  check('the hand starts on the big drum, beat 1', await ringOn(0, 0));
  check('the other drum rows are dimmed', (await page.evaluate(() => document.querySelector('.app').dataset.guide)) === 'kick');
  await shot(page, 'guide-kick');
  const order = [];
  for (let i = 0; i < 12; i++) {
    const target = await page.evaluate(() => {
      const m = window.__monster;
      const st = m.getState();
      const t = st.project.tracks.find((x) => x.id === st.guide?.trackId);
      const c = t?.clips.find((x) => x.id === t.activeClipId);
      return { notes: c?.notes.length ?? 0 };
    });
    const sel = await page.evaluate(() => {
      const ring = document.querySelector('.guide-ring');
      if (!ring || ring.hidden) return null;
      const r = ring.getBoundingClientRect();
      const el = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((e) => e.classList?.contains('stone'));
      return el ? { pad: el.dataset.pad, col: el.dataset.col } : null;
    });
    if (!sel) break;
    order.push(`${sel.pad}:${sel.col}`);
    if (i === 4) await shot(page, 'guide-hat');
    const box = await page.locator(`.step-grid .stone[data-pad="${sel.pad}"][data-col="${sel.col}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(450);
    void target;
  }
  check('the hand leads big drum, snappy drum, then tss-tss', order.join(' ') === '0:0 0:4 1:2 1:6 2:1 2:3 2:5 2:7', order.join(' '));
  s = await S(page);
  check('the first tap started the beat playing', s.transport.playing);
  check('finishing gives three stars', s.settings.lessonStars['first-beat'] === 3);
  await page.waitForSelector('.guide-onward', { timeout: 4000 }).catch(() => null);
  check('then three choices appear', (await page.locator('.guide-choice').count()) === 3);
  await shot(page, 'guide-done');
  await page.getByRole('button', { name: 'Make it a song' }).click();
  await page.waitForTimeout(600);
  s = await S(page);
  check('“Song” turns the beat into a song in Monster Blocks', s.screen === 'blocks' && s.transport.mode === 'song' && !s.guide);
  await ctx.close();
}

// ── First launch: a gentle offer on Boom ───────────────────────────────────
{
  const { ctx, page } = await open({ width: 844, height: 390 }, () => {
    window.__offerFirstBeat = true;
  });
  await page.mouse.click(422, 195);
  await page.waitForSelector('.guide-hand:not([hidden])', { timeout: 4000 }).catch(() => null);
  check('first launch offers the guide with a hand on Boom', (await page.locator('.guide-hand:not([hidden])').count()) === 1);
  await shot(page, 'offer-phone');
  const s0 = await S(page);
  check('the offer changes nothing until Boom is tapped', !s0.guide && s0.labView === 'keys');
  const boom = s0.project.tracks.find((t) => t.monster === 'boom');
  const pod = await page.locator(`.pod[data-track="${boom.id}"] .pod-hit`).boundingBox();
  await page.mouse.click(pod.x + pod.width / 2, pod.y + pod.height / 2);
  await page.waitForTimeout(700);
  const s1 = await S(page);
  check('tapping Boom starts the guide', s1.guide?.kind === 'first-beat' && s1.labView === 'grid');
  await shot(page, 'guide-phone');
  await page.getByRole('button', { name: 'Stop the beat guide' }).click();
  check('the guide can always be closed', !(await S(page)).guide);
  await ctx.close();
}

// ── The sequencer is one tap away: Beats in the dock ───────────────────────
for (const [w, h, tag] of [
  [1024, 768, 'iPad'],
  [844, 390, 'phone'],
  [667, 375, 'small phone'],
  [820, 1180, 'upright iPad'],
]) {
  const { ctx, page } = await open({ width: w, height: h });
  await page.mouse.click(w / 2, h / 2);
  await page.waitForTimeout(400);
  await page.locator('.dock-btn[data-screen="songs"]').click();
  const fits = await page.evaluate(() => {
    const vh = innerHeight;
    return [...document.querySelectorAll('.dock-btn')].every((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom <= vh && r.height >= 40;
    });
  });
  check(`${tag}: all six dock buttons fit, finger-sized`, fits);
  await page.locator('.dock-btn[data-screen="beats"]').click();
  await page.waitForTimeout(400);
  let s = await S(page);
  const sel = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  check(`${tag}: Beats opens Boom’s step grid`, s.screen === 'lab' && s.labView === 'grid' && sel?.monster === 'boom' && (await page.locator('.step-grid').count()) === 1);
  check(`${tag}: Beats is the lit dock button`, (await page.locator('.dock-btn[aria-current="page"]').getAttribute('data-screen')) === 'beats');
  await page.locator('.dock-btn[data-screen="lab"]').click();
  await page.waitForTimeout(300);
  s = await S(page);
  check(`${tag}: Lab goes back to the keys`, s.screen === 'lab' && s.labView === 'keys' && (await page.locator('.keys').count()) === 1);
  if (tag === 'iPad') {
    await page.evaluate(() => {
      const st = window.__monster.getState();
      window.__monster.actions.selectTrack(st.project.tracks.find((t) => t.monster === 'boom').id);
    });
    await page.waitForTimeout(200);
    check('the flip beside the keys says where it goes', (await page.locator('.surface-flip .flip-label').innerText()) === 'Beats');
    // A song without Boom: Beats brings Boom to the stage.
    await page.evaluate(async () => {
      await window.__monster.actions.newSong('blank');
      const st = window.__monster.getState();
      const { removeMonster } = await import('/src/model/edits.ts');
      const boom = st.project.tracks.find((t) => t.monster === 'boom');
      const { commit } = await import('/src/store/store.ts');
      if (boom) commit((p) => removeMonster(p, boom.id));
    });
    const before = (await S(page)).project.tracks.some((t) => t.monster === 'boom');
    await page.locator('.dock-btn[data-screen="beats"]').click();
    await page.waitForTimeout(300);
    s = await S(page);
    const boom = s.project.tracks.find((t) => t.monster === 'boom');
    check('Beats brings Boom to a song that has no drums', !before && !!boom && s.selectedTrackId === boom.id && s.labView === 'grid');
  }
  await ctx.close();
}

// ── Demo songs sound like themselves from the first block ──────────────────
{
  const { ctx, page } = await open();
  await page.mouse.click(512, 384);
  await page.waitForTimeout(400);
  const heard = [];
  for (const id of ['demo-jungle-drum-parade', 'demo-disco-jellyfish', 'demo-skeleton-tiptoe']) {
    await page.locator('.dock-btn[data-screen="songs"]').click();
    await page.locator(`.song-demo[data-demo="${id}"]`).click();
    await page.waitForTimeout(600);
    heard.push(
      await page.evaluate(() => {
        const p = window.__monster.getState().project;
        const first = p.tracks.filter((t) => p.arrangement.rows[t.id][0]);
        return { tempo: p.tempo, sounds: first.map((t) => t.preset).sort().join(' '), tune: first.some((t) => t.monster !== 'boom' && t.monster !== 'grumble') };
      }),
    );
  }
  check('each demo opens with its own tune and sounds', heard.every((h) => h.tune) && new Set(heard.map((h) => h.sounds)).size === 3 && new Set(heard.map((h) => h.tempo)).size === 3, JSON.stringify(heard));
  await ctx.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
