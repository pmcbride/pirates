import type { PlayerProfile, RewardBundle } from "./types";

const profileStorageKey = "sea-of-codes/profile";

export const defaultProfile = (): PlayerProfile => ({
  unlockedMissionIds: ["tutorial-cove"],
  completedMissionIds: [],
  gold: 0,
  stars: 0,
  crewRoster: [],
  fruitPowers: [],
  commandUnlocks: ["sail", "collect"],
  bestStars: {},
  settings: {
    reducedMotion: false,
    soundOn: true,
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
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const merged = defaultProfile();

    return {
      ...merged,
      ...parsed,
      unlockedMissionIds: parsed.unlockedMissionIds ?? merged.unlockedMissionIds,
      completedMissionIds:
        parsed.completedMissionIds ?? merged.completedMissionIds,
      crewRoster: parsed.crewRoster ?? merged.crewRoster,
      fruitPowers: parsed.fruitPowers ?? merged.fruitPowers,
      commandUnlocks: parsed.commandUnlocks ?? merged.commandUnlocks,
      bestStars: parsed.bestStars ?? merged.bestStars,
      settings: {
        ...merged.settings,
        ...(parsed.settings ?? {}),
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

  if (!updated.completedMissionIds.includes(missionId)) {
    updated.completedMissionIds.push(missionId);
  }

  if (nextMissionId && !updated.unlockedMissionIds.includes(nextMissionId)) {
    updated.unlockedMissionIds.push(nextMissionId);
  }

  updated.gold += reward.gold;
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

  return updated;
};
