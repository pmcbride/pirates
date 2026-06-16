import { describe, expect, it } from "vitest";
import { onePieceTheme, originalTheme } from "../themes";
import type { Theme } from "../themes/types";
import { missions } from "./content";
import { cloneQueuedCommands, runMission } from "./engine";
import {
  applyReward,
  defaultProfile,
  deserializeProfile,
  serializeProfile,
} from "./profile";
import type { PlannedCommand } from "./types";

// Most engine specs use the default "original" theme — the active default in
// new profiles. A handful of legacy assertions (Foosha Cove, Shells Town,
// Marine) still target the "one-piece" theme to keep the migration behavior
// covered.

describe("mission runner", () => {
  it("clears the tutorial mission with its sample queue", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
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
      originalTheme,
    );
    const second = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
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
      commandUnlocks: ["move-right", "collect", "fire", "repeat", "if"],
    };
    const mission = missions["coral-lookout"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
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

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(false);
    expect(result.hint?.focusTemplateId).toBe("fire");
    // The hint mentions the theme's enemy noun ("patrol skiff") in the reason.
    expect(result.hint?.reason.toLowerCase()).toContain("patrol skiff");
    expect(queue).toEqual(before);
  });

  it("awards bounty per defeated foe on success (one-piece theme)", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "collect", "fire", "dodge"],
    };
    const mission = missions["spark-shoals"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      onePieceTheme,
    );

    expect(result.success).toBe(true);
    // 1M base bounty from mission + 1M for the defeated Marine.
    expect(result.reward?.bounty).toBe(2_000_000);
    expect(result.reward?.logLine).toContain("Shells Town");
    expect(result.reward?.logLine).toContain("splashed 1 Marine");
  });

  it("runs each action in a loop body per iteration", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    // Replace the first Repeat x3 Right + Right with Repeat x2 [Right, Right] —
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
            templateId: "move-right",
            type: "action",
            action: "move-right",
          },
          {
            instanceId: "loop-1b",
            templateId: "move-right",
            type: "action",
            action: "move-right",
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
        action: "move-right",
      },
    ];

    const result = runMission(mission, customQueue, profile, originalTheme);

    expect(result.success).toBe(true);
    expect(result.finalState.ship.position).toEqual({ x: 7, y: 2 });
  });

  it("falls back to the legacy `action` when loop body is empty", () => {
    const profile = defaultProfile();
    const mission = missions["current-crescent"];

    // Body is explicitly empty; the legacy action `move-right` must drive
    // each iteration.
    const customQueue = cloneQueuedCommands(mission.suggestedQueue).map((command) => {
      if (command.instanceId !== "current-1") return command;
      return { ...command, body: [] };
    });

    const result = runMission(mission, customQueue, profile, originalTheme);

    expect(result.success).toBe(true);
    expect(result.finalState.ship.position).toEqual({ x: 7, y: 2 });
  });

  it("fails the whole run when an action inside a loop body fails", () => {
    const profile = defaultProfile();
    const mission = missions["spark-shoals"];

    // First action is Move-Right directly into the Marine at (1,1) — should
    // fail on the first inner action with the "fire" hint.
    const queue: PlannedCommand[] = [
      {
        instanceId: "loop-x",
        templateId: "repeat",
        type: "loop",
        count: 2,
        body: [
          {
            instanceId: "loop-x-a",
            templateId: "move-right",
            type: "action",
            action: "move-right",
          },
        ],
      },
    ];

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(false);
    expect(result.hint?.focusTemplateId).toBe("fire");
  });

  it("treasure-isle suggested queue uses a loop body and completes", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "fire", "dodge", "talk", "repeat", "if"],
    };
    const mission = missions["treasure-isle"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
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
      originalTheme,
    );

    expect(result.success).toBe(true);
  });

  it("composes a captain's log line when no enemies are defeated (one-piece)", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      onePieceTheme,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.logLine).toContain("Foosha Cove");
    expect(result.reward?.logLine).toContain("hauled 1 chest");
    expect(result.reward?.logLine).not.toContain("Marine");
  });

  it("clears the windrise-cove East Blue practice with its sample queue", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "collect", "fire", "dodge"],
    };
    const mission = missions["windrise-cove"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(110);
    // 1M base + 2M for two enemies defeated.
    expect(result.reward?.bounty).toBe(3_000_000);
  });

  it("teaches range when a wasted Fire preceded sailing into the foe (windrise-cove)", () => {
    const profile = defaultProfile();
    const mission = missions["windrise-cove"];

    // Fire from the dock — the foe at (2,1) is two tiles away, out of range —
    // then sail straight into it. The old hint said "use Fire", contradicting
    // the wasted Fire the player just watched; the new one teaches range.
    const queue: PlannedCommand[] = [
      { instanceId: "range-1", templateId: "fire", type: "action", action: "fire" },
      { instanceId: "range-2", templateId: "move-right", type: "action", action: "move-right" },
      { instanceId: "range-3", templateId: "move-right", type: "action", action: "move-right" },
    ];

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(false);
    const wastedFire = result.steps.find((step) => step.status === "warning");
    expect(wastedFire?.events[0]?.kind).toBe("fire");
    expect(result.hint?.reason).toBe("The cannon was too far away");
    expect(result.hint?.suggestion).toContain(
      "Sail next to the patrol skiff, then Fire",
    );
    expect(result.hint?.focusTemplateId).toBe("move-right");
    // Approach-side tile first (where to Fire from next time), then the foe.
    expect(result.hint?.highlightPositions).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("only suggests a Repeat when the mission palette offers one", () => {
    const profile = defaultProfile();
    const shortPlan = (id: string): PlannedCommand[] => [
      { instanceId: `${id}-short`, templateId: "move-right", type: "action", action: "move-right" },
    ];

    // tutorial-cove has no Repeat block — the hint must not mention one.
    const noLoop = runMission(
      missions["tutorial-cove"],
      shortPlan("cove"),
      profile,
      originalTheme,
    );
    expect(noLoop.success).toBe(false);
    expect(noLoop.hint?.suggestion).toContain("Add more direction arrows");
    expect(noLoop.hint?.suggestion).not.toContain("Repeat");

    // current-crescent teaches Repeat — there the nudge belongs.
    const withLoop = runMission(
      missions["current-crescent"],
      shortPlan("crescent"),
      profile,
      originalTheme,
    );
    expect(withLoop.success).toBe(false);
    expect(withLoop.hint?.suggestion).toContain("(or a Repeat)");
  });

  it("never leaks raw ids into step titles, messages, events, or hints", () => {
    const profile = defaultProfile();
    // Hyphenated template ids and camelCase condition ids are code, not copy.
    const rawId =
      /move-(up|down|left|right)|enemyAhead|obstacleAhead|treasureHere|crewHere/;

    // treasure-isle exercises every block type (moves, two Ifs, Repeat with a
    // body, Talk); current-crescent adds the legacy body-less Repeat; the
    // one-block tutorial plan adds the end-of-queue failure hint.
    const runs = [
      runMission(
        missions["treasure-isle"],
        cloneQueuedCommands(missions["treasure-isle"].suggestedQueue),
        profile,
        originalTheme,
      ),
      runMission(
        missions["current-crescent"],
        cloneQueuedCommands(missions["current-crescent"].suggestedQueue),
        profile,
        originalTheme,
      ),
      runMission(
        missions["tutorial-cove"],
        [{ instanceId: "leak-1", templateId: "move-right", type: "action", action: "move-right" }],
        profile,
        originalTheme,
      ),
    ];

    for (const result of runs) {
      for (const step of result.steps) {
        expect(step.title).not.toMatch(rawId);
        expect(step.message).not.toMatch(rawId);
        for (const event of step.events) {
          expect(event.text).not.toMatch(rawId);
        }
      }
      if (result.hint) {
        expect(result.hint.reason).not.toMatch(rawId);
        expect(result.hint.suggestion).not.toMatch(rawId);
      }
    }
  });

  it("clears the barrel-bay East Blue practice with its sample queue", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "collect", "fire", "dodge"],
    };
    const mission = missions["barrel-bay"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(130);
    // 2M base + 1M for the enemy defeated.
    expect(result.reward?.bounty).toBe(3_000_000);
  });

  it("treats sandbox runs as success even when the queue does nothing useful", () => {
    const profile = defaultProfile();
    const mission = missions["sandbox-isle"];

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
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
    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(true);
    expect(result.hint).toBeUndefined();
    // After bounce, the ship should be back at the start position.
    expect(result.finalState.ship.position).toEqual(mission.start.position);
  });

  it("clears the harbor-bend Up/Down rehab mission with its sample queue", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "move-up", "move-down", "collect"],
    };
    const mission = missions["harbor-bend"];

    // The palette must include the Up direction block — that's the lesson:
    // the chest sits off the main east lane, so Right alone can't reach it.
    expect(mission.palette).toContain("move-up");
    expect(mission.palette).toContain("move-right");
    expect(
      mission.suggestedQueue.some((command) => command.action === "move-up"),
    ).toBe(true);
    expect(
      mission.suggestedQueue.some((command) => command.action === "move-right"),
    ).toBe(true);

    const result = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
    );

    expect(result.success).toBe(true);
    expect(result.reward?.berries).toBe(120);
    // Ship lands at the docking buoy at (4, 0).
    expect(result.finalState.ship.position).toEqual({ x: 4, y: 0 });
  });

  it("emits a warning beat when fire has no target, but still succeeds", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "fire", "collect"],
    };
    const mission = missions["tutorial-cove"];

    // Slot a Fire at the very start. There's no enemy in tutorial-cove, so this
    // is the silent-failure case the warning beat fixes.
    const queue: PlannedCommand[] = [
      { instanceId: "warn-fire", templateId: "fire", type: "action", action: "fire" },
      ...cloneQueuedCommands(mission.suggestedQueue),
    ];

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(true);
    const warnStep = result.steps.find((step) => step.commandId === "warn-fire");
    expect(warnStep).toBeDefined();
    expect(warnStep?.status).toBe("warning");
    expect(warnStep?.message).toContain("Nothing to fire");
  });

  it("emits a warning beat when collect has no target, but still succeeds", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    // Add an extra Collect at the very start where there's no treasure.
    const queue: PlannedCommand[] = [
      { instanceId: "warn-collect", templateId: "collect", type: "action", action: "collect" },
      ...cloneQueuedCommands(mission.suggestedQueue),
    ];

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(true);
    const warnStep = result.steps.find((step) => step.commandId === "warn-collect");
    expect(warnStep).toBeDefined();
    expect(warnStep?.status).toBe("warning");
    expect(warnStep?.message).toContain("Nothing to collect");
  });

  it("emits a warning beat when talk finds no crew, but still succeeds", () => {
    const profile = {
      ...defaultProfile(),
      commandUnlocks: ["move-right", "talk", "collect"],
    };
    const mission = missions["tutorial-cove"];

    // Slot a Talk at the very start. No crew tile anywhere in tutorial-cove.
    const queue: PlannedCommand[] = [
      { instanceId: "warn-talk", templateId: "talk", type: "action", action: "talk" },
      ...cloneQueuedCommands(mission.suggestedQueue),
    ];

    const result = runMission(mission, queue, profile, originalTheme);

    expect(result.success).toBe(true);
    const warnStep = result.steps.find((step) => step.commandId === "warn-talk");
    expect(warnStep).toBeDefined();
    expect(warnStep?.status).toBe("warning");
    expect(warnStep?.message).toContain("Nobody here to talk to");
  });

  it("preserves engine determinism across themes (same queue, different copy)", () => {
    const profile = defaultProfile();
    const mission = missions["tutorial-cove"];

    const inOriginal = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      originalTheme,
    );
    const inOnePiece = runMission(
      mission,
      cloneQueuedCommands(mission.suggestedQueue),
      profile,
      onePieceTheme,
    );

    // Same gameplay outcome regardless of theme.
    expect(inOriginal.success).toBe(true);
    expect(inOnePiece.success).toBe(true);
    expect(inOriginal.finalState.ship.position).toEqual(
      inOnePiece.finalState.ship.position,
    );
    expect(inOriginal.steps.length).toBe(inOnePiece.steps.length);

    // But the log line differs — original calls it "Foglight Cove", the
    // one-piece overlay calls it "Foosha Cove".
    expect(inOriginal.reward?.logLine).toContain("Foglight Cove");
    expect(inOnePiece.reward?.logLine).toContain("Foosha Cove");
    expect(inOriginal.reward?.logLine).not.toEqual(inOnePiece.reward?.logLine);
  });
});

