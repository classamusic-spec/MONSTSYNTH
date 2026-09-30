# 1 · Product information architecture

> **Make music before you know how music works.**
> A child should make an enjoyable sound within five seconds of opening the app, without reading.

## Principles that shape the structure

1. **One creative world, few places.** The child-facing app has exactly four places, reached from a rail of four pictures. There are no menus, tabs inside tabs, or modal flows in the child space.
2. **The monsters are the navigation.** Choosing an instrument means touching a monster. No instrument lists or dropdowns.
3. **Grown-up things live behind a gate.** Settings, deletion, export, microphone permission and privacy information are in Parent Space, which a young child cannot open by accident.
4. **Nothing to save, nothing to lose.** Every change autosaves. There is no Save, no Save As, no file names in the child space.

## Map

```
MONSTER SYNTH
│
├── 🟣 Wake screen  (first tap unlocks sound; monsters wake up and say hello)
│
├── Child space  ─────────────────────────────────────────────────────────────
│   ├── 🏠 My Songs          shelf of song pictures · New song · Start a band
│   ├── 👾 Monster Lab       ← app opens here
│   │     ├── Stage          every monster on the song, touch = sound + select
│   │     │     └── + Add Monster → Monster friends tray (invite / send home)
│   │     ├── Keys / Pads    8 keys (Boom: 6 or 8 drum pads) for the spotlight monster
│   │     ├── Sound toys     costume (preset) · Echo · Gloop · (Maker: Chomper · Wiggle)
│   │     └── Mimic          hold-to-talk voice button (when Mimic is on the keys)
│   ├── 🧱 Monster Blocks    the song: one row per monster, one column per loop
│   │     └── ✨ Magic       "make it a song" auto-arrangement
│   ├── 🖌 Sound Painting     draw music: colour = monster, height = pitch, left→right = time
│   └── Transport rail       ▶ Play/Stop · ● Record (Lab) / ✨ Magic (Blocks) · ↶ Undo
│                            (Maker: ↷ Redo · ✨ Monster Magic panel: speed & mood)
│
└── Grown-up space  (hold ☾ + ★ corners for 3 s, or answer a multiplication question)
    └── Parent Space
          ├── Who is playing?     Little Monster (3–5) · Monster Maker (6–10)
          ├── Sound               volume · maximum volume (ceiling) · test sound
          ├── Microphone (Mimic)  permission switch + plain-language explanation
          ├── Comfort & access    motion · high contrast · picture hints
          ├── Play time           optional limit (15–60 min): the monsters fall asleep when it's up
          ├── Songs               rename · copy · save audio (.wav) · delete
          └── Privacy & storage   what is stored where · storage use · delete all
```

## Two levels of interaction

| | **Little Monster** (≈3–5) | **Monster Maker** (≈6–10) |
|---|---|---|
| Reading required | none (pictures + sound) | optional labels (monster & sound names) |
| Monsters on stage | up to 4 | up to 6 |
| Drum pads | 6 big pads | 8 pads (adds cowbell, boing) |
| Effect buddies | Echo, Gloop | Echo, Gloop, Chomper, Wiggle |
| Timing help | strong (8th-note grid, 90 %) | lighter (16th-note grid, 75 %) |
| History | Undo | Undo + Redo |
| Musical choices | fixed, always in tune | Speed (70–140 bpm) + Mood (6 scales) |
| Blocks | tap / swipe / drag, sleep | + Solo |

The mode is chosen by a grown-up; nothing about the child's songs changes when switching.

## What is deliberately *not* in the product

No accounts, sign-in, cloud sync, social feed, public sharing, chat, followers, likes, ads, marketplaces, in-app purchases, streaks or manipulative rewards. No data leaves the device unless a grown-up saves an audio file.

## Deviations from the reference mock-ups (and why)

The four reference images set the art direction (night-sky world, glossy monsters, rainbow keys, big round transport buttons). The layout was changed where the images would not hold up on real screens held sideways:

| Reference | Built | Reason |
|---|---|---|
| Big page titles ("Monster Lab", "Make a Loop") and taglines on every screen | Brand only on the wake screen and the Songs shelf | Titles cost 20–25 % of the height of a phone held sideways, and 3–5-year-olds cannot read them. |
| Monster list in a sidebar **and** a `< Boom >` switcher | The monsters on stage *are* the switcher | Two controls doing one job; the stage lets kids see the whole band at once (the brief asks for several monsters simultaneously). |
| Transport bar along the bottom | Transport rail on the right, places rail on the left | Height is the scarce dimension in landscape; thumbs rest on the left and right edges when a phone is held sideways. |
| Waveform displays beside the transport | Loop ring around Play (position + 8 beat dots) | Same information, a quarter of the space, readable by non-readers. |
| One monster per screen with a scene | Spotlight monster larger, others visible on the same stage | Layering (adding a second monster) is a core test signal; it should be one tap away. |
| "Make a Loop" step grid | Monster Blocks = loops per song section, with note thumbnails | The brief defines blocks as loops/sections; thumbnails keep the "visual repetition" of the mock-up. |
| Colour families per role (melody purple, bass blue …) | Character colours from the art (Bloop blue, Grumble green …) | Kids identify monsters by the character first; one consistent colour per monster is used everywhere (stage, keys panel, blocks, painting). |
