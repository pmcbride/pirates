# Sea of Codes — Design Doc

> Teach the very first ideas of code — *do this, then this, then this; sometimes
> repeat; sometimes only if* — by putting a kid behind the wheel of the Going Merry
> and pointing them at the horizon.

## 1. North star

- **Audience:** ages 5–7, tablet-first, often pre- or early-reader.
- **Session length:** 3–5 minutes per mission, 15–20 minutes per sit-down.
- **Learning arc:** sequencing → loops → conditionals. Nothing more in v1. No
  variables, no nesting, no typed code.
- **Emotional arc:** every voyage feels like a small chapter of a pirate adventure
  with a clear win and a tiny new toy (block, fruit, crew mate).
- **Failure tone:** "gentle rewind" — never *game over*, always *try the same step
  again with a hint*. The cost of a wrong plan is 5 seconds, not a mission restart.

## 2. The core loop

```
World map ─► Mission planning ─► Plan execution ─► Resolution
   ▲              │                     │              │
   │              │  (mistake)          │              │
   └──────────────┴───── Gentle rewind ◄┘              │
                                                       ▼
                                          Reward / Captain's Log
```

### Beats

1. **World map (Grand Line chart).** Parchment scroll showing the route from
   Starter Cove → Raftel. The player taps the next unlocked island. The map
   docket previews the reward and the one new concept the mission will teach.
2. **Mission planning.** Bottom dock holds the **command queue** (drag/tap stamps
   in) and the **block palette** (only the blocks this lesson cares about). On a
   mission's first attempt, the suggested queue is pre-loaded so the child never
   faces an empty canvas. On subsequent attempts, only the first stamp is
   pre-loaded — the kid has to think the rest through (a "Reset to Suggested"
   button is always available as a safety net, and parents can enable a settings
   toggle to always pre-load the full plan).
3. **Predict-then-run.** Before playback starts (every mission except the
   tutorial), the playfield enters a tap-to-predict overlay: "Where will the
   ship end up?" The player drops a marker on a tile and confirms with "Run
   plan!". After playback the reward (or hint) screen reports whether the
   prediction was right — converting passive watching into active reasoning per
   Wing/Bers/Resnick research on early CT. A "Skip prediction" link on the
   predict screen persists in the profile for parents who want to opt out.
4. **Plan execution.** The Going Merry runs the queue beat-by-beat. Each block
   highlights as it executes. On a hit (treasure, enemy, recruit) the affected
   tile pops and a 1-word callout fires. On a failure the ship freezes mid-beat,
   the offending block pulses, and a **speech bubble** from a relevant Straw Hat
   says what went wrong and what to add.
5. **Resolution.** Success ⇒ Reward screen (berries + stars + new toy) and a
   single line of **Captain's Log** ("Day 14 — Cleared Spark Shoals, took the
   Marine skiff with one shot."). Failure ⇒ player drops back into planning with
   the queue intact and the hint pinned.

### What changed vs. the codex draft

- Currency renamed to **berries** (with bounty as a separate stat).
- Added a **bounty meter** as a secondary progression signal — every enemy
  defeated grows it, and bounty milestones unlock new title cards on the world
  map ("Wanted: 10,000,000 ฿"). It's a *feeling* of escalation that costs
  nothing extra to play.
- Added the **Captain's Log** — one auto-generated line per cleared mission,
  shown on the reward screen and saved into a scrollable log drawer. Gives kids
  a sense of story persistence without requiring them to read more.
- HUD redesigned around comic-book stamps and wanted-poster cards (see §5).

## 3. Content plan (v1)

| # | Sea               | Mission           | Lesson           | Reward                                     |
|---|-------------------|-------------------|------------------|---------------------------------------------|
| 1 | Starter Cove      | Tutorial Cove     | Sequencing       | 6 berries, unlock `fire`                    |
| 2 | East Blue         | Spark Shoals      | Seq + first enemy| 10 berries, unlock `dodge`, recruit Zoro    |
| 3 | Grand Line entry  | Current Crescent  | `repeat`         | 14 berries, unlock `repeat`                 |
| 4 | Sky Island        | Coral Lookout     | `if`             | 18 berries, unlock `if`+`talk`, Gum-Gum Fruit |
| 5 | Raftel            | Treasure Isle     | `repeat` + `if`  | 24 berries, recruit Nami                    |

**Straw Hat crew (passive helpers, not separate combat units):**

| Crew    | Role          | Passive                                       |
|---------|---------------|-----------------------------------------------|
| Zoro    | Swordsman     | Hints get a sparkle and a clearer suggestion. |
| Nami    | Navigator     | +1 berry on every cleared mission.            |
| Usopp   | Sniper (v1.1) | Extends `fire` range by 1.                    |
| Sanji   | Cook (v1.1)   | Failed `collect` no longer ends the run.      |

