# 2 · Core user flows

Flows are written as what the child does → what the product does. Every step produces sound or motion; none needs reading.

## F1 · First sound in under five seconds

1. App opens on the **Monster Lab**. The monsters are asleep (eyes shut, dimmed). A glowing sun with a tapping hand pulses in the middle; for readers it says *"Tap to wake the monsters!"*.
2. Child taps anywhere → audio unlocks (the tap is the browser's required user gesture) → each monster wakes in turn, bounces and sings one note of a chord (≈0.5 s).
3. Bloop stands in the spotlight above eight rainbow keys. Child touches a key → Bloop sings, its mouth opens, the key sinks and ripples.
4. If nothing is touched for 3 s, a pointing hand taps a key (wordless hint).

*Measured in the automated test: a key produces audible output within 150 ms of the touch.*

## F2 · Make a loop (no instructions)

1. Child taps **●** (Record). Nothing is playing and the song is empty, so Record *arms*: the button blinks and its label reads "Play!".
2. The first note the child plays **becomes the downbeat**: the loop starts exactly there. The loop ring around ▶ begins to turn. A first loop is cheered: the monster jumps and throws sparkles, its loop badge pops in, and a dot in the monster's colour appears on the **Blocks** button (the loop is already in the song) until Blocks is visited.
3. Child keeps playing. Notes are pulled onto the beat (soft quantize; drums snap exactly onto it) and placed into Bloop's loop. A soft woodblock tick marks each beat for the whole take when it began without a drum loop.
4. Child taps ● again (or stops playing for two loops, and recording switches off by itself). The loop keeps playing — the child immediately hears their music repeat.
5. Undo removes the whole take in one step.

## F3 · Add a second layer

1. While the loop plays, the child touches **Boom** on the stage → Boom moves into the spotlight, the keys become drum pads, Boom plays a drum.
2. Child taps ● and plays drums along with the loop. Notes land in sync because both loops share one clock.
3. After the first loop, the coach hand briefly points at another monster to suggest adding a layer. After the second, it points at the **Song** button (Little Monsters) or at Blocks (Monster Makers).

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
2. Every touch is heard, and none ever changes a loop's notes:
   * Tap an empty spot → the loop returns: the monster sings a hello note at once (a swipe across empty spots climbs the scale), and when the finger lifts, the loop placed there plays its first two beats.
   * Hold a block → its loop plays (two beats, on a preview channel dressed like the monster). Lift without moving → the block goes away with a soft *pop*; a quick tap is just the pop (no cut-off bit of the loop first).
   * Drag a block → it moves (dropping on another block swaps them) and lands with a hello.
   * While the song plays, the song is what you hear: pressing a block adds no preview on top.
3. A song kept from **Learn** has one phrase per block (A B C A …). Filling a gap there continues the tune: the block gets the phrase to its left.
4. Tap ▶ → the song plays once from block 1 to block 8 with a playhead. At the end, stars rain down and the monsters bow: *"You made a song!"* (only when the song had something to hear).
5. ✨ Magic (the wand where Record usually sits) builds an arrangement and plays it at once from block 1, so every tap is heard: monsters enter one by one, a breakdown drops the rhythm, everyone plays the finale. Every tap gives a different arrangement; Undo goes back. Rows that play several phrases (a kept lesson's tune, and the bass and sparkles that follow its chords) keep every phrase in its block, from block 1, however often Magic is tapped: the song still starts at its beginning, and Magic arranges the other layers (the beat) around it. The first Magic of a song with a beat starts on the beat (Boom enters in block 1).

## F5b · Make it a song in one tap (Little Monsters)

1. Once two awake monsters have loops, a **Song** button (a stack of blocks with a play badge, at least 52 px) appears in the rail under Undo, where Monster Makers have their Magic panel button. It never covers Play, Record, Undo or Beat Hop's Surprise wand, and has no wand of its own, so the two never look alike. With hints on, the coach hand points at it once, when a second monster gets a loop (a re-take on the same monster does not count).
2. One tap → Monster Magic arranges every loop into a song (the beat first, when there is one), Monster Blocks opens and the song plays from block 1.
3. One Undo takes the arrangement back.

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

## F11 · Nothing to play yet (no dead ends)

Play (or Space, or Magic) on a song with nothing to hear never runs a silent loop, never says *"You made a song!"*, and never adds an empty undo step. Instead the monster on the keys goes *"huh?"* (two rising notes), a bubble says what to do, and the coach hand (when hints are on) points where the music comes from, every time, not once a session:

| Where | What is missing | The hand points at |
|---|---|---|
| Lab | no loop yet | Record (*"Record a loop first!"*) |
| Lab | every loop asleep | a sleeping loop badge (*"Wake a monster!"*) |
| Blocks | no loop yet | the screen's big *Go to the Lab* button (*"Make a loop in the Lab first!"*) |
| Blocks | loops, but no blocks | an empty block of a monster with a loop (*"Tap a block!"*) |
| Blocks | every looped monster asleep | a sleeping row's monster (*"Wake a monster!"*) |
| Paint | nothing drawn | the canvas (*"Draw your music!"*) |

Beat Hop's grid always has its pulse, so Play there always starts.

Every bubble has a voice: its monster chirps as it appears (*"yay!"* for good news, *"huh?"* when something is missing). *"Play something!"* after Record is not a dead end, so it stays silent: *"huh?"* always means "nothing here yet". Upright tablets show bubbles just below the top dock, so a bubble never hides what the hand points at. Once-a-session hints that come due while a *"huh?"* is being answered wait and appear right after it.

## F12 · Keyboards, switches and screen readers

* **Lab:** every key is a real button in the Tab order, named by its note (*"Bloop: E"*); Enter or Space plays it (and records during a take). Fingers still glide across keys (the keys let touches through to the keyboard behind them). A–K play too, 1–6 pick a monster.
* **Blocks:** all the blocks are one tab stop (none while the empty card covers them: Tab goes straight to *Go to the Lab*). Arrows move between blocks and monsters, Enter or Space fills an empty spot (and plays it) or clears a block, Shift+← / → carries a block along its row.
* **Reduced motion** (Parent Space, or the device setting): no blinking, no echo ghosts, no jumps or bounces; celebrations become a soft glow and the Blocks dot stays still.
* An axe-core pass over every screen is part of the browser checks and fails on any violation.

## Recovery flows (no destructive mistakes)

| Accident | Recovery |
|---|---|
| Recorded something unwanted | Undo (one step per take) |
| Deleted a block / moved it | Undo |
| Magic or **Song** rearranged the song | Undo (one step) |
| Cleared a monster's loop (hold its loop badge 1 s) | Undo |
| Sent a monster home | It waits on the bench with its loop; invite it back |
| Started a new song | Old song is still on the shelf |
| Deleting songs | Only in Parent Space, with confirmation |
| Something unexpected breaks | A sleepy-monster screen with one "Wake them up again" button; autosave is flushed before restarting |
