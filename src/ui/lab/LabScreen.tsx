import { useEffect, useRef } from 'react';
import { audibleTracks } from '../../magic/sequence';
import { surfaceSize } from '../../model/monsters';
import { trackHasLoop } from '../../model/project';
import { selectTrack, setOverlay } from '../../store/actions';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onFrame } from '../../studio/visualBus';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterPod } from './MonsterPod';
import { PlaySurface } from './PlaySurface';
import { PodTools } from './PodTools';
import { StageScene } from './StageScene';
import { useLookAt } from './useLookAt';

// THE MONSTER LAB — every monster on stage at once (tap one to put it on the
// keys), and eight big keys for the monster in the spotlight.

const KEY_ROW = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];

/** The stage feels the pulse: a soft light on every beat, the moon glows on each bar,
 *  and every monster whose loop you can hear bobs along (not one asleep or left out
 *  by a solo; the spotlight one has its own moves). */
function beatDance(stage: HTMLElement, beat: number) {
  if (typeof stage.animate !== 'function') return;
  stage.querySelector('.stage-pulse')?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
  if (beat % 4 === 0) {
    stage.querySelector('.moon-glow')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }
  const s = getState();
  const ms = Math.min(240, (60000 / s.project.tempo) * 0.5);
  const dancing = new Set(audibleTracks(s.project).filter((t) => t.id !== s.selectedTrackId && trackHasLoop(t)).map((t) => t.id));
  stage.querySelectorAll<HTMLElement>('.pod').forEach((pod) => {
    if (!dancing.has(pod.dataset.track ?? '')) return;
    pod.querySelector('.squish')?.animate([{ translate: '0 0' }, { translate: '0 -3%' }, { translate: '0 0' }], { duration: ms, easing: 'ease-out', id: 'beat-bob' });
  });
}

export function LabScreen() {
  const tracks = useApp((s) => s.project.tracks);
  const selectedId = useApp((s) => s.selectedTrackId);
  const selected = tracks.find((t) => t.id === selectedId) ?? tracks[0];
  const stageRef = useRef<HTMLDivElement>(null);
  useLookAt(stageRef);

  // Move with the music: one small imperative animation set per beat, never React state.
  useEffect(() => {
    let lastBeat = -1;
    return onFrame((p) => {
      const stage = stageRef.current;
      if (!p.playing || p.beat < 0 || !stage) {
        lastBeat = -1;
        return;
      }
      const beat = Math.floor(p.beat);
      if (beat === lastBeat) return;
      lastBeat = beat;
      if (!isReducedMotion()) beatDance(stage, beat);
    });
  }, []);

  // Computer keyboards (Chromebooks, desktops): A–K play, 1–6 pick a monster.
  useEffect(() => {
    const held = new Map<string, number>();
    const down = (e: KeyboardEvent) => {
      const s = getState();
      if (e.metaKey || e.ctrlKey || e.altKey || s.overlay || !s.awake || s.resting) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const idx = KEY_ROW.indexOf(key);
      const track = s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? s.project.tracks[0];
      // Only the keys on screen play (Little mode shows six drums: J and K rest).
      if (idx >= 0 && idx < surfaceSize(track.monster, s.settings.ageMode)) {
        e.preventDefault();
        if (e.repeat || held.has(key)) return;
        const id = studio.press(track.id, idx, { vel: 0.85 }, { at: e.timeStamp });
        if (id >= 0) held.set(key, id);
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
        studio.release(id, e.timeStamp);
        held.delete(key);
      }
    };
    // Keys still down when the window loses focus never send keyup: let them go.
    const releaseHeld = () => {
      held.forEach((id) => studio.release(id));
      held.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseHeld);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseHeld);
      releaseHeld();
    };
  }, []);

  return (
    <section className="lab" aria-label="Monster Lab">
      <div className="stage" ref={stageRef}>
        <StageScene />
        {tracks.map((t) => (
          <MonsterPod key={t.id} track={t} selected={t.id === selected.id} />
        ))}
        <PodTools track={selected} className="pod-tools stage-tools" />
        <button className="add-seat" aria-label="Add Monster" onClick={() => setOverlay('tray')}>
          <Icon name="plus" />
        </button>
      </div>
      <PlaySurface track={selected} />
    </section>
  );
}
