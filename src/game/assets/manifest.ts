import type { TileKind } from "../../sim/types";

export const textureKeys = {
  ship: "ship-token",
  enemy: "enemy-token",
  obstacle: "obstacle-token",
  treasure: "treasure-token",
  crew: "crew-token",
  goal: "goal-token",
  current: "current-token",
} as const;

/** Painted ship sprite (One Piece-style, faces north at 0°). Loaded from
 * public/art/; falls back to the procedural token when absent. */
export const shipArtKey = "ship-art";

/** Painted per-mission board backgrounds. Missions without an entry fall back
 * to the procedural sky/sea gradient. Aspect ratio of the source art is 3:2. */
export const missionBackgrounds: Record<string, string> = {
  "tutorial-cove": "bg-tutorial-cove",
  "spark-shoals": "bg-spark-shoals",
  "windrise-cove": "bg-windrise-cove",
  "barrel-bay": "bg-barrel-bay",
  "harbor-bend": "bg-harbor-bend",
  "current-crescent": "bg-current-crescent",
  "coral-lookout": "bg-coral-lookout",
  "treasure-isle": "bg-treasure-isle",
  "sandbox-isle": "bg-sandbox-isle",
};

export const uiColors = {
  sea: 0x4ec3df,
  seaDeep: 0x1d6f9f,
  sky: 0xffe9b8,
  sun: 0xffb24a,
  sunset: 0xff7a4e,
  parchment: 0xfff1cf,
  parchmentDeep: 0xf1d99a,
  ink: 0x2b1d0e,
  foam: 0xd6f3f8,
  sand: 0xf7d78b,
  coral: 0xff6b5c,
  mint: 0x7be0a3,
  plum: 0x8e7ad8,
  gold: 0xffc94a,
  reef: 0x4f6a55,
  storm: 0x3c6e91,
  bounty: 0xc4391c,
  white: 0xffffff,
} as const;

/** Every board tile kind except "goal" (the goal renders via textureKeys.goal
 * + goalGlyph). Anchoring both maps to TileKind means adding a new kind fails
 * compilation here instead of silently rendering a blank tile. */
type BoardTileKind = Exclude<TileKind, "goal">;

export const kindTextureMap = {
  enemy: textureKeys.enemy,
  obstacle: textureKeys.obstacle,
  treasure: textureKeys.treasure,
  crew: textureKeys.crew,
  current: textureKeys.current,
} as const satisfies Record<BoardTileKind, string>;

/** Hand-drawn SVG tile icons (public/art/tiles/). Rasterized by the loader at
 * 2× tile scale and used as the primary board token art; missions fall back to
 * the procedural `kindTextureMap` stamp + `kindGlyphMap` pictogram when a file
 * fails to load, mirroring the painted-background pattern. */
export const tileArtKeys = {
  enemy: "tile-art-enemy",
  obstacle: "tile-art-obstacle",
  treasure: "tile-art-treasure",
  crew: "tile-art-crew",
  current: "tile-art-current",
} as const satisfies Record<BoardTileKind, string>;

/** X-marks-the-spot landing pad — the goal tile's painted icon. */
export const goalArtKey = "tile-art-goal";

/** Pictogram per tile kind — the pre-reader fallback when a hand-drawn icon
 * fails to load. Rendered as Phaser text centered on the colored token
 * backplate (the backplate keeps carrying the color coding). The current
 * token is glyph-free: its procedural stamp already paints a foam spiral, and
 * stacking the cyclone emoji on top read as two competing swirls. */
export const kindGlyphMap = {
  enemy: "⛵",
  obstacle: "🪨",
  treasure: "💰",
  crew: "🧑",
  current: "",
} as const satisfies Record<BoardTileKind, string>;

/** Goal-tile pictogram — the finish flag every kid knows from races, shown
 * when the painted goal icon isn't available. */
export const goalGlyph = "🏁";
