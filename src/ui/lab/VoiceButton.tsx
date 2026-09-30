import { useEffect, useRef, useState } from 'react';
import { MAX_VOICE_SECONDS, micSupported } from '../../audio/mic';
import type { Track } from '../../model/types';
import { useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onStudioEvent } from '../../studio/visualBus';
import { Icon } from '../icons/Icon';
import { say } from '../shell/bubbles';

// MIMIC · hold the pink button, say something ("banana!"), let go.
// Mimic trims the silence, evens out the volume and plays it back — then every
// key plays your sound higher or lower. Microphone use must be switched on by a
// grown-up in Parent Space first; recordings stay on this device.

export function VoiceButton({ track }: { track: Track }) {
  const allowed = useApp((s) => s.settings.micAllowed) && micSupported();
  const [recording, setRecording] = useState(false);
  const levelRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  useEffect(
    () =>
      onStudioEvent((e) => {
        if (e.type === 'mic-level' && levelRef.current) levelRef.current.style.width = `${Math.round(e.level * 100)}%`;
      }),
    [],
  );

  const finish = async () => {
    if (!active.current) return;
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    setRecording(false);
    const ok = await studio.finishVoiceRecording(track.id);
    say(ok ? { text: 'Mimic copied you!', icon: 'check', monster: 'mimic' } : { text: 'Say it louder!', icon: 'mic', monster: 'mimic' });
  };

  const start = async () => {
    if (!allowed) {
      say({ text: 'Ask a grown-up to wake Mimic’s ears', icon: 'lock', monster: 'mimic' });
      return;
    }
    active.current = true;
    setRecording(true);
    const ok = await studio.startVoiceRecording();
    if (!ok) {
      active.current = false;
      setRecording(false);
      say({ text: 'Mimic can’t hear right now', icon: 'mic', monster: 'mimic' });
      return;
    }
    timer.current = setTimeout(() => void finish(), MAX_VOICE_SECONDS * 1000);
  };

  useEffect(
    () => () => {
      if (active.current) studio.cancelVoiceRecording();
    },
    [],
  );

  return (
    <button
      className="voice-btn"
      data-recording={recording}
      data-locked={!allowed}
      aria-label={allowed ? 'Hold and say something. Mimic will copy it.' : 'Mimic’s ears are off. A grown-up can turn them on.'}
      onPointerDown={(e) => {
        e.preventDefault();
        void start();
      }}
      onPointerUp={() => void finish()}
      onPointerCancel={() => void finish()}
      onPointerLeave={() => void finish()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) void start();
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') void finish();
      }}
    >
      <Icon name={allowed ? 'mic' : 'lock'} />
      {recording ? (
        <span className="voice-level">
          <i ref={levelRef} />
        </span>
      ) : (
        <span>{allowed ? 'Hold & talk' : 'Ears off'}</span>
      )}
    </button>
  );
}
