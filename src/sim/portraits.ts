// Per-island portrait glyph used on the world-map chart. Each mission node
// shows its own Twemoji-rendered hint at what waits there — chest, swordfight,
// whirlpool, crown — even when the island is still locked. Inspired by
// Dragon Coding Games' boss-portrait map: visible portraits pull the player
// forward instead of a row of identical padlocks.
//
// Kept Phaser-free so it can be unit-tested alongside the rest of `src/sim/*`.
export const missionPortraits: Record<string, string> = {
  "tutorial-cove": "📦",
  "spark-shoals": "⚔️",
  "windrise-cove": "🌬️",
  "barrel-bay": "🛢️",
  "harbor-bend": "⚓",
  "current-crescent": "🌀",
  "coral-lookout": "🦜",
  "treasure-isle": "👑",
  "sandbox-isle": "🌴",
};

// Crew portrait badges — hand-authored chibi SVGs in public/art/crew/, one
// per crew id. A single asset set serves both render layers: the DOM HUD
// drops them into <img> tags and BootScene rasterizes them into Phaser
// textures for the on-deck badges. Paths are relative to the page root,
// same convention as the painted boards ("art/bg-*.webp").
export const crewPortraitPaths: Record<string, string> = {
  luffy: "art/crew/luffy.svg",
  zoro: "art/crew/zoro.svg",
  nami: "art/crew/nami.svg",
  usopp: "art/crew/usopp.svg",
  sanji: "art/crew/sanji.svg",
  chopper: "art/crew/chopper.svg",
};
