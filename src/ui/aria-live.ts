/**
 * Screen-reader narration for Sea of Codes.
 *
 * The Phaser canvas is opaque to assistive tech, so the playback's per-step
 * messages, mission-phase transitions, and reward announcements never make
 * it to a screen reader. This module mounts a visually-hidden
 * `<div aria-live="polite" aria-atomic="true">` somewhere in the app shell
 * and exposes a tiny throttled `announce(text)` so subscribers can pipe
 * state-change strings into it.
 *
 * The element stays mounted across screen swaps — it lives in the app shell,
 * not inside the screen-swapping HUD layer.
 */

const VISUALLY_HIDDEN_STYLE =
  "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);" +
  "white-space:nowrap;clip-path:inset(50%);margin:-1px;padding:0;border:0;";

const DEFAULT_THROTTLE_MS = 80;

export interface AriaLiveHandle {
  /** The mounted live-region element (exposed for tests / direct manipulation). */
  readonly element: HTMLElement;
  /**
   * Queue a string to be announced. Identical to the previous message is a
   * no-op (avoids re-announcing the same step on no-op re-renders). Updates
   * are throttled so rapid-fire ticks don't flood the SR queue.
   */
  announce: (text: string) => void;
  /** Force-flush any pending throttled update. Mostly useful for tests. */
  flush: () => void;
  /** Tear down — removes the element and clears any pending timer. */
  destroy: () => void;
}

interface CreateOptions {
  /** Override the throttle window (ms). Defaults to ~80ms. */
  throttleMs?: number;
  /** Inject a clock for tests — defaults to `setTimeout` / `clearTimeout`. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * Mount the live region inside `parent` and return a handle for announcing.
 *
 * Safe to call multiple times in test code, but the real app only mounts once
 * (in `main.ts`). The element is appended to `parent` with `aria-live=polite`
 * and `aria-atomic=true` so every update is read whole.
 */
export const createAriaLiveRegion = (
  parent: HTMLElement,
  options: CreateOptions = {},
): AriaLiveHandle => {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const schedule = options.setTimeoutFn ?? setTimeout;
  const cancel = options.clearTimeoutFn ?? clearTimeout;

  const element = parent.ownerDocument.createElement("div");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  element.setAttribute("role", "status");
  element.setAttribute("data-aria-live", "sea-of-codes");
  element.setAttribute("style", VISUALLY_HIDDEN_STYLE);
  parent.appendChild(element);

  let lastAnnounced = "";
  let pendingText: string | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  const writeNow = (text: string): void => {
    // SR engines often treat identical text as a no-op, but some announce it
    // twice — skip when nothing changed.
    if (text === lastAnnounced) {
      return;
    }
    lastAnnounced = text;
    // Clearing first nudges SRs that otherwise coalesce same-text updates.
    element.textContent = "";
    element.textContent = text;
  };

  const flush = (): void => {
    if (timerHandle !== null) {
      cancel(timerHandle);
      timerHandle = null;
    }
    if (pendingText !== null) {
      const text = pendingText;
      pendingText = null;
      writeNow(text);
    }
  };

  const announce = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    // First announcement: write immediately so the very first message is not
    // delayed behind the throttle window.
    if (timerHandle === null && pendingText === null) {
      writeNow(trimmed);
      // Open the throttle window so the *next* update gets coalesced.
      timerHandle = schedule(() => {
        timerHandle = null;
        if (pendingText !== null) {
          const next = pendingText;
          pendingText = null;
          writeNow(next);
        }
      }, throttleMs);
      return;
    }
    // Within the throttle window — overwrite any pending text. We only ever
    // want the *latest* state to be announced, not every intermediate tick.
    pendingText = trimmed;
  };

  const destroy = (): void => {
    if (timerHandle !== null) {
      cancel(timerHandle);
      timerHandle = null;
    }
    pendingText = null;
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  };

  return { element, announce, flush, destroy };
};
