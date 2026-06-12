---
name: generate-game-art
description: Generate painted art for Sea of Codes (mission board backgrounds, sprites) with gpt-image-1 via scripts/generate-art.ts, in the approved top-down shōnen style, then convert to WebP, wire into the Phaser manifest, and verify with the screenshot harness. Use this whenever the task involves adding or changing game art — a new mission that needs a background, re-rolling an off-style image, a new sprite or token, "make art for X", "paint the board for Y" — even if the user doesn't mention AI or image generation. Also use it when reviewing whether existing art matches the approved style.
---

# Generate game art (Sea of Codes)

End-to-end pipeline for painted game assets: author prompt → generate with
gpt-image-1 → review against the style bar → convert to WebP → wire into the
game → verify in the browser. The style is locked (user-approved); the job is
to extend it consistently, not to invent a new look.

## Cost guardrail

gpt-image-1 prices by quality tier and the spread is large — roughly $0.04
(medium) to $0.25 (high) per 1536×1024 image at launch pricing. Check current
pricing rather than trusting these numbers, and before any batch run state the
image count, quality tier, and estimated cost. Single images and re-rolls
within an approved batch don't need re-approval; a new multi-image batch does.

The API key is `OPENAI_API_KEY` from `.env` at the repo root (the script also
searches the worktree and parent checkout). Never print, echo, or log the key —
the script already redacts it; keep it that way in any debugging.

## Workflow

### 1. Author the prompt

Read [references/style-template.md](references/style-template.md) and fill in
only the `[SCENE]` and `[EDGE FEATURES]` slots — everything else in the
template is load-bearing (perspective, palette, the uncrowded-center rule, the
NO-list). Derive the scene from the mission's identity in
`src/themes/one-piece.ts` / `src/themes/original.ts` (briefings + labels).

Save the prompt to `scripts/prompts/backgrounds/bg-<mission-id>.txt` (or
`scripts/prompts/<asset>.txt` for non-backgrounds) so every committed asset has
a reproducible prompt next to it.

**Moderation trap:** never put "One Piece", "Eiichiro Oda", or any character
name in a prompt — OpenAI blocks IP references and the request fails. Describe
the *style* generically ("Japanese shōnen adventure-anime", "classic Japanese
pirate-adventure anime") instead; that's exactly what the template does.

### 2. Generate

```bash
npx tsx scripts/generate-art.ts \
  --prompt-file scripts/prompts/backgrounds/bg-<id>.txt \
  --out art/generated/bg-<id>.png \
  --size 1536x1024 --quality high \
  --model gpt-image-1
```

Pin `--model gpt-image-1`. Without it the script silently falls back to
dall-e-3 on *any* error (including auth/quota), which produces off-style art
at a different size and bills a second call — better to fail and read the
error. If you ever run without the pin, check the `model:` line in the
`.log.txt` sidecar before accepting the image.

`art/generated/` is gitignored scratch space, and the `.log.txt` sidecar
(prompt + model metadata) is local-only — the committed prompt file from
step 1 is the durable provenance. For a batch, launch the generations as
parallel background Bash jobs (each takes 1–2 min) and collect results as
they finish.

### 3. Review before accepting

Open each image with the Read tool and check, in order of how often gpt-image-1
gets them wrong:

1. **Perspective** — truly top-down? A horizon line or oblique angle is the
   most common failure.
2. **Center clarity** — wide middle open and calm enough for tiles and the
   ship sprite to read on top? Land creeping past the edges fails.
3. **Style match** — same world as `public/art/bg-tutorial-cove.webp`
   (the reference standard): ink outlines, flat cel shading, the palette.
4. **Artifacts** — no text, watermark-ish smudges, grid lines, ships, people.

If an image fails, re-roll **once** with a tightened prompt (known fixes are in
the style template), then accept the better of the two. Don't loop more than
once without telling the user — repeated rolls cost money and usually mean the
prompt needs rethinking, not rerolling.

### 4. Convert to WebP

Game assets ship as WebP under 400 KB (`public/art/` is in the bundle):

```bash
cwebp -q 80 art/generated/bg-<id>.png -o public/art/bg-<id>.webp
```

If the result is over ~400 KB (busy scenes), downscale to 1152×768 first —
`cwebp -resize 1152 768 -q 80 …` — Phaser cover-scales it back up and the
painted style hides the resolution loss.

### 5. Wire into the game

For a mission background, add one line to `missionBackgrounds` in
`src/game/assets/manifest.ts`:

```ts
"<mission-id>": "bg-<mission-id>",
```

BootScene preloads every entry from `public/art/<key>.webp` automatically.
Missing/failed art degrades to the procedural gradient by design — which means
a typo'd key **looks** fine and just renders plain. That's why step 6 is not
optional. Other asset types (sprites) get their own key in the manifest and an
explicit `this.load.image` in BootScene.

### 6. Verify in the browser

```bash
npm i --no-save puppeteer-core            # if not present
npm run dev > /tmp/soc-dev.log 2>&1 &     # log to a file; read the port from it — it roams
SOC_URL=http://localhost:<port> node scripts/screenshot-missions.mjs <suffix>
# set CHROME_PATH if Chrome isn't at the default macOS location
```

`<suffix>` names the screenshot batch (`art/screenshots/<mission>-<suffix>.png`).
For the PR's before/after pair, run once from the pre-change build with
`before` and once with your changes with `after`.

The harness asserts each mission screen mounts and **fails loudly (exit 1) on
any art-load failure**, including vite's 200/text-html SPA fallback for missing
files. A clean exit still isn't enough: Read each screenshot and confirm the
right background is behind the board.

**Stale-server trap:** another worktree's vite may already be serving an old
build on the expected port. Verify the server you're hitting was started from
*this* worktree (`lsof -nP -iTCP:<port> -sTCP:LISTEN` → check the PID's cwd)
before trusting any screenshot.

### 7. Definition of done

- Prompt file committed alongside the asset.
- `npm test` and `npm run build` green.
- Screenshots reviewed for every touched mission; before/after pair in the PR.
- DESIGN.md §5 updated if the visual language itself changed (not needed for
  new missions that follow the existing style).
