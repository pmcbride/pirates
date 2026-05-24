import {
  bountyRank,
  commandLibrary,
  crewMates,
  formatBerries,
  formatBounty,
  fruitPowers,
  missionNodes,
  missions,
} from "../sim/content";
import { gameStore } from "../sim/store";
import type { AppState, HintResult, PlannedCommand, PlayerProfile } from "../sim/types";
import { reconcileKeys } from "./reconcile";
import { playSfx, setMuted } from "./audio";
import { haptic } from "./haptic";

const labelMap = {
  sail: "Sail",
  "turn-left": "Turn Left",
  "turn-right": "Turn Right",
  dodge: "Dodge",
  fire: "Fire",
  collect: "Collect",
  talk: "Talk",
  enemyAhead: "Marine Ahead",
  obstacleAhead: "Reef Ahead",
  treasureHere: "Treasure Here",
  crewHere: "Crew Here",
} as const;

const iconMap = {
  sail: "⛵",
  "turn-left": "↺",
  "turn-right": "↻",
  dodge: "💨",
  fire: "💥",
  collect: "💰",
  talk: "💬",
  repeat: "🔁",
  if: "❓",
  enemyAhead: "⚔️",
  obstacleAhead: "🪨",
  treasureHere: "💎",
  crewHere: "🧑‍🎤",
} as const;

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

const iconFor = (key: keyof typeof iconMap): string => iconMap[key] ?? "•";

/**
 * Render the *inner* markup of a queue card (the contents of the <article>
 * wrapper). The wrapper itself is created once per `instanceId` and kept
 * across renders — see `createQueueCardElement`.
 */
