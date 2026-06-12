import {
  bountyRankFor,
  formatBountyFor,
  formatCurrency,
  getActiveTheme,
  orderedThemeIds,
  themes,
} from "../themes";
import type { Theme, ThemeId } from "../themes/types";
import {
  MAX_NAME_LENGTH,
  createProfile,
  createProfileWithPreset,
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  presetCaptains,
  validateCaptainName,
} from "../sim/captains";
import {
  commandLibrary,
  missionNodes,
  missions,
} from "../sim/content";
import { missionPortraits } from "../sim/portraits";
import { gameStore } from "../sim/store";
import type { AppState, HintResult, PlannedCommand, PlayerProfile } from "../sim/types";
import { playSfx, setMuted } from "./audio";
import { haptic } from "./haptic";
import { iconSvgMap, type IconKey } from "./icons";
import { reconcileKeys } from "./reconcile";
import { setSpeechMuted, speak } from "./speech";

const labelMap = {
  "move-up": "Up",
  "move-down": "Down",
  "move-left": "Left",
  "move-right": "Right",
  dodge: "Dodge",
  fire: "Fire",
  collect: "Collect",
  talk: "Talk",
  enemyAhead: "Foe Ahead",
  obstacleAhead: "Reef Ahead",
  treasureHere: "Treasure Here",
  crewHere: "Crew Here",
} as const;

/**
 * Visual icon set for the command-block library. Values are inline Twemoji
 * SVG markup (see `./icons/index.ts`), not Unicode emoji — so every device
 * (Mac, Windows, Android, ChromeOS) renders the *same* glyph instead of the
 * host OS's emoji font. Keep keys in sync with `IconKey` in `./icons`.
 */
const iconMap: Record<IconKey, string> = iconSvgMap;

/**
 * Tiny ink-style close glyph for the queue card's removal affordance. Used
 * to be a Unicode `✕` but that falls under `\p{Extended_Pictographic}` on
 * modern Unicode tables, so the host OS would render it with its emoji
 * font — defeating the whole reason we bundle Twemoji. Tiny inline SVG
 * keeps the queue card's chrome identical on every device.
 *
 * The ◀/▶ chevrons that used to live here were removed when the queue
 * gained drag-and-drop reordering — arrows confused early readers.
 */
