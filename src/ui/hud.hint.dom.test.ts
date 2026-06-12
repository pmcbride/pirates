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
          suggestion: "Try a different arrow before the next move.",
          focusTemplateId,
          highlightPositions: [],
          retryFromStep: 0,
        }
      : null,
  };
};

const queuedRight = (instanceId: string): PlannedCommand => ({
  instanceId,
  templateId: "move-right",
  type: "action",
  action: "move-right",
});

const queuedUp = (instanceId: string): PlannedCommand => ({
  instanceId,
  templateId: "move-up",
  type: "action",
  action: "move-up",
});

describe("findHintTargetInstanceId", () => {
  it("returns null when no focusTemplateId is provided", () => {
    const queue = [queuedRight("a"), queuedUp("b")];
    expect(findHintTargetInstanceId(queue, undefined)).toBeNull();
  });

  it("returns null when no queued command matches the focusTemplateId", () => {
    const queue = [queuedRight("a"), queuedUp("b")];
    expect(findHintTargetInstanceId(queue, "fire")).toBeNull();
  });

  it("returns the first queued command whose templateId matches", () => {
    const queue = [queuedRight("a"), queuedUp("b"), queuedRight("c")];
    expect(findHintTargetInstanceId(queue, "move-right")).toBe("a");
    expect(findHintTargetInstanceId(queue, "move-up")).toBe("b");
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
    const queue = [queuedRight("q1"), queuedUp("q2"), queuedRight("q3")];
    const state = missionStateWithHint(queue, "move-up");

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
    const queue = [queuedRight("q1")];
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

  it("anchors to the PALETTE stamp when the needed block is missing from the queue", () => {
    // The common "you deleted / never added the needed block" case: the
    // hint focuses `collect` (in tutorial-cove's palette) but the queue
    // only holds movement blocks. The bubble must glow + point at the
    // palette stamp so a pre-reader sees the thing to tap.
    const queue = [queuedRight("q1")];
    const state = missionStateWithHint(queue, "collect");

    expect(() => hud.render(state)).not.toThrow();

    // No queue card claims the highlight…
    expect(root.querySelectorAll(".queue-card.is-hint-target").length).toBe(0);

    // …the matching palette stamp does.
    const paletteTarget = root.querySelector<HTMLElement>(
      '.palette-card[data-template-id="collect"]',
    );
    expect(paletteTarget).not.toBeNull();
    expect(paletteTarget?.classList.contains("is-hint-target")).toBe(true);

    // And the bubble anchors (tail pointed at the stamp).
    const bubble = root.querySelector<HTMLElement>("[data-hint-bubble]");
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains("is-anchored")).toBe(true);
  });

  it("shows the needed block's icon inside the bubble", () => {
    const queue = [queuedRight("q1")];
    hud.render(missionStateWithHint(queue, "collect"));

    const bubble = root.querySelector<HTMLElement>("[data-hint-bubble]");
    expect(bubble).not.toBeNull();
    const icon = bubble?.querySelector(".hint-block-icon svg");
    expect(icon, "bubble must visually name the needed block").not.toBeNull();
  });

  it("clears the palette glow when the hint is dismissed", () => {
    const queue = [queuedRight("q1")];
    hud.render(missionStateWithHint(queue, "collect"));

    const paletteTarget = root.querySelector<HTMLElement>(
      '.palette-card[data-template-id="collect"]',
    );
    expect(paletteTarget?.classList.contains("is-hint-target")).toBe(true);

    hud.render(missionStateWithHint(queue, undefined));

    const stillGlowing = root.querySelectorAll(".palette-card.is-hint-target");
    expect(stillGlowing.length).toBe(0);
  });

  it("falls back to static anchoring when the block is in neither queue nor palette", () => {
    const queue = [queuedRight("q1")];
    // Engine pointed at `fire` — not queued, and not in tutorial-cove's
    // palette either. Nothing can take the glow; the bubble stays static.
    const state = missionStateWithHint(queue, "fire");

    expect(() => hud.render(state)).not.toThrow();

    expect(root.querySelectorAll(".queue-card.is-hint-target").length).toBe(0);
    expect(root.querySelectorAll(".palette-card.is-hint-target").length).toBe(0);

    const bubble = root.querySelector<HTMLElement>("[data-hint-bubble]");
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains("is-anchored")).toBe(false);
  });

  it("clears the hint-target class when the hint is dismissed", () => {
    const queue = [queuedRight("q1")];
    const withHint = missionStateWithHint(queue, "move-right");
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
    const queue = [queuedRight("q1"), queuedUp("q2")];
    hud.render(missionStateWithHint(queue, "move-right"));

    const rightCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q1"]',
    );
    const upCard = root.querySelector<HTMLElement>(
      '.queue-card[data-instance-id="q2"]',
    );
    expect(rightCard?.classList.contains("is-hint-target")).toBe(true);
    expect(upCard?.classList.contains("is-hint-target")).toBe(false);

    hud.render(missionStateWithHint(queue, "move-up"));

    expect(rightCard?.classList.contains("is-hint-target")).toBe(false);
    expect(upCard?.classList.contains("is-hint-target")).toBe(true);
  });
});
