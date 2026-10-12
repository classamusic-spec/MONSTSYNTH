import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BOW_MS, CLAP_TIMES, curtainTimes, HOP_MS, songPerformers } from '../../magic/curtain';
import { getState, useApp } from '../../store/store';
import { studio } from '../../studio/studio';
import { onStudioEvent } from '../../studio/visualBus';
import { isReducedMotion, useReducedMotion } from '../hooks/useCaps';
import { Icon } from '../icons/Icon';
import { liteVisuals } from '../monsters/react';
import { star5 } from '../monsters/shapes';

// ─────────────────────────────────────────────────────────────────────────────
// THE CURTAIN CALL — a song reached its end (only a song that had something to
// hear: the studio sends no `finale` otherwise). No words needed:
//   stars rain down (for every song, demos too: they celebrate the music)
//   the band that played hops one by one in row order, then bows together
//     (Monster Blocks' row heads, or the Lab's monsters if they are on screen;
//     sleeping monsters stay asleep, a monster with no blocks just watches)
//   two hands clap while the audience claps (studio.applause, "clap, clap, clap-clap-clap")
//   a big "again" sparkle plays the song again from the top; it waits several
//     seconds, goes at the child's next touch, and never blocks anything once gone
// Screen readers hear it said (a status line) and find the button by its name.
// Reduced motion: soft glows instead of hops and bows; the hands only fade in.
// Anything that moves on ends it at once: the band plays again, another screen,
// an overlay, rest time, the app falling asleep. Every animation is imperative
// (Web Animations), never React state per monster.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ['#ff4f7e', '#ffcf2e', '#4cd964', '#2fd0e8', '#9a5cff', '#ff8a2b'];
/** The hands appear a moment before the first clap, so they can swing into it. */
const CLAP_LEAD_MS = 180;
/** How long "again" waits for a tap when nothing else is touched. */
const AGAIN_MS = 8000;
const LEAVE_MS = 260;
const SAID = 'The song is over. The band takes a bow!';

interface Performer {
  /** Where a glow goes (behind the monster). */
  host: HTMLElement;
  /** What hops and bows: an HTML-level box, so the compositor does the work. */
  body: HTMLElement;
  colour: string;
}

function anim(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

function colourOf(el: Element): string {
  return getComputedStyle(el).getPropertyValue('--c').trim() || '#ffd84d';
}

/** The performers on screen, in row order: Monster Blocks' row heads, else the Lab's monsters. */
function performersOnScreen(cast: string[]): Performer[] {
  const out: Performer[] = [];
  for (const id of cast) {
    const sel = CSS.escape(id);
    const row = document.querySelector<HTMLElement>(`.block-row[data-track="${sel}"]`);
    if (row) {
      const host = row.querySelector<HTMLElement>('.row-avatar');
      const body = host?.querySelector<HTMLElement>(':scope > .monster-svg, :scope > .paint-avatar');
      if (host && body && row.dataset.sleeping !== 'true') out.push({ host, body, colour: colourOf(row.querySelector('.row-head') ?? row) });
      continue;
    }
    const pod = document.querySelector<HTMLElement>(`.pod[data-track="${sel}"]`);
    const body = pod?.querySelector<HTMLElement>('.squish > .monster-svg');
    if (pod && body) out.push({ host: pod.querySelector<HTMLElement>('.pod-hit') ?? pod, body, colour: colourOf(pod) });
  }
  return out;
}

/** A happy hop: crouch, up, a squash on landing. */
function hop(p: Performer, delay: number) {
  anim(
    p.body,
    [
      { translate: '0 0', scale: '1 1' },
      { translate: '0 0', scale: '1.08 0.9', offset: 0.15 },
      { translate: '0 -14%', scale: '0.95 1.07', offset: 0.45 },
      { translate: '0 0', scale: '1.08 0.9', offset: 0.78 },
      { translate: '0 0', scale: '1 1' },
    ],
    { duration: HOP_MS, delay, easing: 'ease-out', id: 'curtain-hop' },
  );
}

/** The bow: down towards the feet, eyes closed for a held moment, back up. */
function bow(p: Performer, delay: number, lids: boolean) {
  anim(
    p.body,
    [
      { scale: '1 1' },
      { scale: '1.07 0.8', offset: 0.3 },
      { scale: '1.07 0.8', offset: 0.62 },
      { scale: '1 1' },
    ],
    { duration: BOW_MS, delay, easing: 'ease-in-out', id: 'curtain-bow' },
  );
  if (!lids) return;
  // Eyes shut during the bow, then back to whatever they were doing (blinking, Grumble's heavy lids).
  p.body.querySelectorAll('.m-lid').forEach((lid) =>
    anim(lid, [{ transform: 'scaleY(1)', offset: 0.22 }, { transform: 'scaleY(1)', offset: 0.68 }], { duration: BOW_MS, delay, id: 'curtain-lids' }),
  );
}

/** Reduced motion: a soft light in the monster's colour swells behind it and fades (opacity only). */
function glowAt(p: Performer, delay: number) {
  const g = document.createElement('i');
  g.className = 'cheer-glow curtain-glow';
  g.setAttribute('aria-hidden', 'true');
  g.style.setProperty('--glow', p.colour);
  p.host.prepend(g);
  const a = anim(g, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 900, delay, easing: 'ease-out', id: 'curtain-glow' });
  if (a) a.onfinish = a.oncancel = () => g.remove();
  else g.remove();
}

