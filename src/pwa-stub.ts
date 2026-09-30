// Replaces virtual:pwa-register in the demo build (no service worker there).
export function registerSW(_opts?: unknown) {
  return () => Promise.resolve();
}
