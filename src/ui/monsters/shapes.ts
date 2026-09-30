// Procedural path helpers for monster silhouettes (computed once at import).

const f = (n: number) => Math.round(n * 10) / 10;

/** A fuzzy, furry circle: bumps alternate between two radii, joined by smooth curves. */
export function fuzzyCircle(cx: number, cy: number, r: number, bump: number, count: number, seed = 1): string {
  const pts: [number, number][] = [];
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count * 2; i++) {
    const a = (i / (count * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r + bump * (0.7 + rand() * 0.6) : r - bump * 0.15;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = '';
  for (let i = 0; i < pts.length; i += 2) {
    const tip = pts[i];
    const valley = pts[(i + 1) % pts.length];
    const nextTip = pts[(i + 2) % pts.length];
    if (i === 0) d += `M${f((valley[0] + pts[pts.length - 1][0]) / 2)},${f((valley[1] + pts[pts.length - 1][1]) / 2)} `;
    d += `Q${f(tip[0])},${f(tip[1])} ${f((tip[0] + valley[0]) / 2)},${f((tip[1] + valley[1]) / 2)} `;
    d += `Q${f(valley[0])},${f(valley[1])} ${f((valley[0] + nextTip[0]) / 2)},${f((valley[1] + nextTip[1]) / 2)} `;
  }
  return d + 'Z';
}

/** A soft star/sun with rounded points (Spark). */
export function roundStar(cx: number, cy: number, outer: number, inner: number, points: number, rot = -90): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[pts.length - 1], pts[0]);
  let d = `M${f(start[0])},${f(start[1])} `;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % pts.length]);
    d += `Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])} `;
  }
  return d + 'Z';
}

/** Four-pointed twinkle used for sparkles and star glyphs. */
export function twinkle(cx: number, cy: number, r: number): string {
  const k = r * 0.28;
  return `M${f(cx)},${f(cy - r)} Q${f(cx + k)},${f(cy - k)} ${f(cx + r)},${f(cy)} Q${f(cx + k)},${f(cy + k)} ${f(cx)},${f(cy + r)} Q${f(cx - k)},${f(cy + k)} ${f(cx - r)},${f(cy)} Q${f(cx - k)},${f(cy - k)} ${f(cx)},${f(cy - r)} Z`;
}

/** Five-pointed star (keys, stamps, finale confetti). */
export function star5(cx: number, cy: number, outer: number, inner = outer * 0.48): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 === 0 ? outer : inner;
    d += `${i === 0 ? 'M' : 'L'}${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)} `;
  }
  return d + 'Z';
}
