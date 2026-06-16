/**
 * @vitest-environment jsdom
 *
 * Reward-screen celebration layer:
 *   - With motion enabled, clearing a mission rains the sprite burst over the
 *     reward card, hidden from the accessibility tree (it's pure decoration —
 *     the aria-live region already announces the reward).
 *   - Under reduced motion the layer is skipped ENTIRELY (not just paused):
 *     information never rides on it, so it must not render at all.
 *
 * Uses the real Hud → gameStore → content pipeline like the other *.dom
 * tests. The two cases run as one sequential story (tutorial-cove, then
 * spark-shoals) because the singleton store persists mission completion
 * within this file's jsdom world — each mission's first clear uses its full
 * pre-loaded suggested queue, which the engine specs guarantee succeeds.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { gameStore } from "../sim/store";
import { Hud } from "./hud";

const setReducedMotion = (on: boolean): void => {
  if (gameStore.getState().profile.settings.reducedMotion !== on) {
    gameStore.toggleReducedMotion();
  }
};

/** Open a never-cleared mission and drive it to the reward screen. */
const clearMission = (missionId: string): void => {
  gameStore.openMission(missionId);
  gameStore.runActiveMission();
  expect(gameStore.getState().lastRun?.success).toBe(true);
  gameStore.finishPlayback();
  expect(gameStore.getState().screen).toBe("reward");
};

describe("reward celebration layer", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    void new Hud(root);
    gameStore.startAdventure();
  });

  it("rains a decorative, aria-hidden sprite burst when motion is enabled", () => {
    setReducedMotion(false);
    clearMission("tutorial-cove");

    const layer = root.querySelector<HTMLElement>(".reward-celebration");
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(
      layer?.querySelectorAll(".celebration-sprite").length ?? 0,
    ).toBeGreaterThan(0);

    gameStore.claimReward();
  });

  it("skips the layer entirely under reduced motion", () => {
    setReducedMotion(true);
    clearMission("spark-shoals");

    expect(root.querySelector(".reward-celebration")).toBeNull();

    gameStore.claimReward();
    setReducedMotion(false);
  });
});