const queueCardInnerMarkup = (command: PlannedCommand, isRunning: boolean): string => {
  const template = commandLibrary[command.templateId];
  const disabled = isRunning ? "disabled" : "";

  if (command.type === "loop") {
    const body = command.body ?? [];
    const repeatTemplate = commandLibrary.repeat;
    const maxBody = repeatTemplate?.bodyMaxLength ?? 2;
    const canAddBody = !isRunning && body.length < maxBody;

    const bodyChips = body.length
      ? body
          .map((inner) => {
            const innerAction = (inner.action ?? "sail") as keyof typeof iconMap;
            return `
              <span class="loop-body-chip">
                <button ${disabled} data-action="cycle-loop-body" data-instance-id="${command.instanceId}" data-inner-id="${inner.instanceId}" class="chip-button">${iconFor(innerAction)} ${labelMap[innerAction as keyof typeof labelMap]}</button>
                <button ${disabled} aria-label="Remove inner action" data-action="remove-loop-body" data-instance-id="${command.instanceId}" data-inner-id="${inner.instanceId}" class="chip-mini">✕</button>
              </span>
            `;
          })
          .join("")
      : `
        <button ${disabled} data-action="loop-action" data-instance-id="${command.instanceId}" class="chip-button">${iconFor((command.action ?? "sail") as keyof typeof iconMap)} ${labelMap[(command.action ?? "sail") as keyof typeof labelMap]}</button>
      `;

    return `
      <div class="queue-main">
        <span class="stamp-icon">${iconFor("repeat")}</span>
        <div class="queue-kicker">Repeat</div>
        <button ${disabled} data-action="loop-count" data-instance-id="${command.instanceId}" class="chip-button">×${command.count ?? 2}</button>
      </div>
      <div class="loop-body-row">
        ${bodyChips}
        <button ${canAddBody ? "" : "disabled"} data-action="add-loop-body" data-instance-id="${command.instanceId}" class="chip-button chip-add" aria-label="Add inner action">+</button>
      </div>
      <div class="queue-tools">
        <button ${disabled} aria-label="Move left" data-action="move-left" data-instance-id="${command.instanceId}">◀</button>
        <button ${disabled} aria-label="Move right" data-action="move-right" data-instance-id="${command.instanceId}">▶</button>
        <button ${disabled} aria-label="Remove block" data-action="remove-command" data-instance-id="${command.instanceId}">✕</button>
      </div>
    `;
  }

  if (command.type === "condition") {
    const condition = (command.condition ?? "enemyAhead") as keyof typeof iconMap;
    const thenAction = (command.thenAction ?? "fire") as keyof typeof iconMap;
    return `
      <div class="queue-main">
        <span class="stamp-icon">${iconFor("if")}</span>
        <div class="queue-kicker">If</div>
        <button ${disabled} data-action="open-if-condition-picker" data-instance-id="${command.instanceId}" class="chip-button">${iconFor(condition)} ${labelMap[condition as keyof typeof labelMap]}</button>
        <span class="queue-word">then</span>
        <button ${disabled} data-action="open-if-action-picker" data-instance-id="${command.instanceId}" class="chip-button">${iconFor(thenAction)} ${labelMap[thenAction as keyof typeof labelMap]}</button>
      </div>
      <div class="queue-tools">
        <button ${disabled} aria-label="Move left" data-action="move-left" data-instance-id="${command.instanceId}">◀</button>
        <button ${disabled} aria-label="Move right" data-action="move-right" data-instance-id="${command.instanceId}">▶</button>
        <button ${disabled} aria-label="Remove block" data-action="remove-command" data-instance-id="${command.instanceId}">✕</button>
      </div>
    `;
  }

  const action = (command.action ?? template.defaultAction ?? "sail") as keyof typeof iconMap;
  return `
    <div class="queue-main">
      <span class="stamp-icon" style="font-size:1.8rem">${iconFor(action)}</span>
      <div>
        <div class="queue-kicker">${escapeHtml(template.label)}</div>
        <strong>${labelMap[action as keyof typeof labelMap]}</strong>
      </div>
    </div>
    <div class="queue-tools">
      <button ${disabled} aria-label="Move left" data-action="move-left" data-instance-id="${command.instanceId}">◀</button>
      <button ${disabled} aria-label="Move right" data-action="move-right" data-instance-id="${command.instanceId}">▶</button>
      <button ${disabled} aria-label="Remove block" data-action="remove-command" data-instance-id="${command.instanceId}">✕</button>
    </div>
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

const wantedCrewCard = (crewId: string): string => {
  const crew = crewMates[crewId];
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

const wantedFruitCard = (fruitId: string): string => {
  const fruit = fruitPowers[fruitId];
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

const drawerContent = (state: AppState): string => {
  switch (state.selectedDrawer) {
    case "crew": {
      const crewList = state.profile.crewRoster.length
        ? state.profile.crewRoster.map(wantedCrewCard).join("")
        : `<li><div class="wanted-card"><p class="wanted-name">No crew yet</p><p class="wanted-line">Win voyages to invite Straw Hats aboard.</p></div></li>`;

      const fruitList = state.profile.fruitPowers.length
        ? state.profile.fruitPowers.map(wantedFruitCard).join("")
        : `<li><div class="wanted-card"><p class="wanted-name">No Devil Fruits yet</p><p class="wanted-line">Skypiea Lookout hides the first glowing fruit.</p></div></li>`;

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
                ${escapeHtml(node.label)} — ${status}
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

const statsInlineMarkup = (profile: PlayerProfile): string => `
  <div class="stats-inline">
    <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatBerries(profile.berries))}</span>
    <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBounty(profile.bounty))}</span>
    <span class="stat-pill"><span class="stat-icon">⭐</span>${profile.stars}</span>
  </div>
`;

const statusStripInnerMarkup = (profile: PlayerProfile): string => `
  <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatBerries(profile.berries))}</span>
  <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBounty(profile.bounty))}</span>
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
  queueList: HTMLElement;
  palette: HTMLElement;
  drawerHost: HTMLElement;
  pickerHost: HTMLElement;
  // Fingerprints of last-rendered inputs per region.
  fingerprints: {
    objective: string;
    status: string;
    rail: string;
    hint: string;
    dockHead: string;
    palette: string;
    drawer: string;
    picker: string;
    isRunning: boolean;
  };
  // Map of queued-command instanceId → rendered <article> + last fingerprint.
  queueNodes: Map<string, { node: HTMLElement; fingerprint: string }>;
  activeIndex: number;
}

export class Hud {
  /** Which screen the layer currently shows. `null` until first render. */
  private currentScreen: AppState["screen"] | null = null;

  /** Active per-screen layer element (replaced on screen change). */
  private currentLayer: HTMLElement | null = null;

  /** Mission-screen specific cache. Only present while on the mission screen. */
  private mission: MissionScaffold | null = null;

