# 7 · Audio-engine architecture

Plain **Web Audio API** — no audio libraries, no sample packs. Every sound is synthesised from data, so it is small, offline-ready, re-tunable per song, and renders identically live and offline (export).

## Signal flow

```
 voices ─┐
 voices ─┼→ Channel (one per monster) ──→ master bus ─→ glue compressor ─→ limiter ─→ soft clip ─→ output gain ─→ speakers
 voices ─┘    │  Chomper (tanh + tone filter, dry/wet)      ▲      (-16 dB, 3:1)   (-5 dB, 20:1)  (tanh)   (volume × parent ceiling)
              │  pan · volume                               │
              ├─ Echo send ──→ Echo bus: dotted-⅛ delay ⟲ lowpass/highpass feedback ─┤
              └─ Gloop send ─→ Gloop bus: pre-delay → convolver (procedural IR) ──────┘
   Wiggle LFO (per channel, cents) ─→ detune of every oscillator on that channel
```

* **AudioEngine** (`src/audio/engine.ts`) owns the master chain, the two effect buses, the channel map and voice allocation. It works on any `BaseAudioContext`, so the same class drives live play (`AudioContext`) and export (`OfflineAudioContext`).
* **Channel** (`src/audio/channel.ts`) is a monster's strip: Chomper insert (always-on waveshaper blended dry/wet, pre-gain up to ×11, post-gain compensation, 5.2 kHz tame filter), stereo pan (subtle per role), volume, Echo and Gloop sends, and a Wiggle LFO whose output is patched into each voice's oscillator detune.
* **Voices** (`src/audio/voices/`) are created per note and torn down when silent (`NodeBag` tracks every node, source and modulation connection for clean disposal).

| Voice | Used by | Technique |
|---|---|---|
| `SynthVoice` | Bloop, Grumble, Puff, Mimic's "la" | 1–4 oscillators per pitch (+ noise), lowpass with envelope on `detune` (log-domain sweeps), or a 3-band **formant** bank for vowels; pitch envelope ("bloop" scoop, laser "pew"), vibrato, tempo-synced filter wobble, optional drive; chords = several pitch groups in one voice |
| `BellVoice` | Spark | 2-operator **FM**: modulator at an (often inharmonic) ratio, decaying modulation index, optional shimmer partial, optional resonant blip filter |
| `DrumVoice` | Boom | fully synthesised kit: sine-sweep kick + click, noise+body snare, 808-style metallic square bank hats/crash, triple-burst clap, bongos, cowbell, spring "boing" (value curve); kit-wide tune, decay, brightness, drive, "tin can" resonances |
| `SamplerVoice` | Mimic | recorded buffer at `playbackRate = 2^(semitones/12)` (voice pitch *and* speed change — deliberately funny), tone filter, optional ring modulation (robot) |

## Presets are data

`src/audio/presets.ts` defines all 25 sounds as JSON-like objects (`SynthPatch`, `BellPatch`, `DrumPatch`, `VoicePatch`). Adding a sound means adding an object. Playful parameters map onto real synthesis:

| Kid concept | Parameter |
|---|---|
| **Dark ↔ Sparkly** (drag sideways) | filter cutoff ±1.8 octaves · FM index ×2^±1.2 · formant vowel oo→ee · drum brightness |
| **Squish ↔ Stretch** (pinch) | envelope decay/release ×2^±1.2 (pads: attack too), drum decay |
| **Up ↕ down** (drag) | pitch glide through scale steps (portamento per patch) |
| **Hold** | sustain (synths) / roll (drums, bells) |
| **Shake** | Wiggle LFO boost (vibrato) |
| **Costume** | preset |

## Timing: the two-clock scheduler

`src/audio/transport.ts` implements look-ahead scheduling:

