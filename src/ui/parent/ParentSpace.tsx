import { useEffect, useState } from 'react';
import { micSupported } from '../../audio/mic';
import type { MotionPreference, NoteNameStyle, ProjectMeta } from '../../model/types';
import { deleteEverything, deleteSong, duplicateSong, openSong, renameSong, setOverlay, startFirstBeat, updateSettings } from '../../store/actions';
import { loadProject } from '../../store/persistence';
import { SESSION_CHOICES } from '../../model/schema';
import { getState, useApp } from '../../store/store';
import { exportSongWav, safeFileName, saveFile } from '../../studio/export';
import { studio } from '../../studio/studio';
import { Icon } from '../icons/Icon';
import { IS_DEMO } from '../../env';

// ─────────────────────────────────────────────────────────────────────────────
// PARENT SPACE — everything a grown-up may want to decide, kept out of the
// child's creative space. Plain language, standard controls, screen-reader
// friendly. No accounts, no ads, no purchases, no sharing with strangers.
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(ts).toISOString();
  }
}

function SongRow({ meta, current }: { meta: ProjectMeta; current: boolean }) {
  const [name, setName] = useState(meta.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setName(meta.name), [meta.name]);

  const exportWav = async () => {
    setBusy('Making the audio file…');
    try {
      const p = current ? getState().project : await loadProject(meta.id);
      if (!p) return;
      const blob = await exportSongWav(p);
      await saveFile(blob, `${safeFileName(p.name)}.wav`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="ps-song" data-current={current}>
      <div className="ps-song-main">
        <label className="sr-only" htmlFor={`name-${meta.id}`}>
          Song name
        </label>
        <input
          id={`name-${meta.id}`}
          className="ps-input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== meta.name && void renameSong(meta.id, name)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="ps-meta">
          {current ? 'Open now · ' : ''}Changed {formatDate(meta.modifiedAt)} · {meta.filled.length} loop{meta.filled.length === 1 ? '' : 's'}
        </span>
        {busy && <span className="ps-meta">{busy}</span>}
      </div>
      <div className="ps-song-actions">
        {!current && (
          <button className="btn-secondary" onClick={() => void openSong(meta.id)}>
            Open
          </button>
        )}
        <button className="btn-secondary" onClick={() => void duplicateSong(meta.id)}>
          Copy
        </button>
        {!IS_DEMO && (
          <button className="btn-secondary" disabled={!!busy} onClick={() => void exportWav()}>
            <Icon name="download" /> Save audio
          </button>
        )}
        {confirm ? (
          <>
            <button className="btn-danger" onClick={() => void deleteSong(meta.id)}>
              Yes, delete
            </button>
            <button className="btn-secondary" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn-secondary" aria-label={`Delete ${meta.name}`} onClick={() => setConfirm(true)}>
            <Icon name="trash" />
          </button>
        )}
      </div>
    </li>
  );
}

export function ParentSpace() {
  const settings = useApp((s) => s.settings);
  const songs = useApp((s) => s.songs);
  const currentId = useApp((s) => s.project.id);
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ used: string; persisted: boolean } | null>(null);
  const [wipe, setWipe] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        const persisted = (await navigator.storage?.persisted?.()) ?? false;
        const mb = est?.usage ? (est.usage / 1024 / 1024).toFixed(1) : '0';
        setStorage({ used: `${mb} MB`, persisted });
      } catch {
        setStorage(null);
      }
    })();
  }, [songs.length]);

  const toggleMic = async (on: boolean) => {
    if (!on) {
      studio.releaseMic();
      updateSettings({ micAllowed: false });
      setMicMsg('Microphone is off. Mimic will sing with its own voice.');
      return;
    }
    if (!micSupported()) {
      setMicMsg('This browser does not support recording from the microphone.');
      return;
    }
    setMicMsg('Your browser will now ask for permission…');
    const ok = await studio.requestMic();
    if (ok) {
      updateSettings({ micAllowed: true });
      setMicMsg('Microphone is on. Recordings stay on this device.');
    } else {
      updateSettings({ micAllowed: false });
      setMicMsg('Permission was not given. You can allow it in the browser’s site settings.');
    }
  };

  const close = () => setOverlay(null);

  return (
    <div className="ps-scrim" role="dialog" aria-modal="true" aria-labelledby="ps-title">
      <div className="ps">
        <header className="ps-head">
          <div>
            <h1 id="ps-title">Parent Space</h1>
            <p className="ps-sub">Settings for grown-ups. Your child’s creative space stays uncluttered.</p>
          </div>
          <button className="btn-primary" onClick={close}>
            Back to the monsters
          </button>
        </header>

        <section className="ps-section" aria-labelledby="ps-mode">
          <h2 id="ps-mode">Who is playing?</h2>
          <div className="ps-choices" role="radiogroup" aria-labelledby="ps-mode">
            {(
              [
                ['little', 'Little Monster', 'About ages 3–5. Big buttons, no reading, 4 monsters, extra timing help.'],
                ['maker', 'Monster Maker', 'About ages 6–10. Adds 8 drum pads, up to 6 monsters, speed & mood, Chomper and Wiggle effects, solo, redo, names.'],
              ] as const
            ).map(([value, title, desc]) => (
              <label key={value} className="ps-choice" data-checked={settings.ageMode === value}>
                <input type="radio" name="age-mode" value={value} checked={settings.ageMode === value} onChange={() => updateSettings({ ageMode: value })} />
                <span className="ps-choice-title">{title}</span>
                <span className="ps-choice-desc">{desc}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-sound">
          <h2 id="ps-sound">Sound</h2>
          <div className="ps-field">
            <label htmlFor="ps-volume">Volume</label>
            <input
              id="ps-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })}
            />
            <output htmlFor="ps-volume">{Math.round(settings.volume * 100)}%</output>
          </div>
          <div className="ps-field">
            <label htmlFor="ps-ceiling">Maximum volume (ceiling)</label>
            <input
              id="ps-ceiling"
              type="range"
              min={10}
              max={100}
              value={Math.round(settings.volumeCeiling * 100)}
              onChange={(e) => updateSettings({ volumeCeiling: Number(e.target.value) / 100 })}
            />
            <output htmlFor="ps-ceiling">{Math.round(settings.volumeCeiling * 100)}%</output>
          </div>
          <p className="ps-note">
            Sound always passes through a limiter so it never jumps or clips. The ceiling caps loudness no matter what your child does in the
            app; the device’s own volume still applies. Headphones for young children should be volume-limited too.
          </p>
          <button className="btn-secondary" onClick={() => getState().project.tracks[0] && studio.hit(getState().project.tracks[0].id, 4, {}, { record: false })}>
            <Icon name="speaker" /> Test sound
          </button>
        </section>

        <section className="ps-section" aria-labelledby="ps-mic">
          <h2 id="ps-mic">Microphone (Mimic)</h2>
          <label className="ps-toggle">
            <input type="checkbox" checked={settings.micAllowed} onChange={(e) => void toggleMic(e.target.checked)} />
            <span>Let Mimic record short sounds with the microphone</span>
          </label>
          <p className="ps-note">
            Mimic records up to 3 seconds only while your child holds its pink button. Silence is trimmed, then the sound is stored on this
            device only — never uploaded. Turning this off keeps existing recordings but stops new ones.
          </p>
          {micMsg && (
            <p className="ps-status" role="status">
              {micMsg}
            </p>
          )}
        </section>

        <section className="ps-section" aria-labelledby="ps-access">
          <h2 id="ps-access">Comfort & accessibility</h2>
          <div className="ps-field">
            <label htmlFor="ps-motion">Motion</label>
            <select id="ps-motion" value={settings.motion} onChange={(e) => updateSettings({ motion: e.target.value as MotionPreference })}>
              <option value="system">Follow this device</option>
              <option value="reduce">Calm (reduced motion)</option>
              <option value="full">Full bounce</option>
            </select>
          </div>
          <div className="ps-field">
            <label htmlFor="ps-note-names">Names on the keys</label>
            <select id="ps-note-names" value={settings.noteNames} onChange={(e) => updateSettings({ noteNames: e.target.value as NoteNameStyle })}>
              <option value="letters">Letters (C D E)</option>
              <option value="solfege">Do re mi</option>
              <option value="off">None (pictures only)</option>
            </select>
          </div>
          <label className="ps-toggle">
            <input type="checkbox" checked={settings.highContrast} onChange={(e) => updateSettings({ highContrast: e.target.checked })} />
            <span>High contrast panels and outlines</span>
          </label>
          <label className="ps-toggle">
            <input type="checkbox" checked={settings.hints} onChange={(e) => updateSettings({ hints: e.target.checked })} />
            <span>Show gentle picture hints (a pointing hand) for new players</span>
          </label>
          <button
            className="btn-secondary"
            onClick={() => {
              setOverlay(null);
              void startFirstBeat();
            }}
          >
            <Icon name="hand" /> Show the first-beat guide now
          </button>
          <p className="ps-note">
            “My first beat” is a wordless guide on Boom’s drum stones: a hand points at one stone at a time (big drum on beats 1 and 5,
            snappy drum on 3 and 7, a tss-tss on every other beat). The beat starts playing at the first tap, so your child hears it
            grow. It is offered once on the very first visit (when hints are on), and it is always on the Songs shelf and in Learn.
          </p>
          <p className="ps-note">
            Key stickers name each note so you can say “play the E!” and find it on a real piano. They follow the song’s mood; do re mi
            always starts on do. Drums show pictures (and drum words for Monster Makers). The picture on each key also shrinks and climbs as
            the notes go higher, so names are never needed to play.
          </p>
          <p className="ps-note">
            Keyboard: A–K play the keys, 1–6 choose a monster, Space plays or stops, R records, Ctrl/⌘+Z undoes. Nothing flashes rapidly.
          </p>
        </section>

        <section className="ps-section" aria-labelledby="ps-time">
          <h2 id="ps-time">Play time</h2>
          <div className="ps-field">
            <label htmlFor="ps-session">Gentle bedtime for the monsters after</label>
            <select id="ps-session" value={settings.sessionMinutes} onChange={(e) => updateSettings({ sessionMinutes: Number(e.target.value) })}>
              {SESSION_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'No limit' : `${m} minutes`}
                </option>
              ))}
            </select>
          </div>
          <p className="ps-note">
            When the time is up the music stops, the monsters yawn and fall asleep, and everything is already saved. Only a grown-up can
            continue (hold the two corners again). The timer restarts when you close Parent Space.
          </p>
        </section>

        <section className="ps-section" aria-labelledby="ps-songs">
          <h2 id="ps-songs">Songs on this device</h2>
          <ul className="ps-songs">
            {songs.map((m) => (
              <SongRow key={m.id} meta={m} current={m.id === currentId} />
            ))}
          </ul>
        </section>

        <section className="ps-section" aria-labelledby="ps-privacy">
          <h2 id="ps-privacy">Privacy & storage</h2>
          <ul className="ps-list">
            <li>No accounts, no advertising, no in-app purchases, no chat, no followers.</li>
            <li>No analytics or tracking. Nothing your child makes leaves this device unless you save or share it here.</li>
            <li>Songs and recordings are stored in this browser’s local storage (IndexedDB) and saved automatically.</li>
          </ul>
          {IS_DEMO && (
            <p className="ps-note">
              This is the web demo: saving audio files and recording with the microphone work in the installed app, not inside this preview.
            </p>
          )}
          {storage && (
            <p className="ps-note">
              Using {storage.used}. {storage.persisted ? 'Protected from automatic clean-up by the browser.' : 'The browser may clear this data if the device runs low on space — save audio files of favourite songs.'}
            </p>
          )}
          {wipe ? (
            <div className="ps-danger">
              <p>Delete every song and recording on this device? This cannot be undone.</p>
              <button
                className="btn-danger"
                onClick={() => {
                  setWipe(false);
                  void deleteEverything();
                }}
              >
                Delete everything
              </button>
              <button className="btn-secondary" onClick={() => setWipe(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={() => setWipe(true)}>
              <Icon name="trash" /> Delete all data…
            </button>
          )}
        </section>

        <footer className="ps-foot">
          <p>
            Monster Synth 0.1 · Make Noise. Make Monsters. Make Music. · Works offline once installed (Add to Home Screen).
          </p>
        </footer>
      </div>
    </div>
  );
}
