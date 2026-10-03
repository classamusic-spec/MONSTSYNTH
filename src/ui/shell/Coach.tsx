import { useEffect, useRef, useState } from 'react';
import { MODE_CAPS } from '../../model/monsters';
import { activeClip, trackHasLoop } from '../../model/project';
import { getState, labFace, useApp, type AppState } from '../../store/store';
import { studio } from '../../studio/studio';
import { onNote, onStudioEvent } from '../../studio/visualBus';
import { Icon, type IconName } from '../icons/Icon';
import { say } from './bubbles';

// ─────────────────────────────────────────────────────────────────────────────
// Wordless coach. A pointing hand appears only when a child seems stuck:
//   nobody has played yet      → points at a key (or, on Beat Hop, the first big-drum stone)
//   lots of playing, no record → points at Record
//   lots of drumming on Boom   → points at the flip button (Beat Hop)
//   stones placed after Stop   → points at Play
//   first loop made (a take, or stones on the grid) → points at another monster (add a layer)
//   a second monster has a loop → points at "make it a song" (Little) or Monster Blocks (Maker)
// Hints never block anything and can be switched off in Parent Space.
// Play (or Magic) with nothing to hear is answered every time, not once: the
// monster has already said "huh?", a bubble shows what to do, and the hand
// points where the music comes from.
// ─────────────────────────────────────────────────────────────────────────────

interface Way {
  selector: string;
  text: string;
  icon: IconName;
}

/** Where the music comes from, when Play had nothing to play. */
function wayToMusic(s: AppState): Way {
  const looped = s.project.tracks.filter(trackHasLoop);
  const awake = looped.some((t) => !t.sleeping);
  if (s.screen === 'blocks') {
    // Loops wait for blocks; sleeping monsters wait to be woken; otherwise make a loop first.
    if (awake) return { selector: '.block-row[data-empty="false"][data-sleeping="false"] .block[data-on="false"]', text: 'Tap a block!', icon: 'blocks' };
    if (looped.length) return { selector: '.block-row[data-sleeping="true"] .row-avatar', text: 'Wake a monster!', icon: 'zzz' };
    // The screen's own big "Go to the Lab" (the dock's Lab button when it is not there):
    // closer to the finger, and never under the bubble in portrait.
    const go = document.querySelector('.blocks-empty .btn-primary') ? '.blocks-empty .btn-primary' : '.dock-btn[data-screen="lab"]';
    return { selector: go, text: 'Make a loop in the Lab first!', icon: 'lab' };
  }
  if (s.screen === 'paint') return { selector: '.paint-canvas', text: 'Draw your music!', icon: 'brush' };
  if (looped.length && !awake) return { selector: '.loop-badge[data-sleeping="true"]', text: 'Wake a monster!', icon: 'zzz' };
  return { selector: '.t-rec', text: 'Record a loop first!', icon: 'record' };
}

/** Notes in the spotlight monster's loop. */
function spotlightNotes(s: AppState): number {
  const t = s.project.tracks.find((x) => x.id === s.selectedTrackId);
  return (t && activeClip(t)?.notes.length) || 0;
}

interface Target {
  selector: string;
  until: number;
}

