// Render every preset offline in a real browser and report peak / RMS levels,
// so gain staging stays even across monsters. Also renders Beat Hop's densest
// drum grids, every wand groove, every melodic monster's fullest bead lane and
// every wand tune, and the whole band stamped at once, which must all stay
// inside the master gate. Tickle time's laughs (every monster's giggle, bigger
// laugh and "wheee", in its first sound) must peak no louder than a played
// note of the same sound, and the sky's bells must sit under a Spark key.
// Usage: node scripts/audio-levels.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
const report = await page.evaluate(async () => {
  const { AudioEngine } = await import('/src/audio/engine.ts');
  const { MONSTERS } = await import('/src/model/monsters.ts');
  const { noteRequest } = await import('/src/studio/notes.ts');
  const { monsterBandProject } = await import('/src/magic/templates.ts');
  const { renderSong } = await import('/src/studio/export.ts');
  const measure = (buf, from = 0, to = buf.length) => {
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = from; i < to; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
        n++;
      }
    }
    return { peak, rms: Math.sqrt(sum / n) };
  };
  const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
  const rows = [];
  const fx0 = { echo: 0, gloop: 0, chomper: 0, wiggle: 0 };
  for (const m of Object.values(MONSTERS)) {
    for (const p of m.presets) {
      const sr = 44100;
      const ctx = new OfflineAudioContext(2, sr * 2.5, sr);
      const e = new AudioEngine(ctx);
      e.setOutputLevel(1, 1);
      e.ensureChannel({ id: 't', monster: m.kind, preset: p.id, fx: fx0, volume: 0.8, maxVoices: 8 });
      const steps = m.kind === 'boom' ? [0, 1, 2, 3] : [0, 2, 4, 7];
      steps.forEach((s, i) => e.trigger(noteRequest({ scale: 'pentatonicMajor', key: 0 }, m.kind, 't', s, { vel: 0.85 }), 0.05 + i * 0.5, 0.4));
      const buf = await ctx.startRendering();
      const { peak, rms } = measure(buf, 0, Math.floor(sr * 2.1));
      rows.push({ monster: m.kind, preset: p.id, peakDb: db(peak), rmsDb: db(rms) });
    }
  }
  // The metronome's woodblock against a child's kick (track volume 0.8): it must sit underneath.
  const { METRONOME } = await import('/src/audio/presets.ts');
  const { TICK_PAD } = await import('/src/audio/voices/drums.ts');
  const single = async (spec, req) => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, sr * 1, sr);
    const e = new AudioEngine(ctx);
    e.setOutputLevel(1, 1);
    e.ensureChannel({ id: 'c', monster: 'boom', fx: fx0, maxVoices: 4, ...spec });
    e.trigger({ channelId: 'c', midi: [], tone: 0, size: 0, bend: 0, pad: 0, ...req }, 0.05, 0.1);
    return measure(await ctx.startRendering());
  };
  const tick = await single({ preset: METRONOME.preset, volume: METRONOME.volume }, { pad: TICK_PAD, vel: METRONOME.accentVel, bend: METRONOME.accentBend });
  const kick = await single({ preset: METRONOME.preset, volume: 0.8 }, { pad: 0, vel: 0.85 });
  const click = { tickPeakDb: db(tick.peak), kickPeakDb: db(kick.peak), tickQuieter: tick.peak < kick.peak };
  const band = await renderSong(monsterBandProject(3));
  const b = measure(band);
  // Worst case: every monster with every effect cranked.
  const loud = monsterBandProject(4);
  loud.tracks = loud.tracks.map((t) => ({ ...t, fx: { echo: 0.8, gloop: 0.8, chomper: 0.8, wiggle: 0.8 }, volume: 1 }));
  const w = measure(await renderSong(loud));

  // Beat Hop: Boom alone (no blocks, so the loop plays four times), as dense as a child can make it.
  const { createProject } = await import('/src/model/project.ts');
  const { writeCell } = await import('/src/magic/steps.ts');
  const { GROOVES, grooveNotes } = await import('/src/magic/grooves.ts');
  const boomOnly = (notes) => {
    const p = createProject({ seed: 5, monsters: ['boom'] });
    const clip = { id: 'c', lengthBeats: 8, notes };
    p.tracks = p.tracks.map((t) => ({ ...t, clips: [clip], activeClipId: 'c' }));
    return p;
  };
  const cells = (list) => {
    let clip = { id: 'c', lengthBeats: 8, notes: [] };
    for (const [step, col, target] of list) {
      clip = writeCell(clip, { step, col, target, lengthBeats: 8, beatsPerBar: 4, isDrum: true, columnCap: Infinity, dur: 0.5, maxNotes: 160 }).clip;
    }
    return clip.notes;
  };
  const grids = [];
  // Every Little stone lit: tiny cymbal doubles, snappy drum and big drum on every beat.
  const littleAll = [];
  for (let c = 0; c < 8; c++) littleAll.push([2, c, 'double'], [1, c, 'one'], [0, c, 'one']);
  grids.push(['Little grid, every stone lit', cells(littleAll)]);
  // Monster Maker at the cap: four drums in every beat, all doubles, rotating through the eight pads.
  const makerFull = [];
  for (let c = 0; c < 8; c++) for (let k = 0; k < 4; k++) makerFull.push([(c + k * 2) % 8, c, 'double']);
  grids.push(['Maker grid, 4 drums × doubles in every beat', cells(makerFull)]);
  for (const g of GROOVES) grids.push([`wand: ${g.id}${g.maker ? ' (Maker)' : ''}`, grooveNotes(g, { beatsPerBar: 4 })]);
  const gridRows = [];
  for (const [name, notes] of grids) {
    const m = measure(await renderSong(boomOnly(notes)));
    gridRows.push({ grid: name, notes: notes.length, peakDb: db(m.peak), rmsDb: db(m.rms), peak: m.peak });
  }

  // The bead lane: each melodic monster alone (Maker), its fullest lane (the column
  // cap in every beat, low keys, which are the loudest) and every wand tune.
  const { TUNES, tuneNotes, wandPattern } = await import('/src/magic/grooves.ts');
  const { gridColumnCap } = await import('/src/model/monsters.ts');
  const only = (monster, notes) => {
    const p = createProject({ seed: 6, monsters: [monster] });
    const clip = { id: 'c', lengthBeats: 8, notes };
    p.tracks = p.tracks.map((t) => ({ ...t, clips: [clip], activeClipId: 'c' }));
    return p;
  };
  const fullLane = (monster) => {
    const info = MONSTERS[monster];
    const cap = gridColumnCap(monster, 'maker');
    let clip = { id: 'c', lengthBeats: 8, notes: [] };
    for (let c = 0; c < 8; c++) {
      for (let k = 0; k < cap; k++) {
        clip = writeCell(clip, { step: k * 2, col: c, target: 'one', lengthBeats: 8, beatsPerBar: 4, isDrum: false, columnCap: cap, dur: info.gridDur, trimPrevious: info.gridMono }).clip;
      }
    }
    return clip.notes;
  };
  const melodic = ['bloop', 'grumble', 'spark', 'puff', 'mimic'];
  const laneRows = [];
  for (const monster of melodic) {
    const lanes = [[`${monster}: full lane (${gridColumnCap(monster, 'maker')} per beat)`, fullLane(monster)]];
    for (const t of TUNES[monster]) lanes.push([`${monster}: tune ${t.id}${t.maker ? ' (Maker)' : ''}`, tuneNotes(monster, t, { beatsPerBar: 4 })]);
    for (const [name, notes] of lanes) {
      const m = measure(await renderSong(only(monster, notes)));
      laneRows.push({ lane: name, notes: notes.length, peakDb: db(m.peak), rmsDb: db(m.rms), peak: m.peak });
    }
  }
  // The whole band stamped by the wand at once: every monster's busiest Maker idea, together.
  const all6 = createProject({ seed: 7, monsters: ['boom', ...melodic] });
  const busiest = (monster) => {
    let best = [];
    for (let k = 0; k < 10; k++) {
      const notes = wandPattern(monster, 'maker', k, { beatsPerBar: 4 });
      if (notes.length > best.length) best = notes;
    }
    return best;
  };
  all6.tracks = all6.tracks.map((t) => {
    const clip = { id: `c-${t.monster}`, lengthBeats: 8, notes: busiest(t.monster) };
    return { ...t, clips: [clip], activeClipId: clip.id };
  });
  const whole = measure(await renderSong(all6));
  laneRows.push({ lane: 'whole band: every monster\'s busiest wand idea', notes: all6.tracks.reduce((n, t) => n + t.clips[0].notes.length, 0), peakDb: db(whole.peak), rmsDb: db(whole.rms), peak: whole.peak });
  // Tickle time: each monster's laughs on its own channel (its first sound, no effects), as
  // chirp() plays them, against the same sound's played notes (the preset table above).
  const { LAUGHS, laughNotes } = await import('/src/magic/tickle.ts');
  const laughRows = [];
  for (const m of Object.values(MONSTERS)) {
    const preset = m.presets[0].id;
    const notePeak = rows.find((r) => r.monster === m.kind && r.preset === preset).peakDb;
    for (const kind of Object.keys(LAUGHS)) {
      const sr = 44100;
      const ctx = new OfflineAudioContext(2, sr * 3, sr);
      const e = new AudioEngine(ctx);
      e.setOutputLevel(1, 1);
      e.ensureChannel({ id: 't', monster: m.kind, preset, fx: fx0, volume: 0.8, maxVoices: m.maxVoices });
      for (const [step, at, dur, vel, bend = 0] of laughNotes(kind, m.kind)) {
        e.trigger(noteRequest({ scale: 'pentatonicMajor', key: 0 }, m.kind, 't', step, { vel, bend }), 0.05 + at, dur);
      }
      const r = measure(await ctx.startRendering());
      laughRows.push({ monster: m.kind, laugh: kind, peakDb: db(r.peak), rmsDb: db(r.rms), notePeakDb: notePeak, peak: r.peak, overNote: 20 * Math.log10(r.peak) - Number(notePeak) });
    }
  }
  // The musical sky: Star Bells on Spark's studio channel (its own effects, volume 0.75),
  // the highest sky bell and the moon's two-note bell, against a Spark key (vel 0.85, volume 0.8).
  const { SKY_BELL, MOON_BELL, SKY_HIGH, SKY_GAP_MS, moonSteps, skyVel, moonLevel } = await import('/src/magic/sky.ts');
  const skyRender = async (notes) => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, sr * 3, sr);
    const e = new AudioEngine(ctx);
    e.setOutputLevel(1, 1);
    e.ensureChannel({ id: 'sky', monster: 'spark', preset: 'star-bells', fx: MONSTERS.spark.defaultFx, volume: 0.75, maxVoices: 8 });
    for (const [step, vel, dur, at] of notes) e.trigger(noteRequest({ scale: 'pentatonicMajor', key: 0 }, 'spark', 'sky', step, { vel }), 0.05 + at, dur);
    return measure(await ctx.startRendering());
  };
  const bell = await skyRender([[SKY_HIGH, SKY_BELL.vel, SKY_BELL.dur, 0]]);
  const moonR = await skyRender(moonSteps('pentatonicMajor').map((st, i) => [st, MOON_BELL.vels[i], MOON_BELL.dur, i * 0.012]));
  // A sweep: a bell every 70 ms across the whole sky (the first rings out, the rest softer, as on stage).
  const sweep = await skyRender(Array.from({ length: 10 }, (_, i) => [i, skyVel(i ? SKY_GAP_MS : Infinity), SKY_BELL.dur, (i * SKY_GAP_MS) / 1000]));
  // Two hands scribbling: three bells (the most the sky rings) every 70 ms, the busiest the sky can be.
  const scribble = await skyRender(Array.from({ length: 30 }, (_, i) => [(i * 3) % 10, skyVel(i ? 0 : Infinity), SKY_BELL.dur, (Math.floor(i / 3) * SKY_GAP_MS) / 1000]));
  // Mashing the moon: a tap every 80 ms for 1.6 s rings only as often (and as loud) as moonLevel lets it.
  const mash = [];
  let lastMoon = -Infinity;
  for (let t = 0; t <= 1600; t += 80) {
    const level = moonLevel(t - lastMoon);
    if (!level) continue;
    lastMoon = t;
    moonSteps('pentatonicMajor').forEach((st, i) => mash.push([st, MOON_BELL.vels[i] * level, MOON_BELL.dur, t / 1000 + i * 0.012]));
  }
  const moonMash = await skyRender(mash);
  const sparkKey = Number(rows.find((r) => r.monster === 'spark' && r.preset === 'star-bells').peakDb);
  const sky = {
    bellPeakDb: db(bell.peak), moonPeakDb: db(moonR.peak), sweepPeakDb: db(sweep.peak), scribblePeakDb: db(scribble.peak), moonMashPeakDb: db(moonMash.peak), sparkKeyPeakDb: sparkKey,
    bell: bell.peak, moon: moonR.peak, sweep: sweep.peak, scribble: scribble.peak, moonMash: moonMash.peak,
  };
  return { rows, click, band: { peakDb: db(b.peak), rmsDb: db(b.rms), seconds: band.duration.toFixed(1) }, worst: { peakDb: db(w.peak), rmsDb: db(w.rms), peak: w.peak }, gridRows, laneRows, laughRows, sky };
});
console.table(report.rows);
console.log('Metronome tick (accent) vs kick:', report.click);
console.log('Monster Band song:', report.band);
console.log('Worst case (all fx max):', { peakDb: report.worst.peakDb, rmsDb: report.worst.rmsDb });
console.table(report.gridRows.map(({ peak, ...r }) => r));
console.table(report.laneRows.map(({ peak, ...r }) => r));
console.table(report.laughRows.map(({ peak, overNote, ...r }) => ({ ...r, vsNoteDb: overNote.toFixed(1) })));
console.log('Musical sky (Star Bells on Spark\'s studio channel):', { bell: report.sky.bellPeakDb, moon: report.sky.moonPeakDb, sweep: report.sky.sweepPeakDb, scribble: report.sky.scribblePeakDb, moonMash: report.sky.moonMashPeakDb, sparkKey: report.sky.sparkKeyPeakDb });
// The master gate: the limiter and soft clip keep everything under −1 dBFS.
const GATE_DB = -1;
const over = [...report.gridRows, ...report.laneRows.map((r) => ({ ...r, grid: r.lane }))].filter((r) => 20 * Math.log10(r.peak) > GATE_DB);
if (20 * Math.log10(report.worst.peak) > GATE_DB) over.push({ grid: 'worst case' });
console.log(
  over.length
    ? `FAIL  over the ${GATE_DB} dBFS master gate: ${over.map((r) => r.grid).join(', ')}`
    : `PASS  every grid, wand groove, bead lane and wand tune stays under the ${GATE_DB} dBFS master gate`,
);
// A laugh is a chirp, not a fanfare: never more than 1 dB over the sound's own played note, and audible.
const loudLaughs = report.laughRows.filter((r) => r.overNote > 1 || 20 * Math.log10(r.peak) > -6 || 20 * Math.log10(r.peak) < -30);
console.log(
  loudLaughs.length
    ? `FAIL  laughs out of range: ${loudLaughs.map((r) => `${r.monster} ${r.laugh} ${r.peakDb} dB (note ${r.notePeakDb})`).join(', ')}`
    : 'PASS  every laugh peaks at most 1 dB over its own note, between -30 and -6 dBFS',
);
// The sky is a soft bell under the keys: quieter than a Spark key, but clearly there; a sweep and a
// two-hand scribble stay under the gate, and mashing the moon is never louder than a Spark key.
const skyDb = (v) => 20 * Math.log10(v);
const skyOk =
  skyDb(report.sky.bell) <= report.sky.sparkKeyPeakDb - 2 && skyDb(report.sky.bell) > -26 && skyDb(report.sky.moon) <= report.sky.sparkKeyPeakDb && skyDb(report.sky.moon) > -26 &&
  skyDb(report.sky.sweep) < GATE_DB && skyDb(report.sky.scribble) < GATE_DB && skyDb(report.sky.moonMash) <= report.sky.sparkKeyPeakDb;
console.log(skyOk ? 'PASS  sky and moon bells sit under a Spark key (a sweep and a scribble under the gate, a mashed moon under a key)' : 'FAIL  sky bells out of range');
await browser.close();
process.exit(over.length || loudLaughs.length || !skyOk ? 1 : 0);
