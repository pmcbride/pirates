# Sea of Codes — Pirate Coding Adventure

A touch-first browser game that teaches **sequencing → loops → conditionals** to ages 5–7
through a One Piece-flavored pirate fantasy. Build a plan from large icon blocks, watch
the Going Merry execute it, and earn berries, Devil Fruits, and Straw Hat crew along the
way to Raftel and the One Piece.

> **IP scope:** personal/family use only. Direct One Piece names (Luffy, Zoro, gum-gum
> fruit, Raftel, etc.) are fine here. If you ever plan to publish, all named characters,
> fruits, and locations must be re-originalized — see `DESIGN.md → IP and theming`.

## Tech stack

- **Phaser 3.90** for the canvas playfield (world map, mission board).
- **TypeScript** strict mode, ESM, Vite for dev/build.
- **DOM HUD** layered over the canvas — all UI chrome lives in `src/ui/hud.ts`, not Phaser.
- **Vitest** for engine/profile unit tests.
- **No backend.** Profile persists to `localStorage`.

## Repository map

```
src/
  sim/          # deterministic game logic — pure TS, no Phaser, fully testable
    types.ts        # All shared types (AppState, MissionDefinition, RunStep, etc.)
    content.ts      # Mission/crew/fruit/command definitions — the game's content layer
    engine.ts       # runMission() — the command interpreter & rule evaluator
    profile.ts      # PlayerProfile + reward/persistence
    store.ts        # GameStore — subscribable singleton, the only source of truth
    engine.test.ts  # Vitest specs
  game/         # Phaser scenes (canvas only — never touches DOM)
    createGame.ts
    assets/manifest.ts
    scenes/{Boot,Title,WorldMap,Mission,Reward}Scene.ts
  ui/
    hud.ts      # DOM HUD — renders from store.subscribe(), dispatches store actions
  main.ts       # mounts canvas + HUD, routes scene by state.screen
  styles.css    # Visual language — see DESIGN.md for palette and tokens
```

## Working conventions

**Architecture rules — do not break these:**

1. **`src/sim/*` must remain Phaser-free.** It's the testable core. Importing
   `phaser` here is a regression.
2. **`src/game/*` must not touch the DOM.** Anything UI-chrome belongs in `src/ui/hud.ts`.
3. **All gameplay mutation goes through `gameStore`** (see `src/sim/store.ts`).
   Scenes and the HUD subscribe — they never write directly to `AppState`.
4. **`runMission()` is deterministic** — same input queue + profile must produce identical
   `RunStep[]`. Don't introduce `Math.random` or `Date.now` into the engine. Tests in
   `engine.test.ts` rely on this.
5. **Mission failure is "gentle rewind", not game over.** Always return a `HintResult`
   with a `focusTemplateId` and `highlightPositions`. The HUD turns this into a speech
   bubble pointing at the suggested fix (queue card, or the palette stamp when the fix
   is a missing block); `MissionScene` draws pulsing rings on the highlighted tiles.
6. **Run playback advances on the wall clock, never Phaser's clock.** Phaser tweens and
   `delayedCall` freeze while the page is hidden (backgrounded tablet, headless preview),
   so a run awaiting them never reaches `finishPlayback()`. Flow-critical waits in
   `MissionScene` go through `beat()` (`window.setTimeout`); tweens are cosmetic-only and
   every step converges via `snapToStep()`. This is what makes automated preview
   playthroughs possible — keep it that way.
7. **Pre-readers gate every UX decision.** No required reading or typing on the critical
   path: first-run identity is the tap-a-pirate preset grid, board tiles speak pictogram
   (never letters), prediction starts at mission 4, and Web Speech narration mirrors
   on-screen text.

**Content authoring (`src/sim/content.ts`):**

- A mission needs: `MissionNode` (map node + rewards) and `MissionDefinition` (board +
  tiles + suggested queue). Both go in `content.ts`. `missionNodes` ordering = unlock
  ordering — `orderedMissionIds` derives from it.
- Add a new mission by appending to `missionNodes`, adding the matching key to
  `missions`, and listing the previous mission's id in `unlockMissionIds`.
- Keep `palette` short — only show the blocks the lesson needs. Surprise blocks confuse
  early readers.
- `tutorial` text is the single line shown in the dock head — keep it ≤ 60 chars.

**Difficulty curve (must hold):**

| Sea | Concept introduced | Mission |
|-----|-------------------|---------|
| Starter Cove | Sequencing only | tutorial-cove |
| East Blue | Sequencing + first enemy | spark-shoals |
| Grand Line entry | Loops (`repeat`) | current-crescent |
| Sky/Alabasta | Conditionals (`if`) | coral-lookout |
| Raftel | Loops + conditionals combined | treasure-isle |

Never introduce two new concepts in one mission. Loops before conditionals; conditionals
before combined.

**Visual / UX rules (frontend):**

- Touch targets ≥ 64px on the smallest dimension; primary CTAs ≥ 72px tall.
- 1–2 words per button label. Icons are mandatory; text is supportive.
- Never block the lower-third of the playfield during a run — that's the action zone.
- Hints render as comic speech bubbles, never modals. They must include both the
  *reason* and the *suggested fix* in plain words.
- Reduced-motion mode (`profile.settings.reducedMotion`) cuts playback delay and skips
  cosmetic animations — never information animations.

## Running it

```bash
npm install
npm run dev       # vite dev server
npm test          # vitest engine specs
npm run build     # tsc --noEmit + vite build
```

There is no lint script yet — TypeScript strict + the test suite are the safety net.

## Where to make common changes

| You want to... | Edit |
|----------------|------|
| Add a mission | `src/sim/content.ts` (both `missionNodes` and `missions`) |
| Add a new command block | `src/sim/content.ts` `commandLibrary` + handler in `engine.ts` |
| Recruit a new Straw Hat | `crewMates` in `content.ts` + reward wiring in a mission |
| Add a Devil Fruit power | `fruitPowers` + `engine.ts` (e.g. `fireRange()` reads it) |
| Restyle the HUD | `src/styles.css` + markup in `src/ui/hud.ts` |
| Change board visuals | `src/game/scenes/MissionScene.ts` + `assets/manifest.ts` |
| Add a stat (bounty, log) | `PlayerProfile` in `types.ts` → engine → store → HUD |

## Definition of done for a PR

1. `npm test` green.
2. `npm run build` clean (tsc + vite).
3. The change has been opened in `npm run dev` and the affected flow clicked through
   on a tablet-portrait viewport (768×1024) at least once.
4. New gameplay rules have an engine test.
5. `DESIGN.md` updated if the change touches the core loop or visual language.
