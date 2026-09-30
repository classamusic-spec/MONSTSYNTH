// ─────────────────────────────────────────────────────────────────────────────
// AudioContext lifecycle & mobile unlock.
//
// Browsers only allow sound after a user gesture ("activation"): pointerup /
// touchend / click / keydown — *not* pointerdown on touch screens. Monster Synth
// therefore opens with the monsters asleep; the first tap anywhere wakes them,
// which unlocks audio and plays a hello.
// ─────────────────────────────────────────────────────────────────────────────

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;

export function audioSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext || (window as WebkitWindow).webkitAudioContext);
}

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext!;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}

/** Must be called from inside a user-gesture handler. Resolves true once audio runs. */
export async function unlockAudio(): Promise<boolean> {
  // iOS: play through the ring/silent switch like a real instrument app would.
  try {
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
  const c = getAudioContext();
  // Older iOS needs a sound to start inside the gesture: a one-sample silent buffer.
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      /* resumed later by another gesture */
    }
  }
  return c.state === 'running';
}

/**
 * The AudioContext time currently leaving the speakers. Visuals use it so a
 * monster squashes exactly when its note is heard, not when it is scheduled.
 */
export function audibleTime(c: AudioContext): number {
  const ts = typeof c.getOutputTimestamp === 'function' ? c.getOutputTimestamp() : null;
  if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
    const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    // Guard against browsers that report stale timestamps.
    if (Math.abs(t - c.currentTime) < 0.5) return t;
  }
  return c.currentTime - (c.outputLatency || c.baseLatency || 0);
}

/**
 * How late a child's tap arrives compared with what they hear: output latency
 * plus a typical touch-screen delay. Recording subtracts it so loops land on beat.
 */
export function inputCompensation(c: AudioContext): number {
  const out = c.outputLatency || c.baseLatency || 0.01;
  return Math.min(0.2, out + 0.025);
}
