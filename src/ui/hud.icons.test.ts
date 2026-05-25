/**
 * @vitest-environment jsdom
 *
 * Verifies the cross-platform icon strategy: every command-block glyph in
 * the queue and palette must render as inline SVG, never as a Unicode
 * emoji codepoint. The whole reason we ship Twemoji SVGs is that the
 * "designed look" of the stamps depended on a single visual identity,
 * and the host-OS emoji fonts diverged badly (the `🧑‍🎤` ZWJ sequence
 * even broke entirely on older Android).
 *
 * If this test fails the regression is probably either:
 *   - someone reintroduced raw emoji into `iconMap` in `src/ui/hud.ts`, or
 *   - one of the Twemoji SVG files was deleted from `src/ui/icons/`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { Hud } from "./hud";
import { gameStore } from "../sim/store";
import { missions } from "../sim/content";

// Unicode property class for *all* emoji code points — covers single-char
// glyphs (⛵), variation-selector-decorated ones (⚔️), ZWJ sequences
// (🧑‍🎤) and the Misc-Symbols arrows we previously fell back on (↺↻).
const EMOJI_RE = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[↺↻]/u;

const mountHud = (): { hud: Hud; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const hud = new Hud(root);
  return { hud, root };
};

describe("HUD icon rendering (no Unicode emoji in queue/palette)", () => {
  beforeAll(() => {
    // Drive the singleton store into the mission screen so the palette
    // and queue regions are actually mounted.
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
  });

  it("mounts the mission screen with palette + (initial suggested) queue", () => {
    const { root } = mountHud();
    expect(root.querySelector(".palette-grid")).not.toBeNull();
    expect(root.querySelector(".queue-list")).not.toBeNull();
  });

  it("renders every palette stamp's icon as inline SVG, not as a Unicode emoji character", () => {
    const { root } = mountHud();
    const palette = root.querySelector(".palette-grid") as HTMLElement | null;
    expect(palette).not.toBeNull();
    const cards = palette!.querySelectorAll(".palette-card");
    expect(cards.length).toBeGreaterThan(0);

    for (const card of Array.from(cards)) {
      const iconHost = card.querySelector(".stamp-icon");
      expect(iconHost, `palette card ${card.outerHTML.slice(0, 80)}…`).not.toBeNull();
      expect(iconHost!.querySelector("svg")).not.toBeNull();
    }

    // Crucially: no emoji code points survive in the palette markup.
    expect(EMOJI_RE.test(palette!.innerHTML)).toBe(false);
  });

  it("renders every queue card's icon as inline SVG, not as a Unicode emoji character", () => {
    // Make sure the queue has cards. The tutorial mission's suggested
    // queue is pre-loaded on first open, so we use that.
    const queuedCount = gameStore.getState().queuedCommands.length;
    if (queuedCount === 0) {
      // Force at least one card from the mission's own palette.
      const mission = missions["tutorial-cove"];
      const templateId = mission.palette[0];
      gameStore.addCommand(templateId);
    }

    const { root } = mountHud();
    const list = root.querySelector(".queue-list") as HTMLElement | null;
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll(".queue-card").length).toBeGreaterThan(0);
    expect(list!.querySelector(".queue-card .stamp-icon svg")).not.toBeNull();

    expect(EMOJI_RE.test(list!.innerHTML)).toBe(false);
  });

  it("makes queue cards keyboard-focusable (tabindex=0)", () => {
    if (gameStore.getState().queuedCommands.length === 0) {
      const mission = missions["tutorial-cove"];
      gameStore.addCommand(mission.palette[0]);
    }
    const { root } = mountHud();
    const card = root.querySelector(".queue-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card!.tabIndex).toBe(0);
  });

  it("does not strip the focus ring from focusable elements", () => {
    // Defensive: we explicitly do NOT want `outline: none` anywhere in the
    // bundled stylesheet — that's the worst single thing you can do to a
    // keyboard user.
    const styles = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      })
      .map((rule) => (rule as CSSStyleRule).cssText ?? "");
    for (const cssText of styles) {
      // A rule that *sets* outline: none is a regression; a rule that
      // includes "outline-offset: …" or similar is fine.
      if (/outline\s*:\s*(none|0)/i.test(cssText)) {
        throw new Error(`Found outline:none rule in stylesheet: ${cssText}`);
      }
    }
  });
});

describe("HUD keyboard support", () => {
  beforeAll(() => {
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
    // Make sure we have at least two cards to reorder.
    const mission = missions["tutorial-cove"];
    while (gameStore.getState().queuedCommands.length < 2) {
      gameStore.addCommand(mission.palette[0]);
    }
  });

  it("ArrowRight on a focused queue card reorders it via gameStore.moveCommand", () => {
    const { root } = mountHud();
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".queue-card"));
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const first = cards[0];
    const firstInstanceId = first.dataset.instanceId!;
    first.focus();
    expect(document.activeElement).toBe(first);

    const before = gameStore.getState().queuedCommands.map((c) => c.instanceId);

    first.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    const after = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(after).not.toEqual(before);
    // The same instance moved forward by one position.
    expect(after.indexOf(firstInstanceId)).toBeGreaterThan(before.indexOf(firstInstanceId));
  });

  it("Delete on a focused queue card removes that card", () => {
    const { root } = mountHud();
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".queue-card"));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const target = cards[0];
    const targetInstanceId = target.dataset.instanceId!;
    const beforeCount = gameStore.getState().queuedCommands.length;
    target.focus();

    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        cancelable: true,
      }),
    );

    const afterIds = gameStore.getState().queuedCommands.map((c) => c.instanceId);
    expect(afterIds).not.toContain(targetInstanceId);
    expect(afterIds.length).toBe(beforeCount - 1);
  });
});
