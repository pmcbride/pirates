import type { CaptainLogEntry, PlayerProfile, RewardBundle } from "./types";

const profileStorageKey = "sea-of-codes/profile/v2";

/**
 * Read the OS-level `prefers-reduced-motion` media query. Returns false in
 * SSR / non-browser environments (no `window` or no `matchMedia`).
 *
 * Exported so tests can stub it and so callers other than `loadProfile` can
 * reuse the same SSR-safe guard.
 */
export const detectReducedMotionPreference = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // Some older browsers / weird envs throw on malformed queries — be safe.
    return false;
  }
};

export const defaultProfile = (): PlayerProfile => ({
  unlockedMissionIds: ["tutorial-cove", "sandbox-isle"],
  completedMissionIds: [],
  berries: 0,
  bounty: 0,
  stars: 0,
  crewRoster: [],
  fruitPowers: [],
  commandUnlocks: ["move-up", "move-down", "move-left", "move-right", "collect"],
  bestStars: {},
  captainLog: [],
  attemptCounts: {},
  settings: {
    reducedMotion: false,
    soundOn: true,
    muted: false,
    skipPrediction: false,
    alwaysShowSuggested: false,
    // New players start in the default "original" pirate theme; the One Piece
    // overlay is opt-in via the Settings drawer.
    themeId: "original",
  },
});

export const cloneProfile = (profile: PlayerProfile): PlayerProfile =>
  JSON.parse(JSON.stringify(profile)) as PlayerProfile;

export const serializeProfile = (profile: PlayerProfile): string =>
  JSON.stringify(profile);

export const deserializeProfile = (raw: string | null): PlayerProfile => {
  if (!raw) {
    return defaultProfile();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerProfile> & {
      gold?: number;
    };
    const merged = defaultProfile();

    const completedMissionIds =
      parsed.completedMissionIds ?? merged.completedMissionIds;

    // Theme migration:
    // - If the saved profile already has settings.themeId, respect it.
    // - Otherwise, infer: a profile with progress predates the theme system,
    //   so it was implicitly playing the One Piece-flavored copy. Keep that
    //   world so a returning player doesn't see strange new names.
    // - A fresh profile (no progress) gets the new default "original" theme.
    const inheritedThemeId =
      parsed.settings?.themeId ??
      (completedMissionIds.length > 0 ? "one-piece" : merged.settings.themeId);

    return {
      ...merged,
      ...parsed,
      // Migration: older saves used `gold` instead of `berries`.
      berries: parsed.berries ?? parsed.gold ?? merged.berries,
      bounty: parsed.bounty ?? merged.bounty,
      // Always-unlocked sandbox is force-merged on load so older saves see it.
      unlockedMissionIds: Array.from(
        new Set([
          ...(parsed.unlockedMissionIds ?? merged.unlockedMissionIds),
          "sandbox-isle",
        ]),
      ),
      completedMissionIds,
      crewRoster: parsed.crewRoster ?? merged.crewRoster,
      fruitPowers: parsed.fruitPowers ?? merged.fruitPowers,
      commandUnlocks: parsed.commandUnlocks ?? merged.commandUnlocks,
      bestStars: parsed.bestStars ?? merged.bestStars,
      captainLog: parsed.captainLog ?? merged.captainLog,
      attemptCounts: parsed.attemptCounts ?? merged.attemptCounts,
      settings: {
        ...merged.settings,
        ...(parsed.settings ?? {}),
        themeId: inheritedThemeId,
      },
    };
  } catch {
    return defaultProfile();
  }
};

export const loadProfile = (): PlayerProfile => {
  const raw = window.localStorage.getItem(profileStorageKey);
  const profile = deserializeProfile(raw);

  // First-launch seeding: when there's no saved profile yet, honor the OS-level
  // `prefers-reduced-motion` preference so kids on tablets with reduced motion
  // turned on at the OS get calmer playback without ever opening Settings.
  // We only do this on a true cold-start; an existing player's stored choice
  // is preserved verbatim, even if it's the default `false`.
  if (raw === null && detectReducedMotionPreference()) {
    profile.settings.reducedMotion = true;
  }

  return profile;
};

export const saveProfile = (profile: PlayerProfile): void => {
  window.localStorage.setItem(profileStorageKey, serializeProfile(profile));
};

export const applyReward = (
  profile: PlayerProfile,
  missionId: string,
  reward: RewardBundle,
  nextMissionId?: string,
): PlayerProfile => {
  const updated = cloneProfile(profile);

  const isFirstClear = !updated.completedMissionIds.includes(missionId);
  if (isFirstClear) {
    updated.completedMissionIds.push(missionId);
  }

  if (nextMissionId && !updated.unlockedMissionIds.includes(nextMissionId)) {
    updated.unlockedMissionIds.push(nextMissionId);
  }

  updated.berries += reward.berries;
  updated.bounty += reward.bounty;
  updated.stars += reward.stars;
  updated.bestStars[missionId] = Math.max(
    reward.stars,
    updated.bestStars[missionId] ?? 0,
  );

  if (reward.crewId && !updated.crewRoster.includes(reward.crewId)) {
    updated.crewRoster.push(reward.crewId);
  }

  if (
    reward.fruitPowerId &&
    !updated.fruitPowers.includes(reward.fruitPowerId)
  ) {
    updated.fruitPowers.push(reward.fruitPowerId);
  }

  reward.unlockCommandIds.forEach((commandId) => {
    if (!updated.commandUnlocks.includes(commandId)) {
      updated.commandUnlocks.push(commandId);
    }
  });

  if (reward.logLine) {
    const entry: CaptainLogEntry = {
      day: updated.captainLog.length + 1,
      missionId,
      oneLine: reward.logLine,
    };
    updated.captainLog.push(entry);
  }

  return updated;
};
