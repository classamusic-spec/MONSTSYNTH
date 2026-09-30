# 6 · Core monster character specifications

Every musical concept is a character. **A monster's look is a clue to its sound**, and its animation *shows* what the sound is doing. All monsters are layered SVG (`src/ui/monsters/MonsterArt.tsx`) with named parts that can move: `m-body` (squash/stretch from the feet), `m-eye`/`m-pupil` (look at your finger), `m-lid` (blink, sleep), `m-mouth-open`/`m-mouth-closed` (sing), `m-antenna` (wobble), `m-arm`, `m-foot`.

## Instrument monsters

### BLOOP — lead synth · blue · curious, bubbly, melodic
* **Look:** a one-eyed jelly-drop with a wavy dripping hem, two antennae with glossy bubble tips, freckle spots.
* **Why:** round and bubbly = a round, singing tone; one big eye = the one who "leads".
* **Moves:** high notes stretch it upward, low notes squash it down (exactly as the brief describes); antennae wobble; mouth opens for the note length.
* **Register:** C4–E5 (8 pentatonic steps).
* **Sounds:** Bubble Lead (triangle + square, bubbly upward "bloop" into each note, vibrato) · Laser Jelly (detuned saws, resonant sweep, "pew") · Rainbow Whistle (breathy sine, singing vibrato) · Moon Drops (sine droplets that fade) · Alien Giggle (square with a fast giggling trill).
* **Costumes:** none · star shades · flower · crown · party hat.

### BOOM — drums · orange · big, energetic, stompy, bouncy
* **Look:** wide furry ball, little horns, eyebrows, huge toothy grin, stubby feet.
* **Why:** wide and heavy = thump; fur = noisy textures.
* **Moves:** every hit squashes him flat and bounces back; feet stomp on alternate hits.
* **On-body drums:** feet/belly = big drum, middle = snappy drum, head/horns = tiny cymbal. Holding him = drum roll.
* **Pads:** big drum, snappy drum, tiny cymbal, clap, bongos, crash (+ cowbell, boing in Maker).
* **Kits:** Stompy Kit · Pillow Drums (soft, low — gentle on little ears) · Robot Beats (tight, crunchy) · Tin Can Band (metallic, bright).

### GRUMBLE — bass · green · sleepy, huge, deep, wobbly
* **Look:** the biggest, widest monster; heavy half-closed eyelids; soft spikes; square teeth.
* **Why:** big = low; sleepy = slow and warm.
* **Moves:** every bass note makes his whole body wobble side to side; his sleepy eyes pop wide open on each note.
* **Register:** C2–E3, with an octave-up edge in every patch so bass is audible on tablet and phone speakers.
* **Sounds:** Big Belly Bass · Sleepy Dinosaur (round sine, slow scoop) · Wobble Cave (filter wobbling in eighth notes) · Chocolate Thunder (driven square, rich).

### SPARK — plucks & bells · yellow · fast, excitable, shiny
* **Look:** a nine-pointed star-sun, shiny highlight, rosy cheeks, twinkles around.
* **Why:** points and shine = bright, sparkly attacks.
* **Moves:** quick twist on every note and a burst of twinkles; blinks the fastest.
* **Register:** C5–E6. Holding Spark = a twinkle roll.
* **Sounds (FM synthesis):** Star Bells · Magic Dust · Robot Raindrops (resonant blip) · Ice Crystals (glassy, long).

### PUFF — pads · lavender-white · soft, floating, dreamy
* **Look:** a cloud with small eyes and pink cheeks; floats above its shadow.
* **Why:** cloud = sustained, soft texture.
* **Moves:** swells and lifts slowly for as long as a chord lasts.
* **Plays chords:** every key is a three-note chord built from the scale (always consonant).
* **Sounds:** Cloud Nap · Dream Glow (shimmering filter) · Pillow Choir (vowel "aah" formant choir) · Slow Sunrise (opens slowly).

### MIMIC — voice sampler · pink · copies everything
* **Look:** round bean body with two huge listening ears, a curl on top, a big round singing mouth.
* **Why:** big ears = listens; big mouth = repeats.
* **Before recording:** sings "la" with a formant voice whose vowel moves Dark ("oo") ↔ Sparkly ("ee").
* **After recording:** plays the child's recording at every key, lower to higher (chipmunk and giant voices are part of the fun). Presets: Just Me · Chipmunk · Giant · Robot (ring-modulated).
* **Privacy:** microphone only after a grown-up allows it; recordings stay on the device.

## Effect buddies (they change sound instead of making it)

| Buddy | Effect | Look | What you see on the monster |
|---|---|---|---|
| **ECHO** | tempo-synced delay (dotted eighth, darkening repeats) | teal ghost with two fading copies behind it | teal ghost copies of the monster flash on each repeat |
| **GLOOP** | reverb (procedural room, ~2.6 s) | lime goo blob with drips and one eye | goo puddle grows under the monster; notes send ripples |
| **CHOMPER** | saturation / distortion (with a tone-taming filter) | violet ball of zig-zag teeth | Chomper sits on top of the monster chomping |
| **WIGGLE** | vibrato / pitch wobble (shared LFO) | magenta squiggly worm | the monster wobbles like jelly |

Every buddy has three levels — asleep, a little, a lot — shown with two pips and a glowing ring. Shaking a monster temporarily wakes a strong Wiggle.

## Consistency rules

* One identity colour per monster across stage, key panel, blocks, painting swatches, shelf portraits.
* Monsters never look sad, scared or "wrong" — mistakes don't exist, so there are no fail animations.
* Sleeping (muted) always means closed eyes + "z", never a red cross.
* Costumes (hat, shades, crown, flower, bow, halo, beanie, headphones, party hat) change with the sound preset so children can *see* which sound is on.

## Future characters (architecture ready)

Build-a-Monster (body, eyes, mouth, horns, texture ↔ oscillator, envelope, filter, modulation, effect) and Monster Packs (Space, Ocean, Robot, Dinosaur, Haunted, Jungle) plug into the same catalogue + preset data + SVG part structure.
