# 5 · Design-token system

Tokens live in [`src/styles/tokens.css`](../src/styles/tokens.css) as CSS custom properties. The base interface is a **calm night sky**; the **monsters carry the colour**.

## Sizing philosophy

Children hold phones sideways, so **height is the scarce dimension**. Sizes are expressed as `clamp(min, N·vmin, max)` — they scale with the *short side* of the screen and never drop below touch-safe minimums or grow absurdly on large tablets.

## Colour

### Base (night sky)
| Token | Value | Use |
|---|---|---|
| `--sky-0 … --sky-3` | `#0b0d30 → #272d88` | page gradient |
| `--panel` | `rgba(17,19,64,.8)` | rails, key panel |
| `--panel-2`, `--panel-3` | lighter translucent indigo | buttons, row heads |
| `--edge`, `--edge-strong` | lavender 20 % / 50 % | 2 px panel borders |
| `--ink`, `--ink-2`, `--ink-3`, `--ink-dim` | `#fff`, `#d4d7ff`, `#959be0`, `#6b71bf` | text hierarchy |

### Monsters (identity colours, used everywhere the monster appears)
| Monster | `--x` | `--x-light` | `--x-dark` |
|---|---|---|---|
| Bloop · lead | `#2eb8ff` | `#8fdcff` | `#1476d6` |
| Boom · drums | `#ff7a2f` | `#ffb27a` | `#d9501a` |
| Grumble · bass | `#4fd65c` | `#9cf08f` | `#23a03a` |
| Spark · plucks | `#ffd233` | `#ffe98a` | `#e0a300` |
| Puff · pads | `#b9a5ff` | `#f1edff` | `#7f69e0` |
| Mimic · voice | `#ff5fa2` | `#ffa3cb` | `#d93a7e` |

### Effect buddies
`--echo #3de0c8` (teal) · `--gloop #8be04e` (lime) · `--chomper #b061ff` (violet) · `--wiggle #ff5ccf` (magenta)

### Keys (low → high)
`--key-0 … --key-7`: `#ff4f7e` `#ff8a2b` `#ffcf2e` `#4cd964` `#2fd0e8` `#3f8cff` `#9a5cff` `#ff5fd0`
Colour is never the only cue: glyph height and size also encode pitch, and readers get a name sticker.

Key face (shared by the Lab and Learn; the rules live in `src/styles/keys.css`, except the Learn staircase range and the word tags, which are in `src/styles/learn.css`):

| Part | Look | Contrast target |
|---|---|---|
| Glyph staircase | white at 80 % with a drop edge `color-mix(key 50%, black)` under the shape; drums 85 % | ≥ 3:1 for the non-text cue: the white fill alone is only 1.4–3:1 on the key, so the dark edge carries it (edge vs glyph ≥ 5:1 on every key) |
| Name sticker (white key) | pill `rgba(255,255,255,.94)`, ink `color-mix(key 38%, black)`, Fredoka 700 `clamp(14px, 4.2vmin, 26px)`, pill `clamp(22px, 6.2vmin, 40px)` high at `bottom: max(8px, 7%)` | ≥ 4.5:1 (measures 7.7:1 on yellow up to 12:1 on purple) |
| Name sticker (black piano key) | inverted pill `color-mix(key 30%, #0b0d30)`, white ink, thin white inner ring | ≥ 4.5:1 (measures ≥ 9:1) |
| Drum word (Maker) | same white pill, `--fs-xs` | ≥ 4.5:1 |
| Learn word tag | pill in the key colour, ink `#0b0d30`, always fully opaque (upcoming tags are scaled to 0.9 instead of faded) | ≥ 4.5:1 as rendered (lowest: purple ≈ 4.8:1; `e2e-learn` checks it) |
| Finger sparks | white 14 px dots with a 2 px edge `color-mix(key 55%, black)`, alternating with key-colour dots ringed in white; full opacity for 60 % of the 420 ms flight | visible on every key colour, yellow included |
| Sharps / flats | inline SVG strokes in `currentColor`, raised beside the letter | follows the ink |

High contrast turns stickers solid white with `#0b0d30` ink and a 2 px outline (black-key stickers: solid `#0b0d30`, white outline), glyphs fully opaque with a dark outline, and outlines every key; a keyboard-focused key (the Learn keys are buttons) keeps the 4 px `--focus` ring over that outline.

### Actions
`--rec #ff3b55` · `--play-1/2 #7b86ff → #4d4fe3` · `--focus #ffe066` (keyboard focus ring) · `--good #4cd964`

### High contrast (parent option)
`.app[data-contrast='high']` raises panel opacity to 95 %, edges to 55–90 % white and secondary text to full white; keys get the solid stickers and outlines above.

## Type

| Token | Size | Use |
|---|---|---|
| `--font` | Fredoka Variable (self-hosted, OFL), fallbacks: ui-rounded, SF Pro Rounded, Nunito | everything |
| `--fs-xs` | `clamp(10px, 1.9vmin, 13px)` | rail labels, captions |
| `--fs-s` | `clamp(12px, 2.4vmin, 16px)` | card names |
| `--fs-m` | `clamp(14px, 3vmin, 20px)` | body, bubbles |
| `--fs-l` | `clamp(18px, 4.4vmin, 30px)` | sheet titles, wake text |
| `--fs-xl` | `clamp(26px, 7vmin, 56px)` | finale |

Weights: 500 body, 600 labels, 700 titles. Parent Space uses a conventional 16 px / 1.45 reading size.

## Space, shape, size

| Token | Value |
|---|---|
| `--gap` / `--gap-s` | `clamp(6px, 1.5vmin, 16px)` / `clamp(4px, .9vmin, 10px)` |
| `--radius-s / m / l` | `clamp(10–16px)` / `clamp(14–26px)` / `clamp(18–36px)` |
| `--dock-btn` | `clamp(48px, 11.5vmin, 84px)` — places rail buttons |
| `--play-size` | `clamp(64px, 17vmin, 132px)` |
| `--rec-size` | `clamp(52px, 13vmin, 100px)` |
| `--small-btn` | `clamp(42px, 10vmin, 76px)` — undo |
| `--tool` | `clamp(38px, 8.5vmin, 60px)` — sound toys, swatches |
| safe areas | `--safe-t/r/b/l` from `env(safe-area-inset-*)` |

Minimum touch target 44 px everywhere; keys and pads are always the largest targets.

## Depth

* Panels: 2 px edge + `--shadow: 0 10px 26px rgba(3,4,30,.45)`.
* Keys: a 7 px darker "lip" below the key (`0 7px 0 color-mix(key 55%, black)`); pressed keys drop 6 px so the lip disappears.
* Monsters: radial-gradient bodies (light top-left → dark bottom-right), soft white specular ellipse, ground shadow ellipse. No blur filters.

## Motion

| Token | Value | Use |
|---|---|---|
| `--ease-pop` | `cubic-bezier(.34,1.56,.64,1)` | squash & stretch, selections, bubbles |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | presses, fades |
| `--t-fast / --t / --t-slow` | 110 / 220 / 420 ms | micro / standard / layout |

Monster reactions are driven by sound (see characters). **Reduced motion** (device setting or parent choice) keeps feedback — mouths, glows, colour — but removes bouncing, wobbling, confetti, twinkling and idle animation. Nothing flashes faster than ~2 Hz.

## Iconography

24-px grid, 2.6 px rounded strokes, filled silhouettes for primary actions (play, record, home, brush). Every icon button has an `aria-label`.