const CLOSE_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>`;

const accentMap = {
  blue: "accent-blue",
  teal: "accent-teal",
  coral: "accent-coral",
  gold: "accent-gold",
  mint: "accent-mint",
  plum: "accent-plum",
  sunset: "accent-sunset",
  storm: "accent-storm",
} as const;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const iconFor = (key: keyof typeof iconMap): string => iconMap[key] ?? "";

const errorMessageFor = (
  error: "empty" | "too-long" | "invalid-chars" | "duplicate" | undefined,
): string => {
  switch (error) {
    case "empty":
      return "Pick a name to add this captain.";
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

// Helpers — resolve mission/sea/crew/fruit display strings against a theme.
const missionLabel = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.label ?? missionId;

const missionSea = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.sea ?? "";

const missionTutorial = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.tutorial ?? "";

const missionObjective = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.objective.primary ?? "";

/**
 * Render the *inner* markup of a queue card (the contents of the <article>
 * wrapper). The wrapper itself is created once per `instanceId` and kept
 * across renders — see `createQueueCardElement`.
 *
 * Reference-game inspired (Dragon Coding Games for Kids): chips are
 * icon-centered and ≤ 96px wide so 6–8 fit across a 720px viewport without
 * horizontal scroll. Reordering is via drag-and-drop on the card itself
 * (`draggable="true"` lives on the wrapper). Removal is a small `×` that
 * appears on hover / focus.
 */
const queueCardInnerMarkup = (command: PlannedCommand, isRunning: boolean): string => {
  const template = commandLibrary[command.templateId];
  const disabled = isRunning ? "disabled" : "";

  // Common: a small `×` removal affordance shown on hover/focus only.
  const removeBtn = `
    <button
      ${disabled}
      class="queue-remove"
      aria-label="Remove block"
      data-action="remove-command"
      data-instance-id="${command.instanceId}"
      title="Remove"
    >${CLOSE_SVG}</button>
  `;

  if (command.type === "loop") {
    const body = command.body ?? [];
    const repeatTemplate = commandLibrary.repeat;
    const maxBody = repeatTemplate?.bodyMaxLength ?? 2;
    const canAddBody = !isRunning && body.length < maxBody;

    const bodyChips = body.length
      ? body
          .map((inner) => {
            const innerAction = (inner.action ?? "move-right") as keyof typeof iconMap;
            return `
              <span class="loop-body-chip">
                <button ${disabled} aria-label="${escapeHtml(labelMap[innerAction as keyof typeof labelMap] ?? innerAction)}" data-action="cycle-loop-body" data-instance-id="${command.instanceId}" data-inner-id="${inner.instanceId}" class="chip-button chip-icon-only">${iconFor(innerAction)}</button>
                <button ${disabled} aria-label="Remove inner action" data-action="remove-loop-body" data-instance-id="${command.instanceId}" data-inner-id="${inner.instanceId}" class="chip-mini">${CLOSE_SVG}</button>
              </span>
            `;
          })
          .join("")
      : `
        <button ${disabled} aria-label="${escapeHtml(labelMap[(command.action ?? "move-right") as keyof typeof labelMap] ?? "Right")}" data-action="loop-action" data-instance-id="${command.instanceId}" class="chip-button chip-icon-only">${iconFor((command.action ?? "move-right") as keyof typeof iconMap)}</button>
      `;

    return `
      <div class="queue-main queue-loop">
        <span class="stamp-icon">${iconFor("repeat")}</span>
        <button ${disabled} data-action="loop-count" data-instance-id="${command.instanceId}" class="chip-badge" aria-label="Repeat count">×${command.count ?? 2}</button>
      </div>
      <div class="loop-body-row">
        ${bodyChips}
        <button ${canAddBody ? "" : "disabled"} data-action="add-loop-body" data-instance-id="${command.instanceId}" class="chip-button chip-add" aria-label="Add inner action">+</button>
      </div>
      ${removeBtn}
    `;
  }

  if (command.type === "condition") {
    const condition = (command.condition ?? "enemyAhead") as keyof typeof iconMap;
    const thenAction = (command.thenAction ?? "fire") as keyof typeof iconMap;
    const conditionLabel = labelMap[condition as keyof typeof labelMap] ?? condition;
    const thenLabel = labelMap[thenAction as keyof typeof labelMap] ?? thenAction;
    return `
      <div class="queue-main queue-condition">
        <span class="stamp-icon">${iconFor("if")}</span>
        <div class="cond-mini">
          <button ${disabled} aria-label="If ${escapeHtml(conditionLabel)}" data-action="open-if-condition-picker" data-instance-id="${command.instanceId}" class="chip-button chip-icon-only">${iconFor(condition)}</button>
          <span class="cond-arrow" aria-hidden="true">→</span>
          <button ${disabled} aria-label="Then ${escapeHtml(thenLabel)}" data-action="open-if-action-picker" data-instance-id="${command.instanceId}" class="chip-button chip-icon-only">${iconFor(thenAction)}</button>
        </div>
      </div>
      ${removeBtn}
    `;
  }

  const action = (command.action ?? template.defaultAction ?? "move-right") as keyof typeof iconMap;
  const actionLabel = labelMap[action as keyof typeof labelMap] ?? action;
  return `
    <div class="queue-main queue-action" aria-label="${escapeHtml(actionLabel)}">
      <span class="stamp-icon">${iconFor(action)}</span>
    </div>
    ${removeBtn}
  `;
};

/**
 * Fingerprint a command + global running state to a string. Two commands with the
 * same fingerprint render to identical inner markup, so we can skip rewriting
 * the card body when nothing the user can see has changed.
 */
const commandFingerprint = (command: PlannedCommand, isRunning: boolean): string =>
  [
    command.templateId,
    command.type,
    command.action ?? "",
    command.count ?? "",
    command.condition ?? "",
    command.thenAction ?? "",
    isRunning ? "r" : "p",
  ].join("|");

const wantedCrewCard = (theme: Theme, crewId: string): string => {
  const crew = theme.crew[crewId];
  if (!crew) return "";
  return `
    <li>
      <div class="wanted-card">
        <div class="wanted-header">Wanted</div>
        <p class="wanted-name">${escapeHtml(crew.name)}</p>
        <div class="wanted-role">${escapeHtml(crew.title)}</div>
        <p class="wanted-line">${escapeHtml(crew.description)}</p>
      </div>
    </li>
  `;
};

const wantedFruitCard = (theme: Theme, fruitId: string): string => {
  const fruit = theme.fruits[fruitId];
  if (!fruit) return "";
  return `
    <li>
      <div class="wanted-card">
        <div class="wanted-header">Devil Fruit</div>
        <p class="wanted-name">${escapeHtml(fruit.name)}</p>
        <div class="wanted-role">${escapeHtml(fruit.title)}</div>
        <p class="wanted-line">${escapeHtml(fruit.description)}</p>
      </div>
    </li>
  `;
};

interface CaptainsPanelState {
  /** True while the new-captain section (preset grid) is open in-drawer. */
  showNewInput: boolean;
  /** True when the parent expanded the typed-name disclosure inside it. */
  showTyped: boolean;
  /** Last-entered name (preserved across re-renders so an error message
   *  doesn't wipe the input). */
  newDraft: string;
  /** Validation error to show under the input. */
  newError: string;
}

const captainsPanelMarkup = (
  activeName: string | null,
  state: CaptainsPanelState,
): string => {
  const records = listProfiles();
  const rows = records
    .map((record) => {
      const active = activeName?.toLowerCase() === record.name.toLowerCase();
      const cleared = record.profile.completedMissionIds.length;
      return `
        <li class="captain-row${active ? " is-active" : ""}">
          <button
            type="button"
            data-action="switch-captain"
            data-captain-name="${escapeHtml(record.name)}"
            class="captain-row-main"
            ${active ? 'aria-current="true"' : ""}
          >
            <span class="captain-row-icon" aria-hidden="true">🏴‍☠️</span>
            <span class="captain-row-text">
              <strong>${escapeHtml(record.name)}</strong>
              <span class="captain-row-meta">${cleared} voyages cleared${active ? " · sailing" : ""}</span>
            </span>
          </button>
          <button
            type="button"
            data-action="delete-captain"
            data-captain-name="${escapeHtml(record.name)}"
            class="captain-row-delete"
            aria-label="Delete captain ${escapeHtml(record.name)}"
          >🗑️</button>
        </li>
      `;
    })
    .join("");

  // Default new-captain flow is the tap-a-pirate preset grid (no typing —
  // same path as the first-launch overlay). The typed form stays reachable
  // behind a small parent-facing disclosure.
  const presetGrid = `
    <div class="captain-grid captain-preset-grid">
      ${presetCaptains
        .map(
          (preset) => `
            <button
              type="button"
              class="captain-pick captain-pick-preset"
              data-action="add-preset-captain"
              data-preset-name="${escapeHtml(preset.name)}"
            >
              <span class="captain-pick-icon" aria-hidden="true">${preset.icon}</span>
              <strong>${escapeHtml(preset.name)}</strong>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  const typedForm = `
    <form class="captain-new-form" data-captain-new-form>
      <label class="captain-new-label" for="captain-new-input">New captain name</label>
      <input
        id="captain-new-input"
        type="text"
        name="captainName"
        maxlength="${MAX_NAME_LENGTH}"
        autocomplete="off"
        autocapitalize="words"
        spellcheck="false"
        class="captain-input"
        value="${escapeHtml(state.newDraft)}"
        required
      />
      ${state.newError ? `<p class="captain-error">${escapeHtml(state.newError)}</p>` : ""}
      <div class="captain-new-actions">
        <button type="submit" class="primary-cta">⛵ Add captain</button>
      </div>
    </form>
  `;

  const newCaptainSection = state.showNewInput
    ? `
        <p class="drawer-copy">Tap a pirate to start a new voyage.</p>
        ${presetGrid}
        ${
          state.showTyped
            ? typedForm
            : `
              <button type="button" class="captain-type-toggle" data-action="show-typed-captain">
                ✏️ Type a name instead
              </button>
            `
        }
        <button type="button" class="ghost-link" data-action="cancel-new-captain">Cancel</button>
      `
    : `
        <button type="button" class="drawer-toggle" data-action="show-new-captain">
          ＋ New captain
        </button>
      `;

  return `
    <h4 class="drawer-subhead">Captain</h4>
    <ul class="captain-list">${rows}</ul>
    ${newCaptainSection}
    <button type="button" class="drawer-toggle" data-action="reset-active-profile">
      🧹 Start over (this captain)
    </button>
    <p class="drawer-copy">Wipes only the active captain's progress. Other captains keep their voyages.</p>
  `;
};

const themePickerMarkup = (currentThemeId: ThemeId): string => {
  const options = orderedThemeIds
    .map((id) => {
      const theme = themes[id];
      const active = id === currentThemeId;
      return `
        <button
          data-action="set-theme"
          data-theme-id="${id}"
          class="drawer-toggle${active ? " is-active" : ""}"
          aria-pressed="${active}"
        >
          ${escapeHtml(theme.meta.label)}${active ? " ✓" : ""}
        </button>
        <p class="drawer-copy">${escapeHtml(theme.meta.description)}</p>
      `;
    })
    .join("");

  return `
    <h4 class="drawer-subhead">Theme</h4>
    ${options}
  `;
};

const drawerContent = (
  state: AppState,
  theme: Theme,
  captainsPanel: CaptainsPanelState,
  activeCaptainName: string | null,
): string => {
  switch (state.selectedDrawer) {
    case "crew": {
      const crewList = state.profile.crewRoster.length
        ? state.profile.crewRoster.map((id) => wantedCrewCard(theme, id)).join("")
        : `<li><div class="wanted-card"><p class="wanted-name">No crew yet</p><p class="wanted-line">Win voyages to invite shipmates aboard.</p></div></li>`;

      const fruitList = state.profile.fruitPowers.length
        ? state.profile.fruitPowers.map((id) => wantedFruitCard(theme, id)).join("")
        : `<li><div class="wanted-card"><p class="wanted-name">No Devil Fruits yet</p><p class="wanted-line">A lookout in the sky hides the first glowing fruit.</p></div></li>`;

      return `
        <section class="drawer-panel">
          <h3>Crew Log</h3>
          <ul class="drawer-list">${crewList}</ul>
          <h3>Devil Fruits</h3>
          <ul class="drawer-list">${fruitList}</ul>
        </section>
      `;
    }
    case "log": {
      const entries = state.profile.captainLog;
      const body = entries.length
        ? entries
            .slice()
            .reverse()
            .map(
              (entry) => `
                <li>
                  <div class="log-entry">
                    <div class="log-day">Day ${entry.day}</div>
                    <p class="log-line">${escapeHtml(entry.oneLine)}</p>
                  </div>
                </li>
              `,
            )
            .join("")
        : `<li><div class="log-entry"><div class="log-day">—</div><p class="log-line">No entries yet. Set sail to start your log.</p></div></li>`;
      return `
        <section class="drawer-panel">
          <h3>Captain's Log</h3>
          <ul class="drawer-list">${body}</ul>
        </section>
      `;
    }
    case "settings":
      return `
        <section class="drawer-panel">
          <h3>Settings</h3>
          <button data-action="toggle-reduced-motion" class="drawer-toggle">
            Reduced Motion: ${state.profile.settings.reducedMotion ? "On" : "Off"}
          </button>
          <p class="drawer-copy">Cuts cosmetic motion and speeds up the plan playback while keeping every gameplay beat readable.</p>
          <button data-action="toggle-muted" class="drawer-toggle">
            Sound: ${state.profile.settings.muted ? "Muted" : "On"}
          </button>
          <p class="drawer-copy">Silences whooshes, pops, and victory horns. Haptic taps stay on.</p>
          <button data-action="toggle-skip-prediction" class="drawer-toggle">
            Skip Prediction: ${state.profile.settings.skipPrediction ? "On" : "Off"}
          </button>
          <p class="drawer-copy">Predict-then-run asks you to guess where the ship will land before each voyage. Turn this on to hop straight into playback.</p>
          <button data-action="toggle-always-suggested" class="drawer-toggle">
            Always Pre-load Full Plan: ${state.profile.settings.alwaysShowSuggested ? "On" : "Off"}
          </button>
          <p class="drawer-copy">After the first try at a voyage the dock only shows the first stamp. Turn this on to always start from the full suggested plan.</p>
          ${captainsPanelMarkup(activeCaptainName, captainsPanel)}
          ${themePickerMarkup(state.profile.settings.themeId)}
        </section>
      `;
    case "map": {
      const routeList = missionNodes
        .map((node) => {
          const unlocked = state.profile.unlockedMissionIds.includes(node.missionId);
          const complete = state.profile.completedMissionIds.includes(node.missionId);
          const status = complete ? "✓ Cleared" : unlocked ? "Ready" : "🔒 Locked";
          return `
            <li>
              <button ${unlocked ? "" : "disabled"} data-action="select-mission" data-mission-id="${node.missionId}">
                ${escapeHtml(missionLabel(theme, node.missionId))} — ${status}
              </button>
            </li>
          `;
        })
        .join("");

      return `
        <section class="drawer-panel">
          <h3>Voyage Log</h3>
          <ul class="drawer-route-list">${routeList}</ul>
        </section>
      `;
    }
    default:
      return "";
  }
};

/**
 * Top-right stat cluster (map screen).
 *
 * Reference-game inspired (Dragon Coding Games for Kids): a single, prominent
 * coin chip is the headline number. A small star count sits to its left, and
 * the bounty appears as a sub-line under the coin chip so the player still
 * sees it without it competing for the eye. Replaces the three equal-weight
 * pills (berries / bounty / stars) that used to dominate the strip.
 *
 * Layout:
 *   ⭐ 12   [ 🪙 1,250 D ]
 *           Bounty: 5M D
 */
const statsInlineMarkup = (profile: PlayerProfile, theme: Theme): string => `
  <div class="stats-inline">
    <span class="stat-pill stat-pill-star" aria-label="Stars earned">
      <span class="stat-icon" aria-hidden="true">⭐</span>${profile.stars}
    </span>
    <span class="stat-cluster">
      <span class="stat-pill stat-pill-coin" aria-label="Berries">
        <span class="stat-icon" aria-hidden="true">🪙</span>${escapeHtml(formatCurrency(theme, profile.berries))}
      </span>
      <span class="stat-pill-sub" aria-label="Bounty">Bounty: ${escapeHtml(formatBountyFor(theme, profile.bounty))}</span>
    </span>
  </div>
`;

/**
 * Mission-screen status strip. Same consolidation idea as the map: one big
 * coin chip is the headline; bounty drops to a sub-line; crew + fruit counts
 * stay as compact pills next to it.
 */
const statusStripInnerMarkup = (profile: PlayerProfile, theme: Theme): string => `
  <span class="stat-cluster">
    <span class="stat-pill stat-pill-coin" aria-label="Berries">
      <span class="stat-icon" aria-hidden="true">🪙</span>${escapeHtml(formatCurrency(theme, profile.berries))}
    </span>
    <span class="stat-pill-sub" aria-label="Bounty">Bounty: ${escapeHtml(formatBountyFor(theme, profile.bounty))}</span>
  </span>
  <span class="stat-pill"><span class="stat-icon">🧑‍🎤</span>${profile.crewRoster.length}</span>
  <span class="stat-pill"><span class="stat-icon">🍎</span>${profile.fruitPowers.length}</span>
`;

const conditionOptions = [
  "enemyAhead",
  "obstacleAhead",
  "treasureHere",
  "crewHere",
] as const;
const conditionActionOptions = ["fire", "dodge", "collect", "talk"] as const;

const renderConditionPicker = (state: AppState): string => {
  const picker = state.openPicker;
  if (!picker) {
    return "";
  }

  const options: readonly string[] =
    picker.type === "ifCondition" ? conditionOptions : conditionActionOptions;

  const tiles = options
    .map((value) => {
      const label = labelMap[value as keyof typeof labelMap] ?? value;
      const icon = iconFor(value as keyof typeof iconMap);
      return `
        <button
          class="picker-tile"
          data-action="select-picker-option"
          data-value="${escapeHtml(value)}"
        >
          <span class="picker-icon">${icon}</span>
          <span class="picker-label">${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");

  const anchor = picker.anchor;
  // Anchor the popover near the tapped chip; clamp to a small inset so it
  // does not overflow the viewport. The backdrop swallows the outside taps.
  const top = Math.max(16, anchor.y + anchor.h + 8);
  const left = Math.max(16, anchor.x);

  return `
    <div class="picker-backdrop" data-action="close-picker">
      <div
        class="picker-popover surface-card"
        role="dialog"
        aria-label="${picker.type === "ifCondition" ? "Choose condition" : "Choose action"}"
        style="top:${top}px; left:${left}px;"
        data-action="picker-noop"
      >
        <div class="picker-grid">
          ${tiles}
        </div>
      </div>
    </div>
  `;
};

interface MissionScaffold {
  layer: HTMLElement;
  objective: HTMLElement;
  status: HTMLElement;
  rail: HTMLElement;
  hintHost: HTMLElement;
  dock: HTMLElement;
  dockHead: HTMLElement;
  queueRow: HTMLElement;
  queueList: HTMLElement;
  playButton: HTMLElement;
  palette: HTMLElement;
  drawerHost: HTMLElement;
  pickerHost: HTMLElement;
  predictHost: HTMLElement;
  // Fingerprints of last-rendered inputs per region.
  fingerprints: {
    objective: string;
    status: string;
    rail: string;
    hint: string;
    dockHead: string;
    playButton: string;
    palette: string;
    drawer: string;
    picker: string;
    predict: string;
    isRunning: boolean;
  };
  // Map of queued-command instanceId → rendered <article> + last fingerprint.
  queueNodes: Map<string, { node: HTMLElement; fingerprint: string }>;
  activeIndex: number;
  /** instanceId of the queue card currently flagged as the hint target, or null. */
  hintTargetInstanceId: string | null;
  /**
   * templateId of the PALETTE stamp flagged as the hint target — the
   * fallback when the needed block isn't in the queue at all (deleted /
   * never added). Mutually exclusive with `hintTargetInstanceId`.
   */
  hintPaletteTemplateId: string | null;
}

/**
 * Find the first queued command whose `templateId` matches `focusTemplateId`.
 * Walks top-level commands only — loop bodies aren't queue cards of their own.
 * Returns null if no match (or no focus id was set by the engine).
 */
export const findHintTargetInstanceId = (
  queuedCommands: PlannedCommand[],
  focusTemplateId: string | undefined,
): string | null => {
  if (!focusTemplateId) return null;
  for (const command of queuedCommands) {
    if (command.templateId === focusTemplateId) {
      return command.instanceId;
    }
  }
  return null;
};

export class Hud {
  /** Which screen the layer currently shows. `null` until first render. */
  private currentScreen: AppState["screen"] | null = null;

  /** Active per-screen layer element (replaced on screen change). */
  private currentLayer: HTMLElement | null = null;

  /** Mission-screen specific cache. Only present while on the mission screen. */
  private mission: MissionScaffold | null = null;

  /** Last AppState we rendered — needed to reposition the hint bubble on resize. */
  private lastState: AppState | null = null;

  /**
   * After a `gameStore.moveCommand` we want the moved card to keep focus —
   * otherwise hitting Arrow-Right repeatedly would lose its keyboard target
   * the first time the card re-renders. Set on keydown, consumed by the
   * next `reconcileQueueList` call.
   */
  private pendingFocusInstanceId: string | null = null;

  /** Transient state for the captains panel in the Settings drawer. */
  private captainsPanel: CaptainsPanelState = {
    showNewInput: false,
    showTyped: false,
    newDraft: "",
    newError: "",
  };

  /**
   * The command dock (queue + palette) lives in its own DOM region outside
   * the HUD overlay so the playfield grid can reserve fixed bottom space for
   * it. When the caller doesn't pass a dock host we fall back to mounting
   * the dock inside the HUD root — that keeps JSDOM tests working with the
   * single-argument constructor.
   */
  private dockRoot: HTMLElement;

  constructor(private root: HTMLElement, dockRoot?: HTMLElement) {
    this.dockRoot = dockRoot ?? root;
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeydown);
    this.root.addEventListener("submit", this.handleSubmit);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("dragstart", this.handleDragStart);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("dragleave", this.handleDragLeave);
    this.root.addEventListener("dragend", this.handleDragEnd);
    this.root.addEventListener("drop", this.handleDrop);
    if (this.dockRoot !== this.root) {
      this.dockRoot.addEventListener("click", this.handleClick);
      this.dockRoot.addEventListener("keydown", this.handleKeydown);
      this.dockRoot.addEventListener("dragstart", this.handleDragStart);
      this.dockRoot.addEventListener("dragover", this.handleDragOver);
      this.dockRoot.addEventListener("dragleave", this.handleDragLeave);
      this.dockRoot.addEventListener("dragend", this.handleDragEnd);
      this.dockRoot.addEventListener("drop", this.handleDrop);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleResize);
    }
    gameStore.subscribe((state) => {
      setMuted(state.profile.settings.muted);
      // One mute switch silences both sfx and voice narration.
      setSpeechMuted(state.profile.settings.muted);
      this.render(state);
    });
  }

  private handleResize = (): void => {
    if (this.lastState && this.mission) {
      this.positionHintBubble(this.lastState);
    }
  };

  /** Force a re-render of just the drawer body. Used after captains-panel
   *  transient state changes (showing/hiding new-input, error messages) so
   *  we don't need to round-trip through the store. */
  private rerenderDrawer(state: AppState): void {
    const theme = getActiveTheme(state.profile);
    const activeName =
      typeof window === "undefined" ? null : getActiveProfileName();

    // Map screen: re-render the whole layer (cheap).
    if (state.screen === "map") {
      this.renderMapInPlace(state);
      // Restore focus to the new-name input if it's visible — keeps typing
      // smooth after the markup rebuild.
      if (this.captainsPanel.showNewInput) {
        const input = this.root.querySelector<HTMLInputElement>(
          "#captain-new-input",
        );
        input?.focus();
        if (input && this.captainsPanel.newDraft) {
          const len = this.captainsPanel.newDraft.length;
          input.setSelectionRange(len, len);
        }
      }
      return;
    }

    // Mission screen: only the drawer body changes.
    if (this.mission && state.selectedDrawer) {
      this.mission.drawerHost.hidden = false;
      this.mission.drawerHost.innerHTML = drawerContent(
        state,
        theme,
        this.captainsPanel,
        activeName,
      );
      // Bust the cached fingerprint so the next state-driven render still
      // refreshes correctly when the player toggles another setting.
      this.mission.fingerprints.drawer = "";

      if (this.captainsPanel.showNewInput) {
        const input = this.root.querySelector<HTMLInputElement>(
          "#captain-new-input",
        );
        input?.focus();
        if (input && this.captainsPanel.newDraft) {
          const len = this.captainsPanel.newDraft.length;
          input.setSelectionRange(len, len);
        }
      }
    }
  }

  // ── DOM helpers ────────────────────────────────────────────

  private static makeElement(html: string): HTMLElement {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const first = template.content.firstElementChild;
    if (!(first instanceof HTMLElement)) {
      throw new Error(`Hud: expected an element from markup: ${html.slice(0, 64)}…`);
    }
    return first;
  }

  // ── Event handlers (unchanged) ─────────────────────────────

  private handleClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const missionId = button.dataset.missionId;
    const instanceId = button.dataset.instanceId;
    const templateId = button.dataset.templateId;
    const drawer = button.dataset.drawer as AppState["selectedDrawer"] | undefined;
    const themeId = button.dataset.themeId as ThemeId | undefined;

    switch (action) {
      case "start-adventure":
        gameStore.startAdventure();
        break;
      case "select-mission":
        if (missionId) {
          gameStore.selectMission(missionId);
        }
        break;
      case "open-selected-mission":
      case "open-mission":
        gameStore.openMission(missionId);
        break;
      case "leave-mission":
        gameStore.leaveMission();
        break;
      case "claim-reward":
        // The victory fanfare fires automatically on reward-screen entry
        // (see `mountScreen`) — the claim tap just needs a light confirm.
        playSfx("stamp-drop");
        haptic("tap");
        gameStore.claimReward();
        break;
      case "toggle-drawer":
        gameStore.toggleDrawer(drawer ?? null);
        break;
      case "toggle-reduced-motion":
        gameStore.toggleReducedMotion();
        break;
      case "toggle-muted":
        gameStore.toggleMuted();
        break;
      case "toggle-skip-prediction":
        gameStore.toggleSkipPrediction();
        break;
      case "toggle-always-suggested":
        gameStore.toggleAlwaysShowSuggested();
        break;
      case "confirm-prediction":
        gameStore.confirmPrediction();
        break;
      case "skip-prediction":
        // One-shot skip — runs the plan immediately WITHOUT flipping the
        // persisted skipPrediction setting (a kid taps this blindly; the
        // permanent opt-out lives only in the Settings drawer).
        haptic("tap");
        gameStore.skipPredictionOnce();
        break;
      case "set-theme":
        if (themeId) {
          gameStore.setTheme(themeId);
        }
        break;
      case "add-command":
        if (templateId) {
          playSfx("stamp-drop");
          haptic("tap");
          // Instant vocabulary for pre-readers: tap Fire → hear "Fire!".
          speak(`${commandLibrary[templateId]?.label ?? templateId}!`);
          gameStore.addCommand(templateId);
        }
        break;
      case "clear-queue":
        gameStore.clearQueue();
        break;
      case "reset-queue":
        gameStore.resetQueue();
        break;
      case "run-mission":
        playSfx("stamp-drop");
        haptic("confirm");
        gameStore.runActiveMission();
        break;
      case "remove-command":
        if (instanceId) {
          haptic("tap");
          gameStore.removeCommand(instanceId);
        }
        break;
      case "loop-count":
        if (instanceId) {
          haptic("tap");
          gameStore.cycleLoopCount(instanceId);
        }
        break;
      case "loop-action":
        if (instanceId) {
          haptic("tap");
          gameStore.cycleLoopAction(instanceId);
        }
        break;
      case "open-if-condition-picker":
        if (instanceId) {
          haptic("tap");
          const rect = button.getBoundingClientRect();
          gameStore.openPicker("ifCondition", instanceId, {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
          });
        }
        break;
      case "open-if-action-picker":
        if (instanceId) {
          haptic("tap");
          const rect = button.getBoundingClientRect();
          gameStore.openPicker("ifAction", instanceId, {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
          });
        }
        break;
      case "select-picker-option": {
        const value = button.dataset.value;
        if (value) {
          gameStore.selectPickerOption(value);
        }
        break;
      }
      case "close-picker":
        gameStore.closePicker();
        break;
      case "add-loop-body":
        if (instanceId) {
          gameStore.addLoopBodyAction(instanceId, "move-right");
        }
        break;
      case "remove-loop-body": {
        const innerId = button.dataset.innerId;
        if (instanceId && innerId) {
          gameStore.removeLoopBodyAction(instanceId, innerId);
        }
        break;
      }
      case "cycle-loop-body": {
        const innerId = button.dataset.innerId;
        if (instanceId && innerId) {
          gameStore.cycleLoopBodyAction(instanceId, innerId);
        }
        break;
      }
      case "switch-captain": {
        const name = button.dataset.captainName;
        if (name) {
          this.captainsPanel = {
            showNewInput: false,
            showTyped: false,
            newDraft: "",
            newError: "",
          };
          haptic("tap");
          gameStore.switchCaptain(name);
        }
        break;
      }
      case "add-preset-captain": {
        // Tap-a-pirate creation — never fails, never asks for input.
        const presetName = button.dataset.presetName;
        if (!presetName) break;
        haptic("tap");
        const record = createProfileWithPreset(presetName);
        this.captainsPanel = {
          showNewInput: false,
          showTyped: false,
          newDraft: "",
          newError: "",
        };
        // createProfileWithPreset already set the new captain active —
        // reload the store so map/title reflect the fresh profile.
        gameStore.switchCaptain(record.name);
        break;
      }
      case "show-typed-captain":
        this.captainsPanel = {
          ...this.captainsPanel,
          showNewInput: true,
          showTyped: true,
        };
        this.rerenderDrawer(gameStore.getState());
        break;
      case "delete-captain": {
        const name = button.dataset.captainName;
        if (!name) break;
        const ok =
          typeof window === "undefined"
            ? true
            : window.confirm(
                `Delete captain "${name}"? Their voyages will be gone for good.`,
              );
        if (!ok) break;
        const remaining = deleteProfile(name);
        const activeName = getActiveProfileName();
        // If we deleted the active captain, the captains layer already
        // promoted the next one in line; tell the store to reload.
        if (remaining.length === 0) {
          // No captains left — gameStore can't survive without a profile;
          // reload the page so the welcome-name flow runs again.
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          break;
        }
        this.captainsPanel = {
          showNewInput: false,
          showTyped: false,
          newDraft: "",
          newError: "",
        };
        if (activeName) {
          // Reload state (the deleted captain may have been the active one,
          // in which case the captains layer already promoted the next).
          gameStore.switchCaptain(activeName);
        }
        // Force-refresh the drawer body so the captain list reflects the
        // deletion even when the active captain didn't change.
        this.rerenderDrawer(gameStore.getState());
        break;
      }
      case "show-new-captain":
        this.captainsPanel = {
          showNewInput: true,
          showTyped: false,
          newDraft: "",
          newError: "",
        };
        this.rerenderDrawer(gameStore.getState());
        break;
      case "cancel-new-captain":
        this.captainsPanel = {
          showNewInput: false,
          showTyped: false,
          newDraft: "",
          newError: "",
        };
        this.rerenderDrawer(gameStore.getState());
        break;
      case "reset-active-profile": {
        const activeName = getActiveProfileName() ?? "this captain";
        const ok =
          typeof window === "undefined"
            ? true
            : window.confirm(
                `Start over for "${activeName}"? Their progress will be wiped, but other captains keep theirs.`,
              );
        if (!ok) break;
        gameStore.resetActiveProfile();
        break;
      }
    }
  };

  /**
   * Minimum-viable keyboard control. The game is touch-first by design, but
   * a kid on a sibling's laptop with no touchscreen still needs to be able
   * to play — that means at least:
   *
   *   • Tab cycles through palette stamps and queue cards (native, since the
   *     palette uses `<button>` and queue cards now carry `tabindex="0"`).
   *   • Enter / Space on a palette stamp drops it into the queue (Enter is
   *     native for buttons; Space is too. The store call lives in
   *     `handleClick`, which the browser also fires on keyboard activation
   *     of a button — so we don't double-handle it here.)
   *   • Arrow Left / Right on a focused queue card reorders that card.
   *   • Delete / Backspace on a focused queue card removes it.
   *   • Enter on the Run button (and any other `<button>`) triggers run —
   *     same native click synthesis as above.
   *
   * Focus rings are styled via `:focus-visible` in `styles.css` so they
   * appear only for keyboard-driven focus, not on touch / mouse press.
   */
  private handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Queue-card scoped keys — reorder + delete.
    const card = target.closest<HTMLElement>(".queue-card[data-instance-id]");
    if (card) {
      const instanceId = card.dataset.instanceId;
      // Only act when the *card itself* (not an inner button) is the focused
      // element. Otherwise arrow keys on inner buttons would steal focus.
      const cardIsFocused = document.activeElement === card;
      if (!instanceId || !cardIsFocused) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.pendingFocusInstanceId = instanceId;
        haptic("tap");
        gameStore.moveCommand(instanceId, -1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.pendingFocusInstanceId = instanceId;
        haptic("tap");
        gameStore.moveCommand(instanceId, 1);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        haptic("tap");
        gameStore.removeCommand(instanceId);
        return;
      }
    }
  };

  private handleSubmit = (event: Event): void => {
    const form = event.target as HTMLElement | null;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.hasAttribute("data-captain-new-form")) return;
    event.preventDefault();

    const input = form.querySelector<HTMLInputElement>(
      "input[name=captainName]",
    );
    const raw = input?.value ?? "";
    const existing = listProfiles().map((record) => record.name);
    const validation = validateCaptainName(raw, existing);
    if (!validation.ok) {
      this.captainsPanel = {
        showNewInput: true,
        showTyped: true,
        newDraft: raw,
        newError: errorMessageFor(validation.error),
      };
      this.rerenderDrawer(gameStore.getState());
      return;
    }

    const result = createProfile(validation.cleaned);
    if (!result.ok) {
      this.captainsPanel = {
        showNewInput: true,
        showTyped: true,
        newDraft: raw,
        newError: errorMessageFor(result.error),
      };
      this.rerenderDrawer(gameStore.getState());
      return;
    }

    this.captainsPanel = {
      showNewInput: false,
      showTyped: false,
      newDraft: "",
      newError: "",
    };
    // createProfile already set this new captain as active. Reload the
    // store so the title/map etc. show the fresh profile.
    gameStore.switchCaptain(validation.cleaned);
  };

  private handleInput = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (!target || target.id !== "captain-new-input") return;
    // Preserve typed text across drawer re-renders without re-rendering on
    // every keystroke (we only re-render on submit / show / cancel).
    this.captainsPanel.newDraft = target.value;
  };

  /**
   * Two drag sources, two MIME-ish payload keys:
   *   - `application/x-soc-template` — palette card → queue (existing).
   *   - `application/x-soc-instance` — queue card → queue reorder (new).
   *
   * `dataTransfer.types` is the safe channel for sniffing the payload
   * shape during dragover, so we can show a drop indicator without
   * actually being able to read `getData()` (browsers gate the value
   * until drop for security).
   *
   * We also write the same id to `text/plain` for backward-compat with
   * the original `handleDrop` and to satisfy browsers that require some
   * standard MIME be set.
   */
  private handleDragStart = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!event.dataTransfer) return;

    // Queue card source — reorder.
    const queueSource = target?.closest<HTMLElement>(
      ".queue-card[data-instance-id]",
    );
    if (queueSource) {
      const instanceId = queueSource.dataset.instanceId;
      if (!instanceId) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-soc-instance", instanceId);
      event.dataTransfer.setData("text/plain", instanceId);
      queueSource.classList.add("is-dragging");
      return;
    }

    // Palette card source — add.
    const paletteSource = target?.closest<HTMLElement>("[data-template-id]");
    const templateId = paletteSource?.dataset.templateId;
    if (!templateId) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-soc-template", templateId);
    event.dataTransfer.setData("text/plain", templateId);
  };

  /**
   * Highlight the drop slot between queue cards while a drag is over the
   * queue list. The indicator is a CSS pseudo on the card the cursor is
   * approaching from the left; we set `data-drop-side="before"` /
   * `"after"` on the hovered card so styles.css can render a vertical
   * line on the correct side.
   */
  private handleDragOver = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const zone = target?.closest<HTMLElement>("[data-dropzone='queue']");
    if (!zone) return;
    event.preventDefault();
    if (event.dataTransfer) {
      const isReorder = event.dataTransfer.types.includes(
        "application/x-soc-instance",
      );
      event.dataTransfer.dropEffect = isReorder ? "move" : "copy";
    }

    // Clear any previous slot markers in this zone.
    zone.querySelectorAll<HTMLElement>("[data-drop-side]").forEach((node) => {
      node.removeAttribute("data-drop-side");
    });

    // Find the card we're hovering and decide before-vs-after based on
    // cursor X relative to the card's horizontal midpoint.
    const card = target?.closest<HTMLElement>(
      ".queue-card[data-instance-id]",
    );
    if (card) {
      const rect = card.getBoundingClientRect();
      const side = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
      card.setAttribute("data-drop-side", side);
    } else {
      // Hovering an empty area — flag the zone so styles can hint an end-drop.
      zone.setAttribute("data-drop-side", "end");
    }
  };

  private handleDragLeave = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const zone = target?.closest<HTMLElement>("[data-dropzone='queue']");
    if (!zone) return;
    // If we've left the zone entirely (related target not inside it), clear.
    const related = event.relatedTarget as HTMLElement | null;
    if (related && zone.contains(related)) return;
    zone.querySelectorAll<HTMLElement>("[data-drop-side]").forEach((node) => {
      node.removeAttribute("data-drop-side");
    });
    zone.removeAttribute("data-drop-side");
  };

  private handleDragEnd = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const source = target?.closest<HTMLElement>(".queue-card.is-dragging");
    source?.classList.remove("is-dragging");
    // Clear any leftover drop indicators on every queue zone we know about.
    const roots = [this.root, this.dockRoot];
    for (const root of roots) {
      root.querySelectorAll<HTMLElement>("[data-drop-side]").forEach((node) => {
        node.removeAttribute("data-drop-side");
      });
    }
  };

  private handleDrop = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const zone = target?.closest<HTMLElement>("[data-dropzone='queue']");
    if (!zone || !event.dataTransfer) {
      return;
    }
    event.preventDefault();

    // Clean up drop indicators no matter which path we take.
    zone.querySelectorAll<HTMLElement>("[data-drop-side]").forEach((node) => {
      node.removeAttribute("data-drop-side");
    });
    zone.removeAttribute("data-drop-side");

    // 1. Reorder — drag from a queue card to a slot in the queue.
    const reorderInstanceId = event.dataTransfer.getData(
      "application/x-soc-instance",
    );
    if (reorderInstanceId) {
      const targetCard = target?.closest<HTMLElement>(
        ".queue-card[data-instance-id]",
      );
      const queue = gameStore.getState().queuedCommands;
      const sourceIndex = queue.findIndex(
        (c) => c.instanceId === reorderInstanceId,
      );
      if (sourceIndex === -1) return;

      let targetIndex: number;
      if (targetCard && targetCard.dataset.instanceId !== reorderInstanceId) {
        const overId = targetCard.dataset.instanceId ?? "";
        const overIndex = queue.findIndex((c) => c.instanceId === overId);
        if (overIndex === -1) return;
        const rect = targetCard.getBoundingClientRect();
        const after = event.clientX >= rect.left + rect.width / 2;
        // Compute desired index in the *post-removal* sequence.
        let desiredIndex = after ? overIndex + 1 : overIndex;
        if (sourceIndex < desiredIndex) desiredIndex -= 1;
        targetIndex = desiredIndex;
      } else if (!targetCard) {
        // Dropped onto empty zone area — go to end.
        targetIndex = queue.length - 1;
      } else {
        return; // dropped on self
      }

      if (targetIndex !== sourceIndex) {
        playSfx("stamp-drop");
        haptic("tap");
        gameStore.moveCommandToIndex(reorderInstanceId, targetIndex);
      }
      return;
    }

    // 2. Add from palette — original drag-from-palette flow.
    const templateId =
      event.dataTransfer.getData("application/x-soc-template") ||
      event.dataTransfer.getData("text/plain");
    if (templateId) {
      playSfx("stamp-drop");
      haptic("tap");
      gameStore.addCommand(templateId);
    }
  };

  // ── Top-level render ───────────────────────────────────────

  render(state: AppState): void {
    this.lastState = state;
    if (state.screen !== this.currentScreen) {
      this.mountScreen(state);
    }

    switch (state.screen) {
      case "title":
        // Title is static; nothing to update.
        break;
      case "map":
        this.renderMapInPlace(state);
        break;
      case "mission":
      case "sandbox":
        this.renderMissionInPlace(state);
        break;
      case "reward":
        // Reward overlay re-renders only when the reward mission id changes.
        this.renderRewardInPlace(state);
        break;
    }
  }

  private mountScreen(state: AppState): void {
    this.currentScreen = state.screen;
    this.mission = null;
    this.root.innerHTML = "";
    if (this.dockRoot !== this.root) {
      // The dock lives in its own grid row below the playfield; clear it on
      // screen swaps so non-mission screens collapse the row to zero height.
      this.dockRoot.innerHTML = "";
    }

    const theme = getActiveTheme(state.profile);
    const layer = document.createElement("div");
    layer.className = `hud-layer screen-${state.screen}`;
    this.currentLayer = layer;

    switch (state.screen) {
      case "title":
        layer.innerHTML = this.renderTitleMarkup(theme);
        break;
      case "map":
        layer.innerHTML = this.renderMapMarkup(state, theme);
        break;
      case "mission":
      case "sandbox":
        this.mountMissionScaffold(layer, state);
        break;
      case "reward":
        // Fire the fanfare on screen ENTRY — the kid hears the win the
        // moment it lands, not only if they later tap the claim button.
        // mountScreen runs once per screen change, so this never repeats
        // while the overlay sits open. Reduced motion trims the visual
        // celebration only; sound + haptics stay.
        playSfx("reward-claim");
        haptic("success");
        layer.innerHTML = this.renderRewardMarkup(state, theme);
        break;
    }

    this.root.appendChild(layer);
  }

  // ── Title ──────────────────────────────────────────────────

  private renderTitleMarkup(theme: Theme): string {
    return `
      <section class="title-overlay">
        <div class="poster-copy">
          <p class="eyebrow">An early-coding pirate voyage</p>
          <h1>${escapeHtml(theme.taglines.titleHeadline)}</h1>
          <p class="support-copy">${escapeHtml(theme.taglines.titleSupport)}</p>
          <button data-action="start-adventure" class="primary-cta">${escapeHtml(theme.taglines.setSailCta)}</button>
        </div>
      </section>
    `;
  }

  // ── Map ────────────────────────────────────────────────────

  private renderMapMarkup(state: AppState, theme: Theme): string {
    const missionId = state.selectedMissionId ?? state.profile.unlockedMissionIds[0];
    const node = missionNodes.find((entry) => entry.missionId === missionId);
    const rank = bountyRankFor(theme, state.profile.bounty);
    const activeName =
      typeof window === "undefined" ? null : getActiveProfileName();

    const drawerMarkup = state.selectedDrawer
      ? `<aside class="drawer-host">${drawerContent(state, theme, this.captainsPanel, activeName)}</aside>`
      : "";

    const captainPill = activeName
      ? `<span class="captain-pill" title="Active captain">🏴‍☠️ ${escapeHtml(activeName)}</span>`
      : "";

    return `
      <header class="top-strip">
        <div class="surface-card" style="padding:0.9rem 1.2rem;">
          <p class="eyebrow">Sea Chart</p>
          <h2 style="margin:0;font-family:var(--display-font);font-size:1.8rem;">Pick the next voyage</h2>
          <p style="margin:0.2rem 0 0;color:var(--ink-soft);font-size:0.9rem;">${escapeHtml(rank)}</p>
        </div>
        ${captainPill}
        ${statsInlineMarkup(state.profile, theme)}
      </header>

      <nav class="rail-actions">
        <button data-action="toggle-drawer" data-drawer="map">🗺️ Routes</button>
        <button data-action="toggle-drawer" data-drawer="crew">🧑‍🎤 Crew</button>
        <button data-action="toggle-drawer" data-drawer="log">📜 Log</button>
        <button data-action="toggle-drawer" data-drawer="settings">⚙️ Settings</button>
      </nav>

      <section class="map-docket surface-card">
        <p class="eyebrow">${escapeHtml(node ? missionSea(theme, node.missionId) : "")}</p>
        <h3>
          ${node ? `<span class="docket-portrait" aria-hidden="true">${missionPortraits[node.missionId] ?? ""}</span>` : ""}
          ${escapeHtml(node ? missionLabel(theme, node.missionId) : "")}
        </h3>
        <div class="map-reward-row">
          <span>💰 ${escapeHtml(formatCurrency(theme, node?.rewards.berries ?? 0))}</span>
          <span>🏴‍☠️ ${escapeHtml(formatBountyFor(theme, node?.rewards.bounty ?? 0))}</span>
          <span>⭐ ${node?.rewards.stars ?? 0}</span>
          ${node?.rewards.crewId ? `<span>🧑‍🎤 ${escapeHtml(theme.crew[node.rewards.crewId]?.name ?? "")}</span>` : ""}
          ${node?.rewards.fruitPowerId ? `<span>🍎 ${escapeHtml(theme.fruits[node.rewards.fruitPowerId]?.name ?? "")}</span>` : ""}
        </div>
        <button data-action="open-selected-mission" class="primary-cta">${
          missionId === "sandbox-isle"
            ? "🏝️ Free Play"
            : escapeHtml(theme.taglines.setSailCta)
        }</button>
      </section>
      ${drawerMarkup}
    `;
  }

  /**
   * Map screen is fast to rebuild and changes infrequently — we just refresh
   * the whole layer in place when something changes. The screen-level identity
   * check keeps us off the mission-screen tick storm.
   */
  private renderMapInPlace(state: AppState): void {
    if (!this.currentLayer) return;
    const theme = getActiveTheme(state.profile);
    this.currentLayer.innerHTML = this.renderMapMarkup(state, theme);
  }

  // ── Reward ─────────────────────────────────────────────────

  private renderRewardMarkup(state: AppState, theme: Theme): string {
    const reward = state.lastRun?.reward;
    const lastLog = state.profile.captainLog.at(-1);
    const prediction = state.lastPredictionCorrect;
    const rewardLabel = state.rewardMissionId
      ? missionLabel(theme, state.rewardMissionId)
      : "Voyage Clear";

    // Hide zero-value chips — a "+0" pill is pure noise to a pre-reader.
    const chips = [
      (reward?.berries ?? 0) > 0
        ? `<span class="stat-pill">💰 ${escapeHtml(formatCurrency(theme, reward?.berries ?? 0))}</span>`
        : "",
      (reward?.bounty ?? 0) > 0
        ? `<span class="stat-pill bounty" aria-label="Bounty">🏴‍☠️ +${escapeHtml(formatBountyFor(theme, reward?.bounty ?? 0))}</span>`
        : "",
      (reward?.stars ?? 0) > 0
        ? `<span class="stat-pill">⭐ +${reward?.stars ?? 0}</span>`
        : "",
    ].join("");

    return `
      <section class="reward-overlay">
        <div class="reward-copy">
          <p class="eyebrow">Treasure Recovered</p>
          <h2>${escapeHtml(rewardLabel)}</h2>
          ${
            prediction !== null
              ? `<p class="prediction-feedback">${
                  prediction
                    ? "⭐ You guessed it! The ship landed right where you predicted."
                    : "Close — try the next one!"
                }</p>`
              : ""
          }
          ${chips ? `<div class="reward-row">${chips}</div>` : ""}
          ${
            reward?.crewId
              ? `<ul class="drawer-list" style="margin:0;">${wantedCrewCard(theme, reward.crewId)}</ul>`
              : reward?.fruitPowerId
                ? `<ul class="drawer-list" style="margin:0;">${wantedFruitCard(theme, reward.fruitPowerId)}</ul>`
                : ""
          }
          ${
            lastLog
              ? `
                <div class="log-entry">
                  <div class="log-day">Day ${lastLog.day}</div>
                  <p class="log-line">${escapeHtml(lastLog.oneLine)}</p>
                </div>
              `
              : ""
          }
          <button data-action="claim-reward" class="primary-cta">🗺️ Back to Chart</button>
        </div>
        ${state.profile.settings.reducedMotion ? "" : rewardCelebrationMarkup()}
      </section>
    `;
  }

  private renderRewardInPlace(state: AppState): void {
    if (!this.currentLayer) return;
    const theme = getActiveTheme(state.profile);
    this.currentLayer.innerHTML = this.renderRewardMarkup(state, theme);
  }

  // ── Mission scaffold ───────────────────────────────────────

  private mountMissionScaffold(layer: HTMLElement, state: AppState): void {
    const mission = state.activeMissionId ? missions[state.activeMissionId] : null;
    if (!mission) {
      // No mission picked yet — just an empty layer; nothing to scaffold.
      return;
    }

    // Build empty regions; renderMissionInPlace fills them based on state.
    const objective = Hud.makeElement(`<header class="objective-chip surface-card"></header>`);
    // We render the status strip's contents into this wrapper rather than
    // replacing the wrapper itself — keeps the layer's child list stable.
    const status = Hud.makeElement(`<div class="status-strip"></div>`);
    const rail = Hud.makeElement(`<nav class="rail-actions mission-rail"></nav>`);
    const hintHost = Hud.makeElement(`<div class="hint-host"></div>`);
    const dock = Hud.makeElement(`<section class="command-dock surface-card"></section>`);
    const dockHead = Hud.makeElement(`<div class="dock-head"></div>`);
    // Queue row: the horizontal queue strip on the left, the hex Play button
    // anchored to the right. Both share the same row so the Play button stays
    // glued to the queue (Dragon Coding-inspired "go" affordance).
    const queueRow = Hud.makeElement(`<div class="queue-row"></div>`);
    const queueList = Hud.makeElement(`<div class="queue-list" data-dropzone="queue"></div>`);
    const playButton = Hud.makeElement(`<div class="play-host"></div>`);
    queueRow.appendChild(queueList);
    queueRow.appendChild(playButton);
    const palette = Hud.makeElement(`<div class="palette-grid"></div>`);
    const drawerHost = Hud.makeElement(`<aside class="drawer-host" hidden></aside>`);
    // Picker host stays in the DOM but only has content while a picker is open;
    // empty innerHTML when closed.
    const pickerHost = Hud.makeElement(`<div class="picker-host"></div>`);
    // Predict host shows the speech-bubble banner only while mission is in
    // the "predicting" phase.
    const predictHost = Hud.makeElement(`<div class="predict-host"></div>`);

    dock.appendChild(dockHead);
    dock.appendChild(queueRow);
    dock.appendChild(palette);

    layer.appendChild(objective);
    layer.appendChild(status);
    layer.appendChild(rail);
    layer.appendChild(hintHost);
    layer.appendChild(predictHost);
    // The dock mounts into its own grid row below the playfield so it never
    // overlaps the board. When no separate dock root was provided (tests),
    // it stays inside the overlay layer.
    const dockParent = this.dockRoot === this.root ? layer : this.dockRoot;
    dockParent.appendChild(dock);
    layer.appendChild(drawerHost);
    layer.appendChild(pickerHost);

    this.mission = {
      layer,
      objective,
      status,
      rail,
      hintHost,
      dock,
      dockHead,
      queueRow,
      queueList,
      playButton,
      palette,
      drawerHost,
      pickerHost,
      predictHost,
      fingerprints: {
        objective: "",
        status: "",
        rail: "",
        hint: "",
        dockHead: "",
        playButton: "",
        palette: "",
        drawer: "",
        picker: "",
        predict: "",
        isRunning: false,
      },
      queueNodes: new Map(),
      activeIndex: -1,
      hintTargetInstanceId: null,
      hintPaletteTemplateId: null,
    };
  }

  private renderMissionInPlace(state: AppState): void {
    const mission = state.activeMissionId ? missions[state.activeMissionId] : null;
    if (!mission || !this.mission) {
      return;
    }

    const m = this.mission;
    const theme = getActiveTheme(state.profile);
    const isRunning = state.missionPhase === "running";
    const isPredicting = state.missionPhase === "predicting";
    const locked = isRunning || isPredicting;
    const isSandbox = Boolean(mission.sandbox);

    // — Objective chip
    const themedLabel = missionLabel(theme, mission.id);
    const themedSea = missionSea(theme, mission.id);
    const themedObjective = missionObjective(theme, mission.id);
    const objFp = `${mission.id}|${theme.meta.id}|${themedLabel}|${themedSea}|${themedObjective}|${isSandbox ? "s" : "m"}`;
    if (objFp !== m.fingerprints.objective) {
      const eyebrowText = isSandbox
        ? `${escapeHtml(themedSea || "Open Ocean")} — Sandbox — play money`
        : escapeHtml(themedSea);
      m.objective.innerHTML = `
        <p class="eyebrow">${eyebrowText}</p>
        <h2>${escapeHtml(themedLabel)}</h2>
        <p>${escapeHtml(themedObjective)}</p>
      `;
      m.fingerprints.objective = objFp;
    }

    // — Status strip
    const profile = state.profile;
    const statusFp = `${theme.meta.id}|${profile.berries}|${profile.bounty}|${profile.crewRoster.length}|${profile.fruitPowers.length}`;
    if (statusFp !== m.fingerprints.status) {
      // Render the .stat-pill children straight into the wrapper.
      m.status.innerHTML = statusStripInnerMarkup(profile, theme);
      m.fingerprints.status = statusFp;
    }

    // — Rail (static per mission, no inputs change it)
    const railFp = `mission-rail`;
    if (railFp !== m.fingerprints.rail) {
      m.rail.innerHTML = `
        <button data-action="leave-mission">🗺️ Map</button>
        <button data-action="toggle-drawer" data-drawer="crew">🧑‍🎤 Crew</button>
        <button data-action="toggle-drawer" data-drawer="log">📜 Log</button>
        <button aria-label="Settings" data-action="toggle-drawer" data-drawer="settings">⚙️</button>
      `;
      m.fingerprints.rail = railFp;
    }

    // — Hint banner (toggle existence / refresh content only when hint changes).
    // Sandbox suppresses the hint banner — sandbox failures bounce silently.
    const hintFp = `${hintFingerprint(state.activeHint)}|${state.lastPredictionCorrect ?? "n"}|${isSandbox ? "s" : "m"}`;
    if (hintFp !== m.fingerprints.hint) {
      const feedback =
        state.lastPredictionCorrect !== null
          ? `<p class="prediction-feedback">${
              state.lastPredictionCorrect
                ? "⭐ You guessed where the ship would land!"
                : "Close — try the next one!"
            }</p>`
          : "";
      // The fix's block icon rides inside the bubble — a pre-reader can't
      // parse "add a Fire block", but they CAN match the pictured stamp.
      const focusId = state.activeHint?.focusTemplateId;
      const focusIcon =
        focusId && focusId in iconMap
          ? `<span class="hint-block-icon">${iconFor(focusId as keyof typeof iconMap)}</span>`
          : "";
      m.hintHost.innerHTML = state.activeHint && !isSandbox
        ? `
          <section class="hint-banner surface-card" data-hint-bubble>
            <p class="eyebrow">💬 Gentle Rewind</p>
            <strong>${focusIcon}${escapeHtml(state.activeHint.reason)}</strong>
            <p>${escapeHtml(state.activeHint.suggestion)}</p>
            ${feedback}
          </section>
        `
        : "";
      m.fingerprints.hint = hintFp;
    }

    // — Predict banner (mounted only while predicting)
    const predictFp = isPredicting
      ? `predict|${state.predictedEndPosition ? `${state.predictedEndPosition.x},${state.predictedEndPosition.y}` : "none"}`
      : "";
    if (predictFp !== m.fingerprints.predict) {
      m.predictHost.innerHTML = isPredicting
        ? `
          <section class="predict-banner surface-card">
            <p class="eyebrow">🔮 Predict First</p>
            <strong>Where will the ship end up?</strong>
            <p>Tap a tile on the map to drop your guess, then run the plan.</p>
            <div class="predict-actions">
              <button
                data-action="confirm-prediction"
                class="primary-cta"
                ${state.predictedEndPosition ? "" : "disabled"}
              >▶ Run plan!</button>
              <button data-action="skip-prediction" class="predict-skip">
                <span class="dock-action-icon" aria-hidden="true">⏭️</span>Skip
              </button>
            </div>
          </section>
        `
        : "";
      m.fingerprints.predict = predictFp;
    }

    // — Dock head (depends on phase + mission tutorial only)
    const themedTutorial = missionTutorial(theme, mission.id);
    const phaseChar = isRunning ? "r" : isPredicting ? "x" : "p";
    const dockHeadFp = `${theme.meta.id}|${phaseChar}|${themedTutorial}`;
    if (dockHeadFp !== m.fingerprints.dockHead) {
      const h3Text = isRunning
        ? "Captain's plan is sailing"
        : isPredicting
          ? "Predict before you sail"
          : "Build the route";
      m.dockHead.innerHTML = `
        <div>
          <p class="eyebrow">Command Queue</p>
          <h3>${h3Text}</h3>
          <p>${escapeHtml(themedTutorial)}</p>
        </div>
        <div class="dock-actions">
          <button ${locked ? "disabled" : ""} data-action="clear-queue"><span class="dock-action-icon" aria-hidden="true">🧹</span>Clear</button>
          <button ${locked ? "disabled" : ""} data-action="reset-queue"><span class="dock-action-icon" aria-hidden="true">⚓</span>Reset</button>
        </div>
      `;
      m.fingerprints.dockHead = dockHeadFp;
    }

    // — Hex Play button (right of the queue list)
    // Disabled while running / predicting. Pulses gently when the queue has
    // commands ready to run. Keyboard-accessible: it's a real <button> so Enter
    // / Space synthesizes the click that routes through `handleClick`.
    const hasQueue = state.queuedCommands.length > 0;
    const canRun = !locked && hasQueue;
    const playFp = `${locked ? "l" : "u"}|${hasQueue ? "q" : "e"}`;
    if (playFp !== m.fingerprints.playButton) {
      m.playButton.innerHTML = renderHexPlayButton(canRun, locked);
      m.fingerprints.playButton = playFp;
    }

    // — Palette grid (depends on mission palette + locked + rebuild nudge)
    // When the queue is EMPTY during planning, the stamp matching the
    // suggested plan's first block pulses gently — the rebuild path must be
    // self-evident to a pre-reader who just cleared their plan. Gated off
    // under the profile's reduced-motion setting (the CSS media query
    // handles the OS-level preference).
    const nextUpTemplateId =
      !locked &&
      state.queuedCommands.length === 0 &&
      !state.profile.settings.reducedMotion
        ? (mission.suggestedQueue[0]?.templateId ?? null)
        : null;
    const paletteFp = `${mission.id}|${locked ? "l" : "u"}|${nextUpTemplateId ?? "-"}`;
    if (paletteFp !== m.fingerprints.palette) {
      m.palette.innerHTML = mission.palette
        .map((templateId) => {
          const template = commandLibrary[templateId];
          const icon = iconFor(templateId as keyof typeof iconMap);
          const nextUp = templateId === nextUpTemplateId ? " is-next-up" : "";
          // Icon-first stamp: the description sentence is aria-only so the
          // glyph can fill the card (pre-readers never read the sentence).
          return `
            <button
              ${locked ? "disabled" : ""}
              class="palette-card ${accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue"}${nextUp}"
              data-action="add-command"
              data-template-id="${templateId}"
              draggable="true"
              aria-label="${escapeHtml(template.label)} — ${escapeHtml(template.description)}"
            >
              <span class="stamp-icon">${icon}</span>
              <strong>${escapeHtml(template.label)}</strong>
            </button>
          `;
        })
        .join("");
      m.fingerprints.palette = paletteFp;
    }

    // — Queue list (keyed reconcile + active class) — the whole point of this PR.
    this.reconcileQueueList(state, locked);

    // — Hint target: flag the failing queue card so the speech bubble can
    // anchor a dotted tail at it, and so the card itself gets a subtle glow.
    // Sandbox missions never show a hint, so they never get a hint target.
    this.applyHintTarget(state, isSandbox);
    this.positionHintBubble(state);

    // — Drawer host
    const activeName =
      typeof window === "undefined" ? null : getActiveProfileName();
    const drawerFp = `${theme.meta.id}|${drawerFingerprint(state)}|${activeName ?? ""}`;
    if (drawerFp !== m.fingerprints.drawer) {
      if (state.selectedDrawer) {
        m.drawerHost.hidden = false;
        m.drawerHost.innerHTML = drawerContent(
          state,
          theme,
          this.captainsPanel,
          activeName,
        );
      } else {
        m.drawerHost.hidden = true;
        m.drawerHost.innerHTML = "";
      }
      m.fingerprints.drawer = drawerFp;
    }

    // — 2×2 condition/action picker (open/closed)
    const pickerFp = state.openPicker
      ? `${state.openPicker.type}|${state.openPicker.instanceId}|${state.openPicker.anchor.x},${state.openPicker.anchor.y}`
      : "";
    if (pickerFp !== m.fingerprints.picker) {
      m.pickerHost.innerHTML = state.openPicker ? renderConditionPicker(state) : "";
      m.fingerprints.picker = pickerFp;
    }
  }

  /**
   * Keyed reconcile of the queue list.
   *
   * Three responsibilities, in order:
   *   1. If the queue is empty, show the empty-state placeholder.
   *   2. Otherwise, walk `state.queuedCommands`, reusing existing <article>
   *      elements by `instanceId`. New commands are mounted; gone commands
   *      are unmounted. Surviving elements keep their identity (and their
   *      contained scroll position, focus, etc.).
   *   3. Apply the `is-active` class to the card matching `state.playbackIndex`,
   *      and remove it from the previously-active card. No full re-render
   *      on playback ticks — that's the whole bug we're fixing.
   */
  private reconcileQueueList(state: AppState, isRunning: boolean): void {
    const m = this.mission;
    if (!m) return;
    const list = m.queueList;
    const commands = state.queuedCommands;

    // Empty state — placeholder DIV is allowed to be torn down each time it
    // toggles; it has no preserved state worth keeping.
    if (commands.length === 0) {
      m.queueNodes.clear();
      m.activeIndex = -1;
      list.innerHTML = '<div class="empty-queue">Tap stamps below to build a sailing plan.</div>';
      // Bump running flag so transitioning back to non-empty re-creates cards
      // with the right disabled state.
      m.fingerprints.isRunning = isRunning;
      return;
    }

    // If isRunning toggled, all card bodies need to re-render (their buttons
    // change disabled state). We invalidate every fingerprint so the per-card
    // step below picks the change up.
    if (m.fingerprints.isRunning !== isRunning) {
      m.queueNodes.forEach((entry) => {
        entry.fingerprint = "";
      });
      m.fingerprints.isRunning = isRunning;
    }

    // If the placeholder DIV is currently in the list, clear it before we
    // start placing real cards.
    const placeholder = list.querySelector(".empty-queue");
    if (placeholder) {
      list.innerHTML = "";
    }

    // Desired ordering of instance IDs.
    const desiredKeys = commands.map((c) => c.instanceId);
    const currentKeys: string[] = [];
    for (const child of Array.from(list.children)) {
      const key = (child as HTMLElement).dataset?.instanceId;
      if (key) currentKeys.push(key);
    }

    // Compute ops and apply.
    const ops = reconcileKeys(currentKeys, desiredKeys);
    for (const op of ops) {
      if (op.type === "remove") {
        const entry = m.queueNodes.get(op.key);
        if (entry?.node.parentNode === list) {
          list.removeChild(entry.node);
        }
        m.queueNodes.delete(op.key);
      } else {
        const command = commands.find((c) => c.instanceId === op.key);
        if (!command) continue;
        let entry = m.queueNodes.get(op.key);
        let isNewlyCreated = false;
        if (!entry) {
          const node = createQueueCardElement(command, isRunning);
          entry = { node, fingerprint: commandFingerprint(command, isRunning) };
          m.queueNodes.set(op.key, entry);
          isNewlyCreated = true;
        }
        const before = op.beforeKey
          ? (m.queueNodes.get(op.beforeKey)?.node ?? null)
          : null;
        list.insertBefore(entry.node, before);
        if (isNewlyCreated) {
          // Trigger the drop-in animation. Drop the class once the animation
          // finishes (or after a fallback timeout) so it can re-fire if the
          // same instance is ever re-inserted (which today never happens —
          // instance IDs are stable — but we want to be safe).
          const node = entry.node;
          node.classList.add("is-just-dropped");
          const clear = () => {
            node.classList.remove("is-just-dropped");
            node.removeEventListener("animationend", clear);
          };
          node.addEventListener("animationend", clear);
          window.setTimeout(clear, 400);
        }
      }
    }

    // Now every desired card is mounted in order. Update body markup for any
    // card whose fingerprint changed (e.g. loop count cycled).
    for (const command of commands) {
      const entry = m.queueNodes.get(command.instanceId);
      if (!entry) continue;
      const fp = commandFingerprint(command, isRunning);
      if (fp !== entry.fingerprint) {
        entry.node.innerHTML = queueCardInnerMarkup(command, isRunning);
        entry.fingerprint = fp;
      }
      // Drag-to-reorder is gated by playback state — a 5yo dragging a card
      // mid-run would be very confusing.
      const article = entry.node as HTMLElement;
      if (article.draggable !== !isRunning) {
        article.draggable = !isRunning;
      }
    }

    // Active class — surgical toggle, never rebuilds.
    const nextActive = isRunning ? Math.min(state.playbackIndex, commands.length - 1) : -1;
    if (nextActive !== m.activeIndex) {
      if (m.activeIndex >= 0 && m.activeIndex < commands.length) {
        const prevKey = commands[m.activeIndex]?.instanceId;
        if (prevKey) {
          const prevNode = m.queueNodes.get(prevKey)?.node;
          prevNode?.classList.remove("is-active");
          prevNode?.classList.remove("is-warning");
        }
      }
      if (nextActive >= 0) {
        const key = commands[nextActive]?.instanceId;
        if (key) {
          m.queueNodes.get(key)?.node.classList.add("is-active");
        }
      }
      m.activeIndex = nextActive;
    } else if (nextActive >= 0) {
      // Same index but element identity may have changed (queue rebuild). Ensure
      // the active class is on the right node.
      const key = commands[nextActive]?.instanceId;
      if (key) {
        m.queueNodes.get(key)?.node.classList.add("is-active");
      }
    }

    // Warning beat — toggle a yellow tint on the active card so the player
    // sees that the move just played did nothing. Tied to the *currently
    // playing* RunStep status, not the command itself.
    if (nextActive >= 0) {
      const key = commands[nextActive]?.instanceId;
      const node = key ? m.queueNodes.get(key)?.node : undefined;
      if (node) {
        const currentStep = state.lastRun?.steps[state.playbackIndex];
        if (currentStep?.status === "warning") {
          node.classList.add("is-warning");
        } else {
          node.classList.remove("is-warning");
        }
      }
    }

    // Restore focus to a card that was reordered via keyboard. Because we
    // preserve `<article>` identity per `instanceId`, the same DOM node still
    // exists — we just need to re-focus it after the browser may have moved
    // focus during the reorder. Skip when nothing's pending so we don't fight
    // user focus on every render.
    if (this.pendingFocusInstanceId) {
      const entry = m.queueNodes.get(this.pendingFocusInstanceId);
      if (entry && document.activeElement !== entry.node) {
        entry.node.focus();
      }
      this.pendingFocusInstanceId = null;
    }
  }

  /**
   * Apply / clear the `.is-hint-target` highlight on the queue card whose
   * `templateId` matches `activeHint.focusTemplateId`. Cheap to call every
   * render — bails out when the target hasn't changed.
   *
   * Also scrolls the focused card into horizontal view so the player can see
   * which block the rewind is asking them to fix.
   */
  private applyHintTarget(state: AppState, isSandbox: boolean): void {
    const m = this.mission;
    if (!m) return;

    const focusTemplateId =
      state.activeHint && !isSandbox ? state.activeHint.focusTemplateId : undefined;
    const nextTargetId = findHintTargetInstanceId(state.queuedCommands, focusTemplateId);
    // Fallback: the hint names a block that isn't in the queue at all (the
    // common "you deleted / never added the needed block" case). Glow the
    // PALETTE stamp instead so the bubble can point at where the fix lives.
    const nextPaletteId = !nextTargetId && focusTemplateId ? focusTemplateId : null;
    this.applyPaletteHintTarget(nextPaletteId);

    if (nextTargetId === m.hintTargetInstanceId) {
      // Same target — but the node may have been rebuilt (e.g. queue reordered).
      // Re-apply the class to be safe; it's idempotent.
      if (nextTargetId) {
        m.queueNodes.get(nextTargetId)?.node.classList.add("is-hint-target");
      }
      return;
    }

    // Drop the highlight from the previous target.
    if (m.hintTargetInstanceId) {
      m.queueNodes.get(m.hintTargetInstanceId)?.node.classList.remove("is-hint-target");
    }
    m.hintTargetInstanceId = nextTargetId;

    if (nextTargetId) {
      const targetNode = m.queueNodes.get(nextTargetId)?.node;
      if (targetNode) {
        targetNode.classList.add("is-hint-target");
        // Reduced-motion: jump instead of smooth-scroll, per DESIGN.md §4.4.
        const reduced = state.profile.settings.reducedMotion;
        try {
          targetNode.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "nearest",
            inline: "center",
          });
        } catch {
          // JSDOM and some older browsers throw on options — fall back silently.
        }
      }
    }
  }

  /** Find the palette stamp for a templateId (scoped to the mission palette). */
  private paletteButtonFor(templateId: string | null): HTMLElement | null {
    if (!templateId || !this.mission) return null;
    return this.mission.palette.querySelector<HTMLElement>(
      `[data-template-id="${templateId}"]`,
    );
  }

  /**
   * Apply / clear the `.is-hint-target` glow on a palette stamp. Re-applied
   * every render (idempotent) because the palette region rebuilds its
   * innerHTML whenever its fingerprint changes, wiping classes.
   */
  private applyPaletteHintTarget(nextPaletteId: string | null): void {
    const m = this.mission;
    if (!m) return;

    if (nextPaletteId !== m.hintPaletteTemplateId) {
      this.paletteButtonFor(m.hintPaletteTemplateId)?.classList.remove(
        "is-hint-target",
      );
      m.hintPaletteTemplateId = nextPaletteId;
    }
    this.paletteButtonFor(nextPaletteId)?.classList.add("is-hint-target");
  }

  /**
   * Position the hint bubble above the targeted queue card with a dotted
   * tail pointing down at it. When the needed block is MISSING from the
   * queue, the anchor falls back to the matching palette stamp instead —
   * the bubble then points at the thing the player should tap. Static
   * anchor only when neither exists (or no bubble in the DOM).
   *
   * Called both on render and on window resize so the bubble stays glued
   * to the card as the layout changes.
   */
  private positionHintBubble(state: AppState): void {
    const m = this.mission;
    if (!m) return;

    const bubble = m.hintHost.querySelector<HTMLElement>("[data-hint-bubble]");
    if (!bubble) return;

    const targetId = m.hintTargetInstanceId;
    const targetNode =
      (targetId ? m.queueNodes.get(targetId)?.node : null) ??
      this.paletteButtonFor(m.hintPaletteTemplateId);

    if (!targetNode) {
      // Fall back to static-anchor mode — clear any inline overrides and the
      // tail-offset variable so CSS defaults take over.
      bubble.classList.remove("is-anchored");
      bubble.style.removeProperty("left");
      bubble.style.removeProperty("top");
      bubble.style.removeProperty("--hint-tail-offset");
      void state; // explicit no-op — accepted for API symmetry / future use.
      return;
    }

    const cardRect = targetNode.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();

    // Center the bubble horizontally on the card, clamped 8px from each edge.
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1024;
    const cardCenterX = cardRect.left + cardRect.width / 2;
    const bubbleWidth = bubbleRect.width || 320;
    let left = cardCenterX - bubbleWidth / 2;
    left = Math.max(8, Math.min(left, viewportWidth - bubbleWidth - 8));

    // Sit above the card, with a small gap for the tail.
    const tailGap = 18;
    const bubbleHeight = bubbleRect.height || 140;
    const top = Math.max(8, cardRect.top - bubbleHeight - tailGap);

    bubble.classList.add("is-anchored");
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;

    // Position the dotted tail under the bubble so it points at the card.
    const tailOffset = Math.max(16, Math.min(cardCenterX - left, bubbleWidth - 24));
    bubble.style.setProperty("--hint-tail-offset", `${Math.round(tailOffset)}px`);
  }
}

