import { beforeEach, describe, expect, it } from "vitest";
import {
  CaptainStore,
  MIGRATED_LEGACY_CAPTAIN_NAME,
  activeProfileStorageKey,
  createProfile,
  deleteProfile,
  deserializeCaptainList,
  getActiveProfile,
  getActiveProfileName,
  legacyProfileStorageKey,
  listProfiles,
  migrateLegacyV2,
  profilesStorageKey,
  resetActiveProfile,
  saveActiveProfile,
  serializeCaptainList,
  setActiveProfile,
  validateCaptainName,
} from "./captains";
import { defaultProfile, serializeProfile } from "./profile";

const makeStore = (): CaptainStore => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) ?? null) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

describe("validateCaptainName", () => {
  it("trims surrounding whitespace and collapses internal whitespace", () => {
    const result = validateCaptainName("   Captain   Sparrow  ");
    expect(result.ok).toBe(true);
    expect(result.cleaned).toBe("Captain Sparrow");
  });

  it("rejects empty input", () => {
    const result = validateCaptainName("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("empty");
  });

  it("rejects names longer than the max length", () => {
    const result = validateCaptainName("A".repeat(17));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("too-long");
  });

  it("rejects non-alphanumeric characters (except space)", () => {
    const result = validateCaptainName("Cap'n Crunch");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid-chars");
  });

  it("rejects duplicates case-insensitively", () => {
    const result = validateCaptainName("LUFFY", ["luffy", "Zoro"]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("duplicate");
  });

  it("accepts a fresh, valid name", () => {
    const result = validateCaptainName("Nami", ["Luffy"]);
    expect(result.ok).toBe(true);
    expect(result.cleaned).toBe("Nami");
  });
});

describe("migrateLegacyV2", () => {
  it("returns the current list when v3 already has captains", () => {
    const existing = [{ name: "Luffy", profile: defaultProfile() }];
    const legacyRaw = serializeProfile(defaultProfile());
    const next = migrateLegacyV2(existing, legacyRaw);
    expect(next).toBe(existing);
  });

  it("creates the default-named captain from v2 when v3 is empty", () => {
    const legacyProfile = defaultProfile();
    legacyProfile.berries = 42;
    const next = migrateLegacyV2([], serializeProfile(legacyProfile));
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe(MIGRATED_LEGACY_CAPTAIN_NAME);
    expect(next[0].profile.berries).toBe(42);
  });

  it("does nothing when v3 is empty AND v2 is missing", () => {
    expect(migrateLegacyV2([], null)).toEqual([]);
  });
});

describe("serializeCaptainList / deserializeCaptainList", () => {
  it("round-trips through JSON cleanly", () => {
    const records = [
      { name: "Luffy", profile: defaultProfile() },
      { name: "Zoro", profile: defaultProfile() },
    ];
    const round = deserializeCaptainList(serializeCaptainList(records));
    expect(round).toHaveLength(2);
    expect(round[0].name).toBe("Luffy");
    expect(round[1].name).toBe("Zoro");
  });

  it("drops malformed rows and survives bad JSON", () => {
    expect(deserializeCaptainList("not json")).toEqual([]);
    const raw = JSON.stringify([
      { name: "Luffy", profile: defaultProfile() },
      { name: "", profile: defaultProfile() },
      { notAName: "x" },
      "garbage",
    ]);
    const parsed = deserializeCaptainList(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Luffy");
  });
});

describe("captains store API (stateful)", () => {
  let store: CaptainStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("first-launch read produces an empty list and no active captain", () => {
    expect(listProfiles(store)).toEqual([]);
    expect(getActiveProfileName(store)).toBeNull();
    expect(getActiveProfile(store)).toBeNull();
  });

  it("migrates v2 → v3 lazily on first read", () => {
    const legacy = defaultProfile();
    legacy.berries = 9;
    legacy.completedMissionIds = ["tutorial-cove"];
    store.setItem(legacyProfileStorageKey, serializeProfile(legacy));

    const records = listProfiles(store);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe(MIGRATED_LEGACY_CAPTAIN_NAME);
    expect(records[0].profile.berries).toBe(9);
    expect(records[0].profile.completedMissionIds).toContain("tutorial-cove");

    // And the migration is persisted so subsequent reads don't redo it.
    expect(store.getItem(profilesStorageKey)).not.toBeNull();
  });

  it("never clobbers an existing v3 list with v2 data", () => {
    // Seed v3 with one captain, and a different v2 blob lying around.
    const baseProfile = defaultProfile();
    baseProfile.berries = 100;
    store.setItem(
      profilesStorageKey,
      serializeCaptainList([{ name: "Existing", profile: baseProfile }]),
    );
    store.setItem(legacyProfileStorageKey, serializeProfile(defaultProfile()));

    const records = listProfiles(store);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Existing");
    expect(records[0].profile.berries).toBe(100);
  });

  it("createProfile adds a captain and marks it active", () => {
    const result = createProfile("Nami", store);
    expect(result.ok).toBe(true);
    expect(result.record?.name).toBe("Nami");
    expect(getActiveProfileName(store)).toBe("Nami");
    expect(listProfiles(store)).toHaveLength(1);
  });

  it("createProfile rejects duplicates case-insensitively", () => {
    createProfile("Luffy", store);
    const second = createProfile("luffy", store);
    expect(second.ok).toBe(false);
    expect(second.error).toBe("duplicate");
    expect(listProfiles(store)).toHaveLength(1);
  });

  it("setActiveProfile switches to an existing captain", () => {
    createProfile("Luffy", store);
    createProfile("Zoro", store);
    expect(getActiveProfileName(store)).toBe("Zoro");
    expect(setActiveProfile("Luffy", store)).toBe(true);
    expect(getActiveProfileName(store)).toBe("Luffy");
  });

  it("setActiveProfile returns false for unknown captain", () => {
    createProfile("Luffy", store);
    expect(setActiveProfile("Ghost", store)).toBe(false);
    expect(getActiveProfileName(store)).toBe("Luffy");
  });

  it("saveActiveProfile persists changes against the active captain only", () => {
    createProfile("Luffy", store);
    createProfile("Zoro", store);
    setActiveProfile("Luffy", store);

    const profile = defaultProfile();
    profile.berries = 7;
    saveActiveProfile(profile, store);

    const records = listProfiles(store);
    const luffy = records.find((r) => r.name === "Luffy");
    const zoro = records.find((r) => r.name === "Zoro");
    expect(luffy?.profile.berries).toBe(7);
    expect(zoro?.profile.berries).toBe(0);
  });

  it("deleteProfile removes a captain and promotes another when active is deleted", () => {
    createProfile("Luffy", store);
    createProfile("Zoro", store);
    setActiveProfile("Zoro", store);

    const remaining = deleteProfile("Zoro", store);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("Luffy");
    // Active pointer should fall back to the surviving captain.
    expect(getActiveProfileName(store)).toBe("Luffy");
  });

  it("deleteProfile clears the active pointer when the last captain is removed", () => {
    createProfile("Luffy", store);
    deleteProfile("Luffy", store);
    expect(listProfiles(store)).toEqual([]);
    expect(store.getItem(activeProfileStorageKey)).toBeNull();
  });

  it("resetActiveProfile wipes only the active captain", () => {
    createProfile("Luffy", store);
    createProfile("Zoro", store);
    setActiveProfile("Luffy", store);

    // Bank some progress on Luffy.
    const profile = defaultProfile();
    profile.berries = 50;
    profile.completedMissionIds = ["tutorial-cove"];
    saveActiveProfile(profile, store);

    // Bank some progress on Zoro.
    setActiveProfile("Zoro", store);
    const zoroProfile = defaultProfile();
    zoroProfile.berries = 30;
    saveActiveProfile(zoroProfile, store);

    // Reset Zoro.
    const fresh = resetActiveProfile(store);
    expect(fresh?.berries).toBe(0);

    const records = listProfiles(store);
    const luffy = records.find((r) => r.name === "Luffy");
    const zoro = records.find((r) => r.name === "Zoro");
    expect(luffy?.profile.berries).toBe(50);
    expect(zoro?.profile.berries).toBe(0);
    expect(zoro?.profile.completedMissionIds).toEqual([]);
  });
});

describe("switch-player flow integration", () => {
  it("creating Captain A, then B, then switching back to A yields A's profile", () => {
    const store = makeStore();
    createProfile("Alpha", store);

    // Bank progress under Alpha.
    const alphaProfile = defaultProfile();
    alphaProfile.berries = 12;
    saveActiveProfile(alphaProfile, store);

    // Add Bravo — createProfile sets Bravo as active.
    createProfile("Bravo", store);
    expect(getActiveProfileName(store)).toBe("Bravo");

    const bravoProfile = defaultProfile();
    bravoProfile.berries = 99;
    saveActiveProfile(bravoProfile, store);

    // Switch back to Alpha.
    expect(setActiveProfile("Alpha", store)).toBe(true);
    const active = getActiveProfile(store);
    expect(active?.berries).toBe(12);

    // And listProfiles preserves both.
    const records = listProfiles(store);
    expect(records.map((r) => r.name).sort()).toEqual(["Alpha", "Bravo"]);
  });
});
