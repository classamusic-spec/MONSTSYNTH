# 9 · Project data model

Songs are plain JSON documents with a **schema version**, stored in IndexedDB and autosaved. Types: [`src/model/types.ts`](../src/model/types.ts). Loading: [`src/model/schema.ts`](../src/model/schema.ts).

## Project (schema v1)

```ts
Project {
  schemaVersion: 1
  id: string                   // "p-xxxxxxxxxx"
  name: string                 // playful generated name, grown-ups can rename
  createdAt, modifiedAt: number (epoch ms)
  tempo: number                // bpm, 70–140
  key: number                  // root pitch class, 0 = C
  scale: ScaleId               // pentatonicMajor | pentatonicMinor | major | minor | blues | chromatic
  beatsPerBar: number          // 4
  loopBeats: number            // 8  (one loop = one block)
  tracks: Track[]              // stage order = row order in Monster Blocks
  bench: { track: Track; row: (clipId|null)[] }[]   // monsters sent home keep their loops
  arrangement: { length: 8, rows: { [trackId | 'paint']: (clipId | 'paint' | null)[] } }
  painting: { strokes: Stroke[]; sleeping: boolean }
  art: { hue: number; seed: number }                // drives the song's picture on the shelf
}

Track {
  id: string; monster: MonsterKind                  // bloop | boom | grumble | spark | puff | mimic
  preset: string                                    // e.g. "bubble-lead"
  clips: Clip[]; activeClipId: string | null        // MVP uses one clip; model allows variations
  sleeping: boolean; solo: boolean; volume: 0..1
  fx: { echo, gloop, chomper, wiggle: 0..1 }
  sampleId: string | null                           // Mimic's recording in the sample store
}

Clip { id: string; lengthBeats: number; notes: NoteEvent[] }

NoteEvent {
  id: string
  beat: number                 // start inside the clip, 0 ≤ beat < lengthBeats
  dur: number                  // beats
  step: number                 // key index (scale step; drum pad for Boom) — NOT a pitch
  vel: number                  // 0..1
  tone: number                 // Dark ↔ Sparkly at record time, -1..1
}

Stroke { id; brush: MonsterKind | 'rainbow'; kind: 'line' | 'stars'; points: number[] /* x0,y0,x1,y1… 0..1 */; weight: 0..1 }
```

### Why notes store scale steps

Pitches are resolved at play time from `(step, monster register, key, scale)`. A child's loop therefore survives any change of mood or key and can never become out of tune; the same loop can be played by a different monster later (Build-a-Monster) without conversion.

### Mapping to the brief's required fields

| Brief | Field |
|---|---|
| project ID / name / creation & modified date | `id`, `name`, `createdAt`, `modifiedAt` |
| tempo / musical key / scale | `tempo`, `key`, `scale` |
| tracks / monster type / instrument preset | `tracks[]`, `track.monster`, `track.preset` |
| loop clips / clip duration / clip placement | `track.clips[]`, `clip.lengthBeats`, `arrangement.rows` |
| mute state / volume / effects state | `track.sleeping` (+ `solo`), `track.volume`, `track.fx` |
| sample references | `track.sampleId` → `samples` store (shared by copied songs; a recording is removed only when no saved song, the open song or its undo steps use it, and never in the session it was made) |
| arrangement | `arrangement` |
| settings | separate `Settings` document (below) |

## Settings (schema v2, one per device)

```ts
Settings { schemaVersion: 2; ageMode: 'little' | 'maker'; volume: 0..1; volumeCeiling: 0.1..1;
           micAllowed: boolean; motion: 'system' | 'reduce' | 'full'; highContrast: boolean;
           hints: boolean; sessionMinutes: 0 | 15 | 30 | 45 | 60; lastProjectId: string | null;
           lessonStars: Record<songId, 1..3> }   // v2: best stars per learned song
```

v1 → v2 adds `lessonStars` (older settings start with none).

Song lessons themselves are data in `src/magic/lessons.ts`, not stored: each song is
phrases of exactly one block (8 beats) of major-scale steps 0–7 plus one chord root
per half bar. "Keep my song" builds an ordinary project from it (`lessonProject`):
the teacher monster gets one clip per distinct phrase, Boom/Grumble/Spark get a
beat, a bass line and sparkles from the chords, and the tune repeats to fill 8 blocks.

## Storage

IndexedDB database `monster-synth` (v1), object stores:

| Store | Key | Value |
|---|---|---|
| `projects` | project id | Project JSON |
| `samples` | sample id | WAV `Blob` (16-bit mono) |
| `kv` | `"settings"` | Settings JSON |

* **Autosave:** every committed change schedules a write 600 ms later; hiding or closing the app (`visibilitychange`, `pagehide`) flushes immediately. Writes are serialised so they never race.
* **Persistence request:** the app asks the browser to mark storage persistent (`navigator.storage.persist()`); Parent Space shows whether that was granted and how much space is used.
* **Fallback:** if IndexedDB is unavailable (e.g. some private modes) the app keeps working with in-memory storage.
* **Housekeeping:** at start-up, recordings that no song refers to are removed.

## Versioning and migrations

1. Every stored document carries `schemaVersion`.
2. On load, `migrateProject(raw)` runs `PROJECT_MIGRATIONS[v]` step by step up to the current version (v0 → v1 exists for unversioned prototype drafts).
3. The result is **sanitised**: unknown monsters are dropped, duplicate monsters removed, numbers clamped (tempo 70–140, velocities 0.05–1, steps 0–15), notes wrapped into their clip, broken references (arrangement cells pointing at missing clips, active clip ids) repaired, malformed strokes discarded.
4. A child is never told a song is "corrupt": anything salvageable is kept. Only non-objects are rejected.
5. Documents from a newer app version are sanitised best-effort instead of refused.

To add v2: bump `PROJECT_SCHEMA_VERSION`, add `PROJECT_MIGRATIONS[1]`, extend `sanitizeProject`, and add a round-trip test.

## Undo history

The store keeps up to 80 previous project snapshots (immutable data shares unchanged structure). Consecutive slider or swipe edits coalesce into one step (1.5 s window, same key); a recording pass is one step. History is per session and per song (opening another song starts fresh).
