# 8 · Monster Magic rules

Monster Magic is the invisible musical helper. It makes whatever a child does sound intentional — without ever showing words like *quantize*, *scale* or *MIDI*. Rules live in `src/magic/` as pure, unit-tested functions; the runtime that applies them is `src/studio/studio.ts`.

## 1 · No wrong notes (scale locking)

* Keys are **scale steps**, not pitches. Step → pitch happens at play time: `MIDI = monster.baseMidi + key + scaleSemitones(step)`.
* Default scale: **major pentatonic** (C D E G A). Any combination of keys, monsters and loops is consonant.
* All monsters share the song's key and scale, so every loop is harmonically compatible with every other.
* Registers are set per monster so they don't fight: Grumble C2–E3, Puff C3 chords, Bloop C4–E5, Spark C5–E6, Mimic around the recorded pitch.
* **Puff's chords** stack every other scale step (`step, step+2, step+4`) — always inside the scale, so pads never clash with melody or bass.
* Monster Maker "moods" swap the scale for the whole song, including recorded loops (they are stored as steps): Happy (major pentatonic), Mystery (minor pentatonic), Sunny (major), Moody (natural minor), Bluesy (blues), Wild (chromatic).

## 2 · Timing help (snapping)

| | Little Monster | Monster Maker |
|---|---|---|
| melody grid | eighth notes (½ beat), 90 % pull | sixteenth notes (¼ beat), 75 % pull |
| drums (Boom) | exactly on an eighth; within 0.3 beat of a beat → on the beat | exactly on a sixteenth; within 0.1 beat of an eighth → on the eighth |
| note ends | the *end* of a held note snaps to ¼ beat, measured from its snapped start; min ¼ beat, max one loop | same |

* **Melody** keeps a soft pull: `q = beat + (round(beat/grid)·grid − beat) × strength`. The small remainder keeps a trace of human feel.
* **Drums are always on the beat** (`snapDrum`): a hard snap with an on-beat magnet. Young children tap late; the magnet keeps a late "on the beat" tap on the beat instead of the "and". Recorded hits are exact grid positions, so they line up with template and lesson drums (no flams) and with a future beat grid.

**Touch timing:** a note is measured from the touch's own timestamp (`event.timeStamp`), not from when the handler ran, so a busy tablet does not make notes late. It is then shifted back by output latency + touch delay, so a child who plays *with* what they hear lands on the beat.

## 3 · Loops that always line up

* One project clock; **loop length = 2 bars (8 beats)** at 100 bpm by default (≈ 4.8 s: short enough to hear repetition quickly, long enough for a phrase).
* All loops share the length, so they are synchronised by construction — no loop-length correction problem can arise.
* **The first note is the downbeat:** when Record is pressed with nothing playing and an empty song, the loop starts on the child's first note (no count-in to wait for). Beat 0 is placed where the finger landed, measured exactly like every later note.
* When other loops exist, Record starts the band immediately so there is something to play along with.
* **The click:** a take that begins without an awake drum loop gets a soft woodblock tick on every beat (louder on each bar) for the *whole* take — also the take that records the first drum loop. It has its own voice, so it never sounds like one of Boom's drums.
* A note played live is never also triggered by the loop on the same pass (per-note skip guard).
* **Flam guard:** playing a drum that the loop hits within ±60 ms, only the loop's on-beat hit sounds. The touch still animates and records.
* **Bounce filter:** the same drum again within 80 ms in a take (a finger bouncing) is recorded once; both touches still sound.
* **Rolls:** holding Boom or Spark plays repeated hits on the grid lines (eighths in Little, sixteenths in Maker), starting on the next line. While the band plays they ride its clock and are recorded exactly on the grid; with nothing playing they get a clock of their own at the song's speed (never recorded). Speed changes are followed at once. Letting go ends the roll (a hit already scheduled, at most 120 ms ahead, still sounds).

## 4 · Looper rules: replace, don't pile up

Recording is an overdub looper, with guard rails:

1. A new note **replaces** notes recorded on an *earlier* pass in the same grid slot.
2. Notes from the **same pass** (a chord, two drums at once) are kept together.
3. **Drums replace only the same drum** in a slot — kick and snare can share a beat.
4. A double-tap collapsing into one slot becomes one note.
5. Caps: 3 notes per slot (4 for drums), 96 notes per loop (160 for Boom); the oldest unprotected recording goes first. Notes keep their recording order, also when the song is saved and opened again.
6. **Auto-stop:** if nothing is played for two loops, recording turns itself off.
7. A whole recording pass is **one undo step**, including anything else changed during it (a costume, an effect buddy); an empty pass leaves no undo step.
8. **You always hear what you record:** recording on a sleeping monster wakes it, and if other monsters are soloed it joins the solo group.

## 5 · Songs (Monster Blocks)

* The song is 8 blocks; each block is one loop length.
* A monster's first recorded loop **fills its whole row**, so the song immediately contains everything made in the Lab.
* Sleeping (muted) monsters are silent in both Lab and song; Solo (Maker) silences the others.
* **Magic arrange** (`magicArrange`): order layers by one of three entry recipes (beat first · dreamy start · tune first), bring layers in one by one before a breakdown (≈ block 6: drums and bass drop out, somebody always keeps singing), then everyone plays the finale. Seeds vary the recipe and the breakdown position; every result is guaranteed to have sound in every block, a full final block, and a gradual start.

## 6 · Sound Painting → notes

* x → time (the canvas is one loop, snapped to ¼ beats); y → one of 8 pitch lanes (scale steps); colour → monster; pen pressure → loudness.
* Sustaining monsters (Bloop, Grumble, Puff, Mimic): consecutive columns in the same lane merge into one held note → flat lines hold, slopes become melodies.
* Percussive monsters (Boom, Spark): a hit every eighth note along the line, plus on every lane change.
* Dots → one short note; stars → one note each; rainbow → cycles Bloop → Spark → Puff.
* A line that doubles back is not played twice (first crossing wins); 48 notes max per stroke.

## 7 · Protecting the mix

Automatic gain staging per preset, per-monster and global voice limits with click-free stealing, compressor + limiter + soft clip, parent volume ceiling (see audio-engine doc).

## 8 · Intelligent defaults

| Default | Value | Why |
|---|---|---|
| tempo | 100 bpm | comfortable for young children's tapping and singing |
| loop | 2 bars | quick repetition, clear structure |
| scale | major pentatonic in C | no dissonant pairs |
| effects | Bloop a little Gloop; Spark Echo + Gloop; Puff Gloop; Grumble dry | each role sounds finished out of the box |
| starter song | "Start a band" groove + magic arrangement | a finished piece to conduct from minute one |

## Ideas deliberately not in 0.1

* **Tempo from the child's first loop** (estimate beat from inter-onset intervals, fit 1/2/4 bars). Promising, but risky with young children's irregular timing — to be tested against the fixed-grid approach.
* Chord-following bass, call-and-response suggestions, loop variations per monster (the data model already supports multiple clips per track).
