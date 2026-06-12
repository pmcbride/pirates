import { describe, expect, it } from "vitest";
import { originalTheme } from "../themes";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import { defaultProfile, deserializeProfile } from "./profile";
import {
  computePredictionCorrect,
  GameStore,
  gameStore,
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
  it("skips prediction for the first three missions", () => {
    const profile = defaultProfile();
    expect(shouldPredictForMission("tutorial-cove", profile)).toBe(false);
    expect(shouldPredictForMission("spark-shoals", profile)).toBe(false);
    expect(shouldPredictForMission("windrise-cove", profile)).toBe(false);
  });

  it("requires prediction from barrel-bay onward by default", () => {
    expect(shouldPredictForMission("barrel-bay", defaultProfile())).toBe(true);
    expect(shouldPredictForMission("treasure-isle", defaultProfile())).toBe(true);
  });

  it("skips prediction when the player has opted out", () => {
    const profile = defaultProfile();
    profile.settings.skipPrediction = true;
    expect(shouldPredictForMission("barrel-bay", profile)).toBe(false);
  });
});

describe("pickInitialQueue", () => {
  const mission = missions["spark-shoals"];

  it("pre-loads the full suggested queue for a never-attempted mission", () => {
    const profile = profileWithAttempts();
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(mission.suggestedQueue.length);
    expect(queue.map((command) => command.templateId)).toEqual(
      mission.suggestedQueue.map((command) => command.templateId),
    );
  });

  it("keeps the full plan while the mission is attempted but not yet cleared", () => {
    const profile = profileWithAttempts({}, { "spark-shoals": 3 });
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(mission.suggestedQueue.length);
    expect(queue.map((command) => command.templateId)).toEqual(
      mission.suggestedQueue.map((command) => command.templateId),
    );
  });

  it("collapses to a one-stamp stub when replaying an already-cleared mission", () => {
    const profile = profileWithAttempts(
      { completedMissionIds: ["spark-shoals"] },
      { "spark-shoals": 1 },
    );
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(1);
    expect(queue[0].templateId).toBe(mission.suggestedQueue[0].templateId);
  });

  it("respects the alwaysShowSuggested escape hatch on cleared missions", () => {
    const profile = profileWithAttempts(
      { completedMissionIds: ["spark-shoals"] },
      { "spark-shoals": 5 },
    );
    profile.settings.alwaysShowSuggested = true;
    const queue = pickInitialQueue(mission, profile);
    expect(queue).toHaveLength(mission.suggestedQueue.length);
  });

  it("returns the stub as fresh clones, not references into the mission def", () => {
    const profile = profileWithAttempts(
      { completedMissionIds: ["spark-shoals"] },
      { "spark-shoals": 1 },
    );
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
      originalTheme,
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
      originalTheme,
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
      originalTheme,
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
    const result = runMission(mission, queue, profile, originalTheme);
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
    const result = runMission(mission, queue, profile, originalTheme);
    expect(result.success).toBe(false);
    const actual = shipEndPositionForPrediction(result);
    expect(actual).toEqual(result.finalState.ship.position);
  });
});

