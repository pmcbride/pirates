import { describe, expect, it } from "vitest";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import {
  applyReward,
  defaultProfile,
  deserializeProfile,
  serializeProfile,
} from "./profile";

describe("mission runner", () => {
  it("clears the tutorial mission with its sample queue", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(60);
    expect(result.finalState.status).toBe("success");
  });

  it("resolves repeat blocks deterministically", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    const first = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );
    const second = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.steps.map((step) => step.message)).toEqual(
      second.steps.map((step) => step.message),
    );
    expect(first.finalState.ship.position).toEqual({ x: 7, y: 2 });
  });

  it("branches with if-enemy and clears the lookout mission", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["sail", "collect", "fire", "repeat", "if"],
    };
    const mission = missions["coral-lookout"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.fruitPowerId).toBe("gumgum");
  });

  it("returns a hint and preserves the draft queue on failure", () => {
    const profile = defaultProfile();
    const mission = missions["spark-shoals"];
    const queue = cloneQueuedCommands(
      mission.suggestedQueue.filter((command) => command.templateId !== "fire"),
    );
    const before = JSON.parse(JSON.stringify(queue));

    const result = runMission(mission, queue, profile);

    expect(result.success).toBe(false);
    expect(result.hint?.focusTemplateId).toBe("fire");
    expect(result.hint?.reason.toLowerCase()).toContain("enemy");
    expect(queue).toEqual(before);
  });

  it("awards bounty per defeated Marine on success", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["sail", "collect", "fire", "dodge"],
    };
    const mission = missions["spark-shoals"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    // 1M base bounty from mission + 1M for the defeated Marine
    expect(result.reward?.bounty).toBe(2_000_000);
    expect(result.reward?.logLine).toContain("Shells Town");
    expect(result.reward?.logLine).toContain("splashed 1 Marine");
  });

  it("composes a captain's log line when no enemies are defeated", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.logLine).toContain("Foosha Cove");
    expect(result.reward?.logLine).toContain("hauled 1 chest");
    expect(result.reward?.logLine).not.toContain("Marine");
  });

  it("clears the windrise-cove East Blue practice with its sample queue", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["sail", "collect", "fire", "dodge"],
    };
    const mission = missions["windrise-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(110);
    // 1M base + 2M for two Marines defeated.
    expect(result.reward?.bounty).toBe(3_000_000);
  });

  it("clears the barrel-bay East Blue practice with its sample queue", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["sail", "collect", "fire", "dodge"],
    };
    const mission = missions["barrel-bay"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(130);
    // 2M base + 1M for the Marine defeated.
    expect(result.reward?.bounty).toBe(3_000_000);
  });

  it("treats sandbox runs as success even when the queue does nothing useful", () => {
    const profile = defaultProfile();
    const mission = missions["sandbox-isle"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    // Sandbox should always return success and never produce a reward bundle.
    expect(result.success).toBe(true);
    expect(result.reward).toBeUndefined();
    expect(result.hint).toBeUndefined();
  });

  it("bounces the ship instead of failing when a sandbox queue hits an obstacle", () => {
    const profile = defaultProfile();
    const mission = missions["sandbox-isle"];

    // Sail east 5 times: ship goes 0→1→2→3→ would hit obstacle at (4,3).
    // Engine should bounce back to start, mark success, return no hint.
    const queue = cloneQueuedCommands([
      ...mission.suggestedQueue,
      ...mission.suggestedQueue,
    ]);
    const result = runMission(mission, queue, profile);

    expect(result.success).toBe(true);
    expect(result.hint).toBeUndefined();
    // After bounce, the ship should be back at the start position.
    expect(result.finalState.ship.position).toEqual(mission.start.position);
  });
});

describe("profile persistence", () => {
  it("serializes, reloads, and unlocks the next mission", () => {
    const profile = defaultProfile();
    const rewarded = applyReward(
      profile,
      "tutorial-cove",
      { berries: 60, bounty: 0, stars: 1, unlockCommandIds: ["fire"] },
      "spark-shoals",
    );
    const roundTrip = deserializeProfile(serializeProfile(rewarded));

    expect(roundTrip.berries).toBe(60);
    expect(roundTrip.commandUnlocks).toContain("fire");
    expect(roundTrip.unlockedMissionIds).toContain("spark-shoals");
    expect(roundTrip.completedMissionIds).toContain("tutorial-cove");
  });

  it("appends a captain's log entry when reward includes a logLine", () => {
    const profile = defaultProfile();
    const rewarded = applyReward(
      profile,
      "tutorial-cove",
      {
        berries: 60,
        bounty: 0,
        stars: 1,
        unlockCommandIds: ["fire"],
        logLine: "Cleared Foosha Cove, hauled 1 chest.",
      },
      "spark-shoals",
    );

    expect(rewarded.captainLog).toHaveLength(1);
    expect(rewarded.captainLog[0]).toMatchObject({
      day: 1,
      missionId: "tutorial-cove",
      oneLine: "Cleared Foosha Cove, hauled 1 chest.",
    });
  });

  it("accumulates bounty across rewards", () => {
    const profile = defaultProfile();
    const first = applyReward(profile, "tutorial-cove", {
      berries: 60,
      bounty: 0,
      stars: 1,
      unlockCommandIds: [],
    });
    const second = applyReward(first, "spark-shoals", {
      berries: 100,
      bounty: 2_000_000,
      stars: 2,
      unlockCommandIds: [],
    });

    expect(second.bounty).toBe(2_000_000);
    expect(second.berries).toBe(160);
  });

  it("migrates older saves where berries were called 'gold'", () => {
    const legacy = JSON.stringify({
      gold: 18,
      stars: 2,
      unlockedMissionIds: ["tutorial-cove", "spark-shoals"],
      completedMissionIds: ["tutorial-cove"],
    });
    const profile = deserializeProfile(legacy);

    expect(profile.berries).toBe(18);
    expect(profile.bounty).toBe(0);
    expect(profile.captainLog).toEqual([]);
  });
});