/**
 * Big hex "Play" button anchored to the right of the queue strip. Inspired by
 * Dragon Coding Games for Kids — the hex shape reads as a "go" affordance
 * for early readers far better than a text button. The button is ~88px tall
 * (well above the 64px touch-target floor) with a sunset-yellow fill, ink
 * border, and a centered white play triangle.
 *
 * Behavior toggles:
 *   - `canRun` true  → active, gentle pulse glow so the eye is drawn to it.
 *   - `canRun` false + `locked` → disabled (running / predicting).
 *   - `canRun` false + `!locked` → idle (no commands in the queue yet).
 *
 * Real native <button> so Enter / Space keyboard activation works for free,
 * routed through the existing `data-action="run-mission"` click handler.
 */
const renderHexPlayButton = (canRun: boolean, locked: boolean): string => {
  const disabled = !canRun;
  const stateClass = canRun ? "is-ready" : locked ? "is-locked" : "is-idle";
  return `
    <button
      type="button"
      class="hex-play ${stateClass}"
      data-action="run-mission"
      aria-label="Run plan"
      title="Run plan"
      ${disabled ? "disabled" : ""}
    >
      <svg class="hex-play-svg" viewBox="0 0 100 110" aria-hidden="true" focusable="false">
        <polygon
          class="hex-play-shape"
          points="50,4 94,30 94,80 50,106 6,80 6,30"
        />
        <polygon
          class="hex-play-triangle"
          points="40,32 76,55 40,78"
        />
      </svg>
    </button>
  `;
};

