import { describe, expect, it } from "vitest";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import {
  applyReward,
  defaultProfile,
  deserializeProfile,
  serializeProfile,
} from "./profile";
import type { PlannedCommand } from "./types";

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

  it("runs each action in a loop body per iteration", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    // Replace the first Repeat x3 Sail + Sail with Repeat x2 [Sail, Sail] —
    // same 4 forward moves to reach the chest at (4,2), but exercises the
    // new body path instead of the legacy single-action loop.
    const customQueue: PlannedCommand[] = [
      {
        instanceId: "loop-1",
        templateId: "repeat",
        type: "loop",
        count: 2,
        body: [
          {
            instanceId: "loop-1a",
            templateId: "sail",
            type: "action",
            action: "sail",
          },
          {
            instanceId: "loop-1b",
            templateId: "sail",
            type: "action",
            action: "sail",
          },
        ],
      },
      {
        instanceId: "after-loop",
        templateId: "collect",
        type: "action",
        action: "collect",
      },
      {
        instanceId: "loop-2",
        templateId: "repeat",
        type: "loop",
        count: 3,
        action: "sail",
      },
    ];

    const result = runMission(mission, customQueue, profile);

    expect(result.success).toBe(true);
    expect(result.finalState.ship.position).toEqual({ x: 7, y: 2 });
  });

  it("falls back to the legacy `action` when loop body is empty", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    // Body is explicitly empty; the legacy action `sail` must drive each iteration.
    const customQueue = cloneQueuedCommands(mission.suggestedQueue).map((command) => {
      if (command.instanceId !== "current-1") return command;
      return { ...command, body: [] };
    });

    const result = runMission(mission, customQueue, profile);

    expect(result.success).toBe(true);
    expect(result.finalState.ship.position).toEqual({ x: 7, y: 2 });
  });

  it("fails the whole run when an action inside a loop body fails", () => {
    const profile = defaultProfile();
    const mission = missions["spark-shoals"];

    // First action is Sail directly into the Marine at (1,1) — should fail
    // on the first inner action with the "fire" hint.
    const queue: PlannedCommand[] = [
      {
        instanceId: "loop-x",
        templateId: "repeat",
        type: "loop",
        count: 2,
        body: [
          {
            instanceId: "loop-x-a",
            templateId: "sail",
            type: "action",
            action: "sail",
          },
        ],
      },
    ];

    const result = runMission(mission, queue, profile);

    expect(result.success).toBe(false);
    expect(result.hint?.focusTemplateId).toBe("fire");
  });

  it("treasure-isle suggested queue uses a loop body and completes", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["sail", "fire", "dodge", "talk", "repeat", "if"],
    };
    const mission = missions["treasure-isle"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
    const isle3 = mission.suggestedQueue.find((c) => c.instanceId === "isle-3");
    expect(isle3?.body?.length).toBe(2);
  });

  it("coral-lookout suggested queue completes for a default profile (no fruits, no crew)", () => {
    const profile = defaultProfile();
    const mission = missions["coral-lookout"];

    // No repeat allowed in this mission's palette anymore — the lesson is
    // purely about the If conditional.
    expect(mission.palette).not.toContain("repeat");
    expect(
      mission.suggestedQueue.every((command) => command.templateId !== "repeat"),
    ).toBe(true);

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
    );

    expect(result.success).toBe(true);
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
