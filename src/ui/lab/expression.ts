// Ephemeral per-monster expression set by squishing (pinching) a monster:
// -1 = squished (short, tight) … +1 = stretched (long, open). Applies to every
// note that monster plays until it is squished again.

const sizes = new Map<string, number>();
const listeners = new Set<(trackId: string, size: number) => void>();

export function getSize(trackId: string): number {
  return sizes.get(trackId) ?? 0;
}

export function setSize(trackId: string, size: number) {
  const v = Math.max(-1, Math.min(1, size));
  sizes.set(trackId, v);
  listeners.forEach((l) => l(trackId, v));
}

export function onSize(l: (trackId: string, size: number) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
