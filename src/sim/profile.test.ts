import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectReducedMotionPreference,
  loadProfile,
  serializeProfile,
} from "./profile";

/**
 * Tests for the first-launch reduced-motion seeding behavior.
 *
 * The vitest env is `node` by default — there's no real `window` — so we
 * stub a minimal `window` with the bits the profile loader touches:
 *   - `window.localStorage.getItem(key)`
 *   - `window.matchMedia(query).matches`
 */

interface FakeStorage {
  store: Record<string, string | null>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const makeStorage = (
  initial: Record<string, string | null> = {},
): FakeStorage => ({
  store: { ...initial },
  getItem(key) {
    return this.store[key] ?? null;
  },
  setItem(key, value) {
    this.store[key] = value;
  },
});

const stubWindow = (opts: {
  storage: FakeStorage;
  prefersReducedMotion: boolean | null;
}): void => {
  const matchMedia = opts.prefersReducedMotion === null
    ? undefined
    : (query: string) => ({
        media: query,
        matches:
          query.includes("prefers-reduced-motion: reduce") &&
          opts.prefersReducedMotion === true,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      });

  vi.stubGlobal("window", {
    localStorage: opts.storage,
    matchMedia,
  });
};

describe("detectReducedMotionPreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when window is undefined (SSR safety)", () => {
    vi.stubGlobal("window", undefined);
    expect(detectReducedMotionPreference()).toBe(false);
  });

  it("returns false when matchMedia is missing", () => {
    stubWindow({ storage: makeStorage(), prefersReducedMotion: null });
    expect(detectReducedMotionPreference()).toBe(false);
  });

  it("returns true when the OS reports reduced motion", () => {
    stubWindow({ storage: makeStorage(), prefersReducedMotion: true });
    expect(detectReducedMotionPreference()).toBe(true);
  });

  it("returns false when the OS reports no reduced-motion preference", () => {
    stubWindow({ storage: makeStorage(), prefersReducedMotion: false });
    expect(detectReducedMotionPreference()).toBe(false);
  });
});

describe("loadProfile — first-launch reduced-motion seeding", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds reducedMotion=true from OS when localStorage is empty", () => {
    stubWindow({
      storage: makeStorage(),
      prefersReducedMotion: true,
    });
    const profile = loadProfile();
    expect(profile.settings.reducedMotion).toBe(true);
  });

  it("leaves reducedMotion=false when OS does not prefer reduced motion (fresh profile)", () => {
    stubWindow({
      storage: makeStorage(),
      prefersReducedMotion: false,
    });
    const profile = loadProfile();
    expect(profile.settings.reducedMotion).toBe(false);
  });

  it("does NOT overwrite an existing player's stored choice (reducedMotion=false)", () => {
    // Stored profile has reducedMotion explicitly off, even though OS reports on.
    const stored = serializeProfile({
      unlockedMissionIds: ["tutorial-cove", "sandbox-isle"],
      completedMissionIds: ["tutorial-cove"],
      berries: 5,
      bounty: 0,
      stars: 1,
      crewRoster: [],
      fruitPowers: [],
      commandUnlocks: ["sail", "collect"],
      bestStars: { "tutorial-cove": 1 },
      captainLog: [],
      attemptCounts: { "tutorial-cove": 1 },
      settings: {
        reducedMotion: false,
        soundOn: true,
        muted: false,
        skipPrediction: false,
        alwaysShowSuggested: false,
        themeId: "original",
      },
    });

    stubWindow({
      storage: makeStorage({ "sea-of-codes/profile/v2": stored }),
      prefersReducedMotion: true,
    });

    const profile = loadProfile();
    expect(profile.settings.reducedMotion).toBe(false);
  });

  it("preserves an existing player's reducedMotion=true even if OS says off", () => {
    const stored = serializeProfile({
      unlockedMissionIds: ["tutorial-cove", "sandbox-isle"],
      completedMissionIds: [],
      berries: 0,
      bounty: 0,
      stars: 0,
      crewRoster: [],
      fruitPowers: [],
      commandUnlocks: ["sail", "collect"],
      bestStars: {},
      captainLog: [],
      attemptCounts: {},
      settings: {
        reducedMotion: true,
        soundOn: true,
        muted: false,
        skipPrediction: false,
        alwaysShowSuggested: false,
        themeId: "original",
      },
    });

    stubWindow({
      storage: makeStorage({ "sea-of-codes/profile/v2": stored }),
      prefersReducedMotion: false,
    });

    const profile = loadProfile();
    expect(profile.settings.reducedMotion).toBe(true);
  });
});
