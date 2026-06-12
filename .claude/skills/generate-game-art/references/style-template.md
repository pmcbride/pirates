# Approved style template — mission board backgrounds

User-approved 2026-06-11 (PR #25, all nine v1 backgrounds). Change only the
two bracketed slots; every other clause exists because its absence produced a
rejected image at some point.

## The template

> Top-down bird's-eye view (orthographic, looking straight down) of
> **[SCENE]**, drawn in Japanese shōnen adventure-anime art style — bold black
> ink outlines, flat cel-shaded colors, soft cell highlights, expressive but
> clean shapes, warm tropical pirate-adventure cartoon palette. The area is
> mostly open ocean in the wide center (where a grid of game tiles will sit on
> top), with land/features ONLY at the very edges: **[EDGE FEATURES]**. Subtle
> wave ripples, foam swirls, and sun-shimmer patterns across the water surface.
> Palette: sea turquoise #4ec3df, deep sea blue #1d6f9f, sandy beach #f7d78b,
> parchment cream #fff1cf, accent red #ff6b5c, tropical green #7ec96b. The
> central ocean area must be visually uniform and uncrowded so that pirate
> ship sprites and game tile icons placed on top read clearly with strong
> contrast. NO ships, NO characters, NO people, NO UI, NO text, NO logos, NO
> grid lines, NO arrows, NO compass rose. Wide landscape aspect (roughly 3:2)
> for a game board background. Style references: classic Japanese
> pirate-adventure anime, Ghibli ocean color palette, sticker-style game art
> with thick black outlines.

## Filling the slots

- **[SCENE]**: one phrase naming the place and its mood, e.g. "the sea outside
  a small harbor town", "a windswept cove with gusty cross-waves", "the sea
  around a legendary final island bathed in golden light".
- **[EDGE FEATURES]**: 2–4 concrete features, each pinned to an edge or corner
  ("along the top edge", "at the bottom-left corner"). Pinning placement is
  what keeps the center open — vague features drift inward.
- Palette extensions are allowed per scene (e.g. `regal gold #ffc94a` for
  treasure-isle, pastel sky tones for coral-lookout) — append to the palette
  list, don't replace it.
- The eight shipped prompts in `scripts/prompts/backgrounds/` are the worked
  examples — read 2–3 before writing a new one. (tutorial-cove has no prompt
  file: its art was approved before the prompt-file convention existed; the
  template above is derived from it.)

## Scene voice per sea (keep the difficulty-curve mood)

| Sea | Mood | Example flavor |
|-----|------|----------------|
| Starter Cove / East Blue | sunny, safe, sandy | beaches, palms, small docks |
| Grand Line entry | dramatic motion | current swirls, rock arcs |
| Sky Island | airy, pastel | clouds below edges, lighter sea |
| Raftel / finale | golden, regal | glow, rock spires, deep blues |
| Free play | playful, zero threat | lagoon, palm clusters, no wrecks |

## Known failure modes → prompt fixes (from the v1 batch)

| Failure | Fix that worked |
|---------|-----------------|
| Horizon line / oblique camera (most common) | Add "perfectly flat vertical map view, no horizon line, no perspective depth" after the opening clause |
| Land creeping into center | Re-pin every feature to a named edge/corner and add "the entire central two-thirds is open water" |
| Watermark-ish smudge or stray glyphs | Re-roll; if it repeats, add "absolutely no lettering of any kind" |
| Overcooked detail fighting the tiles | Add "minimal detail in open water, large simple shapes" |
| Style drift (painterly/realistic) | Lead with "flat cel-shaded sticker-style cartoon" and cite the ink outlines twice |

## Reference standard

`public/art/bg-tutorial-cove.webp` is the canonical look. Every new background
must read as the same world: if you put it side-by-side with tutorial-cove and
it looks like a different game, re-roll with tightened style clauses no matter
how pretty it is.

## Non-background assets (sprites, tokens)

Same style vocabulary (ink outlines, cel shading, palette), but request
"isolated on a plain solid background for easy cutout, single centered
subject" and generate at 1024×1024. The Going Merry sprite
(`public/art/ship.png`, from PR #20) is the reference for sprite finish.
