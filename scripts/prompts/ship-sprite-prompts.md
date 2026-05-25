# Ship sprite prompts

Asset A — top-down pirate ship token used in `MissionScene`. Reads at ≥ 64px tall
on the smallest board. Must fit the warm sunset / parchment sticker palette
(`--coral`, `--sun`, `--parchment`, `--ink`; see `DESIGN.md` §5.1).

## Variant 1 — cute storybook (kept as final)

```
Top-down 2D game sprite of a small wooden pirate sailing ship, painted in a
warm storybook cartoon style with cream sails, a tiny red Jolly Roger flag,
and a curled stern. Centered on a fully transparent background. Soft 8px
offset sticker drop shadow. Single ship, no crew, no water, no UI, no text.
Clean ink outlines, flat shading with subtle painted texture. Designed for a
children's coding game; must read clearly at 96 by 128 pixels. Warm sunset
palette: coral red flag (#ff6b5c), cream sails (#fff1cf), warm tan hull
(#c08458), dark ink outline (#2b1d0e).
```

Why: this is the prompt that produced the keeper. Concrete pixel size in the
prompt forces the model to compose at the right scale instead of producing a
full painting that we'd then have to scale down (and lose detail to AA).

## Variant 2 — alternate try (discarded)

```
Aerial bird's-eye view of a friendly cartoon pirate ship, top-down camera,
sticker style, painted texture, warm cream and red palette, mast and two sails
visible from above as soft trapezoids, no shadow on the deck, transparent
background, no border, designed as a single token for a kids' game board.
```

Why discarded: generated a ship at a 3/4 angle and an overly painterly hull
that didn't crop cleanly. Kept Variant 1.
