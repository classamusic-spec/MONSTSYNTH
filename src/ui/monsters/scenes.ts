// ─────────────────────────────────────────────────────────────────────────────
// Little scenes for changes, so a child SEES what a tap changed.
//   costume poof → a puff of coloured smoke and a squash-hop; the new hat drops a
//                  short way and lands on the preview's second note (the preview
//                  starts at once, nothing in the sound waits for the picture);
//                  a costume with no hat: the old one flies off and pops
//   Chomper      → the Chomper buddy bites on every note its monster plays,
//                  dropping a few crumbs when it is on "a lot"
// Visual only: no sound, no studio timing. Imperative (Web Animations), never
// React state; every animation id starts with "poof-" or "chomp-".
// Reduced motion: a soft glow instead (the new hat simply fades in).
// Lite visuals (a slow tablet): only whole-box moves (smoke, hop, the buddy's
// squash); nothing animated inside the drawings.
// ─────────────────────────────────────────────────────────────────────────────

export interface SceneLook {
  reduced: boolean;
  lite: boolean;
}

function anim(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, opts);
}

const short = () => window.innerHeight < 560;

/** A soft light in the monster's colour, behind it (opacity only). */
function glow(root: HTMLElement, id: string) {
  const host = root.querySelector<HTMLElement>('.pod-hit') ?? root;
  const g = document.createElement('i');
  g.className = 'cheer-glow';
  g.setAttribute('aria-hidden', 'true');
  g.style.setProperty('--glow', getComputedStyle(root).getPropertyValue('--c').trim() || '#ffd84d');
  host.prepend(g);
  const a = anim(g, [{ opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', id });
  if (a) a.onfinish = a.oncancel = () => g.remove();
  else g.remove();
}

// ── Costume poof ────────────────────────────────────────────────────────────

const PUFFS = 6;

/** Stop a poof still running (rapid hat taps restart it cleanly). */
function cancelPoof(root: HTMLElement) {
  root.querySelectorAll('.poof-puff, .poof-oldhat').forEach((n) => n.remove());
  for (const a of root.getAnimations?.({ subtree: true }) ?? []) if (String(a.id).startsWith('poof-')) a.cancel();
}

/** A copy of a hat that can live on next to the new costume: its ids (and what points at them) renamed. */
function hatCopy(hat: Element): Element {
  const copy = hat.cloneNode(true) as Element;
  const ids = new Map<string, string>();
  for (const el of [copy, ...copy.querySelectorAll('[id]')]) {
    const id = el.getAttribute('id');
    if (!id) continue;
    ids.set(id, `${id}-poof`);
    el.setAttribute('id', `${id}-poof`);
  }
  if (ids.size) {
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const attr of ['fill', 'stroke', 'filter', 'clip-path', 'href']) {
        const v = el.getAttribute(attr);
        if (!v) continue;
        const m = v.match(/#([^)\s]+)/);
        if (m && ids.has(m[1])) el.setAttribute(attr, v.replace(`#${m[1]}`, `#${ids.get(m[1])}`));
      }
    }
  }
  return copy;
}

/**
 * The monster changed costume. `oldHat` is a copy of the costume it wore (its
 * `.m-accessory`), so a costume without a hat can still show the old one fly off.
 */
export function costumePoof(root: HTMLElement, oldHat: Element | null, look: SceneLook) {
  const wrap = root.querySelector<HTMLElement>('.monster-wrap');
  const svg = root.querySelector<SVGSVGElement>('.squish > .monster-svg');
  if (!wrap || !svg) return;
  cancelPoof(root);
  const hat = svg.querySelector<SVGGElement>('.m-hat');

  if (look.reduced) {
    glow(root, 'poof-glow');
    anim(hat, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', id: 'poof-fade' });
    return;
  }

  // Smoke: soft puffs in the monster's colours swell out from its middle and fade.
  const n = look.lite ? 3 : PUFFS;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'poof-puff';
    p.setAttribute('aria-hidden', 'true');
    wrap.appendChild(p);
    const a = (i / n) * Math.PI * 2 + 0.4;
    const dx = Math.cos(a) * 26;
    const dy = Math.sin(a) * 16 - 4;
    const s = 0.9 + (i % 3) * 0.15;
    const anim1 = anim(
      p,
      [
        { transform: 'translate(0, 0) scale(.3)', opacity: 0 },
        { transform: `translate(${(dx * 0.45).toFixed(1)}cqmin, ${(dy * 0.45).toFixed(1)}cqmin) scale(${s.toFixed(2)})`, opacity: 0.95, offset: 0.3 },
        { transform: `translate(${dx.toFixed(1)}cqmin, ${(dy - 6).toFixed(1)}cqmin) scale(${(s * 1.25).toFixed(2)})`, opacity: 0 },
      ],
      { duration: 480, delay: i * 18, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards', id: 'poof-smoke' },
    );
    if (anim1) anim1.onfinish = anim1.oncancel = () => p.remove();
    else p.remove();
  }

  // Under the smoke: a squash and a little hop, landing as the second preview note sounds.
  const h = short() ? 3 : 5;
  const stage = root.closest('.stage') ?? root;
  const stageTop = stage.getBoundingClientRect().top;
  const hopPx = (svg.getBoundingClientRect().height * h) / 100;
  anim(
    svg,
    [
      { translate: '0 0', scale: '1 1' },
      { translate: '0 0', scale: '1.12 0.86', offset: 0.18 },
      { translate: `0 -${h}%`, scale: '0.95 1.06', offset: 0.48 },
      { translate: '0 0', scale: '1.07 0.93', offset: 0.76 },
      { translate: '0 0', scale: '1 1' },
    ],
    { duration: 440, easing: 'ease-out', id: 'poof-hop' },
  );
  if (look.lite) return;

  // Room above the hat at the top of the hop: a hat never pokes out of the stage's top edge.
  const room = (top: number) => top - stageTop - hopPx - 2;

  if (hat) {
    // The new hat drops a short way, from a little bigger, and lands with a squash.
    // Short stages (phones) have little room above a head: a smaller drop, less growth.
    const hb = hat.getBoundingClientRect();
    const space = Math.max(0, room(hb.top));
    const grow = hb.height > 0 ? Math.min(0.3, space / hb.height) : 0;
    const ctm = hat.getScreenCTM();
    const pxPerUnit = ctm ? Math.hypot(ctm.c, ctm.d) || 1 : 1;
    const drop = Math.max(0, Math.min(24, space - grow * hb.height)) / pxPerUnit;
    anim(
      hat,
      [
        { transform: `translateY(${(-drop).toFixed(1)}px) scale(${(1 + grow).toFixed(3)})`, opacity: 0 },
        { transform: `translateY(${(-drop * 0.7).toFixed(1)}px) scale(${(1 + grow * 0.87).toFixed(3)})`, opacity: 1, offset: 0.2 },
        { transform: `translateY(0) scale(${(1 + Math.min(0.08, grow)).toFixed(3)})`, offset: 0.55, easing: 'ease-out' },
        { transform: 'translateY(0) scale(1.14, 0.84)', offset: 0.7 },
        { transform: 'translateY(0) scale(0.96, 1.05)', offset: 0.86 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 400, easing: 'ease-in', id: 'poof-hat' },
    );
  } else if (oldHat) {
    // No hat now: the old one flies up out of the smoke, spins a little and pops.
    const body = svg.querySelector('.m-body');
    if (!body) return;
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'poof-oldhat');
    g.setAttribute('aria-hidden', 'true');
    g.appendChild(hatCopy(oldHat));
    body.appendChild(g);
    const top = g.getBoundingClientRect().top;
    const up = Math.max(0, Math.min(short() ? 10 : 22, room(top)));
    const a = anim(
      g,
      [
        { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1 },
        { transform: `translateY(-${up * 0.7}px) rotate(-14deg) scale(1.08)`, opacity: 1, offset: 0.5 },
        { transform: `translateY(-${up}px) rotate(-22deg) scale(1.45)`, opacity: 0 },
      ],
      { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', id: 'poof-oldhat' },
    );
    if (a) a.onfinish = a.oncancel = () => g.remove();
    else g.remove();
  }
}

// ── Chomper chomps ──────────────────────────────────────────────────────────

/** Crumbs in the air at once, per monster (a fast drum roll stays light). */
export const MAX_CRUMBS = 6;

function crumbs(root: HTMLElement, buddy: Element) {
  const wrap = root.querySelector<HTMLElement>('.monster-wrap');
  if (!wrap || typeof wrap.animate !== 'function') return;
  const n = Math.min(2, MAX_CRUMBS - wrap.querySelectorAll(':scope > .chomp-crumb').length);
  if (n <= 0) return;
  const wb = wrap.getBoundingClientRect();
  const bb = buddy.getBoundingClientRect();
  // The wrap may be scaled down (a friend, not the spotlight monster): back to its own pixels.
  const k = wrap.offsetWidth ? wb.width / wrap.offsetWidth : 1;
  const x = (bb.left - wb.left + bb.width * 0.5) / k;
  const y = (bb.top - wb.top + bb.height * 0.8) / k;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'chomp-crumb';
    c.setAttribute('aria-hidden', 'true');
    c.style.left = `${x.toFixed(1)}px`;
    c.style.top = `${y.toFixed(1)}px`;
    c.style.background = i % 2 ? '#ffffff' : '#c58bff';
    wrap.appendChild(c);
    const dx = (i % 2 ? 1 : -1) * (6 + Math.random() * 10);
    const dy = 20 + Math.random() * 16;
    const a = c.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) rotate(${(dx * 14).toFixed(0)}deg)`, opacity: 0 },
      ],
      { duration: 600, easing: 'cubic-bezier(.3,0,.8,1)', id: 'chomp-crumb' },
    );
    a.onfinish = a.oncancel = () => c.remove();
  }
}

/** The Chomper buddy bites as its monster plays a note (`level`: 1 a little, 2 a lot). */
export function chompOnNote(root: HTMLElement, level: number, look: SceneLook) {
  if (level <= 0) return;
  const buddy = root.querySelector('.chomper-buddy');
  if (!buddy) return;
  if (look.reduced) {
    anim(buddy, [{ opacity: 1 }, { opacity: 0.55, offset: 0.35 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', id: 'chomp-glow' });
    return;
  }
  anim(buddy, [{ scale: '1 1' }, { scale: '1.14 0.86', offset: 0.35 }, { scale: '1 1' }], { duration: 180, easing: 'ease-out', id: 'chomp' });
  if (look.lite) return;
  anim(buddy.querySelector('.fx-jaw'), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.12)', offset: 0.4 }, { transform: 'scaleY(1)' }], {
    duration: 170,
    easing: 'ease-out',
    id: 'chomp-jaw',
  });
  if (level >= 2) crumbs(root, buddy);
}
