import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BOW_MS, CLAP_TIMES, curtainCast, curtainTimes, HOP_MS } from '../../magic/curtain';
import type { MonsterKind } from '../../model/types';
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
//     (Monster Blocks' row heads: a song only plays to its end in Blocks;
//     sleeping monsters stay asleep; a monster with no blocks just watches,
//     unless it sang the ending's crash or "ta-da!"). A tap on a performer while
//     it bows makes it hop again with a happy "yay!" (not the sleep toggle).
//   two hands clap while the audience claps (studio.applause, "clap, clap, clap-clap-clap");
//     tapping the hands claps along (one more clap), and never reaches the blocks under them
//   a big "again" sparkle plays the song again from the top; it waits several
//     seconds, goes at the child's next touch, and never blocks anything once gone.
//     Its sparkles count as the button; once tapped, its spot swallows a little
//     one's double tap for a moment. A child who is already busy elsewhere
//     before it comes (editing the song) is not interrupted: it does not come.
// Screen readers hear it said (a status line) and find the button by its name.
// Reduced motion: soft glows instead of hops and bows; the hands only fade in.
// Anything that moves on ends it at once: the band plays again, another screen,
// an overlay, rest time, the app falling asleep or going out of sight. Nobody
// watching when the song ends (Parent Space open, the app hidden): no show.
// Every animation is imperative (Web Animations), never React state per monster.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ['#ff4f7e', '#ffcf2e', '#4cd964', '#2fd0e8', '#9a5cff', '#ff8a2b'];
/** The hands appear a moment before the first clap, so they can swing into it. */
const CLAP_LEAD_MS = 180;
/** The hands' whole show: pop in, clap, fade (`curtain-hands` in curtain.css). */
const HANDS_MS = 1700;
/** A tap on the hands claps along, at most this often. */
const CLAP_TAP_MS = 120;
/** How long "again" waits for a tap when nothing else is touched. */
const AGAIN_MS = 8000;
const LEAVE_MS = 260;
/**
 * After "again" is tapped, its spot keeps swallowing touches this long, and as
 * long again after every further tap there ("tap, tap, tap" must not edit the song).
 */
const SHIELD_MS = 600;
const SAID = 'The song is over. The band takes a bow!';
/** What a child touches when they have moved on to something else (the song's blocks, any control). */
const BUSY = '.blocks-grid, button, a, input, select, textarea';

interface Performer {
  /** Where a glow goes (behind the monster). */
  host: HTMLElement;
  /** What hops and bows: an HTML-level box, so the compositor does the work. */
  body: HTMLElement;
  colour: string;
  /** Monster Blocks' row head (a tap there hops again during the bow). */
  head: HTMLElement | null;
  /** Who says "yay!" when tapped (the painting's row has no voice of its own). */
  monster: MonsterKind | null;
}

