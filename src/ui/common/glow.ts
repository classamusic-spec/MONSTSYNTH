// Light an element up for a moment (data-glow="true", styled in CSS). Notes can
// repeat faster than a glow lasts: each new glow extends the light, and only
// the newest one switches it off, so a key never flickers out early.

const latest = new WeakMap<HTMLElement, Map<string, number>>();
let seq = 0;

export function glow(el: HTMLElement, ms: number, attr = 'glow') {
  const id = ++seq;
  let byAttr = latest.get(el);
  if (!byAttr) latest.set(el, (byAttr = new Map()));
  byAttr.set(attr, id);
  el.dataset[attr] = 'true';
  setTimeout(() => {
    if (byAttr.get(attr) === id) el.dataset[attr] = 'false';
  }, ms);
}