function cancelCurtain() {
  if (typeof document.getAnimations !== 'function') return;
  for (const a of document.getAnimations()) if (a.id.startsWith('curtain-')) a.cancel();
}

/** The hands clap on the audience's rhythm: apart between claps, together on each clap. */
function clapHands(root: HTMLElement) {
  const times = CLAP_TIMES.map((t) => t * 1000 + CLAP_LEAD_MS);
  const total = times[times.length - 1] + 360;
  const swing = (open: string, shut: string): Keyframe[] => {
    const f: Keyframe[] = [{ transform: open, offset: 0, easing: 'ease-in' }];
    let prev = 0;
    for (const t of times) {
      if (prev > 0) f.push({ transform: open, offset: (prev + t) / 2 / total, easing: 'ease-in' });
      f.push({ transform: shut, offset: t / total, easing: 'ease-out' });
      prev = t;
    }
    f.push({ transform: shut, offset: 1 });
    return f;
  };
  anim(root.querySelector('.clap-l'), swing('rotate(-18deg)', 'rotate(0deg)'), { duration: total, id: 'curtain-clap' });
  anim(root.querySelector('.clap-r'), swing('rotate(18deg)', 'rotate(0deg)'), { duration: total, id: 'curtain-clap' });
  const flash: Keyframe[] = [{ opacity: 0, offset: 0 }];
  times.forEach((t, i) => {
    // Each flash fades before the next clap begins (offsets never go backwards).
    const fade = Math.min(t + 110, (times[i + 1] ?? total) - 30);
    flash.push({ opacity: 0, offset: (t - 20) / total }, { opacity: 1, offset: t / total }, { opacity: 0, offset: fade / total });
  });
  flash.push({ opacity: 0, offset: 1 });
  anim(root.querySelector('.clap-burst'), flash, { duration: total, id: 'curtain-clap' });
}

