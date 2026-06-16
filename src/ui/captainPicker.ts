/**
 * Pre-mount captain picker.
 *
 * Runs BEFORE the Phaser game / GameStore are imported so the active-captain
 * pointer is set in localStorage by the time anything reads it. Handles three
 * cases:
 *
 *   1. No profiles in storage → "Who's sailing today?" tap-a-pirate grid.
 *      One tap on a preset portrait creates a fresh profile and resolves —
 *      a pre-reader gets into the game without typing a single letter.
 *      A small "Type a name instead" disclosure keeps the typed form
 *      available for parents.
 *   2. Exactly one profile → silently resolves with that profile as active.
 *   3. 2+ profiles → "Pick your captain" picker with big buttons + "+ New".
 *
 * Pre-launch v2 migration also happens here (via `listProfiles` reading the
 * v2 blob through the captains layer) so the picker shows the migrated
 * "Captain" entry if the player is upgrading.
 */
import {
  MAX_CAPTAINS_SHOWN,
  MAX_NAME_LENGTH,
  createProfile,
  createProfileWithPreset,
  listProfiles,
  presetCaptains,
  setActiveProfile,
  validateCaptainName,
} from "../sim/captains";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const errorMessage = (
  error: "empty" | "too-long" | "invalid-chars" | "duplicate" | undefined,
): string => {
  switch (error) {
    case "empty":
      return "Pick a captain name to get started.";
    case "too-long":
      return `Names are ${MAX_NAME_LENGTH} letters or fewer.`;
    case "invalid-chars":
      return "Letters, numbers, and spaces only.";
    case "duplicate":
      return "A captain with that name already exists.";
    default:
      return "";
  }
};

/**
 * Default new-captain flow: a grid of big emoji-portrait buttons. One tap
 * creates the profile (duplicate names auto-suffix — see
 * `createProfileWithPreset`) and starts the game. No keyboard anywhere on
 * the kid path.
 */
const renderPresetGrid = (host: HTMLElement, onDone: () => void): void => {
  const presetButtons = presetCaptains
    .map(
      (preset) => `
        <button
          type="button"
          class="captain-pick captain-pick-preset"
          data-preset-name="${escapeHtml(preset.name)}"
        >
          <span class="captain-pick-icon" aria-hidden="true">${preset.icon}</span>
          <strong>${escapeHtml(preset.name)}</strong>
        </button>
      `,
    )
    .join("");

  host.innerHTML = `
    <section class="captain-overlay" role="dialog" aria-labelledby="captain-overlay-title">
      <div class="surface-card captain-card">
        <p class="eyebrow">Sea of Codes</p>
        <h1 id="captain-overlay-title">Who's sailing today?</h1>
        <p>Tap a pirate to begin!</p>
        <div class="captain-grid captain-preset-grid">
          ${presetButtons}
        </div>
        <button type="button" class="captain-type-toggle" data-captain-type-name>
          ✏️ Type a name instead
        </button>
      </div>
    </section>
  `;

  host
    .querySelectorAll<HTMLButtonElement>("[data-preset-name]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.presetName ?? "";
        if (!name) return;
        // Never fails — collisions auto-suffix and the new captain is active.
        createProfileWithPreset(name);
        onDone();
      });
    });

  const typeBtn = host.querySelector<HTMLButtonElement>(
    "[data-captain-type-name]",
  );
  typeBtn?.addEventListener("click", () => {
    renderTypedNameForm(host, onDone);
  });
};

/**
 * Parent path: the original typed-name form, reachable only through the
 * "Type a name instead" disclosure on the preset grid.
 */
