/**
 * Tiny haptic helper. Uses navigator.vibrate when supported, no-ops otherwise.
 *
 * Reduced-motion users only get the lightest "tap" feedback — the longer
 * confirm/success/fail patterns are skipped. Haptic is intentionally NOT
 * gated on the audio mute switch; they're independent accessibility knobs.
 */

import { gameStore } from "../sim/store";

export type HapticPattern = "tap" | "confirm" | "success" | "fail";

const patterns: Record<HapticPattern, number | number[]> = {
  tap: 8,
  confirm: [12, 40, 12],
  success: [20, 60, 20, 60, 40],
  fail: [40, 80, 40],
};

/** Internal seam so tests can read the resolved pattern. */
export const __getHapticPattern = (pattern: HapticPattern): number | number[] =>
  patterns[pattern];

export const haptic = (pattern: HapticPattern): void => {
  if (typeof navigator === "undefined") {
    return;
  }
  const vibrate = (navigator as Navigator & { vibrate?: Navigator["vibrate"] }).vibrate;
  if (typeof vibrate !== "function") {
    return;
  }

  let reducedMotion = false;
  try {
    reducedMotion = gameStore.getState().profile.settings.reducedMotion;
  } catch {
    reducedMotion = false;
  }

  if (reducedMotion && pattern !== "tap") {
    return;
  }

  try {
    // Navigator.vibrate accepts number | number[]; TS lib types narrowed it to
    // Iterable<number>, so widen the call site here.
    (vibrate as (pattern: number | number[]) => boolean).call(
      navigator,
      patterns[pattern],
    );
  } catch {
    // no-op
  }
};
