// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findHintTargetInstanceId, Hud } from "./hud";
import { gameStore } from "../sim/store";
import type { AppState, PlannedCommand } from "../sim/types";

/**
 * Build a minimal AppState pinned to the mission screen, with a queued plan
 * and an optional active hint. We pull the initial state from the store so
 * the profile is real; only the fields the HUD reads on the mission screen
 * are overridden.
 */
const missionStateWithHint = (
  queuedCommands: PlannedCommand[],
  focusTemplateId: string | undefined,
): AppState => {
  const base = gameStore.getState();
  return {
    ...base,
    screen: "mission",
    activeMissionId: "tutorial-cove",
    queuedCommands,
    missionPhase: "planning",
    activeHint: focusTemplateId
      ? {
          reason: "The ship bumped a reef.",
          suggestion: "Try a Turn before the next Sail.",
          focusTemplateId,
          highlightPositions: [],
          retryFromStep: 0,
        }
      : null,
  };
};

const queuedSail = (instanceId: string): PlannedCommand => ({
  instanceId,
  templateId: "sail",
  type: "action",
  action: "sail",
});

const queuedTurnLeft = (instanceId: string): PlannedCommand => ({
  instanceId,
  templateId: "turn-left",
  type: "action",
  action: "turn-left",
});

describe("findHintTargetInstanceId", () => {
  it("returns null when no focusTemplateId is provided", () => {
    const queue = [queuedSail("a"), queuedTurnLeft("b")];
    expect(findHintTargetInstanceId(queue, undefined)).toBeNull();
  });

  it("returns null when no queued command matches the focusTemplateId", () => {
    const queue = [queuedSail("a"), queuedTurnLeft("b")];
    expect(findHintTargetInstanceId(queue, "fire")).toBeNull();
  });

  it("returns the first queued command whose templateId matches", () => {
    const queue = [queuedSail("a"), queuedTurnLeft("b"), queuedSail("c")];
    expect(findHintTargetInstanceId(queue, "sail")).toBe("a");
    expect(findHintTargetInstanceId(queue, "turn-left")).toBe("b");
  });
});

describe("Hud — hint speech bubble anchoring", () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    hud = new Hud(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("marks the matching queue card with `.is-hint-target` when a hint focuses it", () => {
    const queue = [queuedSail("q1"), queuedTurnLeft("q2"), queuedSail("q3")];
    const state = missionStateWithHint(queue, "turn-left");

    hud.render(state);

    const targetCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q2"]',
    );
    expect(targetCard).not.toBeNull();
    expect(targetCard?.classList.contains("is-hint-target")).toBe(true);

    // Other cards must NOT carry the highlight.
    const otherCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q1"]',
    );
    expect(otherCard?.classList.contains("is-hint-target")).toBe(false);
  });

  it("falls back gracefully when the engine produced no focusTemplateId", () => {
    const queue = [queuedSail("q1")];
    const state = missionStateWithHint(queue, undefined);
    // Force a hint to exist but with no focus id.
    const stateWithUnfocusedHint: AppState = {
      ...state,
      activeHint: {
        reason: "Drift",
        suggestion: "Try again",
        focusTemplateId: undefined,
        highlightPositions: [],
        retryFromStep: 0,
      },
    };

    expect(() => hud.render(stateWithUnfocusedHint)).not.toThrow();

    const bubble = root.querySelector<HTMLElement>("[data-hint-bubble]");
    expect(bubble).not.toBeNull();
    // Static-anchor mode — no inline `top` override, no `is-anchored` class.
    expect(bubble?.classList.contains("is-anchored")).toBe(false);
    expect(bubble?.style.top).toBe("");

    // And nothing in the queue is flagged as a hint target.
    const cards = root.querySelectorAll(".queue-card.is-hint-target");
    expect(cards.length).toBe(0);
  });

  it("falls back gracefully when no queue card matches the focusTemplateId", () => {
    const queue = [queuedSail("q1")];
    // Engine pointed at `fire` but no `fire` block is in the queue.
    const state = missionStateWithHint(queue, "fire");

    expect(() => hud.render(state)).not.toThrow();

    const cards = root.querySelectorAll(".queue-card.is-hint-target");
    expect(cards.length).toBe(0);

    const bubble = root.querySelector<HTMLElement>("[data-hint-bubble]");
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains("is-anchored")).toBe(false);
  });

  it("clears the hint-target class when the hint is dismissed", () => {
    const queue = [queuedSail("q1")];
    const withHint = missionStateWithHint(queue, "sail");
    hud.render(withHint);

    const card = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q1"]',
    );
    expect(card?.classList.contains("is-hint-target")).toBe(true);

    // Re-render with no active hint.
    const withoutHint = missionStateWithHint(queue, undefined);
    hud.render(withoutHint);

    expect(card?.classList.contains("is-hint-target")).toBe(false);
  });

  it("moves the hint-target class when the focusTemplateId changes", () => {
    const queue = [queuedSail("q1"), queuedTurnLeft("q2")];
    hud.render(missionStateWithHint(queue, "sail"));

    const sailCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q1"]',
    );
    const turnCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q2"]',
    );
    expect(sailCard?.classList.contains("is-hint-target")).toBe(true);
    expect(turnCard?.classList.contains("is-hint-target")).toBe(false);

    hud.render(missionStateWithHint(queue, "turn-left"));

    expect(sailCard?.classList.contains("is-hint-target")).toBe(false);
    expect(turnCard?.classList.contains("is-hint-target")).toBe(true);
  });
});
