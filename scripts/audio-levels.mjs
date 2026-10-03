// Render every preset offline in a real browser and report peak / RMS levels,
// so gain staging stays even across monsters. Also renders Beat Hop's densest
// drum grids and every wand groove, which must stay inside the master gate.
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
  return { rows, click, band: { peakDb: db(b.peak), rmsDb: db(b.rms), seconds: band.duration.toFixed(1) }, worst: { peakDb: db(w.peak), rmsDb: db(w.rms), peak: w.peak }, gridRows };
});
console.table(report.rows);
console.log('Metronome tick (accent) vs kick:', report.click);
console.log('Monster Band song:', report.band);
console.log('Worst case (all fx max):', { peakDb: report.worst.peakDb, rmsDb: report.worst.rmsDb });
console.table(report.gridRows.map(({ peak, ...r }) => r));
// The master gate: the limiter and soft clip keep everything under −1 dBFS.
const GATE_DB = -1;
const over = report.gridRows.filter((r) => 20 * Math.log10(r.peak) > GATE_DB);
if (20 * Math.log10(report.worst.peak) > GATE_DB) over.push({ grid: 'worst case' });
console.log(over.length ? `FAIL  over the ${GATE_DB} dBFS master gate: ${over.map((r) => r.grid).join(', ')}` : `PASS  every grid and wand groove stays under the ${GATE_DB} dBFS master gate`);
await browser.close();
process.exit(over.length ? 1 : 0);
