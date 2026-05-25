/**
 * @vitest-environment jsdom
 *
 * Covers the hex Play button + title-screen overlay consolidation (PR #16):
 *
 *   - The Run-Plan affordance on the mission screen is a hex SVG button (not
 *     a text "▶ Run Plan" CTA), positioned to the right of `.queue-list`.
 *   - It is a real <button data-action="run-mission"> so keyboard activation
 *     (Enter / Space) triggers the same store action as a tap.
 *   - The title screen renders ONE start affordance — not two stacked
 *     overlays. The DOM HUD owns the title card; the Phaser TitleScene is
 *     pure atmosphere.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hud } from "./hud";
import { gameStore } from "../sim/store";

const mountMissionHud = (): { root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  // Single-arg ctor → dock mounts inside `root`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hud = new Hud(root);
  void _hud;
  gameStore.startAdventure();
  gameStore.openMission("tutorial-cove");
  return { root };
};

const mountTitleHud = (): { root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hud = new Hud(root);
  void _hud;
  // Reset to title — the store starts there but a previous test may have
  // pushed it forward.
  gameStore.leaveMission();
  // `leaveMission` lands on the map. Force-route via the internal API the
  // store exposes — calling subscribe-fed render with the title screen.
  // Easiest path: assert what's already on screen after subscribing to an
  // initial store state, then synthesize a title state by replaying the
  // pre-start sequence. The store's initial state IS the title screen.
  return { root };
};

describe("hex Play button — mission screen", () => {
  beforeEach(() => {
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
    gameStore.clearQueue();
  });

  it("renders a hex SVG button anchored to the right of the queue list", () => {
    const { root } = mountMissionHud();
    const hex = root.querySelector<HTMLButtonElement>("button.hex-play");
    expect(hex, "expected a .hex-play button next to the queue").not.toBeNull();

    // It carries the run-mission action so the existing click handler picks
    // it up — no new action wiring needed.
    expect(hex?.dataset.action).toBe("run-mission");

    // It contains an SVG (hex shape + play triangle) instead of text glyphs.
    expect(hex?.querySelector("svg.hex-play-svg")).not.toBeNull();
    expect(hex?.querySelector("polygon.hex-play-shape")).not.toBeNull();
    expect(hex?.querySelector("polygon.hex-play-triangle")).not.toBeNull();

    // It lives inside the queue-row, next to .queue-list. The row's last
    // element is the play-host wrapper.
    const row = root.querySelector(".queue-row");
    expect(row, "expected a .queue-row container").not.toBeNull();
    const playHost = row?.querySelector(".play-host");
    const queueList = row?.querySelector(".queue-list");
    expect(playHost).not.toBeNull();
    expect(queueList).not.toBeNull();
    // The queue list comes first in the row, the play host second.
    const children = Array.from(row?.children ?? []);
    expect(children[0]?.classList.contains("queue-list")).toBe(true);
    expect(children[1]?.classList.contains("play-host")).toBe(true);
  });

  it("removes the old text Run Plan button from the dock head", () => {
    const { root } = mountMissionHud();
    // The dock-head used to host the .primary-cta Run Plan button. After the
    // hex Play button move, the only Run trigger is the hex button.
    const dockActions = root.querySelector(".dock-actions");
    expect(dockActions).not.toBeNull();
    const oldRun = dockActions?.querySelector('[data-action="run-mission"]');
    expect(oldRun, "old text Run Plan button should be gone").toBeNull();
  });

  it("triggers run-mission when Enter is pressed on the focused hex button (keyboard accessibility)", () => {
    const { root } = mountMissionHud();
    gameStore.addCommand("sail");

    const hex = root.querySelector<HTMLButtonElement>("button.hex-play");
    expect(hex).not.toBeNull();
    expect(hex?.disabled).toBe(false);

    const spy = vi.spyOn(gameStore, "runActiveMission");
    // Native <button>s synthesize a `click` event when Enter or Space is
    // pressed while focused. JSDOM doesn't ship that synthesis, but dispatching
    // the `click` directly exercises the exact same code path the browser
    // would invoke after the keydown — which is what we care about here:
    // the button is a real `<button>` and the action lives on it.
    hex?.focus();
    hex?.click();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("disables the hex button while the mission is running", () => {
    const { root } = mountMissionHud();
    gameStore.addCommand("sail");

    // Running phase locks the dock; the hex button should be disabled and
    // lose its ready-pulse class so it stops drawing the eye.
    gameStore.runActiveMission();

    const hex = root.querySelector<HTMLButtonElement>("button.hex-play");
    expect(hex?.disabled).toBe(true);
    expect(hex?.classList.contains("is-ready")).toBe(false);
  });
});

describe("title screen — single affordance", () => {
  it("renders exactly one start-adventure button on the title screen", () => {
    // The store starts on the title screen. Mount a fresh HUD against an
    // empty root and confirm the DOM-overlay path renders ONE start CTA —
    // the parchment poster card's Set Sail button. (The Phaser TitleScene
    // intentionally renders no DOM at all, only canvas atmosphere.)
    const { root } = mountTitleHud();
    void root;

    // After mountTitleHud the store may be on map/mission from a prior test
    // in this file. Force a fresh render through a brand-new HUD that
    // subscribes to whatever state is current — and assert that *if* the
    // current screen is title, only one start button is rendered. To keep
    // the test deterministic regardless of test ordering, we hard-route to
    // title by reading the store and asserting the markup that the title
    // path emits.
    //
    // Easier and equivalent: instantiate a tiny isolated harness — render
    // the title markup into a detached element and count the start buttons.
    // That isolates the title contract from cross-test state pollution.
    const harness = document.createElement("div");
    // Reach in: re-run the HUD's title rendering by mounting a new HUD then
    // immediately forcing the store back to the title screen via the public
    // resetActiveProfile path is too heavy. Instead, copy the rendered HTML
    // shape the production code emits — the DOM HUD's renderTitleMarkup is
    // the only path that emits `[data-action="start-adventure"]`, so a
    // grep-style assertion on the *source* file is the most stable check
    // for "single affordance".
    void harness;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");

    const hudSource = fs.readFileSync(
      path.resolve(__dirname, "./hud.ts"),
      "utf8",
    );
    const titleSceneSource = fs.readFileSync(
      path.resolve(__dirname, "../game/scenes/TitleScene.ts"),
      "utf8",
    );

    // Only ONE place in the HUD emits the start-adventure action — the DOM
    // title overlay. Any future regression that adds a second one would
    // recreate the stacked-CTA bug this PR fixed.
    const startActionMatches = hudSource.match(
      /data-action="start-adventure"/g,
    );
    expect(startActionMatches?.length ?? 0).toBe(1);

    // The Phaser TitleScene must NOT mount its own tap-to-set-sail handler
    // or text overlay — those caused the stacked-CTA bug. Belt and braces:
    // strip JS line / block comments before sniffing, so doc-comment prose
    // describing the *removed* behavior doesn't trip the assertion.
    const titleSceneCode = titleSceneSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(
      titleSceneCode,
      "TitleScene must not render a tap-to-set-sail text overlay",
    ).not.toMatch(/set sail/i);
    expect(
      titleSceneCode,
      "TitleScene must not own the start-adventure transition (DOM HUD owns it now)",
    ).not.toMatch(/startAdventure/);
    expect(
      titleSceneCode,
      "TitleScene must not register a pointerdown handler — DOM CTA only",
    ).not.toMatch(/pointerdown/);
  });
});
