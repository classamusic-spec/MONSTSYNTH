# 4 · Component architecture

Monster Synth is a React + TypeScript single-page PWA built with Vite. The code is split into **three layers** so UI experiments never require touching the audio engine, and musical rules can be unit-tested without a browser.

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. PRESENTATION & MONSTER INTERACTION        src/ui/  (React, CSS, SVG)  │
│    screens, monsters, gestures, animation, coach, Parent Space          │
└───────────────▲──────────────────────────────┬──────────────────────────┘
                │ onNote / onFrame / events     │ press / move / release,
                │ (visual bus)                  │ play, record, undo …
┌───────────────┴──────────────────────────────▼──────────────────────────┐
│ 2. MONSTER MAGIC — music intelligence                                    │
│    pure rules   src/magic/  scales, quantize, looper rules, sequencing,  │
│                             arrangement, painting→notes, templates       │
│    runtime      src/studio/ Studio: gestures → in-scale notes, recording │
│                             sessions, transport, visual timing, export   │
└──────────────────────────────────────────────┬──────────────────────────┘
                                               │ noteOn / trigger / channels
┌──────────────────────────────────────────────▼──────────────────────────┐
│ 3. AUDIO ENGINE                     src/audio/  (Web Audio API only)      │
│    AudioEngine, Channel strips, Voices (synth, FM bell, drums, sampler),  │
│    presets (data), master protection, look-ahead Transport, mic, WAV     │
└──────────────────────────────────────────────────────────────────────────┘
        state & persistence: src/model/ (types, schema, edits) · src/store/ (zustand, IndexedDB)