export function Coach() {
  const enabled = useApp((s) => s.settings.hints);
  const awake = useApp((s) => s.awake);
  const overlay = useApp((s) => s.overlay);
  const [target, setTarget] = useState<Target | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const done = useRef(new Set<string>());
  /** While the hand answers a "nothing to play", the once-a-session hints wait (and come right after). */
  const answering = useRef(0);

  useEffect(() => {
    if (!enabled || !awake) return;
    let live = 0; // notes played on the Lab's keys
    let touched = false; // anything played in the Lab (keys, stones, drum pictures)
    let boomHits = 0;
    let stones = 0;
    let recorded = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (id: string, selector: string, ms: number) => {
      if (done.current.has(id)) return;
      const now = performance.now();
      // A "nothing to play" answer is on screen: this hint comes right after it.
      if (now < answering.current) {
        timers.push(setTimeout(() => show(id, selector, ms), answering.current - now + 200));
        return;
      }
      // A hint whose target is gone (the child moved on) is not used up: it can come later.
      if (!document.querySelector(selector)) return;
      done.current.add(id);
      setTarget({ selector, until: now + ms });
    };
    const hide = () => setTarget(null);

    timers.push(
      setTimeout(() => {
        if (touched) return;
        const grid = labFace(getState()) === 'grid';
        show('tap-key', grid ? ".step-grid .stone[data-pad='0'][data-col='0']" : '.keys .key:nth-child(3)', 7000);
      }, 3000),
    );
    const offNote = onNote((v) => {
      // Only playing on the Lab's keys counts: auditions in Blocks, Paint and Learn
      // (and Beat Hop's stone previews) must not use up the once-per-session hints.
      const s = getState();
      if (v.source !== 'live' || s.screen !== 'lab') return;
      if (!touched) {
        touched = true;
        hide();
      }
      // Stone previews and drum pictures on the grid are not playing the keys:
      // they never use up the "try Record" count.
      if (labFace(s) === 'grid') return;
      live++;
      if (live === 16 && !recorded) show('try-record', '.t-rec[data-state]', 5000);
      // Drumming away on Boom without recording: its beat grid might be the thing.
      if (v.monster === 'boom' && ++boomHits === 8 && !recorded) show('try-grid', '.surface-flip', 5000);
    });
    // Stones placed with the band stopped (after Stop): show where Play is, once.
    const offStore = useApp.subscribe((s, prev) => {
      if (s.project === prev.project || s.selectedTrackId !== prev.selectedTrackId) return;
      if (s.screen !== 'lab' || labFace(s) !== 'grid' || s.transport.playing || studio.gridWaiting) return;
      if (spotlightNotes(s) > spotlightNotes(prev) && ++stones === 4) show('play-glow', '.t-play', 4000);
    });
    // Counted in monsters with loops, not takes: a re-take on the same monster is
    // still one loop. Read once the store has the new loop (after the delay).
    const looped = () => getState().project.tracks.filter(trackHasLoop).length;
    const countLoop = (delay: number) => {
      timers.push(
        setTimeout(() => {
          const n = looped();
          if (n === 1) show('add-layer', '.pod:not([data-selected="true"]) .pod-hit', 5000);
          // Two monsters with loops make a song: Little Monsters have a button for it, Monster Makers go to Blocks.
          if (n >= 2) show('make-song', !MODE_CAPS[getState().settings.ageMode].magicPanel ? '.t-song' : '.dock-btn[data-screen="blocks"]', 5000);
        }, delay),
      );
    };
    const offEvent = onStudioEvent((e) => {
      if (e.type === 'record-start') {
        recorded = true;
        hide();
      }
      if (e.type === 'record-stop' && e.notes > 0) countLoop(1200);
      // A loop made on the grid (or by the wand); a take counts when it ends (above).
      // Grid hints wait a little: the child is still placing stones.
      if (e.type === 'loop-created' && !getState().transport.recording) countLoop(4000);
    });
    return () => {
      offNote();
      offStore();
      offEvent();
      timers.forEach(clearTimeout);
    };
  }, [enabled, awake]);

  // Nothing to play: a bubble every time (it says what the "huh?" meant), and
  // the hand too when hints are on (not limited to once a session).
  useEffect(
    () =>
      onStudioEvent((e) => {
        if (e.type !== 'nothing-to-play') return;
        const s = getState();
        const way = wayToMusic(s);
        const monster = s.project.tracks.find((t) => t.id === s.selectedTrackId)?.monster;
        say({ text: way.text, icon: way.icon, monster, chirp: null });
        if (s.settings.hints && document.querySelector(way.selector)) {
          answering.current = performance.now() + 4000;
          setTarget({ selector: way.selector, until: answering.current });
        }
      }),
    [],
  );

  // Follow the target element while the hint is visible.
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      if (performance.now() > target.until) {
        setTarget(null);
        return;
      }
      const el = document.querySelector(target.selector);
      if (!el) {
        setTarget(null);
        return;
      }
      const hand = handRef.current;
      const glow = glowRef.current;
      if (!hand || !glow) return;
      const r = el.getBoundingClientRect();
      const size = Math.min(r.width, r.height, 140);
      hand.style.left = `${r.left + r.width / 2}px`;
      hand.style.top = `${r.top + r.height / 2}px`;
      glow.style.left = `${r.left + r.width / 2 - size / 2}px`;
      glow.style.top = `${r.top + r.height / 2 - size / 2}px`;
      glow.style.width = glow.style.height = `${size}px`;
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!target || overlay) return null;
  return (
    <>
      <div ref={glowRef} className="coach-glow" aria-hidden />
      <div ref={handRef} className="coach-hand" aria-hidden>
        <Icon name="hand" />
      </div>
    </>
  );
}
