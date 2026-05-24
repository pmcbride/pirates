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
      commandUnlocks: ["sail", "collect", "fire", "repeat", "if"],
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
      commandUnlocks: ["sail", "collect", "fire", "dodge"],
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
