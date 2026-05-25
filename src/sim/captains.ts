import {
  cloneProfile,
  defaultProfile,
  deserializeProfile,
  serializeProfile,
} from "./profile";
import type { PlayerProfile } from "./types";

/**
 * Per-captain profile storage (DESIGN.md §9 multi-kid support).
 *
 * Schema v3:
 *   sea-of-codes/profiles/v3       → JSON array of { name, profile }
 *   sea-of-codes/active-profile/v3 → string (active captain name)
 *
 * Schema v2 (single-slot legacy):
 *   sea-of-codes/profile/v2 → serialized PlayerProfile
 *
 * On first read, v2 is migrated into v3 under the captain name "Captain".
 * v2 storage is left in place so a downgrade can still read it.
 */
export const profilesStorageKey = "sea-of-codes/profiles/v3";
export const activeProfileStorageKey = "sea-of-codes/active-profile/v3";
export const legacyProfileStorageKey = "sea-of-codes/profile/v2";

export const MAX_NAME_LENGTH = 16;
export const MAX_CAPTAINS_SHOWN = 4;
export const MIGRATED_LEGACY_CAPTAIN_NAME = "Captain";

export interface CaptainRecord {
  name: string;
  profile: PlayerProfile;
}

export interface CaptainStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ── Name validation ────────────────────────────────────────────

const NAME_PATTERN = /^[A-Za-z0-9 ]+$/;

export type NameValidationError =
  | "empty"
  | "too-long"
  | "invalid-chars"
  | "duplicate";

export interface NameValidationResult {
  ok: boolean;
  cleaned: string;
  error?: NameValidationError;
}

/**
 * Trim, collapse internal whitespace, and validate. Duplicate check is
 * case-insensitive against `existingNames`. Returns the cleaned name on ok.
 */
export const validateCaptainName = (
  raw: string,
  existingNames: readonly string[] = [],
): NameValidationResult => {
  const cleaned = raw.trim().replace(/\s+/g, " ");

  if (cleaned.length === 0) {
    return { ok: false, cleaned, error: "empty" };
  }
  if (cleaned.length > MAX_NAME_LENGTH) {
    return { ok: false, cleaned, error: "too-long" };
  }
  if (!NAME_PATTERN.test(cleaned)) {
    return { ok: false, cleaned, error: "invalid-chars" };
  }

  const lower = cleaned.toLowerCase();
  const isDuplicate = existingNames.some(
    (existing) => existing.toLowerCase() === lower,
  );
  if (isDuplicate) {
    return { ok: false, cleaned, error: "duplicate" };
  }

  return { ok: true, cleaned };
};

// ── Pure read / write of the v3 list ───────────────────────────

const isCaptainRecord = (value: unknown): value is CaptainRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as { name?: unknown; profile?: unknown };
  return (
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    !!record.profile &&
    typeof record.profile === "object"
  );
};

/**
 * Deserialize the raw v3 list. Bad rows are dropped, profiles are re-merged
 * through `deserializeProfile` so per-profile migrations still apply.
 */
export const deserializeCaptainList = (raw: string | null): CaptainRecord[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const records: CaptainRecord[] = [];
    for (const entry of parsed) {
      if (!isCaptainRecord(entry)) continue;
      records.push({
        name: entry.name.trim().slice(0, MAX_NAME_LENGTH),
        profile: deserializeProfile(JSON.stringify(entry.profile)),
      });
    }
    return records;
  } catch {
    return [];
  }
};

export const serializeCaptainList = (records: CaptainRecord[]): string =>
  JSON.stringify(
    records.map((record) => ({
      name: record.name,
      profile: record.profile,
    })),
  );

// ── Storage adapter (window.localStorage by default) ───────────

const memoryStore = (): CaptainStore => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) ?? null : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

const resolveStore = (store?: CaptainStore): CaptainStore => {
  if (store) return store;
  if (typeof window === "undefined" || !window.localStorage) {
    return memoryStore();
  }
  return window.localStorage;
};

// ── Migration v2 → v3 ──────────────────────────────────────────

/**
 * Pure migration step. Given the current v3 list and the raw v2 blob (or null),
 * returns the list to write back. v2 is only consumed when v3 is empty so we
 * never clobber an existing v3 state.
 */
export const migrateLegacyV2 = (
  currentRecords: CaptainRecord[],
  legacyRaw: string | null,
  captainName: string = MIGRATED_LEGACY_CAPTAIN_NAME,
): CaptainRecord[] => {
  if (currentRecords.length > 0) return currentRecords;
  if (!legacyRaw) return currentRecords;
  const profile = deserializeProfile(legacyRaw);
  return [{ name: captainName, profile }];
};