export function Finale() {
  const reduced = useReducedMotion();
  /** Stars (and hands): a new key for every song's end. 0 = nothing on screen. */
  const [run, setRun] = useState(0);
  const [clap, setClap] = useState(false);
  const [again, setAgain] = useState<'off' | 'on' | 'leaving'>('off');
  const [said, setSaid] = useState('');
  const clapRef = useRef<HTMLSpanElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const againFocused = useRef(false);
  const hideAgainRef = useRef<() => void>(() => {});

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let active = false;
    let againUp = false;
    const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));

    const onDown = (e: PointerEvent) => {
      // A tap on "again" itself plays; any other touch (which still does its own job) sends it away.
      if (againRef.current?.contains(e.target as Node)) return;
      hideAgain();
    };
    const hideAgain = () => {
      if (!againUp) return;
      againUp = false;
      window.removeEventListener('pointerdown', onDown, true);
      setAgain('leaving');
      later(LEAVE_MS, () => setAgain('off'));
    };
    hideAgainRef.current = hideAgain;
    const autoHide = () => (againFocused.current ? later(1500, autoHide) : hideAgain());
    const showAgain = () => {
      againUp = true;
      setAgain('on');
      window.addEventListener('pointerdown', onDown, true);
      later(AGAIN_MS, autoHide);
    };

    const end = () => {
      timers.forEach(clearTimeout);
      timers = [];
      window.removeEventListener('pointerdown', onDown, true);
      againUp = false;
      cancelCurtain();
      if (!active) return;
      active = false;
      setRun(0);
      setClap(false);
      setAgain('off');
      setSaid('');
    };

    const offEvent = onStudioEvent((e) => {
      if (e.type !== 'finale') return;
      end();
      active = true;
      const still = isReducedMotion();
      const cast = performersOnScreen(songPerformers(getState().project));
      const t = curtainTimes(cast.length);
      setRun((n) => n + 1);
      setSaid(SAID);
      cast.forEach((p, i) => (still ? glowAt(p, t.hops[i]) : hop(p, t.hops[i])));
      // Lids live inside the drawings (a repaint): slow devices keep to the composited bow.
      const lids = !still && !liteVisuals();
      cast.forEach((p) => (still ? glowAt(p, t.bow) : bow(p, t.bow, lids)));
      later(t.clap - CLAP_LEAD_MS, () => setClap(true));
      later(t.clap, () => studio.applause());
      later(t.again, showAgain);
      later(t.done, () => {
        setRun(0);
        setClap(false);
      });
    });
    const offStore = useApp.subscribe((s, prev) => {
      if (!active) return;
      const movedOn =
        (s.transport.playing && !prev.transport.playing) ||
        s.screen !== prev.screen ||
        (s.overlay !== null && s.overlay !== prev.overlay) ||
        (s.resting && !prev.resting) ||
        (!s.awake && prev.awake);
      if (movedOn) end();
    });
    return () => {
      offEvent();
      offStore();
      end();
    };
  }, []);

  // The hands clap in time with the applause (with reduced motion they only fade in).
  useEffect(() => {
    if (clap && clapRef.current && !isReducedMotion()) clapHands(clapRef.current);
  }, [clap]);

  return (
    <>
      <p className="sr-only" role="status">
        {said}
      </p>
      {run > 0 && (
        <div className="finale" aria-hidden key={run}>
          {!reduced &&
            Array.from({ length: 28 }, (_, i) => (
              <svg
                key={i}
                className="confetti"
                viewBox="0 0 20 20"
                style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${1.8 + (i % 5) * 0.25}s` }}
              >
                <path d={star5(10, 10, 9)} fill={COLORS[i % COLORS.length]} />
              </svg>
            ))}
        </div>
      )}
      {(clap || again !== 'off') && (
        <div className="curtain">
          {clap && (
            <span ref={clapRef} className="finale-clap" aria-hidden key={run}>
              <Icon name="clap" />
            </span>
          )}
          {again !== 'off' && (
            <button
              ref={againRef}
              type="button"
              className="curtain-again"
              data-leaving={again === 'leaving'}
              aria-label="Play the song again"
              onClick={() => {
                // A keyboard or switch user keeps their place: focus moves to Play (now Stop).
                const focused = document.activeElement === againRef.current;
                hideAgainRef.current();
                studio.play();
                if (focused) document.querySelector<HTMLElement>('.t-play')?.focus();
              }}
              onFocus={() => (againFocused.current = true)}
              onBlur={() => (againFocused.current = false)}
            >
              <span className="curtain-again-face">
                <Icon name="again" />
              </span>
              {Array.from({ length: 6 }, (_, k) => (
                <i key={k} className="curtain-spark" style={{ '--k': k } as CSSProperties} aria-hidden />
              ))}
            </button>
          )}
        </div>
      )}
    </>
  );
}
