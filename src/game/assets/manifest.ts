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

/** Texture key for a crew portrait badge (rasterized from the SVG in
 * public/art/crew/). Scenes must check `textures.exists` before use —
 * a failed load degrades to simply not drawing that badge. */
export const crewArtKey = (crewId: string): string => `crew-art-${crewId}`;

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

export const kindTextureMap = {
  enemy: textureKeys.enemy,
  obstacle: textureKeys.obstacle,
  treasure: textureKeys.treasure,
  crew: textureKeys.crew,
  current: textureKeys.current,
} as const;
