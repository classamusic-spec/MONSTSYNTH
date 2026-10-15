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
| `src/magic/sequence.ts` | `collectEvents(project, from, to, mode)` — the sequencer's brain; `songHasSound(project, mode)` — would Play make a sound (the guard against silent loops and false finales) |
| `src/magic/steps.ts` | Beat Hop: cells of a loop (`projectGrid`, wrap-aware `cellOf`), drum rows, `writeCell` (exact beats, per-beat and per-loop caps), tap cycles, groove velocities, and Tidy (`isTidy`, `snapNotes`) |
| `src/magic/grooves.ts` | The wand's ready-made drum grooves (the first is the Monster Band beat) |
| `src/magic/arrange.ts` | Monster Blocks operations and Magic auto-arrangement (`magicArrange(project, seed, { beatFirst })` keeps multi-phrase rows such as kept lessons whole, phrase by phrase from block 1, arranges the other layers around them, and returns the same arrangement object when nothing changes); `clipForCell` picks what a tapped gap gets (the phrase to its left in a multi-phrase row) |
| `src/magic/curtain.ts` | The curtain call: `songPerformers(project)` (rows heard somewhere in the song, in row order; agrees with `songHasSound`), `finaleSingers(project)` (who crashes and who sings "ta-da!" on the last downbeat; the studio's finale uses it), `curtainCast(project)` (the bow's cast: the performers plus the finale's singers, in row order; nobody when the song has nothing to hear), `noteRow(note)` (which Blocks row a note belongs to: painting notes first, even in a borrowed voice), `singGate` (a row head reacts at most every 90 ms, Boom's big drum always), `curtainTimes(n)` (hops one by one, bow together, clap, "again"), `applauseHits(seed)` (the audience's *clap, clap, clap-clap-clap*) |
| `src/magic/tickle.ts` | Tickle time, pure: `tickleTap` / `tickleQuiet` (contacts in a sliding window → giggly, more, laugh, level 2, rest; steady drumming calms instead) and `LAUGHS` / `laughNotes` (each monster's giggle, laugh and wheee as data) |
| `src/magic/sky.ts` | The musical sky, pure: `skyStep` (position → scale step 0–9), bell and moon levels, `moonSteps`, `moonLevel` (mashing rings at most every 350 ms) |
| `src/magic/painting.ts` | Strokes → notes |
| `src/magic/templates.ts`, `names.ts` | Starter band song, playful song names |
| `src/studio/studio.ts` | **Studio** singleton: wake/unlock, live notes, rolls, recording sessions, transport control (Play refuses an empty song: a "huh?" and `nothing-to-play`; the finale only follows a song that had sound), `makeSong` / `rearrange` (Magic that plays at once), `audition` (a block's first beats on a `preview:<monster>` channel and a little clock of its own), `chirp` (a monster's "huh?", "yay!", "pop", the falling "bye" when it goes home, and tickle time's "giggle", "laugh" and "wheee"), `invite` / `sendHome` (the Add Monster tray, one undo step each; the first-beat guide's Boom never leaves), `tickle` (every new finger-down on a pod goes to the Tickler in `src/studio/tickle.ts`, which keeps one state per monster, plays laughs only when nothing else is heard, and emits `tickle`), `skyBell` / `moonBell` (the musical sky on Spark's studio channel; never recorded, hushed while a take records), `applause` (the curtain call's claps on the `crowd` channel, or `once` for a single clap when the child taps the hands; never recorded, no visuals, silent while anything plays or the app is hidden; the band starting again hushes it), visual timing queue, mic, sync store → engine |
| `src/studio/notes.ts` | Step → `NoteRequest` (pitches, chords, drum pads, Mimic bend) |
| `src/studio/visualBus.ts` | `onNote`, `onFrame`, `onStudioEvent` pub/sub (events: `wake`, `record-start`, `record-stop`, `loop-created`, `nothing-to-play`, `finale`, `mic-level`, `tickle`; note sources include `sky` and `laugh`, which never count as playing the keys) |
| `src/studio/export.ts` | Offline render → WAV, share/download |
| `src/audio/engine.ts` | Master chain, Echo & Gloop buses, channels, voice allocation/limiting |
| `src/audio/channel.ts` | Per-monster strip: Chomper, pan, volume, sends, Wiggle LFO |
| `src/audio/voices/*` | `SynthVoice`, `BellVoice`, `DrumVoice`, `SamplerVoice` |
| `src/audio/presets.ts` | Every sound as plain data |
| `src/audio/transport.ts` | Worker-clocked look-ahead scheduler |
| `src/audio/context.ts` | AudioContext creation, mobile unlock, audible time, input latency |
| `src/audio/mic.ts`, `wav.ts`, `dsp.ts` | Microphone capture + processing, WAV codec, envelopes/curves/IR |
| `src/store/store.ts` | Zustand store, `commit` (undo history, coalescing), undo/redo, groups; UI-only fields that are never saved (`labView`, `newBlocks`: loops waiting in Blocks) |
| `src/store/actions.ts` | Boot, songs (open/new/copy/rename/delete), settings, navigation |
| `src/store/persistence.ts`, `idb.ts` | Debounced autosave, IndexedDB with in-memory fallback |
| `src/ui/shell/*` | AppShell, NavDock (+ the new-loop dot on Blocks), TransportRail (+LoopRing, the Little-mode Song button), WakeOverlay, ParentGate, BubbleLayer (bubbles chirp "yay"/"huh" by default; `chirp: null` for prompts that are not dead ends), Coach (hints counted from project state, e.g. "make it a song" once two monsters have loops; a hint whose target is missing is not used up; the answer to `nothing-to-play`), Cheer (first-loop jump, sparkles and badge pop; wake bounce; glows under reduced motion), Finale (the curtain call on `finale`: star rain, the performers on screen hop in row order and bow together, clapping hands with `studio.applause()`, then the "again" button that replays the song; a status line for screen readers; its pictures take their own touches so nothing reaches the blocks under them; ends at once on Play, another screen, an overlay, rest time or the app going out of sight, and never starts behind an overlay or while hidden), RotateHint, Sky, Logo |
| `src/ui/lab/*` | LabScreen, StageScene, MonsterPod (squish gestures), PodTools, PlaySurface (keys), StepGrid + DrumRows + BeatRuler (Beat Hop, the grid face of the keys; StepGrid picks a `GridLane` per monster: `DRUM_LANE` for Boom now, the bead lane next), SurfaceSide (flip button, tidy magnet), VoiceButton, MonsterTray (with `trayMotion.ts`: the hello hop and goodbye wave), MagicPanel, glyphs, eye tracking, StageSky (the musical sky and moon: only the bare stage hears it) |
| `src/ui/monsters/tickle.ts`, `scenes.ts` | Imperative character scenes: the giggles face, bubbles, belly laugh and "wheee" hop (tickle time); the costume poof and hat drop; Chomper's bite. All Web Animations on composited boxes, lite and reduced-motion aware |
| `src/ui/monsters/*` | `MonsterArt` (SVG cast), accessories (costumes), `FxBuddy`, note reactions (WAAPI), shape helpers |
| `src/ui/blocks/*` | BlocksScreen (cells are buttons with a roving tab stop; fills, presses and removals are heard through `studio.hit` / `audition` / `chirp`; the playhead writes only the playhead and the playing column's blocks each frame), `useSingingRows` (one `onNote` listener: the matching row head runs `reactToNote`, throttled per row, awake rows only, painting notes on the painting's row), note thumbnails |
| `src/ui/paint/*` | PaintScreen (canvas, tools, palette) |
| `src/ui/songs/*` | SongsScreen, SongPortrait |
| `src/ui/parent/*` | ParentSpace |

## Key runtime paths

**Touch → sound (latency-critical).** `pointerdown` on a key → `studio.press()` → `noteRequest()` (scale lock) → `engine.noteOn()` at `ctx.currentTime`. No React state is touched before the sound starts; the key's pressed look is set directly on the DOM node. Visuals are emitted synchronously on the visual bus.

**Loop playback.** A Web Worker ticks every 25 ms → `Transport.tick()` asks `studio.provide(from, to)` (which calls `collectEvents`) for the next 120 ms → each event is scheduled sample-accurately with `engine.trigger(req, when, dur)` and queued for animation at `when`. One `requestAnimationFrame` loop reads the *audible* time (`getOutputTimestamp`) and releases animations when the sound actually reaches the speakers.

**Play with nothing to hear.** `studio.play()` asks `songHasSound(project, mode)` first. False: no transport starts; the spotlight monster chirps "huh?" and `nothing-to-play` goes out on the bus; the Coach shows a bubble and points where the music comes from. Magic (`rearrange`, `makeSong`) does the same when the arrangement would be silent, and commits nothing. `startTransport` remembers whether a song run had sound, and only such a run ends with the finale.

**The curtain call.** When a song with sound reaches its end, the studio plays the crash and ta-da on the last downbeat and sends `finale` when the transport stops. Finale asks `curtainCast(project)` for the cast, finds them on screen (Blocks row heads by `.block-row[data-track]`; a song only plays to its end in Blocks), and runs the `curtainTimes` timetable with Web Animations on each monster's outer SVG (composited `translate`/`scale`; the lids close inside the drawing unless lite visuals are on): hops in row order, one bow together, then the hands and `studio.applause()` together, then the "again" button. Touches: the hands and "again" (with an invisible ring as wide as its sparkles) take their own touches; after "again" is tapped an invisible shield keeps its spot for 600 ms after each tap there; while the band is on stage a window capture-phase `click` turns a finger tap on a performer's row head into one more hop and `studio.chirp(monster, 'yay')` instead of the sleep toggle (keys and switches keep the toggle); a `pointerdown` on the grid or a control before "again" is due means the child has moved on, so it is skipped. The hands unmount the moment they have faded, and `.curtain` clips everything to the screen area, hit testing included. Reduced motion swaps every movement for an opacity glow. Every timer and `curtain-*` animation is cancelled the moment the band plays again, the screen changes, an overlay opens or rest time starts. In Blocks, each row head's SVG is centred out of flow with `contain: strict`, so breathing, blinking and singing never re-lay out the grid (a grid or flex item cannot be its own layout boundary).

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
| full app | Playwright scripts in a real Chromium: `scripts/e2e.mjs` (touch→sound, record, layer, play, undo, autosave), `scripts/e2e-more.mjs` (Blocks, Paint, Add Monster, Mimic with fake mic, grown-up gate, WAV export, and the axe gate), `scripts/e2e-edge.mjs` (regressions from code review: feedback sounds never recorded, redo after an empty take, focus loss, rest time, leaving the Lab mid-take, recordings shared by copied songs, no dead ends on an empty song), `scripts/e2e-ux.mjs` (dead ends and where the hand points, Blocks auditions that never write notes, kept lessons through Magic, the first-loop cheer and Blocks dot, keyboard play of keys and blocks, make-it-a-song and its undo, reduced motion), `scripts/touch-check.mjs` (real touch events with the normal autoplay policy, glissando, chords, no stuck notes, 4× CPU throttle, bounded voices, a six-monster Little stage), `scripts/e2e-guide.mjs` (the first-beat guide, Boom's offer, demo songs, the Beats button), `scripts/e2e-delight.mjs` (tickle time, the musical sky and moon, costume poof, Chomper, on three sizes with real touch), `scripts/e2e-curtain.mjs` (row heads that sing in Blocks, the bow, applause and "again", taps that never edit the song), `scripts/e2e-join.mjs` (six monsters for Little Monsters and how they fit on iPad, phone and upright tablet, the bye-bye and its one-step undo, Mimic's picture lock, fair Learn stars with Magic help, teacher and word taps that sing but never count or stutter the teacher's phrase, the friends seat at six, the first-beat guide's Boom staying, axe on the tray and a lesson) |
| accessibility | axe-core gate in `scripts/e2e-more.mjs` over the Lab (keys), Blocks, Paint, Songs, the Learn shelf, a lesson, the Add Monster tray, the Magic panel and Parent Space (any violation fails; the grid face is scanned in `scripts/e2e-steps.mjs`) |
| sound | `scripts/audio-levels.mjs` renders every preset offline and reports peak/RMS; worst-case mix check |
| visuals | `scripts/shots.mjs`, `scripts/tour.mjs`, `scripts/crowded.mjs` screenshot phone/tablet/portrait layouts |

## Extensibility hooks

* New monster → one catalogue entry + presets + an SVG body component.
* New sound → one preset object (no audio code).
* New effect buddy → `FxKind` + channel parameter + buddy art.
* Build-a-Monster → presets are already data; appearance → parameter mappings can generate patches.
* Monster Packs / Worlds → catalogue + art + stage scene per pack; project stores monster kinds, not art.
