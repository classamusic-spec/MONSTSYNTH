# 10 · MVP development roadmap

## Hypothesis for 0.1

> **Can a child create a recognisable little piece of music without instruction?**

Everything in 0.1 exists to test that. Anything that doesn't serve it waits.

## 0.1 — built (this repository)

| Area | Status |
|---|---|
| Bloop synth, Boom drums, Grumble bass, Spark plucks | ✅ 17 presets + costumes |
| 8-key surface (6/8 drum pads), multi-touch, glissando | ✅ |
| Scale locking (pentatonic default) | ✅ |
| Squish the Monster gestures (tap height, drag pitch/brightness, hold, shake, pinch) | ✅ |
| Basic monster animation driven by sound | ✅ breathing, blinking, looking, singing, role reactions, FX visuals |
| Four synchronised loops, record / play / stop / undo | ✅ first-note downbeat, soft quantize, replace rules, auto-stop |
| Automatic loop alignment | ✅ shared clock, fixed loop length |
| Autosave + local persistence | ✅ IndexedDB, versioned schema |
| Basic delay and reverb | ✅ Echo & Gloop buddies |
| Monster Blocks arrangement | ✅ tap, swipe, drag, sleep, Magic arrange, song playback + finale |
| Responsive tablet interface | ✅ phones & tablets sideways, tablets upright, rotate hint |
| **Beyond the MVP brief, built because they were cheap on this architecture** | Sound Painting · Puff pads · Mimic voice sampler · Add Monster tray with bench · Monster Maker mode (speed, mood, Chomper, Wiggle, redo, solo) · Parent Space with gate · WAV export · PWA offline install · wordless coach |

## 0.2 — learn from children (next 4–6 weeks)

1. **Run the product test** (see [11-product-testing.md](11-product-testing.md)) with 8–12 children per age band, in homes and a classroom. Record sessions (with consent) as screen + audio + hands video.
2. Add an **on-device, opt-in, parent-controlled test log** (never automatic, never uploaded without the parent exporting it): time-to-first-sound, time-to-first-loop, number of layers, undo use, screens visited.
3. **Simplify before adding.** Candidate cuts if unused: pinch-squish, costumes in Little mode, the Paint Magic stars tool.
4. Tune Monster Magic from observations: quantize strength, loop length (1 vs 2 bars) for 3-year-olds, auto-stop timing, whether the first-note downbeat confuses anyone.
5. Real-device latency pass on a mid-range Android tablet and an older iPad (target < 30 ms touch-to-sound on iPad, < 60 ms on Android).

## 0.3 — deepen what worked

* Loop **variations** per monster (A/B blocks) and scenes (verse/chorus) — data model already supports several clips per track.
* Blocks: copy, duplicate, extend (12/16 blocks), per-row volume (Maker).
* Mimic: several recordings per song, pitch-preserving voice shifting (AudioWorklet), "banana choir" chords.
* Better Sound Painting: follow pen pressure more expressively, paint over the playing loop.
* Tempo-from-first-loop experiment vs. fixed grid (A/B in the product test).
* Accessibility: switch access scanning mode, larger-target option, colour-blind review with real users.

## 0.4 — Build-a-Monster

* Body / eyes / mouth / horns / texture pickers that map to synthesis: bigger = lower, sparkly = brighter, rubbery = longer bends, metal = metallic oscillators, ghost = more reverb.
* "Look inside" for Monster Makers: Sparkle → *Filter Cutoff*, Squish → *Envelope*, Wiggle → *LFO*, Echo → *Delay*, Gloop → *Reverb* — the path from play into real production concepts.

## 0.5 — worlds and packs

* Monster Packs (Space, Ocean, Robot, Dinosaur, Haunted, Jungle): new characters + presets + stage scenes, no engine changes.
* Child profiles on one device (parent-managed), each with their own shelf.
* Optional parent-managed backup/export of all songs; still no accounts or public sharing.

## Release criteria (any version)

* A child makes a sound within 5 s of launch, without help, in ≥ 90 % of test sessions.
* No audio clicks, clipping or runaway volume in any preset or combination (automated level check stays below 0 dBFS with all effects at maximum).
* No data loss across app kill / reload / device restart in repeated manual tests.
* Unit, end-to-end and level scripts pass; builds work offline once installed.
* No ads, trackers, accounts, public messaging or purchase prompts — ever.