const renderTypedNameForm = (host: HTMLElement, onDone: () => void): void => {
  host.innerHTML = `
    <section class="captain-overlay" role="dialog" aria-labelledby="captain-overlay-title">
      <div class="surface-card captain-card">
        <p class="eyebrow">Sea of Codes</p>
        <h1 id="captain-overlay-title">Welcome aboard!</h1>
        <p>What's your captain name?</p>
        <form class="captain-form" data-captain-form>
          <input
            type="text"
            name="captainName"
            maxlength="${MAX_NAME_LENGTH}"
            autocomplete="off"
            autocapitalize="words"
            spellcheck="false"
            aria-label="Captain name"
            placeholder="Captain Sparrow"
            class="captain-input"
            required
          />
          <p class="captain-error" data-captain-error aria-live="polite"></p>
          <button type="submit" class="primary-cta">⛵ Set sail</button>
        </form>
        <button type="button" class="captain-type-toggle" data-captain-back-to-presets>
          🏴‍☠️ Back to the pirates
        </button>
      </div>
    </section>
  `;

  const form = host.querySelector<HTMLFormElement>("[data-captain-form]")!;
  const input = form.querySelector<HTMLInputElement>("input[name=captainName]")!;
  const error = host.querySelector<HTMLElement>("[data-captain-error]")!;

  input.focus();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = createProfile(input.value);
    if (!result.ok) {
      error.textContent = errorMessage(result.error);
      input.focus();
      return;
    }
    error.textContent = "";
    onDone();
  });

  const backBtn = host.querySelector<HTMLButtonElement>(
    "[data-captain-back-to-presets]",
  );
  backBtn?.addEventListener("click", () => {
    renderPresetGrid(host, onDone);
  });
};

const renderPicker = (host: HTMLElement, onDone: () => void): void => {
  const records = listProfiles();
  const shown = records.slice(0, MAX_CAPTAINS_SHOWN);

  const captainButtons = shown
    .map(
      (record) => `
        <button
          type="button"
          class="captain-pick"
          data-captain-name="${escapeHtml(record.name)}"
        >
          <span class="captain-pick-icon" aria-hidden="true">🏴‍☠️</span>
          <strong>${escapeHtml(record.name)}</strong>
          <span class="captain-pick-meta">
            ${record.profile.completedMissionIds.length} voyages cleared
          </span>
        </button>
      `,
    )
    .join("");

  host.innerHTML = `
    <section class="captain-overlay" role="dialog" aria-labelledby="captain-overlay-title">
      <div class="surface-card captain-card">
        <p class="eyebrow">Sea of Codes</p>
        <h1 id="captain-overlay-title">Pick your captain</h1>
        <p>Choose who's sailing today.</p>
        <div class="captain-grid">
          ${captainButtons}
          <button type="button" class="captain-pick captain-pick-new" data-captain-new>
            <span class="captain-pick-icon" aria-hidden="true">＋</span>
            <strong>New captain</strong>
            <span class="captain-pick-meta">Start a fresh voyage</span>
          </button>
        </div>
      </div>
    </section>
  `;

  host.querySelectorAll<HTMLButtonElement>("[data-captain-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.captainName ?? "";
      if (!name) return;
      if (setActiveProfile(name)) {
        onDone();
      }
    });
  });

  const newBtn = host.querySelector<HTMLButtonElement>("[data-captain-new]");
  newBtn?.addEventListener("click", () => {
    renderPresetGrid(host, onDone);
  });
};

/**
 * Resolve the active captain. Renders the picker/welcome screen into `host`
 * when needed; resolves immediately when exactly one captain already exists.
 */
export const resolveActiveCaptain = (host: HTMLElement): Promise<void> => {
  const records = listProfiles();

  return new Promise((resolve) => {
    if (records.length === 1) {
      // Make sure the active pointer matches.
      setActiveProfile(records[0].name);
      resolve();
      return;
    }

    const done = (): void => {
      host.innerHTML = "";
      resolve();
    };

    if (records.length === 0) {
      renderPresetGrid(host, done);
    } else {
      renderPicker(host, done);
    }
  });
};

// Re-export for tests/other UI surfaces.
export { validateCaptainName };
