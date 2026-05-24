// Theme system for Sea of Codes.
//
// The engine, store, and scene IDs all use stable internal keys ("tutorial-cove",
// "spark-shoals", "zoro", "gumgum"). Anything the player *sees* — mission labels,
// crew names, ship name, sea names, enemy names, currency, taglines — comes from
// a Theme. There is one default theme ("original") that uses original pirate
// names safe to share publicly, and one opt-in theme ("one-piece") that uses
// direct One Piece names for personal/family use. See DESIGN.md §7.

export type ThemeId = "original" | "one-piece";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
}

export interface ThemeShip {
  name: string;
}

export interface ThemeMissionStrings {
  label: string;
  sea: string;
  briefing: string;
  tutorial: string;
  preview: string;
  objective: {
    primary: string;
    short: string;
  };
}

export interface ThemeCrewStrings {
  name: string;
  title: string;
  description: string;
}

export interface ThemeFruitStrings {
  name: string;
  title: string;
  description: string;
}

export interface ThemeCurrency {
  // Single-character glyph shown after the number (e.g. "฿" or "D").
  symbol: string;
  nameSingular: string;
  namePlural: string;
}

export interface BountyRank {
  // Inclusive lower bound. The highest rank whose minBounty <= bounty wins.
  minBounty: number;
  label: string;
}

export interface ThemeHintPrefixes {
  // Optional sparkle-line shown when the "sparkle hint" passive crew member
  // (Zoro / Saber) is in the roster. Leave undefined to skip.
  withSparkleCrew?: string;
}

export interface ThemeTaglines {
  titleHeadline: string;
  titleSupport: string;
  // The big "Set Sail" call-to-action label.
  setSailCta: string;
  // Multi-line evocative copy on the Phaser title screen.
  titlePoster: string;
}

export interface Theme {
  meta: ThemeMeta;
  ship: ThemeShip;
  // Keys are sea identifiers used internally; values are display strings.
  seas: Record<string, string>;
  // Keys are mission IDs.
  missions: Record<string, ThemeMissionStrings>;
  // Keys: missionId -> tileId -> label.
  tileLabels: Record<string, Record<string, string>>;
  // Keys are crew IDs ("zoro", "nami").
  crew: Record<string, ThemeCrewStrings>;
  // Keys are fruit IDs ("gumgum").
  fruits: Record<string, ThemeFruitStrings>;
  currency: ThemeCurrency;
  // Sorted high-to-low (or any order) — the engine picks the highest minBounty
  // <= the player's bounty. There must always be at least one entry with
  // minBounty: 0.
  bountyRanks: BountyRank[];
  // What the engine calls a hostile combatant in user-facing strings.
  // e.g. "Marine" / "patrol skiff". Used by hints and the captain's log line.
  enemyKind: {
    singular: string;
    plural: string;
  };
  hintPrefixes: ThemeHintPrefixes;
  taglines: ThemeTaglines;
}
