import { describe, expect, it } from "vitest";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import { defaultProfile, deserializeProfile } from "./profile";
import {
  computePredictionCorrect,
  pickInitialQueue,
  shipEndPositionForPrediction,
  shouldPredictForMission,
} from "./store";
import type { PlayerProfile } from "./types";

const profileWithAttempts = (
  overrides: Partial<PlayerProfile> = {},
  attemptCounts: PlayerProfile["attemptCounts"] = {},
): PlayerProfile => ({
  ...defaultProfile(),
  attemptCounts,
  ...overrides,
});

describe("shouldPredictForMission", () => {
  it("skips prediction for the tutorial mission", () => {
    expect(shouldPredictForMission("tutorial-cove", defaultProfile())).toBe(false);
  });

  it("requires prediction for non-tutorial missions by default", () => {
    expect(shouldPredictForMission("spark-shoals", defaultProfile())).toBe(true);
  });

  it("skips prediction when the player has opted out", () => {
    const profile = defaultProfile();
    profile.settings.skipPrediction = true;
    expect(shouldPredictForMission("spark-shoals", profile)).toBe(false);
  });
});

describe("pickInitialQueue", () => {
  const mission = missions["spark-shoals"];

  it("pre-loads the full suggested queue on the first attempt", () => {
    const profile = profileWithAttempts();
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(mission.suggestedQueue.length);
    expect(queue.map((command) => command.templateId)).toEqual(
      mission.suggestedQueue.map((command) => command.templateId),
    );
  });

  it("collapses to a one-stamp stub on subsequent attempts", () => {
    const profile = profileWithAttempts({}, { "spark-shoals": 1 });
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(1);
    expect(queue[0].templateId).toBe(mission.suggestedQueue[0].templateId);
  });

  it("respects the alwaysShowSuggested escape hatch", () => {
    const profile = profileWithAttempts({}, { "spark-shoals": 5 });
    profile.settings.alwaysShowSuggested = true;
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(mission.suggestedQueue.length);
  });

  it("returns the stub as fresh clones, not references into the mission def", () => {
    const profile = profileWithAttempts({}, { "spark-shoals": 1 });
    const queue = pickInitialQueue(mission, profile);
    expect(queue[0]).not.toBe(mission.suggestedQueue[0]);
  });
});

describe("prediction correctness helpers", () => {
  it("returns null when there is no prediction to score", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];
    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );
    expect(computePredictionCorrect(null, result)).toBeNull();
  });

  it("marks correct predictions true", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];
    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );
    const actual = shipEndPositionForPrediction(result);
    expect(computePredictionCorrect(actual, result)).toBe(true);
  });

  it("marks an off-by-one prediction false", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];
    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );
    const actual = shipEndPositionForPrediction(result);
    expect(
      computePredictionCorrect({ x: actual.x + 1, y: actual.y }, result),
    ).toBe(false);
  });

  it("uses the last non-failed ship position when the run fails partway", () => {
    const profile = defaultProfile();
    const mission = missions["spark-shoals"];
    // Keep fire + one sail, then drop the rest — ship will run out of moves
    // short of the goal, which fails at the end (after several successful steps).
    const queue = cloneQueuedCommands(mission.suggestedQueue.slice(0, 2));
    const result = runMission(mission, queue, profile);
    expect(result.success).toBe(false);

    const actual = shipEndPositionForPrediction(result);
    const lastNonFailed = [...result.steps]
      .reverse()
      .find((step) => step.status !== "failed");
    expect(lastNonFailed).toBeDefined();
    expect(actual).toEqual(lastNonFailed!.ship.position);
    // Sanity: not the failure step's snapshot
    const failedStep = result.steps.find((step) => step.status === "failed");
    expect(failedStep).toBeDefined();
  });

  it("falls back to finalState when every step failed", () => {
    const profile = defaultProfile();
    const mission = missions["spark-shoals"];
    // No fire and first move is a sail straight into the Marine — immediate fail.
    const queue = cloneQueuedCommands(
      mission.suggestedQueue.filter((command) => command.templateId !== "fire"),
    );
    const result = runMission(mission, queue, profile);
    expect(result.success).toBe(false);
    const actual = shipEndPositionForPrediction(result);
    expect(actual).toEqual(result.finalState.ship.position);
  });
});

describe("profile migration for attemptCounts and new settings", () => {
  it("adds attemptCounts to legacy profiles without it", () => {
    const legacy = JSON.stringify({
      berries: 12,
      stars: 1,
      unlockedMissionIds: ["tutorial-cove", "spark-shoals"],
      completedMissionIds: ["tutorial-cove"],
    });
    const profile = deserializeProfile(legacy);
    expect(profile.attemptCounts).toEqual({});
    expect(profile.settings.skipPrediction).toBe(false);
    expect(profile.settings.alwaysShowSuggested).toBe(false);
  });

  it("preserves attemptCounts from newer profiles", () => {
    const recent = JSON.stringify({
      berries: 0,
      stars: 0,
      attemptCounts: { "spark-shoals": 3 },
      settings: { reducedMotion: true, soundOn: true, skipPrediction: true },
    });
    const profile = deserializeProfile(recent);
    expect(profile.attemptCounts).toEqual({ "spark-shoals": 3 });
    expect(profile.settings.skipPrediction).toBe(true);
    expect(profile.settings.reducedMotion).toBe(true);
    // The new alwaysShowSuggested default fills in for partially-migrated profiles.
    expect(profile.settings.alwaysShowSuggested).toBe(false);
  });

  it("does not crash on a totally empty profile", () => {
    const profile = deserializeProfile("{}");
    expect(profile.attemptCounts).toEqual({});
    // sandbox-isle is force-merged into unlockedMissionIds by the PR-5 migration.
    expect(profile.unlockedMissionIds).toContain("tutorial-cove");
    expect(profile.unlockedMissionIds).toContain("sandbox-isle");
  });
});