function anim(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

function colourOf(el: Element): string {
  return getComputedStyle(el).getPropertyValue('--c').trim() || '#ffd84d';
}

/** The performers on screen, in row order: Monster Blocks' row heads (songs only finish in Blocks). */
function performersOnScreen(cast: string[]): Performer[] {
  const out: Performer[] = [];
  for (const id of cast) {
    const sel = CSS.escape(id);
    const row = document.querySelector<HTMLElement>(`.block-row[data-track="${sel}"]`);
    if (row) {
      const host = row.querySelector<HTMLElement>('.row-avatar');
      const body = host?.querySelector<HTMLElement>(':scope > .monster-svg, :scope > .paint-avatar');
      const kind = row.dataset.monster;
      const monster = kind && kind !== 'paint' ? (kind as MonsterKind) : null;
      if (host && body && row.dataset.sleeping !== 'true') out.push({ host, body, colour: colourOf(row.querySelector('.row-head') ?? row), head: host, monster });
    }
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
  // The hands stay together after the last clap while they fade (no snapping back open).
  anim(root.querySelector('.clap-l'), swing('rotate(-18deg)', 'rotate(0deg)'), { duration: total, fill: 'forwards', id: 'curtain-clap' });
  anim(root.querySelector('.clap-r'), swing('rotate(18deg)', 'rotate(0deg)'), { duration: total, fill: 'forwards', id: 'curtain-clap' });
  const flash: Keyframe[] = [{ opacity: 0, offset: 0 }];
  times.forEach((t, i) => {
    // Each flash fades before the next clap begins (offsets never go backwards).
    const fade = Math.min(t + 110, (times[i + 1] ?? total) - 30);
    flash.push({ opacity: 0, offset: (t - 20) / total }, { opacity: 1, offset: t / total }, { opacity: 0, offset: fade / total });
  });
  flash.push({ opacity: 0, offset: 1 });
  anim(root.querySelector('.clap-burst'), flash, { duration: total, fill: 'forwards', id: 'curtain-clap' });
}

/** A tap on the hands: they squeeze together with a flash (the crowd claps once with them). */
function squeezeHands(root: HTMLElement) {
  anim(root.querySelector('svg'), [{ scale: '1' }, { scale: '0.86 1.05', offset: 0.35 }, { scale: '1' }], { duration: 240, easing: 'ease-out', id: 'curtain-squeeze' });
  anim(root.querySelector('.clap-burst'), [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', id: 'curtain-squeeze' });
}

export function Finale() {
  const reduced = useReducedMotion();
  /** Stars (and hands): a new key for every song's end. 0 = nothing on screen. */
  const [run, setRun] = useState(0);
  const [clap, setClap] = useState(false);
  const [again, setAgain] = useState<'off' | 'on' | 'leaving'>('off');
  /** "Again" was just tapped: its spot swallows the next touch or two for a moment. */
  const [shield, setShield] = useState(false);
  const [said, setSaid] = useState('');
  const clapRef = useRef<HTMLSpanElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const hideAgainRef = useRef<() => void>(() => {});
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastClapTap = useRef(0);
  const raiseShield = () => {
    clearTimeout(shieldTimer.current);
    setShield(true);
    shieldTimer.current = setTimeout(() => setShield(false), SHIELD_MS);
  };

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let active = false;
    let againUp = false;
    /** The child touched something else before "again" came: they have moved on, so it does not come. */
    let touched = false;
    let listening = false;
    let still = false;
    let cast: Performer[] = [];
    /** Until then (while the band hops and bows), a tap on a performer's head makes it hop again. */
    let encoreUntil = 0;
    const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));

    /** The performer whose row head this is, while the band is still on stage. */
    const performerAt = (target: EventTarget | null): Performer | null => {
      if (performance.now() > encoreUntil || !(target instanceof Node)) return null;
      return cast.find((p) => p.head?.contains(target)) ?? null;
    };
    const onDown = (e: PointerEvent) => {
      // The curtain's own pictures, and the performers on stage, answer their own touches.
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('.curtain') || performerAt(target)) return;
      // Any other touch (which still does its own job) sends "again" away. Before it comes, a
      // child busy with the song (a block, a button) is not interrupted: it will not come.
      if (againUp) hideAgain();
      else if (target?.closest(BUSY)) touched = true;
    };
    const onClick = (e: MouseEvent) => {
      // A finger on a bowing monster: one more hop and a happy "yay!", not the sleep toggle
      // under it (the encore would go on without that monster). Keys and switches keep the toggle.
      if (e.detail === 0) return;
      const p = performerAt(e.target);
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      if (still) glowAt(p, 0);
      else hop(p, 0);
      if (p.monster) studio.chirp(p.monster, 'yay');
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('click', onClick, true);
      } else {
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('click', onClick, true);
      }
    };
    const hideAgain = () => {
      if (!againUp) return;
      againUp = false;
      listen(false);
      setAgain('leaving');
      later(LEAVE_MS, () => setAgain('off'));
    };
    hideAgainRef.current = hideAgain;
    // A keyboard or switch user resting on "again" keeps it (it is gone the moment focus leaves).
    const autoHide = () => (againRef.current && document.activeElement === againRef.current ? later(1500, autoHide) : hideAgain());
    const showAgain = () => {
      if (touched) {
        listen(false);
        return;
      }
      againUp = true;
      setAgain('on');
      later(AGAIN_MS, autoHide);
    };

    const end = () => {
      timers.forEach(clearTimeout);
      timers = [];
      listen(false);
      againUp = false;
      touched = false;
      cast = [];
      encoreUntil = 0;
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
      // Nobody is watching (the app is out of sight, or a grown-up has Parent Space open): no show.
      if (document.hidden || getState().overlay !== null) return;
      active = true;
      still = isReducedMotion();
      cast = performersOnScreen(curtainCast(getState().project));
      const t = curtainTimes(cast.length);
      encoreUntil = performance.now() + t.again;
      listen(true);
      setRun((n) => n + 1);
      setSaid(SAID);
      cast.forEach((p, i) => (still ? glowAt(p, t.hops[i]) : hop(p, t.hops[i])));
      // Lids live inside the drawings (a repaint): slow devices keep to the composited bow.
      const lids = !still && !liteVisuals();
      cast.forEach((p) => (still ? glowAt(p, t.bow) : bow(p, t.bow, lids)));
      later(t.clap - CLAP_LEAD_MS, () => setClap(true));
      // Gone the moment they have faded: nothing invisible is left to catch a touch.
      later(t.clap - CLAP_LEAD_MS + HANDS_MS, () => setClap(false));
      later(t.clap, () => studio.applause());
      later(t.again, showAgain);
      later(t.done, () => setRun(0));
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
    const onVisibility = () => document.hidden && end();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offEvent();
      offStore();
      document.removeEventListener('visibilitychange', onVisibility);
      end();
    };
  }, []);

  useEffect(() => () => clearTimeout(shieldTimer.current), []);

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
      {(clap || again !== 'off' || shield) && (
        <div className="curtain">
          {clap && (
            <span
              ref={clapRef}
              className="finale-clap"
              aria-hidden
              key={run}
              onPointerDown={(e) => {
                // The child claps along: one more clap from the crowd, and the hands squeeze.
                // (The picture takes the touch, so the blocks under it are never edited.)
                e.preventDefault();
                const now = performance.now();
                if (now - lastClapTap.current < CLAP_TAP_MS) return;
                lastClapTap.current = now;
                studio.applause(undefined, true);
                if (clapRef.current && !isReducedMotion()) squeezeHands(clapRef.current);
              }}
            >
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
                // A little one's second tap lands on the shield, not on the block under the button.
                raiseShield();
                studio.play();
                if (focused) document.querySelector<HTMLElement>('.t-play')?.focus();
              }}
            >
              <span className="curtain-again-face">
                <Icon name="again" />
              </span>
              {Array.from({ length: 6 }, (_, k) => (
                <i key={k} className="curtain-spark" style={{ '--k': k } as CSSProperties} aria-hidden />
              ))}
            </button>
          )}
          {shield && again === 'off' && <span className="curtain-shield" aria-hidden onPointerDown={raiseShield} />}
        </div>
      )}
    </>
  );
}