```

**Dependency rule:** `ui → studio → magic/model → (nothing)` and `studio → audio → (nothing)`. The audio layer never imports songs, scales or React; `magic/` and `model/` never import audio nodes or the DOM.

## Source map

| Path | Responsibility |
|---|---|
| `src/model/types.ts` | Project, Track, Clip, NoteEvent, Arrangement, Painting, Settings |
| `src/model/monsters.ts` | Monster catalogue (role, colours, register, presets, glyph), FX buddies, mode capabilities |
| `src/model/project.ts` | Factories and selectors (`createProject`, `activeClip`, `songBeats`) |
| `src/model/schema.ts` | Versioned migrations + sanitising loaders for projects and settings |
| `src/model/edits.ts` | Pure, immutable edits (record note, cycle fx, add/bench monster, strokes …) |
| `src/magic/scales.ts` | Scale tables, step → MIDI, pad chords, Mimic transposition |
| `src/magic/timing.ts` | wrap, soft quantize, drum snap + bounce test, grid slots, note-end snapping, grid lines / next occurrence |
| `src/magic/recorder.ts` | Looper placement and "replace, don't pile up" insertion rules |
| `src/magic/sequence.ts` | `collectEvents(project, from, to, mode)` — the sequencer's brain |
| `src/magic/steps.ts` | Beat Hop: cells of a loop (`projectGrid`, wrap-aware `cellOf`), drum rows, `writeCell` (exact beats, per-beat and per-loop caps), tap cycles, groove velocities, and Tidy (`isTidy`, `snapNotes`) |
| `src/magic/grooves.ts` | The wand's ready-made drum grooves (the first is the Monster Band beat) |
| `src/magic/arrange.ts` | Monster Blocks operations and Magic auto-arrangement |
| `src/magic/painting.ts` | Strokes → notes |
| `src/magic/templates.ts`, `names.ts` | Starter band song, playful song names |
| `src/studio/studio.ts` | **Studio** singleton: wake/unlock, live notes, rolls, recording sessions, transport control, visual timing queue, mic, sync store → engine |
| `src/studio/notes.ts` | Step → `NoteRequest` (pitches, chords, drum pads, Mimic bend) |
| `src/studio/visualBus.ts` | `onNote`, `onFrame`, `onStudioEvent` pub/sub |
| `src/studio/export.ts` | Offline render → WAV, share/download |
| `src/audio/engine.ts` | Master chain, Echo & Gloop buses, channels, voice allocation/limiting |
| `src/audio/channel.ts` | Per-monster strip: Chomper, pan, volume, sends, Wiggle LFO |
| `src/audio/voices/*` | `SynthVoice`, `BellVoice`, `DrumVoice`, `SamplerVoice` |
| `src/audio/presets.ts` | Every sound as plain data |
| `src/audio/transport.ts` | Worker-clocked look-ahead scheduler |
| `src/audio/context.ts` | AudioContext creation, mobile unlock, audible time, input latency |
| `src/audio/mic.ts`, `wav.ts`, `dsp.ts` | Microphone capture + processing, WAV codec, envelopes/curves/IR |
| `src/store/store.ts` | Zustand store, `commit` (undo history, coalescing), undo/redo, groups |
| `src/store/actions.ts` | Boot, songs (open/new/copy/rename/delete), settings, navigation |
| `src/store/persistence.ts`, `idb.ts` | Debounced autosave, IndexedDB with in-memory fallback |
| `src/ui/shell/*` | AppShell, NavDock, TransportRail (+LoopRing), WakeOverlay, ParentGate, BubbleLayer, Coach, Finale, RotateHint, Sky, Logo |
| `src/ui/lab/*` | LabScreen, StageScene, MonsterPod (squish gestures), PodTools, PlaySurface (keys), StepGrid + DrumRows + BeatRuler (Beat Hop, the grid face of the keys; StepGrid picks a `GridLane` per monster: `DRUM_LANE` for Boom now, the bead lane next), SurfaceSide (flip button, tidy magnet), VoiceButton, MonsterTray, MagicPanel, glyphs, eye tracking |
| `src/ui/monsters/*` | `MonsterArt` (SVG cast), accessories (costumes), `FxBuddy`, note reactions (WAAPI), shape helpers |
| `src/ui/blocks/*` | BlocksScreen, note thumbnails |
| `src/ui/paint/*` | PaintScreen (canvas, tools, palette) |
| `src/ui/songs/*` | SongsScreen, SongPortrait |
| `src/ui/parent/*` | ParentSpace |

## Key runtime paths

**Touch → sound (latency-critical).** `pointerdown` on a key → `studio.press()` → `noteRequest()` (scale lock) → `engine.noteOn()` at `ctx.currentTime`. No React state is touched before the sound starts; the key's pressed look is set directly on the DOM node. Visuals are emitted synchronously on the visual bus.

**Loop playback.** A Web Worker ticks every 25 ms → `Transport.tick()` asks `studio.provide(from, to)` (which calls `collectEvents`) for the next 120 ms → each event is scheduled sample-accurately with `engine.trigger(req, when, dur)` and queued for animation at `when`. One `requestAnimationFrame` loop reads the *audible* time (`getOutputTimestamp`) and releases animations when the sound actually reaches the speakers.

**Edits.** UI calls `commit(p => edit(p, …))`. `commit` stores the previous project for undo (optionally coalescing slider/swipe gestures), clears redo, updates the song shelf entry, and schedules an autosave. The studio subscribes to the store and pushes only *changed* channel settings (preset, effects, volume, samples, tempo) into the engine.

## Rendering strategy

* React renders structure; **per-note animation never re-renders React.** Monster reactions use the Web Animations API on SVG groups; keys, loop ring, playhead and paint effects are updated imperatively from bus listeners.
* Monster art is inline SVG with gradients (no filters on animated elements; the only filter is the Echo ghost tint, applied to two `<use>` copies).
* `memo` on monster art and pods; zustand selectors keep subscriptions narrow.
* Idle cost: one rAF loop; the paint effects canvas skips frames when nothing moves.

## Testing

| Layer | Tooling |
|---|---|
| model + magic | Vitest unit tests (`npm test`): scales, quantize, looper rules, sequencing across window boundaries, arrangement, painting, schema migration |
| full app | Playwright scripts in a real Chromium: `scripts/e2e.mjs` (touch→sound, record, layer, play, undo, autosave), `scripts/e2e-more.mjs` (Blocks, Paint, Add Monster, Mimic with fake mic, grown-up gate, WAV export), `scripts/e2e-edge.mjs` (regressions from code review: feedback sounds never recorded, redo after an empty take, focus loss, rest time, leaving the Lab mid-take, recordings shared by copied songs), `scripts/touch-check.mjs` (real touch events with the normal autoplay policy, glissando, chords, no stuck notes, 4× CPU throttle, bounded voices) |
| accessibility | axe-core audit of every screen (0 violations at release) |
| sound | `scripts/audio-levels.mjs` renders every preset offline and reports peak/RMS; worst-case mix check |
| visuals | `scripts/shots.mjs`, `scripts/tour.mjs`, `scripts/crowded.mjs` screenshot phone/tablet/portrait layouts |

## Extensibility hooks

* New monster → one catalogue entry + presets + an SVG body component.
* New sound → one preset object (no audio code).
* New effect buddy → `FxKind` + channel parameter + buddy art.
* Build-a-Monster → presets are already data; appearance → parameter mappings can generate patches.
* Monster Packs / Worlds → catalogue + art + stage scene per pack; project stores monster kinds, not art.
