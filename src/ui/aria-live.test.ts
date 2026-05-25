// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAriaLiveRegion } from "./aria-live";

describe("createAriaLiveRegion (DOM)", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts a polite aria-live region inside the parent", () => {
    const aria = createAriaLiveRegion(root);
    expect(aria.element.parentNode).toBe(root);
    expect(aria.element.getAttribute("aria-live")).toBe("polite");
    expect(aria.element.getAttribute("aria-atomic")).toBe("true");
    expect(aria.element.getAttribute("role")).toBe("status");
    // Visually hidden, but accessible.
    const style = aria.element.getAttribute("style") ?? "";
    expect(style).toContain("position:absolute");
    expect(style).toContain("width:1px");
    expect(style).toContain("height:1px");
    expect(style).toContain("overflow:hidden");
    aria.destroy();
  });

  it("only mounts a single live region per call", () => {
    createAriaLiveRegion(root);
    expect(root.querySelectorAll('[data-aria-live="sea-of-codes"]').length).toBe(1);
  });

  it("writes the announced text into the region on the first call", () => {
    const aria = createAriaLiveRegion(root);
    aria.announce("The ship glides one tile forward.");
    expect(aria.element.textContent).toBe("The ship glides one tile forward.");
    aria.destroy();
  });

  it("ignores empty / whitespace strings", () => {
    const aria = createAriaLiveRegion(root);
    aria.announce("   ");
    expect(aria.element.textContent).toBe("");
    aria.destroy();
  });

  it("throttles rapid-fire announcements to the latest text", () => {
    vi.useFakeTimers();
    const aria = createAriaLiveRegion(root, { throttleMs: 80 });

    aria.announce("Step 1.");
    expect(aria.element.textContent).toBe("Step 1.");

    // Inside the throttle window — these get coalesced into one update.
    aria.announce("Step 2.");
    aria.announce("Step 3.");
    aria.announce("Step 4.");
    // Element should still show Step 1 — nothing flushed yet.
    expect(aria.element.textContent).toBe("Step 1.");

    vi.advanceTimersByTime(80);
    // The most recent pending text wins — Step 4.
    expect(aria.element.textContent).toBe("Step 4.");

    aria.destroy();
  });

  it("skips re-announcing identical text", () => {
    const aria = createAriaLiveRegion(root);
    aria.announce("Same message.");
    aria.flush();
    aria.announce("Same message.");
    aria.flush();
    // textContent is the same — but we want to confirm no thrash.
    expect(aria.element.textContent).toBe("Same message.");
    aria.destroy();
  });

  it("destroy() removes the element and stops pending updates", () => {
    vi.useFakeTimers();
    const aria = createAriaLiveRegion(root, { throttleMs: 50 });
    aria.announce("First.");
    aria.announce("Second."); // queued
    aria.destroy();
    expect(root.querySelector('[data-aria-live="sea-of-codes"]')).toBeNull();
    // No throw from advancing timers after destroy.
    vi.advanceTimersByTime(100);
  });

  it("simulates a playback tick stream and ends on the final step text", () => {
    vi.useFakeTimers();
    const aria = createAriaLiveRegion(root, { throttleMs: 80 });

    const steps = [
      "The ship glides one tile forward.",
      "The ship turns to starboard.",
      "Treasure collected!",
    ];

    aria.announce(steps[0]);
    expect(aria.element.textContent).toBe(steps[0]);

    aria.announce(steps[1]);
    aria.announce(steps[2]);
    vi.advanceTimersByTime(80);

    expect(aria.element.textContent).toBe(steps[2]);

    aria.destroy();
  });
});
