import { useEffect, useRef } from 'react';
import { selectTrack, setOverlay } from '../../store/actions';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { Icon } from '../icons/Icon';
import { MonsterPod } from './MonsterPod';
import { PlaySurface } from './PlaySurface';
import { StageScene } from './StageScene';
import { useLookAt } from './useLookAt';

// THE MONSTER LAB — every monster on stage at once (tap one to put it on the
// keys), and eight big keys for the monster in the spotlight.

const KEY_ROW = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];

export function LabScreen() {
  const tracks = useApp((s) => s.project.tracks);
  const selectedId = useApp((s) => s.selectedTrackId);
  const selected = tracks.find((t) => t.id === selectedId) ?? tracks[0];
  const stageRef = useRef<HTMLDivElement>(null);
  useLookAt(stageRef);

  // Computer keyboards (Chromebooks, desktops): A–K play, 1–6 pick a monster.
  useEffect(() => {
    const held = new Map<string, number>();
    const down = (e: KeyboardEvent) => {
      const s = getState();
      if (e.metaKey || e.ctrlKey || e.altKey || s.overlay || !s.awake) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const idx = KEY_ROW.indexOf(key);
      const track = s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? s.project.tracks[0];
      if (idx >= 0) {
        e.preventDefault();
        if (e.repeat || held.has(key)) return;
        held.set(key, studio.press(track.id, idx, { vel: 0.85 }));
        return;
      }
      const n = Number(key);
      if (n >= 1 && n <= s.project.tracks.length) {
        selectTrack(s.project.tracks[n - 1].id);
        return;
      }
      if (key === 'arrowright' || key === 'arrowleft') {
        const i = s.project.tracks.findIndex((t) => t.id === track.id);
        const next = s.project.tracks[(i + (key === 'arrowright' ? 1 : -1) + s.project.tracks.length) % s.project.tracks.length];
        selectTrack(next.id);
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const id = held.get(key);
      if (id !== undefined) {
        studio.release(id);
        held.delete(key);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      held.forEach((id) => studio.release(id));
    };
  }, []);

  return (
    <section className="lab" aria-label="Monster Lab">
      <div className="stage" ref={stageRef}>
        <StageScene />
        {tracks.map((t) => (
          <MonsterPod key={t.id} track={t} selected={t.id === selected.id} />
        ))}
        <button className="add-seat" aria-label="Add Monster" onClick={() => setOverlay('tray')}>
          <Icon name="plus" />
        </button>
      </div>
      <PlaySurface track={selected} />
    </section>
  );
}