describe("theme catalog", () => {
  // Every theme must define copy for every mission, crew member, and fruit
  // power that exists in the structural content layer. Catches the easy
  // mistake of forgetting to extend a theme when adding new content.
  const requiredMissionIds = Object.keys(missions);
  const requiredCrewIds = ["zoro", "nami"];
  const requiredFruitIds = ["gumgum"];

  const cases: Array<[string, Theme]> = [
    ["original", originalTheme],
    ["one-piece", onePieceTheme],
  ];

  it.each(cases)("%s theme covers every mission", (_label, theme) => {
    for (const id of requiredMissionIds) {
      expect(theme.missions[id]).toBeDefined();
      expect(theme.missions[id].label.length).toBeGreaterThan(0);
      expect(theme.missions[id].sea.length).toBeGreaterThan(0);
    }
  });

  it.each(cases)("%s theme covers every crew member", (_label, theme) => {
    for (const id of requiredCrewIds) {
      expect(theme.crew[id]).toBeDefined();
      expect(theme.crew[id].name.length).toBeGreaterThan(0);
    }
  });

  it.each(cases)("%s theme covers every fruit power", (_label, theme) => {
    for (const id of requiredFruitIds) {
      expect(theme.fruits[id]).toBeDefined();
      expect(theme.fruits[id].name.length).toBeGreaterThan(0);
    }
  });

  it.each(cases)("%s theme has tile labels for every tile", (_label, theme) => {
    for (const id of requiredMissionIds) {
      const mission = missions[id];
      const tileLabels = theme.tileLabels[id] ?? {};
      for (const tile of mission.tiles) {
        expect(tileLabels[tile.id]).toBeDefined();
      }
    }
  });

  it.each(cases)("%s theme has a 0-bounty rank entry", (_label, theme) => {
    expect(theme.bountyRanks.some((rank) => rank.minBounty === 0)).toBe(true);
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

  it("migrates an existing player (with progress) to the one-piece theme", () => {
    // Pre-theme-system saves don't have settings.themeId. If the player has
    // any completed missions, they were implicitly playing the One Piece
    // copy — keep that world so the rename doesn't surprise them.
    const legacy = JSON.stringify({
      berries: 40,
      stars: 1,
      unlockedMissionIds: ["tutorial-cove", "spark-shoals"],
      completedMissionIds: ["tutorial-cove"],
      settings: { reducedMotion: false, soundOn: true },
    });
    const profile = deserializeProfile(legacy);

    expect(profile.settings.themeId).toBe("one-piece");
  });

  it("starts a fresh profile in the default original theme", () => {
    // A profile with no progress is treated as new — it gets the post-theme
    // default ("original"), even when it lacks settings.themeId entirely.
    const fresh = JSON.stringify({
      berries: 0,
      stars: 0,
      unlockedMissionIds: ["tutorial-cove"],
      completedMissionIds: [],
    });
    const profile = deserializeProfile(fresh);

    expect(profile.settings.themeId).toBe("original");
  });

  it("respects an explicit themeId in a saved profile", () => {
    const explicit = JSON.stringify({
      berries: 100,
      completedMissionIds: ["tutorial-cove"],
      settings: { reducedMotion: false, soundOn: true, themeId: "original" },
    });
    const profile = deserializeProfile(explicit);

    expect(profile.settings.themeId).toBe("original");
  });
});
