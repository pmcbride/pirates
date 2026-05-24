import type { PlayerProfile } from "../sim/types";
import { onePieceTheme } from "./one-piece";
import { originalTheme } from "./original";
import type { BountyRank, Theme, ThemeId } from "./types";

export type { Theme, ThemeId, BountyRank } from "./types";
export { originalTheme } from "./original";
export { onePieceTheme } from "./one-piece";

export const themes: Record<ThemeId, Theme> = {
  original: originalTheme,
  "one-piece": onePieceTheme,
};

export const defaultThemeId: ThemeId = "original";

export const getTheme = (themeId: ThemeId | undefined | null): Theme =>
  (themeId && themes[themeId]) || themes[defaultThemeId];

// Read the theme directly from a profile. Falls back to the default if the
// profile's themeId is unknown (defensive against bad data).
export const getActiveTheme = (profile: PlayerProfile): Theme =>
  getTheme(profile.settings.themeId);

export const orderedThemeIds: ThemeId[] = ["original", "one-piece"];

// Bounty rank lookup against a theme's ladder. Ranks may be in any order;
// we pick the entry with the highest minBounty <= bounty.
export const bountyRankFor = (theme: Theme, bounty: number): string => {
  let winner: BountyRank | undefined;
  for (const rank of theme.bountyRanks) {
    if (rank.minBounty <= bounty) {
      if (!winner || rank.minBounty > winner.minBounty) {
        winner = rank;
      }
    }
  }
  return winner?.label ?? theme.bountyRanks[0]?.label ?? "";
};

// Currency formatters. Berries-style "1,000 ฿" pattern stays — only the symbol
// changes between themes.
export const formatCurrency = (theme: Theme, amount: number): string =>
  `${amount.toLocaleString("en-US")} ${theme.currency.symbol}`;

export const formatBountyFor = (theme: Theme, amount: number): string => {
  const symbol = theme.currency.symbol;
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M ${symbol}`;
  }
  return `${amount.toLocaleString("en-US")} ${symbol}`;
};