// ── Stateful API (uses storage) ────────────────────────────────

const loadList = (store: CaptainStore): CaptainRecord[] => {
  const raw = store.getItem(profilesStorageKey);
  let records = deserializeCaptainList(raw);

  if (records.length === 0) {
    const legacyRaw = store.getItem(legacyProfileStorageKey);
    const migrated = migrateLegacyV2(records, legacyRaw);
    if (migrated.length > 0) {
      records = migrated;
      store.setItem(profilesStorageKey, serializeCaptainList(records));
    }
  }

  return records;
};

const writeList = (store: CaptainStore, records: CaptainRecord[]): void => {
  store.setItem(profilesStorageKey, serializeCaptainList(records));
};

const findIndex = (records: CaptainRecord[], name: string): number =>
  records.findIndex((record) => record.name.toLowerCase() === name.toLowerCase());

export const listProfiles = (store?: CaptainStore): CaptainRecord[] =>
  loadList(resolveStore(store));

export const getActiveProfileName = (store?: CaptainStore): string | null => {
  const s = resolveStore(store);
  const records = loadList(s);
  if (records.length === 0) return null;

  const stored = s.getItem(activeProfileStorageKey);
  if (stored) {
    const match = records.find(
      (record) => record.name.toLowerCase() === stored.toLowerCase(),
    );
    if (match) return match.name;
  }
  // Stale or missing pointer — fall back to the first record.
  s.setItem(activeProfileStorageKey, records[0].name);
  return records[0].name;
};

export const setActiveProfile = (
  name: string,
  store?: CaptainStore,
): boolean => {
  const s = resolveStore(store);
  const records = loadList(s);
  const idx = findIndex(records, name);
  if (idx === -1) return false;
  s.setItem(activeProfileStorageKey, records[idx].name);
  return true;
};

export const getActiveProfile = (store?: CaptainStore): PlayerProfile | null => {
  const s = resolveStore(store);
  const name = getActiveProfileName(s);
  if (!name) return null;
  const records = loadList(s);
  const record = records.find(
    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
  );
  return record ? cloneProfile(record.profile) : null;
};

export interface CreateProfileResult {
  ok: boolean;
  error?: NameValidationError;
  record?: CaptainRecord;
}

export const createProfile = (
  rawName: string,
  store?: CaptainStore,
): CreateProfileResult => {
  const s = resolveStore(store);
  const records = loadList(s);
  const validation = validateCaptainName(
    rawName,
    records.map((record) => record.name),
  );
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const record: CaptainRecord = {
    name: validation.cleaned,
    profile: defaultProfile(),
  };
  const next = [...records, record];
  writeList(s, next);
  s.setItem(activeProfileStorageKey, record.name);
  return { ok: true, record };
};

export const deleteProfile = (
  name: string,
  store?: CaptainStore,
): CaptainRecord[] => {
  const s = resolveStore(store);
  const records = loadList(s);
  const idx = findIndex(records, name);
  if (idx === -1) return records;

  const next = [...records.slice(0, idx), ...records.slice(idx + 1)];
  writeList(s, next);

  const activeName = s.getItem(activeProfileStorageKey);
  if (activeName?.toLowerCase() === name.toLowerCase()) {
    if (next.length > 0) {
      s.setItem(activeProfileStorageKey, next[0].name);
    } else {
      s.removeItem(activeProfileStorageKey);
    }
  }
  return next;
};

/**
 * Persist `profile` against the currently-active captain. No-op if there is
 * no active captain (the picker hasn't run yet, e.g. SSR/test).
 */
export const saveActiveProfile = (
  profile: PlayerProfile,
  store?: CaptainStore,
): void => {
  const s = resolveStore(store);
  const name = getActiveProfileName(s);
  if (!name) return;
  const records = loadList(s);
  const idx = findIndex(records, name);
  if (idx === -1) return;
  const next = [...records];
  next[idx] = { name: records[idx].name, profile };
  writeList(s, next);
};

/**
 * Reset just the active captain's profile back to defaults (DESIGN: "Start
 * over" in Settings clears only the current captain).
 */
export const resetActiveProfile = (store?: CaptainStore): PlayerProfile | null => {
  const s = resolveStore(store);
  const name = getActiveProfileName(s);
  if (!name) return null;
  const records = loadList(s);
  const idx = findIndex(records, name);
  if (idx === -1) return null;
  const fresh = defaultProfile();
  const next = [...records];
  next[idx] = { name: records[idx].name, profile: fresh };
  writeList(s, next);
  return cloneProfile(fresh);
};

// ── Re-export the (un-cloned) serializer used by saveActiveProfile callers
// that already cloned the profile.
export const _internal = { serializeProfile };
