import type { CaptainLogEntry, PlayerProfile, RewardBundle } from "./types";

const profileStorageKey = "sea-of-codes/profile/v2";

export const defaultProfile = (): PlayerProfile => ({
  unlockedMissionIds: ["tutorial-cove"],
  completedMissionIds: [],
  berries: 0,
  bounty: 0,
  stars: 0,
  crewRoster: [],
  fruitPowers: [],
  commandUnlocks: ["sail", "collect"],
  bestStars: {},
  captainLog: [],
  settings: {
    reducedMotion: false,
    soundOn: true,
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
      unlockedMissionIds: parsed.unlockedMissionIds ?? merged.unlockedMissionIds,
      completedMissionIds,
      crewRoster: parsed.crewRoster ?? merged.crewRoster,
      fruitPowers: parsed.fruitPowers ?? merged.fruitPowers,
      commandUnlocks: parsed.commandUnlocks ?? merged.commandUnlocks,
      bestStars: parsed.bestStars ?? merged.bestStars,
      captainLog: parsed.captainLog ?? merged.captainLog,
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

export const loadProfile = (): PlayerProfile =>
  deserializeProfile(window.localStorage.getItem(profileStorageKey));

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
