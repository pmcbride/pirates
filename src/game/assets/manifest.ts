export const textureKeys = {
  ship: "ship-token",
  enemy: "enemy-token",
  obstacle: "obstacle-token",
  treasure: "treasure-token",
  crew: "crew-token",
  goal: "goal-token",
  current: "current-token",
} as const;

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
