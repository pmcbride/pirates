import { beforeEach, describe, expect, it } from "vitest";
import {
  CaptainStore,
  MAX_NAME_LENGTH,
  MIGRATED_LEGACY_CAPTAIN_NAME,
  activeProfileStorageKey,
  createProfile,
  createProfileWithPreset,
  deleteProfile,
  deserializeCaptainList,
  getActiveProfile,
  getActiveProfileName,
  legacyProfileStorageKey,
  listProfiles,
  migrateLegacyV2,
  presetCaptains,
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

describe("createProfileWithPreset (tap-to-create, never fails)", () => {
  let store: CaptainStore;

  beforeEach(() => {
    store = makeStore();
  });

  it("creates the preset name verbatim on first use and marks it active", () => {
    const record = createProfileWithPreset("Captain Wave", store);
    expect(record.name).toBe("Captain Wave");
    expect(getActiveProfileName(store)).toBe("Captain Wave");
    expect(listProfiles(store)).toHaveLength(1);
  });

  it("suffixes ' II' then ' III' on duplicate collisions", () => {
    const first = createProfileWithPreset("Captain Wave", store);
    const second = createProfileWithPreset("Captain Wave", store);
    const third = createProfileWithPreset("Captain Wave", store);
    expect(first.name).toBe("Captain Wave");
    expect(second.name).toBe("Captain Wave II");
    expect(third.name).toBe("Captain Wave III");
    expect(listProfiles(store)).toHaveLength(3);
  });

  it("treats collisions case-insensitively", () => {
    createProfile("captain wave", store);
    const record = createProfileWithPreset("Captain Wave", store);
    expect(record.name).toBe("Captain Wave II");
  });

  it("keeps suffixed names within MAX_NAME_LENGTH by trimming the base", () => {
    // "Captain Parrot" is 14 chars — a bare " II" would overflow the 16-char
    // cap, so the base must give way while the numeral survives whole.
    const first = createProfileWithPreset("Captain Parrot", store);
    const second = createProfileWithPreset("Captain Parrot", store);
    expect(first.name).toBe("Captain Parrot");
    expect(second.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(second.name.endsWith(" II")).toBe(true);
    expect(second.name).not.toBe(first.name);
  });

  it("every result passes validateCaptainName against the rest of the roster", () => {
    // Hammer one preset repeatedly — each new name must be storable as-is.
    for (let i = 0; i < 6; i += 1) {
      const before = listProfiles(store).map((r) => r.name);
      const record = createProfileWithPreset("Captain Sunny", store);
      const validation = validateCaptainName(record.name, before);
      expect(validation.ok).toBe(true);
      expect(validation.cleaned).toBe(record.name);
    }
    expect(listProfiles(store)).toHaveLength(6);
  });

  it("ships preset captains that are all individually valid names", () => {
    expect(presetCaptains.length).toBeGreaterThanOrEqual(4);
    for (const preset of presetCaptains) {
      const validation = validateCaptainName(preset.name);
      expect(validation.ok, `preset "${preset.name}" must validate`).toBe(true);
      expect(preset.icon.length).toBeGreaterThan(0);
    }
    // Names must be unique within the preset list itself.
    const lower = presetCaptains.map((p) => p.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
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

describe("profile creation resilience", () => {
  const throwingStore = (): CaptainStore => {
    const map = new Map<string, string>();
    return {
      getItem: (key) => (map.has(key) ? (map.get(key) ?? null) : null),
      setItem: () => {
        throw new Error("QuotaExceededError (simulated)");
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
  };

  it("createProfileWithPreset returns a usable captain when storage writes throw", () => {
    // Quota exhaustion / locked-down private browsing on the first-launch
    // tap must degrade to a non-persisted session, never a stuck picker.
    const record = createProfileWithPreset("Captain Wave", throwingStore());
    expect(record.name).toBe("Captain Wave");
    expect(record.profile.berries).toBe(defaultProfile().berries);
  });

  it("createProfile reports ok when only persistence fails", () => {
    const result = createProfile("Theo", throwingStore());
    expect(result.ok).toBe(true);
    expect(result.record?.name).toBe("Theo");
  });

  it("createProfileWithPreset falls back to the legacy default name on empty input", () => {
    const store = makeStore();
    const record = createProfileWithPreset("   ", store);
    expect(record.name).toBe(MIGRATED_LEGACY_CAPTAIN_NAME);
    // The fallback name round-trips the list serializer (an empty name
    // would be silently dropped by deserializeCaptainList on next launch).
    expect(listProfiles(store).map((r) => r.name)).toContain(
      MIGRATED_LEGACY_CAPTAIN_NAME,
    );
  });
});
