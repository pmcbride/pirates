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