**Devil Fruits (command modifiers, not new commands):**

| Fruit              | Modifies   | Effect                                  |
|--------------------|------------|-----------------------------------------|
| Gum-Gum (Ember v1) | `fire`     | Fire reaches two tiles ahead.           |
| Smoke-Smoke (v1.1) | `dodge`    | Dodge can pass through a single reef.   |
| Bara-Bara (v1.1)  | `collect`  | Collect grabs from one tile ahead too.  |

## 4. Game systems

### 4.1 Command blocks

| Block       | Type      | Args                              | Lesson |
|-------------|-----------|-----------------------------------|--------|
| Up          | action    | —                                 | sequence atom (absolute direction) |
| Down        | action    | —                                 | sequence atom (absolute direction) |
| Left        | action    | —                                 | sequence atom (absolute direction) |
| Right       | action    | —                                 | sequence atom (absolute direction) |
| Dodge       | action    | —                                 | sequence + reflex |
| Fire        | action    | —                                 | sequence + targeting |
| Collect     | action    | —                                 | sequence + interaction |
| Talk        | action    | —                                 | sequence + interaction |
| Repeat      | loop      | count (2–3), action               | loops |
| If          | condition | condition, then-action            | conditionals |

The four direction blocks (**Up / Down / Left / Right**) each move the ship one
tile in the matching compass direction — **absolute, not relative**. The ship's
facing is auto-set to whichever direction it last moved, so the sprite still
"points forward" and `Fire` / `Dodge` / tile-here actions still have a well-defined
notion of "ahead" — but the player never has to mentally rotate to plan a route.
The older `Sail` + `Turn Left` / `Turn Right` blocks were retired with the
absolute-direction model (PR #16) — they required 5-year-olds to mentally compose
two transformations per move.

**Block argument editing** is single-tap cycling, never typed input. `count` cycles
2 ↔ 3. Conditions cycle through `enemyAhead / obstacleAhead / treasureHere / crewHere`.

### 4.2 Engine determinism

`runMission(mission, queue, profile) → MissionRunResult` is pure. Same args = same
output. No randomness in v1. Sea visuals can be cosmetic-random; gameplay never is.

### 4.3 Bounty meter (new)

```
profile.bounty += 1_000_000 per enemy defeated by Fire
profile.bounty += 5_000_000 per boss defeated
```

Bounty has **no gameplay effect** in v1. It's a wanted-poster number that grows
on the title bar and reward screen. Milestones:

- 0  ฿: "Rookie Pirate"
- 10M ฿: "East Blue Champion"
- 50M ฿: "Grand Line Captain"
- 100M ฿: "Yonko-class"

### 4.4 Captain's Log (new)

After every successful mission, append:

```ts
{
  day: number,        // monotonically increasing
  missionId: string,
  oneLine: string,    // auto-generated from mission outcome
}
```

Auto-generation uses simple templating from the run result — number of enemies
splashed, treasure grabbed, crew recruited. The log lives in a side drawer and the
last entry shows on the reward screen.

## 5. Frontend redesign

### 5.1 Visual language

| Layer         | Tokens                                                  |
|---------------|---------------------------------------------------------|
| Palette       | Warm sunset over a sky-blue sea, not the codex's deep navy. |
|               | `--sea`: `#4ec3df`, `--sea-deep`: `#1d6f9f`             |
|               | `--sky`: `#ffe9b8`, `--sun`: `#ffb24a`                  |
|               | `--parchment`: `#fff1cf`, `--ink`: `#2b1d0e`            |
|               | `--coral`: `#ff6b5c`, `--mint`: `#7be0a3`, `--plum`: `#8e7ad8` |
|               | `--bounty`: `#c4391c` (wanted-poster red)               |
| Type          | Display: a chunky storybook serif (Fredoka / fallback Georgia bold). |
|               | UI: a high-x-height sans (Nunito / fallback Trebuchet).             |
|               | Sizes step on 1.25 ratio: 14 / 18 / 22 / 28 / 36 / 48.              |
| Shape         | 28px corner radius everywhere. 3px ink-black border on stamps.      |
|               | 8px offset drop shadow (no blur) — the "sticker" look.              |
| Iconography   | Each command is a colored stamp with a chunky pictogram +           |
|               | a 1-word caption. No fine-line icons.                               |
| Motion        | Slot-in spring on stamps dropped into the queue, gentle bob on the  |
|               | Merry while idle, pop on tile clears. Stripped in reduced-motion.   |

### 5.2 Layout (mission view, portrait tablet)

```
┌──────────────────────────────────────────────────┐
│  ◀ Map     [Sea name — Mission title]    Bounty │  ← top strip (≤ 72px)
├──────────────────────────────────────────────────┤
│                                                  │
│              [ Phaser playfield ]                │
│                                                  │
│           ┌────────────────────┐                 │
│           │  💬 Hint bubble    │  (when active) │
│           └────────────────────┘                 │
├──────────────────────────────────────────────────┤
│  Command Queue                                   │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                       │  ← horizontal scroll
│  │S │ │R3│ │F │ │C │ │S │                       │
│  └──┘ └──┘ └──┘ └──┘ └──┘                       │
│  ─────────────────────────────  [Clear] [▶ Run] │
│  Block Palette                                   │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐                            │
│  │Sa│ │Fi│ │Co│ │Re│                            │
│  └──┘ └──┘ └──┘ └──┘                            │
└──────────────────────────────────────────────────┘
```

Side stats (berries, bounty, crew count, fruit count) collapse to a single
horizontal pill row above the command queue on tablet-portrait — the codex
draft's right-side vertical stack swallowed too much screen.

### 5.3 Component spec

- **Command stamp (palette + queue):** 96×96 min, colored fill, 3px ink border,
  big pictogram (~40px), 1-word label below in 14px bold. Press → press-in shadow.
- **Wanted-poster card (crew + fruit drawers):** parchment background, ink-black
  rough border, dotted divider, "WANTED" header, character portrait, bounty in
  red, one-line ability in handwritten font. Used in the reward reveal too.
- **Hint speech bubble:** parchment fill, dotted tail pointing at the failed
  block, two lines max: bold *reason*, lighter *suggestion*.
- **Captain's Log entry:** parchment row, "Day N" left rule, one-line entry.
- **Primary CTA:** sun-yellow fill, ink border, drop shadow, 72px tall.

### 5.4 World map redesign

The world map switches from "constellation of glowing nodes" to a true **pirate
chart**: parchment background, dotted route line, x-marks-the-spot icons,
ribboned banner labels per sea ("East Blue", "Grand Line", "Raftel"). Each
island bobs in a sea-foam ring on hover.

The map docket (bottom card) shows: sea name, mission title, one-line preview,
reward icons, and a big "Set Sail" CTA. Routes drawer becomes a "Voyage Log"
drawer listing cleared missions with stars and Captain's Log entries.

## 6. Accessibility

- Tap targets ≥ 64px. Primary CTAs ≥ 72px.
- No information is conveyed by color alone — every state has an icon and a label.
- `prefers-reduced-motion` and an in-app toggle both kill cosmetic motion and
  halve playback delay.
- Speech bubbles use the highest-contrast text (`--ink` on `--parchment`).
- Audio (in v1.1) is supportive, never required. All sound is paired with a
  visible animation.
- No text input. Ever. Argument editing is single-tap cycling.

## 7. IP and theming

This build uses direct One Piece names because the project is personal/family
only. If publication is ever considered, all of the following must be renamed
(no character likenesses or trademarked terms):

- Ship "Going Merry" → e.g. "Sunny Skipper"
- Crew: Luffy/Zoro/Nami/Usopp/Sanji → original names matching the codex draft
  (Captain Coral, Saber, Compass, Spyglass, Skillet).
- Fruits: Gum-Gum → "Stretch Fruit"; Smoke-Smoke → "Mist Fruit"; etc.
- Seas: East Blue / Grand Line / Raftel → "Starter Cove / Grand Sea / Last Isle".
- Currency Berries (฿) → "Doubloons".
- Bounty visual styling (wanted poster) is generic-pirate and stays.

## 8. Roadmap

| Phase   | Scope |
|---------|-------|
| v1.0 (now) | 5 missions, 9 blocks, 2 crew, 1 fruit, bounty meter, captain's log, full HUD redesign, all engine tests green. |
| v1.1   | 3 more missions in Alabasta, +3 crew (Usopp/Sanji/Chopper), +2 fruits, sound, animated wanted posters. |
| v1.2   | Sandbox island: free-play with all unlocked blocks, no objective — pure programming play. |
| v2     | Multi-step lessons (introduce `if-else`), 2-block `repeat`, branching world map with optional islands. |

## 9. Open questions

- **Drag-and-drop on small touch:** the codex draft supports both tap and drag.
  Need to test whether 5-year-olds reliably drag stamps from palette to queue,
  or whether tap-to-append is the only used path. Possibly remove HTML5 drag in
  v1.1 if telemetry confirms.
- **Reading load:** the suggested-queue safety net let kids beat missions
  without engaging the lesson. Implemented mitigation: only the *first* attempt
  pre-loads the full suggested queue; subsequent attempts start with a single
  stamp (a "Reset to Suggested" button is always available, and parents can
  re-enable the legacy behavior via Settings → "Always pre-load full plan").
- **Save scope:** profile is single-slot per browser. Multi-kid households will
  collide. Consider a name-picker on first launch in v1.1.
