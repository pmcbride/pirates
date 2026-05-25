/**
 * @vitest-environment jsdom
 *
 * Covers the compact-queue / drag-reorder PR:
 *   - Queue chips are icon-only and ≤ 96px wide (board-dominant layout).
 *   - A queue chip is `draggable` and writes the right `dataTransfer` keys
 *     when dragstart fires (the contract `handleDrop` relies on to tell a
 *     reorder apart from a palette-add).
 *   - `.command-dock` is NOT `position: absolute` — that's what used to make
 *     it overlap the canvas. The grid shell now reserves the bottom row for
 *     it instead.
 *   - The ◀ / ▶ move buttons are gone from queue cards. (Removed because
 *     5–7 year-olds found the arrows confusing — drag-and-drop replaces
 *     them.)
 *
 * These tests intentionally use the real Hud → gameStore → content pipeline
 * to confirm the chips render the way the player would actually see them.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Hud } from "./hud";
import { gameStore } from "../sim/store";

const mountMissionHud = (): { root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  // Single-arg ctor → dock mounts inside `root`, which is exactly what the
  // assertions below want.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hud = new Hud(root);
  void _hud;
  // Drive the store into the mission screen so the queue + palette are real.
  gameStore.startAdventure();
  gameStore.openMission("tutorial-cove");
  return { root };
};

const widthFromStyle = (el: HTMLElement): number => {
  // JSDOM doesn't lay out — but our CSS defines a fixed `width` and `max-width`
  // on `.queue-card` in pixels, so reading the stylesheet's computed cascade
  // via inline `style` won't help. Instead we read the CSS declaration that
  // applies (the rule lives in `styles.css` which JSDOM doesn't load). We
  // therefore assert against the *declared* sizing of the card by checking
  // the `data-queue-card-width` token if set, falling back to the layout box.
  const rect = el.getBoundingClientRect();
  if (rect.width > 0) return rect.width;
  // Read max-width from the inline style if forced; else parse a stylesheet.
  return 0;
};

describe("compact queue chip — sizing", () => {
  beforeEach(() => {
    // Reset to a known state — clear any queue from the previous test.
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
    gameStore.clearQueue();
  });

  it("declares a queue-card width of ≤ 96px in the rendered CSS", () => {
    // The `.queue-card` rule in `styles.css` declares `width: 76px; max-width: 96px;`.
    // JSDOM doesn't apply the stylesheet, so the assertion reads the source
    // CSS string instead — that's the single source of truth for sizing and
    // it's what a real browser would honour. If a future refactor bumps the
    // max past 96 we'll catch it here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    // Pull the `.queue-card { ... }` block (the very first one — the broader
    // selector that sets width). We allow newlines via `s` flag.
    const block = /\.queue-card\s*\{([^}]+)\}/s.exec(css);
    expect(block, "no .queue-card CSS block found").not.toBeNull();

    const decl = block?.[1] ?? "";
    const maxWidthMatch = /max-width:\s*(\d+)px/.exec(decl);
    expect(maxWidthMatch, "no max-width declared on .queue-card").not.toBeNull();
    const maxWidth = Number(maxWidthMatch?.[1] ?? "9999");
    expect(maxWidth).toBeLessThanOrEqual(96);

    // Also check the declared `width` — the chip should default to a compact
    // value, not stretch.
    const widthMatch = /[^-]width:\s*(\d+)px/.exec(decl);
    expect(widthMatch).not.toBeNull();
    const width = Number(widthMatch?.[1] ?? "9999");
    expect(width).toBeLessThanOrEqual(96);

    // Suppress the unused helper warning while keeping it documented above.
    void widthFromStyle;
  });

  it("renders queue cards with NO ◀ / ▶ move buttons", () => {
    const { root } = mountMissionHud();
    gameStore.addCommand("move-right");
    gameStore.addCommand("move-right");

    const cards = root.querySelectorAll(".queue-card");
    expect(cards.length).toBeGreaterThan(0);

    // No data-action="move-left" / "move-right" anywhere in the queue.
    const moveLeft = root.querySelector('[data-action="move-left"]');
    const moveRight = root.querySelector('[data-action="move-right"]');
    expect(moveLeft).toBeNull();
    expect(moveRight).toBeNull();
  });

  it("renders queue cards as draggable", () => {
    const { root } = mountMissionHud();
    gameStore.addCommand("move-right");

    const card = root.querySelector<HTMLElement>(".queue-card");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("draggable")).toBe("true");
  });
});

describe("compact queue chip — drag-and-drop reorder payload", () => {
  beforeEach(() => {
    gameStore.startAdventure();
    gameStore.openMission("tutorial-cove");
    gameStore.clearQueue();
  });

  it("dragstart on a queue card writes the reorder MIME with the instanceId", () => {
    const { root } = mountMissionHud();
    gameStore.addCommand("move-right");

    const card = root.querySelector<HTMLElement>(".queue-card");
    expect(card).not.toBeNull();
    const instanceId = card!.dataset.instanceId;
    expect(instanceId).toBeTruthy();

    // Build a minimal DataTransfer stand-in — JSDOM's `DataTransfer` is not
    // fully implemented, so we mimic the parts the handler actually touches:
    // `effectAllowed`, `setData`, `getData`, `types`.
    const setCalls: Array<[string, string]> = [];
    const store: Record<string, string> = {};
    const dt: Partial<DataTransfer> = {
      effectAllowed: "none",
      setData: (format: string, data: string) => {
        store[format] = data;
        setCalls.push([format, data]);
      },
      getData: (format: string) => store[format] ?? "",
      get types() {
        return Object.keys(store);
      },
    } as Partial<DataTransfer>;

    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dt });
    card!.dispatchEvent(event);

    // The handler must write BOTH the reorder MIME and a `text/plain` mirror
    // (the latter is required by some browsers).
    expect(store["application/x-soc-instance"]).toBe(instanceId);
    expect(store["text/plain"]).toBe(instanceId);
    expect(dt.effectAllowed).toBe("move");
  });

  it("dragstart on a palette card writes the template MIME (unchanged behavior)", () => {
    const { root } = mountMissionHud();

    const palette = root.querySelector<HTMLElement>(
      '.palette-card[data-template-id="move-right"]',
    );
    expect(palette).not.toBeNull();

    const store: Record<string, string> = {};
    const dt: Partial<DataTransfer> = {
      effectAllowed: "none",
      setData: (format: string, data: string) => {
        store[format] = data;
      },
      getData: (format: string) => store[format] ?? "",
      get types() {
        return Object.keys(store);
      },
    } as Partial<DataTransfer>;

    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dt });
    palette!.dispatchEvent(event);

    expect(store["application/x-soc-template"]).toBe("move-right");
    expect(store["text/plain"]).toBe("move-right");
    expect(dt.effectAllowed).toBe("copy");
  });
});

describe("command dock layout — no canvas overlap", () => {
  it("the .command-dock CSS rule does NOT use position: absolute", () => {
    // The whole point of the layout refactor: the dock used to be
    // `position: absolute; bottom: 1rem;` over the canvas. Now it sits in
    // its own grid row. JSDOM doesn't apply our stylesheet, so the assertion
    // reads the source CSS directly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    // Find the .command-dock rule block.
    const block = /\.command-dock\s*\{([^}]+)\}/s.exec(css);
    expect(block, "no .command-dock CSS rule found").not.toBeNull();

    const decl = block?.[1] ?? "";
    expect(decl).not.toMatch(/position:\s*absolute/);
    // It SHOULD be position: relative (or unset → static) — assert relative
    // so a future refactor that switches it back to absolute is loud.
    expect(decl).toMatch(/position:\s*relative/);
  });

  it("the app shell uses a grid layout that reserves space for the dock", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    const block = /\.app-shell\s*\{([^}]+)\}/s.exec(css);
    expect(block, "no .app-shell CSS rule found").not.toBeNull();

    const decl = block?.[1] ?? "";
    expect(decl).toMatch(/display:\s*grid/);
    // 1fr (playfield) + auto (dock) — the dock claims only what it needs.
    expect(decl).toMatch(/grid-template-rows:\s*1fr\s+auto/);
  });
});
