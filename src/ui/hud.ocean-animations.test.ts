/**
 * @vitest-environment jsdom
 *
 * Smoke tests for the "ocean phase animations" PR:
 *   1. When a brand-new command lands in the queue, its rendered chip gets the
 *      `.is-just-dropped` class so the chip can play the bounce-in keyframe
 *      animation declared in `src/styles.css`.
 *   2. The CSS file actually declares the two new keyframe animations the
 *      Phaser-side ocean effects rely on (`hint-bubble-in`, `queue-chip-drop`)
 *      so the DOM-side polish lands together with the canvas effects.
 *
 * JSDOM doesn't apply stylesheets, so we read the CSS source directly for the
 * keyframe assertion — same pattern as `hud.queue.dom.test.ts`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Hud } from "./hud";
import { gameStore } from "../sim/store";

const mountMissionHud = (): { root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hud = new Hud(root);
  void _hud;
  gameStore.startAdventure();
  gameStore.openMission("tutorial-cove");
  return { root };
};

describe("queue chip drop-in animation", () => {
  beforeEach(() => {
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
    gameStore.clearQueue();
    document.body.innerHTML = "";
  });

  it("adds .is-just-dropped to a freshly inserted queue card", () => {
    const { root } = mountMissionHud();
    // `openMission` pre-fills the suggested queue — wipe it so we can observe
    // the next addCommand as a brand-new insert.
    gameStore.clearQueue();
    gameStore.addCommand("move-right");

    const cards = root.querySelectorAll<HTMLElement>(".queue-card");
    expect(cards.length).toBe(1);
    expect(cards[0].classList.contains("is-just-dropped")).toBe(true);
  });

  it("does NOT re-add .is-just-dropped to existing cards when a new one is appended", () => {
    const { root } = mountMissionHud();
    gameStore.clearQueue();
    gameStore.addCommand("move-right");
    const firstCard = root.querySelector<HTMLElement>(".queue-card");
    expect(firstCard).not.toBeNull();

    // Manually strip the class (in a real browser, animationend would do this
    // ~180ms after insert — we simulate that here).
    firstCard!.classList.remove("is-just-dropped");

    gameStore.addCommand("move-right");
    const cards = root.querySelectorAll<HTMLElement>(".queue-card");
    expect(cards.length).toBe(2);

    // The original card stays clean — only the NEW one gets the entrance class.
    expect(cards[0].classList.contains("is-just-dropped")).toBe(false);
    expect(cards[1].classList.contains("is-just-dropped")).toBe(true);
  });
});

describe("ocean animation CSS contract", () => {
  it("declares the hint-bubble-in and queue-chip-drop keyframes", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    // Hint banner entrance — referenced by the `.hint-banner` rule's
    // `animation: hint-bubble-in ...` declaration.
    expect(css).toMatch(/@keyframes\s+hint-bubble-in\b/);
    expect(css).toMatch(/animation:\s*hint-bubble-in/);

    // Queue chip drop — referenced by the `.queue-card.is-just-dropped` rule.
    expect(css).toMatch(/@keyframes\s+queue-chip-drop\b/);
    expect(css).toMatch(/\.queue-card\.is-just-dropped/);

    // Reduced-motion override — hint bubble should fall back to a fade-only
    // animation when the user has opted out of motion.
    expect(css).toMatch(/prefers-reduced-motion[^}]*hint-banner/s);
  });
});
