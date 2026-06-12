import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captainCrewId,
  crewMates,
  missionNodes,
  missions,
  orderedCrewIds,
  orderedMissionIds,
  recruitedCrewInOrder,
} from "./content";
import { deckSlotsFor, maxDeckSlots } from "./crewDeck";
import { crewPortraitPaths } from "./portraits";
import { defaultProfile, deserializeProfile, reconcileCrewRoster } from "./profile";

describe("crew catalog", () => {
  it("ships the full six-mate crew in boarding order", () => {
    expect(orderedCrewIds).toEqual([
      "luffy",
      "zoro",
      "nami",
      "usopp",
      "sanji",
      "chopper",
    ]);
    expect(Object.keys(crewMates).sort()).toEqual([...orderedCrewIds].sort());
  });

  it("recruits every mate except the captain on exactly one voyage", () => {
    const rewardCounts = new Map<string, number>();
    for (const node of missionNodes) {
      const crewId = node.rewards.crewId;
      if (crewId) {
        rewardCounts.set(crewId, (rewardCounts.get(crewId) ?? 0) + 1);
      }
    }

    expect(rewardCounts.get(captainCrewId)).toBeUndefined();
    for (const crewId of orderedCrewIds.filter((id) => id !== captainCrewId)) {
      expect(rewardCounts.get(crewId), `${crewId} must be recruitable`).toBe(1);
    }
    // No mission may reward an id missing from the catalog.
    for (const crewId of rewardCounts.keys()) {
      expect(crewMates[crewId]).toBeDefined();
    }
  });

  it("keeps node rewards and mission reward bundles in sync on crewId", () => {
    for (const node of missionNodes) {
      expect(missions[node.missionId].reward.crewId).toBe(node.rewards.crewId);
    }
  });

  it("recruits mates along the route in boarding order", () => {
    const recruitOrder = orderedMissionIds
      .map((missionId) => missions[missionId].reward.crewId)
      .filter((crewId): crewId is string => Boolean(crewId));
    expect(recruitOrder).toEqual(
      orderedCrewIds.filter((id) => id !== captainCrewId),
    );
  });

  it("orders and filters a profile roster into boarding order", () => {
    expect(recruitedCrewInOrder(["nami", "luffy", "ghost", "zoro"])).toEqual([
      "luffy",
      "zoro",
      "nami",
    ]);
    expect(recruitedCrewInOrder([])).toEqual([]);
  });
});

describe("crew portraits", () => {
  it("has a portrait badge on disk for every crew mate", () => {
    for (const crewId of orderedCrewIds) {
      const path = crewPortraitPaths[crewId];
      expect(path, `${crewId} needs a portrait path`).toBeDefined();
      expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
    }
  });
});

describe("deck slots", () => {
  it("returns one on-hull slot per crew mate up to the cap", () => {
    for (let count = 0; count <= maxDeckSlots; count += 1) {
      const slots = deckSlotsFor(count);
      expect(slots).toHaveLength(count);
      for (const slot of slots) {
        // Stay on the hull: within half the ship's width/height of center.
        expect(Math.abs(slot.fx)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(slot.fy)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("clamps oversized rosters to the densest arrangement", () => {
    expect(deckSlotsFor(99)).toHaveLength(maxDeckSlots);
    expect(deckSlotsFor(-1)).toHaveLength(0);
  });
});

describe("crew roster migration", () => {
  it("seeds the captain into fresh profiles", () => {
    expect(defaultProfile().crewRoster).toEqual([captainCrewId]);
  });

  it("backfills the captain into pre-captain saves", () => {
    expect(reconcileCrewRoster([], [])).toEqual([captainCrewId]);
    expect(reconcileCrewRoster(["zoro"], [])).toEqual([captainCrewId, "zoro"]);
  });

  it("backfills mates stranded behind already-cleared voyages", () => {
    // An old save cleared windrise-cove before nami was its reward.
    expect(reconcileCrewRoster([], ["windrise-cove"])).toEqual([
      captainCrewId,
      "nami",
    ]);
  });

  it("never duplicates and is idempotent", () => {
    const once = reconcileCrewRoster(
      ["luffy", "zoro", "nami"],
      ["spark-shoals", "windrise-cove"],
    );
    expect(once).toEqual(["luffy", "zoro", "nami"]);
    expect(reconcileCrewRoster(once, ["spark-shoals", "windrise-cove"])).toEqual(once);
  });

  it("applies through deserializeProfile for stored saves", () => {
    const stored = JSON.stringify({
      unlockedMissionIds: ["tutorial-cove", "spark-shoals", "windrise-cove"],
      completedMissionIds: ["tutorial-cove", "spark-shoals", "windrise-cove"],
      crewRoster: ["zoro"],
    });
    const profile = deserializeProfile(stored);
    expect(profile.crewRoster).toEqual(["luffy", "zoro", "nami"]);
  });
});