describe("predict beat flow", () => {
  // Drive a store through a full clear of `missionId` using the pre-loaded
  // suggested plan — the exact path a pre-reader takes: open, Run, watch, claim.
  const clearWithSuggestedPlan = (store: GameStore, missionId: string): void => {
    store.openMission(missionId);
    store.runActiveMission();
    store.finishPlayback();
    store.claimReward();
  };

  // Clear the three exempt missions so barrel-bay — the first mission with a
  // predict beat — is unlocked.
  const storeWithFirstThreeCleared = (): GameStore => {
    const store = new GameStore();
    store.startAdventure();
    clearWithSuggestedPlan(store, "tutorial-cove");
    clearWithSuggestedPlan(store, "spark-shoals");
    clearWithSuggestedPlan(store, "windrise-cove");
    return store;
  };

  it("runs the first three missions with no predict gate (friction-free chain)", () => {
    const store = new GameStore();
    store.startAdventure();

    for (const missionId of ["tutorial-cove", "spark-shoals", "windrise-cove"]) {
      store.openMission(missionId);
      expect(store.getState().activeMissionId).toBe(missionId);
      store.runActiveMission();
      // Exempt missions go straight into playback — never the predict beat.
      expect(store.getState().missionPhase).toBe("running");
      expect(store.getState().lastRun?.success).toBe(true);
      store.finishPlayback();
      store.claimReward();
    }

    expect(store.getState().profile.unlockedMissionIds).toContain("barrel-bay");
  });

  it("pre-places the prediction marker on the start tile so confirm is never dead", () => {
    const store = storeWithFirstThreeCleared();
    store.openMission("barrel-bay");
    store.runActiveMission();

    const state = store.getState();
    expect(state.missionPhase).toBe("predicting");
    expect(state.predictedEndPosition).toEqual(
      missions["barrel-bay"].start.position,
    );
    // A copy, not a live reference into the mission definition.
    expect(state.predictedEndPosition).not.toBe(
      missions["barrel-bay"].start.position,
    );

    // The confirm CTA works immediately, before the player moves the marker.
    store.confirmPrediction();
    expect(store.getState().missionPhase).toBe("running");
    expect(store.getState().lastRun?.success).toBe(true);
    // The untouched start-tile guess is scored like any other guess.
    expect(store.getState().lastPredictionCorrect).toBe(false);
  });

  it("skipPredictionOnce runs the plan right away without persisting the opt-out", () => {
    const store = storeWithFirstThreeCleared();
    store.openMission("barrel-bay");
    store.runActiveMission();
    expect(store.getState().missionPhase).toBe("predicting");

    store.skipPredictionOnce();

    const state = store.getState();
    expect(state.missionPhase).toBe("running");
    expect(state.lastRun?.success).toBe(true);
    // No guess is scored on a skipped run...
    expect(state.lastPredictionCorrect).toBeNull();
    // ...and the persisted Settings opt-out stays untouched.
    expect(state.profile.settings.skipPrediction).toBe(false);
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
    // sandbox-isle is force-merged into unlockedMissionIds by the PR-5 migration
    // so older saves see the always-unlocked free-play island on next load.
    expect(profile.unlockedMissionIds).toContain("tutorial-cove");
    expect(profile.unlockedMissionIds).toContain("sandbox-isle");
  });
});

describe("GameStore.moveCommand", () => {
  // Use the sandbox mission — it pulls in every unlocked command, so we can
  // stack any palette we want without bumping into per-mission filters.
  const seedQueue = (count: number): string[] => {
    gameStore.startAdventure();
    gameStore.openSandbox();
    gameStore.clearQueue();
    for (let i = 0; i < count; i += 1) {
      gameStore.addCommand("move-right");
    }
    return gameStore.getState().queuedCommands.map((c) => c.instanceId);
  };

  it("moves a card by directional delta (-1 / 1) — keyboard path", () => {
    const ids = seedQueue(3);
    gameStore.moveCommand(ids[2], -1);
    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).toEqual([ids[0], ids[2], ids[1]]);
  });

  it("ignores directional moves at the edges", () => {
    const ids = seedQueue(2);
    gameStore.moveCommand(ids[0], -1);
    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).toEqual(ids);
  });

  it("moveCommandToIndex moves a card to an absolute target index — drag-and-drop path", () => {
    const ids = seedQueue(4);
    // Move the last card (index 3) to index 0.
    gameStore.moveCommandToIndex(ids[3], 0);
    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).toEqual([ids[3], ids[0], ids[1], ids[2]]);
  });

  it("moveCommandToIndex clamps the target index to the queue range", () => {
    const ids = seedQueue(3);
    // 99 is way past the end — should clamp to last slot.
    gameStore.moveCommandToIndex(ids[0], 99);
    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("moveCommandToIndex is a no-op when the target equals the current index", () => {
    const ids = seedQueue(3);
    gameStore.moveCommandToIndex(ids[1], 1);
    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).toEqual(ids);
  });
});

describe("setPlaybackIndex re-entrancy guard", () => {
  // Regression: playback dispatches setPlaybackIndex synchronously while
  // scene listeners are still running. Re-notifying on an unchanged index
  // re-entered MissionScene's listener and recursed until the page wedged.
  it("does not re-notify listeners when the index is unchanged", async () => {
    const { GameStore } = await import("./store");
    const store = new GameStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    expect(notifications).toBe(1); // subscribe fires immediately

    store.setPlaybackIndex(3);
    store.setPlaybackIndex(3);
    store.setPlaybackIndex(3);
    expect(notifications).toBe(2); // only the first change notifies

    store.setPlaybackIndex(4);
    expect(notifications).toBe(3);
  });
});
