import { describe, expect, it } from "vitest";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import { applyReward, defaultProfile, deserializeProfile, serializeProfile } from "./profile";

describe("mission runner", () => {
  it("clears the tutorial mission with its sample queue", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const result = runMission(mission, cloneQueuedCommands(mission.suggestedQueue), profile);

    expect(result.success).toBe(true);
    expect(result.reward?.gold).toBe(6);
    expect(result.finalState.status).toBe("success");
  });

  it("resolves repeat blocks deterministically", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    const first = runMission(mission, cloneQueuedCommands(mission.suggestedQueue), profile);
    const second = runMission(mission, cloneQueuedCommands(mission.suggestedQueue), profile);

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

    const result = runMission(mission, cloneQueuedCommands(mission.suggestedQueue), profile);

    expect(result.success).toBe(true);
    expect(result.reward?.fruitPowerId).toBe("emberfruit");
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
    expect(result.hint?.reason).toContain("enemy");
    expect(queue).toEqual(before);
  });
});

describe("profile persistence", () => {
  it("serializes, reloads, and unlocks the next mission", () => {
    const profile = defaultProfile();
    const rewarded = applyReward(profile, "tutorial-cove", { gold: 6, stars: 1, unlockCommandIds: ["fire"] }, "spark-shoals");
    const roundTrip = deserializeProfile(serializeProfile(rewarded));

    expect(roundTrip.gold).toBe(6);
    expect(roundTrip.commandUnlocks).toContain("fire");
    expect(roundTrip.unlockedMissionIds).toContain("spark-shoals");
    expect(roundTrip.completedMissionIds).toContain("tutorial-cove");
  });
});