* A **Web Worker** posts a tick every **25 ms** (workers keep time while the main thread is busy); falls back to `setInterval` where blob workers are blocked.
* Each tick schedules every event starting in the next **120 ms** at its exact `AudioContext` time (`startTime + beat × 60/bpm`).
* Events come from a provider callback (Monster Magic's `collectEvents`), so the transport knows nothing about songs.
* Tempo changes keep the current beat continuous. Song mode stops itself at the last block and fires `ended` (→ finale).
* Stopping fades every *sequenced* voice in 60 ms and cancels those scheduled in the future; live notes are untouched.

**Animation sync.** Scheduled notes are queued for the UI with their start time; a single rAF loop compares them with the *audible* time from `ctx.getOutputTimestamp()` (fallback: `currentTime − outputLatency`). Monsters react when the note is heard, not when it is scheduled.

## Latency

* `AudioContext({ latencyHint: 'interactive' })`.
* Live notes start at `ctx.currentTime` from the `pointerdown` handler — before any React work.
* `touch-action: none` on playing surfaces (no gesture delay, no double-tap zoom), pointer capture for drags.
* Recording subtracts **input compensation** = output latency + ~25 ms touch delay (capped at 200 ms), so notes land where the child heard them.

## Protecting ears and the mix

1. **Gain staging:** every preset calibrated by offline measurement (`scripts/audio-levels.mjs`): single notes peak around −6 to −13 dBFS; the full starter band peaks at −2.6 dBFS; the worst case (every effect at maximum, every channel at full volume) peaks at −2.1 dBFS.
2. **Voice limiting:** per-monster limits (Grumble 3, Puff 3 chords, Bloop 6, Spark 8, Boom 10) and a global limit of 30; the oldest voice is stolen with a 15 ms fade (no clicks).
3. **Dynamics:** gentle glue compressor → brick-wall-style limiter → tanh soft clipper (transparent below about −6 dBFS).
4. **Volume ceiling:** output gain = child volume × parent ceiling (default 85 %).
5. **Click-free envelopes:** every attack starts from 0 with ≥ 2 ms ramps; releases use exponential targets; sources stop only after the tail.
6. **Loop hygiene:** recorded notes replace older notes in the same slot and loops are capped at 96 notes, so layering never piles into noise.

## Mobile realities handled

| Issue | Handling |
|---|---|
| Autoplay policy: no audio before a user gesture (and `pointerdown` on touch is not an activation event) | Wake screen: first tap (`click`) calls `resume()` synchronously, plays a silent buffer (older iOS), then the hello chord |
| iOS mute switch silences Web Audio | `navigator.audioSession.type = 'playback'` where supported |
| iOS interruptions / backgrounding | stop transport, release notes, flush autosave; if the context is not running on return, the monsters fall asleep and the next tap wakes them |
| Small speakers can't reproduce 65 Hz bass | every bass patch has an octave-up harmonic layer |
| CPU on mid-range tablets | voices are cheap native nodes; one convolver and one delay shared by all monsters; no AudioWorklet needed for the MVP |

## Microphone (Mimic)

`src/audio/mic.ts`: `getUserMedia` (noise suppression and AGC on, echo cancellation off) → `MediaRecorder` → `decodeAudioData` → mono → trim leading/trailing silence (10 ms RMS windows, adaptive threshold, 30 ms pre-roll / 80 ms tail) → cap at 3 s → normalise peak to −1 dBFS → 8 ms / 25 ms fades. Stored as 16-bit WAV in IndexedDB. The stream is opened only when needed and closed 15 s after the last recording, so the browser's microphone indicator goes off.

## Export

`src/studio/export.ts` renders the song (or 4 loops when no blocks are used) through a fresh `AudioEngine` on an `OfflineAudioContext` at 44.1 kHz, then encodes 16-bit stereo WAV. On tablets the share sheet is offered; elsewhere a download.

## Future: AudioWorklet

The engine interface (`noteOn / noteOff / trigger / setTone / setPitch`) is voice-agnostic. Karplus-Strong plucks, wavetables with morphing, granular Mimic, or pitch-preserving voice shifting can be added as AudioWorklet-backed voices without touching Monster Magic or the UI.
