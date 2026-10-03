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
* Colour-independent pitch cues: each key's glyph (the monster's shape: bubble, blob, star, cloud, heart) **climbs and shrinks** from left (low, big) to right (high, small) — a visual staircase. `KeyGlyph` sets `--stair` (0 lowest … 1 highest; deliberately not `--t`, the timing token); `keys.css` turns it into a height, and lifts the staircase a little when a name sticker is shown so the lowest picture clears it.
* **Key face = colour + staircase + name sticker.** A white pill at the bottom of each melodic key names its note, like the letter stickers on a toy xylophone: letters (C D E, the default in both modes), movable do re mi (in the Lab the leftmost key is always *do*), or none — a Parent Space choice ("Names on the keys"). Names come from `src/magic/noteNames.ts` (`spellStep` / `keyNames` / `keyLabel`) and follow the song's key and mood live, so picking Mystery re-letters the keys to C E♭ F G B♭. Spelling follows the scale degree (D major has F♯ and C♯), and one piano rule keeps it child-friendly: a white piano key is always its plain letter (no C♭, E♯ or double flats). Notes that are black piano keys get an inverted, dark sticker. Letter only — the staircase already shows the octave. Sharps and flats are drawn as tiny SVGs (the self-hosted font has no ♯/♭). The key's spoken label says the name ("Bloop: F sharp", "Bloop: C (higher)").
  * Puff's sticker names its lowest note (the key's own step), never a chord name.
  * Mimic shows names only while it sings with its built-in voice; with a recording the pitch is the child's own, so no name could be true.
  * Boom shows no names (drums have no pitch). Monster Makers with names on see short drum words in the same sticker style (kick, snare, hat, clap, bongo, crash, bell, boing), so a grown-up can say "kick on 1 and 3"; the pictures stay the main cue.
  * The sticker pops (scale 1.12) when a finger or the loop plays the key — CSS on `data-down` / `data-glow`, no React state.
* Drum pads carry a picture for every drum (big drum, snappy drum, tiny cymbal, clap, bongos, crash, cowbell, boing).
* One touch handler for the whole row: multi-finger chords, and **sliding across keys plays each key** (glissando). Stickers, glyphs and sparkles never take touches (`pointer-events: none`).
* Pressed keys sink (3D lip collapses); a ring and a few colour sparks burst **where the finger lands**, clipped to that key so a press never seems to light its neighbour (at most 3 bursts per key, removed after 450 ms, none with reduced motion). Keys glow when the loop plays them, so children see what they recorded.
* Learn uses the same key face (the teacher's staircase plus stickers, "E, play this one"), and every lyric syllable sits under a tag in its key's colour (with the name inside when names are on), lit for the next note to play and for the note the teacher is singing. Upcoming tags are a touch smaller, never faded. Do re mi in Learn starts on the tune's home note (where it ends), so Old MacDonald, on the keys of D major, sings "do do do so la la so" from G.
* Sound Painting's left edge carries a ribbon of the key colours (high at the top, each colour spanning exactly its lane) that flashes the lane that sounds, plus the lane names beside it; lane lines sit exactly where `laneForY` changes lane. With the Boom brush the lanes are drum pads: no names, and the ribbon wears the pads' colours.
* Monster Magic (Maker) shows each mood's notes under its name ("C E♭ F G B♭" for Mystery) when names are on.
* Pen pressure (Apple Pencil) sets loudness; fingers use a friendly fixed velocity.

## Beat Hop: the back of the keys

The keys flip over into a grid of stepping stones for the monster in the spotlight. One column is one beat: the same 8 beats as the 8 dots around Play and one block in Monster Blocks, with a wider gap between the two bars. There is no new screen; the stage stays (smaller, still dancing) and the transport rail stays. In this release the grid face is Boom's; melodic monsters get theirs (the bead lane) next, so the flip button shows only while Boom is on the keys.

* **Getting there (no words):** the flip button (3×3 stones) at the top of the surface's side column, which pulses once the first time Boom is selected in a session and whose middle stones blink on every beat while the band plays; ⇧G on a keyboard; the **Make a beat** card on the Songs shelf (a new song that opens on Boom's grid, big drum stones on 1 and 5 shimmering, the wand sparkling); Boom's empty row picture in Monster Blocks; and the Coach's hand on the flip button after 8 Boom hits with no Record. On the grid face the button shows three rainbow keys and flips back.
* **Rows (Boom):** one per drum, high sounds on top: tiny cymbal, (clap), snappy drum, big drum, matching Boom's head/belly/feet. Little Monsters see cymbal, snare and kick; Monster Makers also the clap, plus a **+** under the drum pictures (in the toys' column on phones) for bongos, crash, cowbell and boing. Any drum a loop already plays always gets a row, in both modes. Each row head is the drum's picture on its pad colour; touching it plays the drum (nothing is written).
* **Stones:** a dark stone is a socket with the drum's silhouette (beats 1 and 3 of each bar a little lighter); a lit stone is a little key (same gradient and lip) that grows with its loudness, with one pip for a hit and two for a double. Hits off the beat (live playing, wand grooves) show as small stones exactly where they are inside the beat.
* **Touch:** one handler for the whole grid, with hit-testing by maths over the measured stones (gaps are never dead zones), every finger its own gesture:

| Gesture | Little Monster | Monster Maker |
|---|---|---|
| tap a dark stone | lights it (the tiny cymbal lights as a double: tss-tss) | lights it (one hit) |
| tap a lit stone | off | one → double → off |
| tap a partly lit stone | becomes the row's default | becomes the row's default |
| swipe | starting on a dark stone lights every stone crossed (2D, across rows); starting on a lit stone erases | same |

  Every gesture is one undo step. A beat holds at most 4 different drums and a loop 160 Boom notes: a full beat wobbles "no" and nothing is taken away. Pressed stones sink and ripple; a stone taken away shrinks with a poof.
* **Sound:** with nothing playing, the first stone starts the loop *from that stone's beat*, so the first thing heard is the child's own stone, on the beat. After Stop, a stone sounds at once (a soft blip when one is taken away). While the band plays, a new stone plays in this very pass and, when its turn is more than half a beat away, a soft preview sounds on the next sixteenth. See Monster Magic §9.
* **What moves:** a soft beam of light over the beat that is playing, the ruler dot growing, and a mini copy of the monster hopping from dot to dot, landing with a squash exactly on each beat. Each stone pops (with a ring) when its note is heard, at the same moment as the monster on the stage. Wand grooves pop in from left to right; tidied notes slide into their slots. All of it is imperative (no React state per frame or note). Reduced motion keeps only lit states, the beam and a ring on the current dot; high contrast outlines the sockets and rings the lit stones.
* **Ruler:** one dot per beat, a star on each bar's first beat, bigger dots on beats 1 and 3, and beat numbers 1–8 for Monster Makers.
* **Recording is off under the grid.** Record's place on the rail holds the **Surprise** wand: each tap stamps the next ready-made groove (6 for Little Monsters on the first four drums, 4 more for Monster Makers; the first is the Monster Band's own beat), starting the loop from beat 1 if it was stopped. A burst of taps is one undo step back to the child's own beat. Flipping to the grid mid-take ends the take (one undo step); R does nothing there. Flipping back brings Record back.
* **A beat to sit on:** under the grid, while no drum loop can be heard, the band's soft woodblock tick plays on every beat.
* **Keyboard:** the grid is an ARIA grid with one tab stop; arrows move between stones (they never switch monsters there), Enter taps the focused stone, Space still plays/stops, A–K still play live.
* **Sizes:** stones are at least 44 × 44 px (with their share of the gaps) on 844×390 and 667×375 phones, iPad 1024×768 and 820×1180 portrait; on phones the stage shrinks to about 0.55 of the keys' share (96 px with five or more drum rows) so the grid gets the height.

### The surface's side column (both faces)

The flip button, then the toys (phones only; tall screens keep them in the stage toolbar), then the **tidy magnet**: it appears (with a little bounce) whenever the spotlight monster's loop has notes off the grid, on the keys face and the grid face alike. One tap pulls every note onto the beat grid, one undo step, with a short twinkle. Little Monsters' single column of toys becomes two on the keys face when the flip or the magnet joins it.

### The beat you can see (keys face)

While the band plays, the key panel breathes on every beat: a soft light, a little stronger with a small lift on each bar's first beat (imperative WAAPI; none with reduced motion). The stage's beat dance is in *Monster behaviour on stage*.

## Transport rail

| Control | Behaviour |
|---|---|
| ▶ / ■ | Lab & Paint: loop playback. Blocks: plays the song once, then the finale. A ring around the button shows loop (or song) position with one dot per beat (or per block); red while recording. |
| ● Record | idle → armed (empty & stopped: first note starts the loop) or recording (plays immediately if there is music). Tap again to stop; stops by itself after two quiet loops. Undo removes a whole take. |
| ✨ Magic (Blocks) | Auto-arrange the song (replaces Record on Blocks). |
| ✨ Surprise (Beat Hop) | Stamps the next ready-made groove into the spotlight monster's loop (replaces Record under the grid). |
| ↶ Undo | Always present; says "Nothing to undo" instead of being disabled. |
| ↷ Redo, ✨ Monster Magic (Maker) | Redo; speed (turtle ↔ rabbit) and mood (Happy, Mystery, Sunny, Moody, Bluesy, Wild). |

## Keyboard (Chromebooks, desktops)

`A S D F G H J K` play the keys · `1–6` pick a monster · `← →` previous/next monster · `⇧G` flips the keys to Beat Hop's grid and back · in the grid, arrows move between stones and `Enter` taps one · `Space` play/stop · `R` record (not under the grid) · `Ctrl/⌘+Z` undo · `Ctrl/⌘+Y` or `⇧⌘Z` redo · `Esc` closes panels. Focus rings are thick and yellow.

## Wordless coaching

A pointing hand (and a glowing ring) appears only when a child seems stuck: no sound after 3 s → a key (on Beat Hop, the first big-drum stone); lots of playing but no recording → Record; 8 Boom hits and no recording → the flip button; 4 stones placed after Stop → Play; first loop made → another monster; three loops → Blocks. Each hint shows once per session and can be switched off in Parent Space. Stone previews never count as playing.

## Speech bubbles

Short, icon-led bubbles from a monster for moments that matter ("Draw your music!", "Mimic copied you!", "Record a loop for Bloop first!"). They never block input and disappear after 2.6 s.