/**
 * Celebration layer for the reward overlay: a burst of star/coin sprites
 * raining over the card with staggered delays (whole show ≤ ~1.5s). The
 * positions/delays are derived from the sprite index (golden-angle spread),
 * not Math.random — re-renders of the overlay don't reshuffle the burst,
 * and jsdom tests see stable markup. Callers skip this entirely under
 * reduced motion (sounds are kept; this layer is purely cosmetic).
 */
const CELEBRATION_SPRITES = ["⭐", "🪙", "✨", "🎉"] as const;
const CELEBRATION_COUNT = 24;

const rewardCelebrationMarkup = (): string => {
  const sprites = Array.from({ length: CELEBRATION_COUNT }, (_, i) => {
    const left = Math.round((i * 137.5) % 100);
    const delayMs = (i * 61) % 700;
    const emoji = CELEBRATION_SPRITES[i % CELEBRATION_SPRITES.length];
    return `<span class="celebration-sprite" style="left:${left}%;animation-delay:${delayMs}ms;">${emoji}</span>`;
  }).join("");
  return `<div class="reward-celebration" aria-hidden="true">${sprites}</div>`;
};

const hintFingerprint = (hint: HintResult | null): string =>
  hint ? `${hint.reason}|${hint.suggestion}|${hint.focusTemplateId ?? ""}` : "";