  constructor(private root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("dragstart", this.handleDragStart);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("drop", this.handleDrop);
    gameStore.subscribe((state) => {
      setMuted(state.profile.settings.muted);
      this.render(state);
    });
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
        playSfx("reward-claim");
        haptic("success");
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
      case "add-command":
        if (templateId) {
          playSfx("stamp-drop");
          haptic("tap");
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
      case "move-left":
        if (instanceId) {
          haptic("tap");
          gameStore.moveCommand(instanceId, -1);
        }
        break;
      case "move-right":
        if (instanceId) {
          haptic("tap");
          gameStore.moveCommand(instanceId, 1);
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
          gameStore.addLoopBodyAction(instanceId, "sail");
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
    }
  };

  private handleDragStart = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    const source = target?.closest<HTMLElement>("[data-template-id]");
    const templateId = source?.dataset.templateId;
    if (!templateId || !event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", templateId);
  };

  private handleDragOver = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-dropzone='queue']")) {
      event.preventDefault();
    }
  };

  private handleDrop = (event: DragEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("[data-dropzone='queue']") || !event.dataTransfer) {
      return;
    }
    event.preventDefault();
    const templateId = event.dataTransfer.getData("text/plain");
    if (templateId) {
      playSfx("stamp-drop");
      haptic("tap");
      gameStore.addCommand(templateId);
    }
  };

  // ── Top-level render ───────────────────────────────────────

  render(state: AppState): void {
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

    const layer = document.createElement("div");
    layer.className = `hud-layer screen-${state.screen}`;
    this.currentLayer = layer;

    switch (state.screen) {
      case "title":
        layer.innerHTML = this.renderTitleMarkup();
        break;
      case "map":
        layer.innerHTML = this.renderMapMarkup(state);
        break;
      case "mission":
        this.mountMissionScaffold(layer, state);
        break;
      case "reward":
        layer.innerHTML = this.renderRewardMarkup(state);
        break;
    }

    this.root.appendChild(layer);
  }

  // ── Title ──────────────────────────────────────────────────

  private renderTitleMarkup(): string {
    return `
      <section class="title-overlay">
        <div class="poster-copy">
          <p class="eyebrow">An early-coding pirate voyage</p>
          <h1>Set sail for the One Piece.</h1>
          <p class="support-copy">Drag big command stamps to plan a route. Splash Marines, scoop berries, recruit Straw Hats, and chase Devil Fruits across the Grand Line.</p>
          <button data-action="start-adventure" class="primary-cta">⛵ Set Sail</button>
        </div>
      </section>
    `;
  }

  // ── Map ────────────────────────────────────────────────────

  private renderMapMarkup(state: AppState): string {
    const missionId = state.selectedMissionId ?? state.profile.unlockedMissionIds[0];
    const node = missionNodes.find((entry) => entry.missionId === missionId);
    const mission = missionId ? missions[missionId] : null;
    const rank = bountyRank(state.profile.bounty);

    const drawerMarkup = state.selectedDrawer
      ? `<aside class="drawer-host">${drawerContent(state)}</aside>`
      : "";

    return `
      <header class="top-strip">
        <div class="surface-card" style="padding:0.9rem 1.2rem;">
          <p class="eyebrow">Sea Chart</p>
          <h2 style="margin:0;font-family:var(--display-font);font-size:1.8rem;">Pick the next voyage</h2>
          <p style="margin:0.2rem 0 0;color:var(--ink-soft);font-size:0.9rem;">${escapeHtml(rank)}</p>
        </div>
        ${statsInlineMarkup(state.profile)}
      </header>

      <nav class="rail-actions">
        <button data-action="toggle-drawer" data-drawer="map">🗺️ Routes</button>
        <button data-action="toggle-drawer" data-drawer="crew">🧑‍🎤 Crew</button>
        <button data-action="toggle-drawer" data-drawer="log">📜 Log</button>
        <button data-action="toggle-drawer" data-drawer="settings">⚙️ Settings</button>
      </nav>

      <section class="map-docket surface-card">
        <p class="eyebrow">${escapeHtml(node?.sea ?? "Starter Cove")}</p>
        <h3>${escapeHtml(node?.label ?? "Foosha Cove")}</h3>
        <p>${escapeHtml(node?.preview ?? mission?.briefing ?? "")}</p>
        <div class="map-reward-row">
          <span>💰 ${escapeHtml(formatBerries(node?.rewards.berries ?? 0))}</span>
          <span>🏴‍☠️ ${escapeHtml(formatBounty(node?.rewards.bounty ?? 0))}</span>
          <span>⭐ ${node?.rewards.stars ?? 0}</span>
          ${node?.rewards.crewId ? `<span>🧑‍🎤 ${escapeHtml(crewMates[node.rewards.crewId]?.name ?? "")}</span>` : ""}
          ${node?.rewards.fruitPowerId ? `<span>🍎 ${escapeHtml(fruitPowers[node.rewards.fruitPowerId]?.name ?? "")}</span>` : ""}
        </div>
        <div class="mission-pill-row">
          ${missionNodes
            .map((entry) => {
              const unlocked = state.profile.unlockedMissionIds.includes(entry.missionId);
              const current = missionId === entry.missionId;
              return `<button ${unlocked ? "" : "disabled"} data-action="select-mission" data-mission-id="${entry.missionId}" class="route-pill ${current ? "is-current" : ""}">${escapeHtml(entry.label)}</button>`;
            })
            .join("")}
        </div>
        <button data-action="open-selected-mission" class="primary-cta">⛵ Set Sail</button>
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
    this.currentLayer.innerHTML = this.renderMapMarkup(state);
  }

  // ── Reward ─────────────────────────────────────────────────

  private renderRewardMarkup(state: AppState): string {
    const mission = state.rewardMissionId ? missions[state.rewardMissionId] : null;
    const reward = state.lastRun?.reward;
    const lastLog = state.profile.captainLog.at(-1);

    return `
      <section class="reward-overlay">
        <div class="reward-copy">
          <p class="eyebrow">Treasure Recovered</p>
          <h2>${escapeHtml(mission?.label ?? "Voyage Clear")}</h2>
          <div class="reward-row">
            <span class="stat-pill">💰 ${escapeHtml(formatBerries(reward?.berries ?? 0))}</span>
            <span class="stat-pill bounty" aria-label="Bounty">🏴‍☠️ +${escapeHtml(formatBounty(reward?.bounty ?? 0))}</span>
            <span class="stat-pill">⭐ +${reward?.stars ?? 0}</span>
          </div>
          ${
            reward?.crewId
              ? `<ul class="drawer-list" style="margin:0;">${wantedCrewCard(reward.crewId)}</ul>`
              : reward?.fruitPowerId
                ? `<ul class="drawer-list" style="margin:0;">${wantedFruitCard(reward.fruitPowerId)}</ul>`
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
      </section>
    `;
  }

  private renderRewardInPlace(state: AppState): void {
    if (!this.currentLayer) return;
    this.currentLayer.innerHTML = this.renderRewardMarkup(state);
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
    const queueList = Hud.makeElement(`<div class="queue-list" data-dropzone="queue"></div>`);
    const palette = Hud.makeElement(`<div class="palette-grid"></div>`);
    const drawerHost = Hud.makeElement(`<aside class="drawer-host" hidden></aside>`);
    const pickerHost = Hud.makeElement(`<div class="picker-host"></div>`);

    dock.appendChild(dockHead);
    dock.appendChild(queueList);
    dock.appendChild(palette);

    layer.appendChild(objective);
    layer.appendChild(status);
    layer.appendChild(rail);
    layer.appendChild(hintHost);
    layer.appendChild(dock);
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
      queueList,
      palette,
      drawerHost,
      pickerHost,
      fingerprints: {
        objective: "",
        status: "",
        rail: "",
        hint: "",
        dockHead: "",
        palette: "",
        drawer: "",
        picker: "",
        isRunning: false,
      },
      queueNodes: new Map(),
      activeIndex: -1,
    };
  }

  private renderMissionInPlace(state: AppState): void {
    const mission = state.activeMissionId ? missions[state.activeMissionId] : null;
    if (!mission || !this.mission) {
      return;
    }

    const m = this.mission;
    const isRunning = state.missionPhase === "running";

    // — Objective chip
    const objFp = `${mission.id}|${mission.label}|${mission.sea}|${mission.objective.primary}`;
    if (objFp !== m.fingerprints.objective) {
      m.objective.innerHTML = `
        <p class="eyebrow">${escapeHtml(mission.sea)}</p>
        <h2>${escapeHtml(mission.label)}</h2>
        <p>${escapeHtml(mission.objective.primary)}</p>
      `;
      m.fingerprints.objective = objFp;
    }

    // — Status strip
    const profile = state.profile;
    const statusFp = `${profile.berries}|${profile.bounty}|${profile.crewRoster.length}|${profile.fruitPowers.length}`;
    if (statusFp !== m.fingerprints.status) {
      // Render the .stat-pill children straight into the wrapper.
      m.status.innerHTML = statusStripInnerMarkup(profile);
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

    // — Hint banner (toggle existence / refresh content only when hint changes)
    const hintFp = hintFingerprint(state.activeHint);
    if (hintFp !== m.fingerprints.hint) {
      m.hintHost.innerHTML = state.activeHint
        ? `
          <section class="hint-banner surface-card">
            <p class="eyebrow">💬 Gentle Rewind</p>
            <strong>${escapeHtml(state.activeHint.reason)}</strong>
            <p>${escapeHtml(state.activeHint.suggestion)}</p>
          </section>
        `
        : "";
      m.fingerprints.hint = hintFp;
    }

    // — Dock head (depends on isRunning + mission tutorial only)
    const dockHeadFp = `${isRunning ? "r" : "p"}|${mission.tutorial}`;
    if (dockHeadFp !== m.fingerprints.dockHead) {
      m.dockHead.innerHTML = `
        <div>
          <p class="eyebrow">Command Queue</p>
          <h3>${isRunning ? "Captain's plan is sailing" : "Build the route"}</h3>
          <p>${escapeHtml(mission.tutorial)}</p>
        </div>
        <div class="dock-actions">
          <button ${isRunning ? "disabled" : ""} data-action="clear-queue">Clear</button>
          <button ${isRunning ? "disabled" : ""} data-action="reset-queue">Reset</button>
          <button ${isRunning ? "disabled" : ""} data-action="run-mission" class="primary-cta">▶ Run Plan</button>
        </div>
      `;
      m.fingerprints.dockHead = dockHeadFp;
    }

    // — Palette grid (depends on mission palette + isRunning)
    const paletteFp = `${mission.id}|${isRunning ? "r" : "p"}`;
    if (paletteFp !== m.fingerprints.palette) {
      m.palette.innerHTML = mission.palette
        .map((templateId) => {
          const template = commandLibrary[templateId];
          const icon = iconFor(templateId as keyof typeof iconMap);
          return `
            <button
              ${isRunning ? "disabled" : ""}
              class="palette-card ${accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue"}"
              data-action="add-command"
              data-template-id="${templateId}"
              draggable="true"
            >
              <span class="stamp-icon">${icon}</span>
              <strong>${escapeHtml(template.label)}</strong>
              <span>${escapeHtml(template.description)}</span>
            </button>
          `;
        })
        .join("");
      m.fingerprints.palette = paletteFp;
    }

    // — Queue list (keyed reconcile + active class) — the whole point of this PR.
    this.reconcileQueueList(state, isRunning);

    // — Drawer host
    const drawerFp = drawerFingerprint(state);
    if (drawerFp !== m.fingerprints.drawer) {
      if (state.selectedDrawer) {
        m.drawerHost.hidden = false;
        m.drawerHost.innerHTML = drawerContent(state);
      } else {
        m.drawerHost.hidden = true;
        m.drawerHost.innerHTML = "";
      }
      m.fingerprints.drawer = drawerFp;
    }

    // — Picker overlay (popover for if-condition / if-action selection)
    const picker = state.openPicker;
    const pickerFp = picker
      ? `${picker.type}|${picker.instanceId}|${picker.anchor.x}|${picker.anchor.y}|${picker.anchor.w}|${picker.anchor.h}`
      : "";
    if (pickerFp !== m.fingerprints.picker) {
      m.pickerHost.innerHTML = picker ? renderConditionPicker(state) : "";
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
        if (!entry) {
          const node = createQueueCardElement(command, isRunning);
          entry = { node, fingerprint: commandFingerprint(command, isRunning) };
          m.queueNodes.set(op.key, entry);
        }
        const before = op.beforeKey
          ? (m.queueNodes.get(op.beforeKey)?.node ?? null)
          : null;
        list.insertBefore(entry.node, before);
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
    }

    // Active class — surgical toggle, never rebuilds.
    const nextActive = isRunning ? Math.min(state.playbackIndex, commands.length - 1) : -1;
    if (nextActive !== m.activeIndex) {
      if (m.activeIndex >= 0 && m.activeIndex < commands.length) {
        const prevKey = commands[m.activeIndex]?.instanceId;
        if (prevKey) {
          m.queueNodes.get(prevKey)?.node.classList.remove("is-active");
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
  }
}

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
  article.className = `queue-card ${accent}`;
  article.dataset.instanceId = command.instanceId;
  article.innerHTML = queueCardInnerMarkup(command, isRunning);
  return article;
};

