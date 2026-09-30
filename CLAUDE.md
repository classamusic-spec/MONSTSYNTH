# Monster Synth — working notes

Tablet-first creative music toy for ages 3–10 (React 19 + TypeScript + Vite + Web Audio). Read `README.md` and `docs/` for product and design intent.

## Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run check        # tsc --noEmit + vitest (run before every commit)
npm run build        # production PWA build → dist/
npm run build:demo   # single-file embeddable demo → dist-demo/
npm run e2e          # Playwright checks (needs the dev server running on 127.0.0.1:5173)
node scripts/touch-check.mjs      # touch events, audio unlock, stuck notes, CPU throttle
node scripts/audio-levels.mjs     # re-measure preset levels after any sound change
node scripts/tour.mjs             # screenshots of every screen (phone/tablet/portrait)
```

Playwright is pinned to 1.56.1 to match the preinstalled Chromium.

## Layer rules (do not break)

- `src/audio/` knows nothing about songs, scales, the store or React.
- `src/magic/` and `src/model/` are pure: no DOM, no audio nodes. Unit-test them in `tests/`.
- `src/studio/` is the only place that connects gestures, Monster Magic and the audio engine.
- UI never touches audio nodes; it calls `studio.*` and listens on `visualBus`.

## Conventions

- Project edits: write a pure function in `src/model/edits.ts`, apply with `commit(p => edit(p, …))` (undo + autosave come for free). Use `{ coalesce: key }` for sliders/swipes, `{ undoable: false }` only inside a `beginGroup`/`endGroup` pair.
- Zustand selectors must return stable references (select the slice, derive in render) — a selector that builds a new array/object each call loops forever.
- Per-note animation is imperative (Web Animations API / DOM attributes), never React state.
- Notes store scale **steps**, not pitches. Pitch is resolved at play time.
- New sounds are data in `src/audio/presets.ts`; re-run `scripts/audio-levels.mjs` and keep single-note peaks around −6 to −13 dBFS.
- Any schema change: bump the version, add a migration step and a sanitiser branch in `src/model/schema.ts`, and add a round-trip test.
- Kids' UX: every touch makes sound or motion; no text is required; nothing destructive without undo; grown-up features live in Parent Space.
- Privacy: no network calls, analytics, accounts or third-party assets (fonts are self-hosted).