const drawerFingerprint = (state: AppState): string => {
  if (!state.selectedDrawer) return "none";
  const profile = state.profile;
  return [
    state.selectedDrawer,
    profile.crewRoster.join(","),
    profile.fruitPowers.join(","),
    profile.captainLog.length,
    profile.captainLog.at(-1)?.oneLine ?? "",
    profile.settings.reducedMotion ? "rm-on" : "rm-off",
    profile.unlockedMissionIds.join(","),
    profile.completedMissionIds.join(","),
  ].join("|");
};

/**
 * Create the <article> wrapper for a queue card and fill it with the inner
 * markup. The wrapper is what we keep across renders — its identity is the
 * thing that preserves focus, scroll, and CSS transitions on the card.
 */
const createQueueCardElement = (command: PlannedCommand, isRunning: boolean): HTMLElement => {
  const template = commandLibrary[command.templateId];
  const accent = accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue";
  const article = document.createElement("article");
  article.className = `queue-card queue-card-${command.type} ${accent}`;
  article.dataset.instanceId = command.instanceId;
  // Make the card itself a tab-stop so keyboard users can focus it and
  // use the arrow / Delete shortcuts defined in `Hud.handleKeydown`.
  article.tabIndex = 0;
  article.setAttribute("role", "group");
  article.setAttribute(
    "aria-label",
    `${template.label} command — drag to reorder, arrow keys also work, Delete to remove`,
  );
  // Drag-to-reorder: the card itself is the drag source. Disabled while
  // the queue is running (playback owns the queue) — handled by the
  // `is-running` class flipping the CSS `-webkit-user-drag` and the
  // dragstart handler bailing out if isRunning is true (via inner controls
  // being disabled). The `draggable` attribute drives native HTML5 DnD.
  article.draggable = !isRunning;
  article.innerHTML = queueCardInnerMarkup(command, isRunning);
  return article;
};

