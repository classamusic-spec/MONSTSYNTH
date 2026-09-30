# 2 · Core user flows

Flows are written as what the child does → what the product does. Every step produces sound or motion; none needs reading.

## F1 · First sound in under five seconds

1. App opens on the **Monster Lab**. The monsters are asleep (eyes shut, dimmed). A glowing sun with a tapping hand pulses in the middle; for readers it says *"Tap to wake the monsters!"*.
2. Child taps anywhere → audio unlocks (the tap is the browser's required user gesture) → each monster wakes in turn and sings one note of a chord (≈0.5 s).
3. Bloop stands in the spotlight above eight rainbow keys. Child touches a key → Bloop sings, its mouth opens, the key sinks and ripples.
4. If nothing is touched for 3 s, a pointing hand taps a key (wordless hint).

*Measured in the automated test: a key produces audible output within 150 ms of the touch.*

## F2 · Make a loop (no instructions)

1. Child taps **●** (Record). Nothing is playing and the song is empty, so Record *arms*: the button blinks and its label reads "Play!".
2. The first note the child plays **becomes the downbeat**: the loop starts exactly there. The loop ring around ▶ begins to turn.
3. Child keeps playing. Notes are pulled onto the beat (soft quantize) and placed into Bloop's loop. A soft tick marks each beat while there is no drum loop.
4. Child taps ● again (or stops playing for two loops, and recording switches off by itself). The loop keeps playing — the child immediately hears their music repeat.
5. Undo removes the whole take in one step.

## F3 · Add a second layer

1. While the loop plays, the child touches **Boom** on the stage → Boom moves into the spotlight, the keys become drum pads, Boom plays a drum.
2. Child taps ● and plays drums along with the loop. Notes land in sync because both loops share one clock.
3. After the first loop, the coach hand briefly points at another monster to suggest adding a layer.

## F4 · Squish the Monster (expressive play)

Touching a monster on stage plays it directly:

| Gesture | Sound | Picture |
|---|---|---|
| tap higher / lower on the monster | higher / lower note | monster stretches up / squashes down |
| drag up / down while holding | slides through the scale (in tune) | stretches / squashes with the finger |
| drag left / right | Dark ↔ Sparkly (filter, vowel, bell brightness) | dims ↔ brightens |
| hold | note sustains (Boom, Spark: drum roll / twinkle roll) | mouth stays open |
| shake side to side | wobble (vibrato) | — |
| pinch in / out with two fingers | squish = short and tight · stretch = long and open | monster stays squished / stretched |

## F5 · Build a song (Monster Blocks)

1. Child opens **Blocks**. Every monster with a loop already fills its row (the first recording auto-fills the row), so the song exists immediately.
2. Tap a block → it disappears (a gap in the song). Tap an empty spot → the loop returns. Swipe across empty spots → several appear. Drag a block → it moves; dropping on another block swaps them.
3. Tap ▶ → the song plays once from block 1 to block 8 with a playhead. At the end, stars rain down and the monsters bow: *"You made a song!"*.
4. ✨ Magic (the wand where Record usually sits) builds an arrangement: monsters enter one by one, a breakdown drops the rhythm, everyone plays the finale. Every tap gives a different arrangement; Undo goes back.

## F6 · Sound Painting

1. Child opens **Paint** ("Draw your music!"). Picks a monster colour (swatches show the monster's face) or the rainbow.
2. Drawing sings while the finger moves (every lane change or so). Dots = short notes, flat lines = held notes, rising lines = rising melodies. Stars tool stamps twinkles. Eraser rubs strokes out.
3. ▶ plays the painting as a loop together with the band; a playhead sweeps and rings pop where notes sound. The painting also gets its own row in Monster Blocks.

## F7 · Mimic copies a voice ("banana")

1. A grown-up switches on the microphone in Parent Space (the browser asks for permission while the grown-up is present).
2. Child invites Mimic from **+ Add Monster**. The keys show a pink **Hold & talk** button.
3. Child holds it and says "banana" (max 3 s). Mimic trims silence, evens the volume, and plays it back.
4. Every key now plays "banana" lower or higher, locked to the song's scale. Mimic can record loops like any monster.
5. Without permission the button shows a lock; tapping it makes Mimic say *"Ask a grown-up to wake Mimic's ears"*.

## F8 · Come back to an earlier idea

1. Child taps 🏠 → **My Songs**: a shelf of song pictures. Each shows that song's monsters — awake if they have loops, asleep if not — in the song's own colour.
2. Tap a picture → that song opens in the Lab exactly as it was. **New song** starts fresh; **Start a band** opens a ready-made groove to conduct (tap loop badges to make monsters sleep or join).

## F9 · Grown-up tasks

1. Hold ☾ (bottom-left) and ★ (top-right) together for 3 s → a ring fills → Parent Space opens. (Keyboard users: focus either mark and press Enter → multiplication question.)
2. Change age mode, volume ceiling, microphone, motion, contrast, hints, play time.
3. Rename, copy, delete songs; **Save audio** renders the song offline to a `.wav` (share sheet on tablets, download elsewhere).

## F10 · Play time is up (optional)

1. A grown-up set a play time in Parent Space (off by default).
2. Only time the app is awake and visible counts. When it runs out, the music stops, the band yawns and falls asleep: *"Time for a break!"* — everything is already saved.
3. The screen cannot be dismissed by the child; a grown-up holds the two corners, and closing Parent Space starts a fresh session.

## Recovery flows (no destructive mistakes)

| Accident | Recovery |
|---|---|
| Recorded something unwanted | Undo (one step per take) |
| Deleted a block / moved it | Undo |
| Cleared a monster's loop (hold its loop badge 1 s) | Undo |
| Sent a monster home | It waits on the bench with its loop; invite it back |
| Started a new song | Old song is still on the shelf |
| Deleting songs | Only in Parent Space, with confirmation |
| Something unexpected breaks | A sleepy-monster screen with one "Wake them up again" button; autosave is flushed before restarting |
