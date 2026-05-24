import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// gameStore is imported by haptic.ts — vi.mock keeps the test free of the
// full sim/content graph and lets us flip reducedMotion per test.
const stateRef = {
  profile: { settings: { reducedMotion: false } },
};

vi.mock("../sim/store", () => ({
  gameStore: {
    getState: () => stateRef,
  },
}));

import { __getHapticPattern, haptic } from "./haptic";

const navigatorAny = globalThis as unknown as { navigator?: { vibrate?: ReturnType<typeof vi.fn> } };

const installNavigator = (vibrate?: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> => {
  const fn = vibrate ?? vi.fn(() => true);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { vibrate: fn },
  });
  return fn;
};

const installNavigatorWithoutVibrate = (): void => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
};

const removeNavigator = (): void => {
  if ("navigator" in globalThis) {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
};

beforeEach(() => {
  stateRef.profile.settings.reducedMotion = false;
});

afterEach(() => {
  removeNavigator();
  delete navigatorAny.navigator;
});

describe("haptic", () => {
  it("calls navigator.vibrate with the tap pattern", () => {
    const vibrate = installNavigator();
    haptic("tap");
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("calls navigator.vibrate with the confirm pattern", () => {
    const vibrate = installNavigator();
    haptic("confirm");
    expect(vibrate).toHaveBeenCalledWith([12, 40, 12]);
  });

  it("calls navigator.vibrate with the success pattern", () => {
    const vibrate = installNavigator();
    haptic("success");
    expect(vibrate).toHaveBeenCalledWith([20, 60, 20, 60, 40]);
  });

  it("calls navigator.vibrate with the fail pattern", () => {
    const vibrate = installNavigator();
    haptic("fail");
    expect(vibrate).toHaveBeenCalledWith([40, 80, 40]);
  });

  it("no-ops when navigator.vibrate is unsupported", () => {
    installNavigatorWithoutVibrate();
    expect(() => haptic("confirm")).not.toThrow();
  });

  it("no-ops when navigator is missing entirely", () => {
    removeNavigator();
    expect(() => haptic("success")).not.toThrow();
  });

  it("skips non-tap patterns when reducedMotion is on", () => {
    const vibrate = installNavigator();
    stateRef.profile.settings.reducedMotion = true;
    haptic("success");
    haptic("confirm");
    haptic("fail");
    expect(vibrate).not.toHaveBeenCalled();
    haptic("tap");
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("__getHapticPattern returns the registered patterns", () => {
    expect(__getHapticPattern("tap")).toBe(8);
    expect(__getHapticPattern("confirm")).toEqual([12, 40, 12]);
  });
});
