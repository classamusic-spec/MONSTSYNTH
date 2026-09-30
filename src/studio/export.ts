import { AudioEngine } from '../audio/engine';
import { audioBufferToWav, blobToAudioBuffer } from '../audio/wav';
import { collectEvents, type PlayMode } from '../magic/sequence';
import { MONSTERS } from '../model/monsters';
import { songBeats } from '../model/project';
import type { Project } from '../model/types';
import { loadSample } from '../store/persistence';
import { noteRequest } from './notes';

// Export a song as a WAV file by rendering it offline with the *same* engine
// that plays it live — what you export is exactly what you heard.

type OfflineCtor = typeof OfflineAudioContext;

export async function renderSong(project: Project, opts: { sampleRate?: number } = {}): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 44100;
  const spb = 60 / project.tempo;
  const hasBlocks = Object.values(project.arrangement.rows).some((r) => r.some(Boolean));
  const mode: PlayMode = hasBlocks ? 'song' : 'loop';
  const beats = mode === 'song' ? songBeats(project) : project.loopBeats * 4;
  const seconds = beats * spb + 3;
  const Offline: OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: OfflineCtor }).webkitOfflineAudioContext;
  const ctx = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new AudioEngine(ctx);
  engine.setTempo(project.tempo);
  engine.setOutputLevel(1, 0.95);
  engine.syncChannels(
    project.tracks.map((t) => ({ id: t.id, monster: t.monster, preset: t.preset, fx: t.fx, volume: t.volume, maxVoices: MONSTERS[t.monster].maxVoices })),
  );
  for (const t of project.tracks) {
    if (!t.sampleId) continue;
    const blob = await loadSample(t.sampleId);
    if (blob) {
      try {
        engine.setSample(t.id, await blobToAudioBuffer(ctx, blob));
      } catch {
        /* the singing voice is used instead */
      }
    }
  }
  const start = 0.05;
  for (const e of collectEvents(project, 0, beats, { mode })) {
    if (!engine.hasChannel(e.channelId)) {
      const info = MONSTERS[e.monster];
      engine.ensureChannel({ id: e.channelId, monster: e.monster, preset: info.presets[0].id, fx: info.defaultFx, volume: 0.75, maxVoices: info.maxVoices });
    }
    engine.trigger(
      noteRequest(project, e.monster, e.channelId, e.note.step, { vel: e.note.vel, tone: e.note.tone }),
      start + e.absBeat * spb,
      Math.max(0.05, e.note.dur * spb),
    );
  }
  return ctx.startRendering();
}

export async function exportSongWav(project: Project): Promise<Blob> {
  return audioBufferToWav(await renderSong(project));
}

export function safeFileName(name: string): string {
  return (name.replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-') || 'monster-song').slice(0, 48);
}

/** Share sheet on tablets/phones when available, otherwise a normal download. */
export async function saveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch {
      /* cancelled: fall through to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
