# 3 · Monster Lab screen specification

The Monster Lab is where the app opens and where most play happens. It is designed for **tablets and phones held sideways**; tablets held upright get an adapted layout, and phones held upright see a friendly "turn me sideways" screen.

## Layout

```
┌──────┬─────────────────────────────────────────────────────┬────────┐
│ ☐🏠  │  STAGE — night scene, monsters standing on hills     │   ★    │ ← grown-up mark
│ ☐👾  │   (Bloop)  (Boom)  (Grumble)  (Spark)       [ + ]    │  (▶)   │ ← Play + loop ring
│ ☐🧱  │   spotlight monster is larger                       │  (●)   │ ← Record
│ ☐🖌  ├─────────────────────────────────────────────────────┤  (↶)   │ ← Undo
│      │ [toys] [ key ][ key ][ key ][ key ][ key ][ key ]…   │        │
│  ☾   │  KEYS — 8 rainbow keys / 6–8 drum pads              │        │
└──────┴─────────────────────────────────────────────────────┴────────┘
  places rail                screen                            transport rail
```

* **Grid:** `places rail | screen | transport rail`, gaps and radii scale with the short side of the screen (`vmin`), safe-area insets respected (notches, home indicator).
* **Split:** stage : keys ≈ 1.08 : 1 on phones; 1.3 : 1 on tall screens (≥ 560 px) where the stage has spare height.
* **Portrait tablets:** rails become a top bar (places) and a bottom bar (transport); stage above keys.
* **Portrait phones (< 600 px wide):** full-screen "Turn me sideways!" with Bloop rotating (CSS-only; installed app is locked to landscape by the manifest).

### Target sizes (CSS px)

| Device | Keys | Play | Record | Monster (spotlight) |
|---|---|---|---|---|
| Phone 667×375 | ≈ 58 × 150 | 64 | 52 | ≈ 150 |
| Phone 844×390 | ≈ 70 × 160 | 66 | 52 | ≈ 170 |
| iPad 1024×768 | ≈ 80 × 290 | 130 | 100 | ≈ 330 |

All touch targets ≥ 44 px; primary actions ≥ 52 px; keys are the largest targets on screen.

## Stage

* Every monster in the song stands on the stage in one row (Little: up to 4, Maker: up to 6).
* **Touching a monster plays it and puts it in the spotlight** (onto the keys). There is no separate instrument picker.
* Spotlight monster: wider pod (flex 1.45–2.3), full size, glowing platform, a soft light cone. Others: 86 % scale, still animated.
* **Loop badge** (monster-coloured circle with ↻) appears when a monster has a loop:
  * tap → the loop sleeps (muted: monster dozes, "z" floats up, badge shows Zz) / wakes;
  * hold 1 s → the badge shakes and the loop is cleared (Undo restores it).
* **+ Add Monster** seat at the end of the row opens the Monster friends tray.
* **Sound toys** for the spotlight monster: costume hat (next preset, the monster changes outfit and plays a preview) and effect buddies (tap cycles asleep → a little → a lot, shown by 2 pips and a glowing ring). On tall screens they sit above the monster's head; on phones they sit at the left of the keys so the stage keeps its room.
* Maker mode shows the monster name (and sound name on tablets) as a small label.

### Monster behaviour on stage

| State | Visual |
|---|---|
| idle | breathes (each monster at its own pace), blinks, antennae sway, eyes follow the last touch anywhere on screen |
| plays a note | body reaction by role (see characters doc), mouth opens for the note's length, lids lift, antennae wobble |
| Echo on | teal ghost copies of the monster flash in time with the echo repeats |
| Gloop on | a goo puddle under the monster; each note sends a ripple ring |
| Chomper on | a small Chomper sits on the pod, chomping |
| Wiggle on | the monster wobbles like jelly |
| sleeping | eyes shut, desaturated, slow breathing, "z" |
| recording | small red dot on the spotlight pod |

## Keys and pads

* 8 keys for melodic monsters; Boom has 6 big pads (Little) or 8 (Maker).
* Keys are **scale steps**, never raw pitches — see Monster Magic. Nothing can be out of tune.
* Colour-independent pitch cues: each key's glyph (the monster's shape: bubble, blob, star, cloud, heart) **climbs and shrinks** from left (low, big) to right (high, small) — a visual staircase.
* Drum pads carry a picture for every drum (big drum, snappy drum, tiny cymbal, clap, bongos, crash, cowbell, boing).
* One touch handler for the whole row: multi-finger chords, and **sliding across keys plays each key** (glissando).
* Pressed keys sink (3D lip collapses) and ripple; keys glow when the loop plays them, so children see what they recorded.
* Pen pressure (Apple Pencil) sets loudness; fingers use a friendly fixed velocity.

## Transport rail

| Control | Behaviour |
|---|---|
| ▶ / ■ | Lab & Paint: loop playback. Blocks: plays the song once, then the finale. A ring around the button shows loop (or song) position with one dot per beat (or per block); red while recording. |
| ● Record | idle → armed (empty & stopped: first note starts the loop) or recording (plays immediately if there is music). Tap again to stop; stops by itself after two quiet loops. Undo removes a whole take. |
| ✨ Magic (Blocks) | Auto-arrange the song (replaces Record on Blocks). |
| ↶ Undo | Always present; says "Nothing to undo" instead of being disabled. |
| ↷ Redo, ✨ Monster Magic (Maker) | Redo; speed (turtle ↔ rabbit) and mood (Happy, Mystery, Sunny, Moody, Bluesy, Wild). |

## Keyboard (Chromebooks, desktops)

`A S D F G H J K` play the keys · `1–6` pick a monster · `← →` previous/next monster · `Space` play/stop · `R` record · `Ctrl/⌘+Z` undo · `Ctrl/⌘+Y` or `⇧⌘Z` redo · `Esc` closes panels. Focus rings are thick and yellow.

## Wordless coaching

A pointing hand (and a glowing ring) appears only when a child seems stuck: no sound after 3 s → a key; lots of playing but no recording → Record; first loop made → another monster; three loops → Blocks. Each hint shows once per session and can be switched off in Parent Space.

## Speech bubbles

Short, icon-led bubbles from a monster for moments that matter ("Draw your music!", "Mimic copied you!", "Record a loop for Bloop first!"). They never block input and disappear after 2.6 s.
