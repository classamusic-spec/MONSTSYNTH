import { useEffect, useRef, useState } from 'react';
import { beatProgress, FIRST_BEAT_STEPS } from '../../magic/firstBeat';
import { activeClip } from '../../model/project';
import { endGuide, isDemoCopy, recordLessonStars, selectTrack, setLabView, startFirstBeat } from '../../store/actions';
import { getState, labFace, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { isReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { MonsterArt } from '../monsters/MonsterArt';
import { onStudioEvent } from '../../studio/visualBus';
import { say } from './bubbles';

// "MY FIRST BEAT" — a wordless guide on Boom's real stones. One hand, one
// glowing stone at a time: big drum on 1 and 5, snappy drum on 3 and 7, then
// tss-tss on every other beat. The first tap starts the loop, so the child
// hears their own beat grow. Progress is read from Boom's loop (src/magic/
// firstBeat.ts), never stored, so Undo, the wand and leaving all just work.
// When the beat is done: a cheer, three stars, and three picture choices.

const MEASURE_MS = 200;
const IDLE_HINT_MS = 4500;

export function FirstBeatGuide() {
  const guide = useApp((s) => s.guide);
  const project = useApp((s) => s.project);
  const screen = useApp((s) => s.screen);
  const selected = useApp((s) => s.selectedTrackId);
  const labView = useApp((s) => s.labView);
  const overlay = useApp((s) => s.overlay);
  const playing = useApp((s) => s.transport.playing);
  const handRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [onward, setOnward] = useState(false);
  const cheered = useRef(false);
  const lastStep = useRef(-1);

  const track = guide ? project.tracks.find((t) => t.id === guide.trackId) : undefined;
  const clip = track ? activeClip(track) : null;
  const progress = beatProgress(clip?.notes ?? [], clip?.lengthBeats ?? 8);
  const onGrid =
    !!guide && screen === 'lab' && !overlay && selected === guide.trackId && labFace({ labView, project, selectedTrackId: selected }) === 'grid';

  // A different song was opened: the guide quietly ends.
  useEffect(() => {
    if (guide && (project.id !== guide.projectId || !track)) endGuide();
  }, [guide, project.id, track]);

  // Row spotlight (CSS dims the other drum rows) while building.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return;
    const id = guide && onGrid && !progress.done ? FIRST_BEAT_STEPS[progress.step].id : '';
    if (id) app.dataset.guide = id;
    else delete app.dataset.guide;
    return () => {
      delete app.dataset.guide;
    };
  }, [guide, onGrid, progress.done, progress.step]);

  // Each new row starts with its drum and a reader's cue.
  useEffect(() => {
    if (!guide || !onGrid || progress.done || progress.step === lastStep.current) return;
    lastStep.current = progress.step;
    const step = FIRST_BEAT_STEPS[progress.step];
    say({ text: step.cue, icon: 'hand', monster: 'boom', chirp: null });
    studio.auditionStep(guide.trackId, step.pad, 0.75);
  }, [guide, onGrid, progress.done, progress.step]);

  // A quiet child hears the drum it should add, every few seconds.
  const targetKey = progress.target ? `${progress.target.pad}:${progress.target.col}` : '';
  useEffect(() => {
    if (!guide || !onGrid || !progress.target) return;
    const pad = progress.target.pad;
    const id = setInterval(() => studio.auditionStep(guide.trackId, pad, 0.6), IDLE_HINT_MS);
    return () => clearInterval(id);
  }, [guide, onGrid, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Done: cheer once, keep three stars, then offer what comes next.
  useEffect(() => {
    if (!guide || !progress.done || cheered.current) return;
    cheered.current = true;
    recordLessonStars('first-beat', 3);
    say({ text: 'Your beat!', icon: 'star', monster: 'boom', chirp: 'yay' });
    if (!getState().transport.playing) studio.play();
    burst();
    const t = setTimeout(() => setOnward(true), 2200);
    return () => clearTimeout(t);
  }, [guide, progress.done]);

  useEffect(() => {
    if (!guide) {
      cheered.current = false;
      lastStep.current = -1;
      setOnward(false);
    }
  }, [guide]);

  // Follow the target with the hand (a few times a second: no layout per frame).
  const selector = !guide
    ? null
    : !onGrid
      ? screen === 'lab' && !overlay
        ? selected === guide.trackId
          ? '.surface-flip'
          : `.pod[data-track="${guide.trackId}"] .pod-hit`
        : null
      : progress.target
        ? `.step-grid .stone[data-pad="${progress.target.pad}"][data-col="${progress.target.col}"]`
        : playing
          ? null
          : '.t-play';
  useEffect(() => {
    if (!selector) return;
    let raf = 0;
    let at = -Infinity;
    const place = (now: number) => {
      raf = requestAnimationFrame(place);
      if (now - at < MEASURE_MS) return;
      at = now;
      const el = document.querySelector(selector);
      const hand = handRef.current;
      const ring = ringRef.current;
      if (!el || !hand || !ring) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(44, Math.min(r.width, r.height, 140)) + 10;
      hand.style.left = `${r.left + r.width / 2}px`;
      hand.style.top = `${r.top + r.height * 0.6}px`;
      ring.style.left = `${r.left + r.width / 2 - size / 2}px`;
      ring.style.top = `${r.top + r.height / 2 - size / 2}px`;
      ring.style.width = ring.style.height = `${size}px`;
      hand.hidden = ring.hidden = false;
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [selector]);

  if (!guide) return null;

  const friend = () => {
    const s = getState();
    const mate = s.project.tracks.find((t) => t.monster === 'grumble') ?? s.project.tracks.find((t) => t.monster !== 'boom');
    setOnward(false);
    endGuide();
    if (!mate) return;
    selectTrack(mate.id);
    setLabView('grid');
    studio.gridWand(mate.id);
  };
  const song = () => {
    setOnward(false);
    endGuide();
    studio.makeSong();
  };
  const keep = () => {
    setOnward(false);
    endGuide();
  };

  return (
    <>
      {selector && !onward && (
        <>
          <div ref={ringRef} className="guide-ring" hidden aria-hidden />
          <div ref={handRef} className="guide-hand" hidden aria-hidden>
            <Icon name="hand" />
          </div>
        </>
      )}
      {screen === 'lab' && !overlay && (
        <div className="guide-bar" role="status" aria-label={`My first beat: ${progress.met} of ${progress.total} stones`}>
          <span className="guide-face" aria-hidden>
            <MonsterArt kind="boom" />
          </span>
          <span className="guide-dots" aria-hidden>
            {Array.from({ length: progress.total }, (_, i) => (
              <i key={i} data-on={i < progress.met} />
            ))}
          </span>
          <button className="guide-close" aria-label="Stop the beat guide" onClick={() => endGuide()}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {onward && (
        <div className="guide-onward" role="dialog" aria-label="What next?">
          <button className="guide-choice" aria-label="A friend joins in" onClick={friend}>
            <span className="guide-choice-art">
              <MonsterArt kind="grumble" />
              <i className="guide-plus">
                <Icon name="plus" />
              </i>
            </span>
            <span>Friend</span>
          </button>
          <button className="guide-choice" aria-label="Make it a song" onClick={song}>
            <span className="guide-choice-art guide-choice-icon">
              <Icon name="blocks" />
            </span>
            <span>Song</span>
          </button>
          <button className="guide-choice" aria-label="Keep drumming" onClick={keep}>
            <span className="guide-choice-art guide-choice-icon">
              <Icon name="check" />
            </span>
            <span>Drum on</span>
          </button>
        </div>
      )}
    </>
  );
}

/** A star burst over the grid when the beat is done (none in reduced motion). */
function burst() {
  if (isReducedMotion()) return;
  const grid = document.querySelector('.step-grid');
  if (!grid) return;
  const r = grid.getBoundingClientRect();
  for (let i = 0; i < 12; i++) {
    const star = document.createElement('span');
    star.className = 'guide-star';
    star.style.left = `${r.left + r.width / 2}px`;
    star.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(star);
    const a = (i / 12) * Math.PI * 2;
    const d = 80 + (i % 3) * 40;
    const anim = star.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1)`, opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    anim.onfinish = () => star.remove();
  }
}

/**
 * First launch: a gentle offer, never a takeover. Shortly after the monsters
 * wake, if nobody has made music yet, a hand rests on Boom and Boom plays a
 * little beat now and then. Tapping Boom starts the guide; playing anything
 * else (or waiting) lets the offer go for this session.
 */
export function FirstBeatOffer() {
  const [podSel, setPodSel] = useState<string | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let boomId: string | null = null;
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      boomId = null;
      setPodSel(null);
    };
    const offWake = onStudioEvent((e) => {
      if (e.type !== 'wake' || boomId) return;
      // Automated browsers start every run as a brand-new child; they opt in.
      if (navigator.webdriver && !(window as unknown as { __offerFirstBeat?: boolean }).__offerFirstBeat) return;
      timers.push(
        setTimeout(() => {
          const s = getState();
          const boom = s.project.tracks.find((t) => t.monster === 'boom');
          const fresh = s.songs.every((m) => isDemoCopy(m.id) || m.filled.length === 0) && s.project.tracks.every((t) => !t.clips.some((c) => c.notes.length));
          if (!boom || !s.settings.hints || s.settings.lessonStars['first-beat'] || !fresh) return;
          if (s.screen !== 'lab' || s.overlay || s.resting || s.guide || s.transport.playing) return;
          boomId = boom.id;
          setPodSel(`.pod[data-track="${boom.id}"] .pod-hit`);
          for (let i = 0; i < 3; i++) {
            timers.push(
              setTimeout(() => {
                if (!boomId) return;
                [0, 0.18, 0.36].forEach((d, k) => timers.push(setTimeout(() => boomId && studio.auditionStep(boomId, [0, 0, 2][k], 0.7), d * 1000)));
              }, 600 + i * 5000),
            );
          }
          timers.push(setTimeout(stop, 16000));
        }, 900),
      );
    });
    const offSel = useApp.subscribe((s, prev) => {
      if (!boomId) return;
      // Tapping Boom says yes; going anywhere else says not now.
      if (s.selectedTrackId === boomId && prev.selectedTrackId !== boomId) {
        stop();
        void startFirstBeat();
      } else if (s.screen !== 'lab' || s.overlay || s.transport.playing || s.transport.armed) stop();
    });
    return () => {
      stop();
      offWake();
      offSel();
    };
  }, []);

  useEffect(() => {
    if (!podSel) return;
    let raf = 0;
    let at = -Infinity;
    const place = (now: number) => {
      raf = requestAnimationFrame(place);
      if (now - at < MEASURE_MS) return;
      at = now;
      const el = document.querySelector(podSel);
      const hand = handRef.current;
      const ring = ringRef.current;
      if (!el || !hand || !ring) return;
      const r = el.getBoundingClientRect();
      const size = Math.min(r.width, r.height) * 0.9;
      hand.style.left = `${r.left + r.width / 2}px`;
      hand.style.top = `${r.top + r.height * 0.55}px`;
      ring.style.left = `${r.left + r.width / 2 - size / 2}px`;
      ring.style.top = `${r.top + r.height / 2 - size / 2}px`;
      ring.style.width = ring.style.height = `${size}px`;
      hand.hidden = ring.hidden = false;
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [podSel]);

  if (!podSel) return null;
  return (
    <>
      <div ref={ringRef} className="guide-ring guide-ring-round" hidden aria-hidden />
      <div ref={handRef} className="guide-hand" hidden aria-hidden>
        <Icon name="hand" />
      </div>
    </>
  );
}
