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
  sea: 0x0f3b57,
  seaDeep: 0x08273a,
  foam: 0xd7f6f7,
  sand: 0xf7d78b,
  coral: 0xf67c5c,
  mint: 0x6fe4ba,
  plum: 0x8f78c9,
  gold: 0xf3b63c,
  reef: 0x1c6a67,
  storm: 0x264f73,
  white: 0xffffff,
} as const;

export const kindTextureMap = {
  enemy: textureKeys.enemy,
  obstacle: textureKeys.obstacle,
  treasure: textureKeys.treasure,
  crew: textureKeys.crew,
  current: textureKeys.current,
} as const;
