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
  commandLibrary,
  missionNodes,
  missions,
} from "../sim/content";
import { gameStore } from "../sim/store";
import type { AppState, PlannedCommand } from "../sim/types";

const labelMap = {
  sail: "Sail",
  "turn-left": "Turn Left",
  "turn-right": "Turn Right",
  dodge: "Dodge",
  fire: "Fire",
  collect: "Collect",
  talk: "Talk",
  enemyAhead: "Foe Ahead",
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

// Helpers — resolve mission/sea/crew/fruit display strings against a theme.
const missionLabel = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.label ?? missionId;

const missionSea = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.sea ?? "";

const missionPreview = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.preview ?? "";

const missionBriefing = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.briefing ?? "";

const missionTutorial = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.tutorial ?? "";

const missionObjective = (theme: Theme, missionId: string): string =>
  theme.missions[missionId]?.objective.primary ?? "";

const queueCard = (command: PlannedCommand, isRunning: boolean): string => {
  const template = commandLibrary[command.templateId];
  const accent = accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue";
  const disabled = isRunning ? "disabled" : "";

  if (command.type === "loop") {
    const action = (command.action ?? "sail") as keyof typeof iconMap;
    return `
      <article class="queue-card ${accent}">
        <div class="queue-main">
          <span class="stamp-icon">${iconFor("repeat")}</span>
          <div class="queue-kicker">Repeat</div>
          <button ${disabled} data-action="loop-count" data-instance-id="${command.instanceId}" class="chip-button">×${command.count ?? 2}</button>
          <button ${disabled} data-action="loop-action" data-instance-id="${command.instanceId}" class="chip-button">${iconFor(action)} ${labelMap[action as keyof typeof labelMap]}</button>
        </div>
        <div class="queue-tools">
          <button ${disabled} aria-label="Move left" data-action="move-left" data-instance-id="${command.instanceId}">◀</button>
          <button ${disabled} aria-label="Move right" data-action="move-right" data-instance-id="${command.instanceId}">▶</button>
          <button ${disabled} aria-label="Remove block" data-action="remove-command" data-instance-id="${command.instanceId}">✕</button>
        </div>
      </article>
    `;
  }

  if (command.type === "condition") {
    const condition = (command.condition ?? "enemyAhead") as keyof typeof iconMap;
    const thenAction = (command.thenAction ?? "fire") as keyof typeof iconMap;
    return `
      <article class="queue-card ${accent}">
        <div class="queue-main">
          <span class="stamp-icon">${iconFor("if")}</span>
          <div class="queue-kicker">If</div>
          <button ${disabled} data-action="if-condition" data-instance-id="${command.instanceId}" class="chip-button">${iconFor(condition)} ${labelMap[condition as keyof typeof labelMap]}</button>
          <span class="queue-word">then</span>
          <button ${disabled} data-action="if-action" data-instance-id="${command.instanceId}" class="chip-button">${iconFor(thenAction)} ${labelMap[thenAction as keyof typeof labelMap]}</button>
        </div>
        <div class="queue-tools">
          <button ${disabled} aria-label="Move left" data-action="move-left" data-instance-id="${command.instanceId}">◀</button>
          <button ${disabled} aria-label="Move right" data-action="move-right" data-instance-id="${command.instanceId}">▶</button>
          <button ${disabled} aria-label="Remove block" data-action="remove-command" data-instance-id="${command.instanceId}">✕</button>
        </div>
      </article>
    `;
  }

  const action = (command.action ?? template.defaultAction ?? "sail") as keyof typeof iconMap;
  return `
    <article class="queue-card ${accent}">
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
    </article>
  `;
};

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

const drawerContent = (state: AppState, theme: Theme): string => {
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

const statsInline = (state: AppState, theme: Theme): string => `
  <div class="stats-inline">
    <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatCurrency(theme, state.profile.berries))}</span>
    <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBountyFor(theme, state.profile.bounty))}</span>
    <span class="stat-pill"><span class="stat-icon">⭐</span>${state.profile.stars}</span>
  </div>
`;

const statusStrip = (state: AppState, theme: Theme): string => `
  <div class="status-strip">
    <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatCurrency(theme, state.profile.berries))}</span>
    <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBountyFor(theme, state.profile.bounty))}</span>
    <span class="stat-pill"><span class="stat-icon">🧑‍🎤</span>${state.profile.crewRoster.length}</span>
    <span class="stat-pill"><span class="stat-icon">🍎</span>${state.profile.fruitPowers.length}</span>
  </div>
`;

export class Hud {
  constructor(private root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("dragstart", this.handleDragStart);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("drop", this.handleDrop);
    gameStore.subscribe((state) => {
      this.root.innerHTML = this.render(state);
    });
  }

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
        gameStore.claimReward();
        break;
      case "toggle-drawer":
        gameStore.toggleDrawer(drawer ?? null);
        break;
      case "toggle-reduced-motion":
        gameStore.toggleReducedMotion();
        break;
      case "set-theme":
        if (themeId) {
          gameStore.setTheme(themeId);
        }
        break;
      case "add-command":
        if (templateId) {
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
        gameStore.runActiveMission();
        break;
      case "remove-command":
        if (instanceId) {
          gameStore.removeCommand(instanceId);
        }
        break;
      case "move-left":
        if (instanceId) {
          gameStore.moveCommand(instanceId, -1);
        }
        break;
      case "move-right":
        if (instanceId) {
          gameStore.moveCommand(instanceId, 1);
        }
        break;
      case "loop-count":
        if (instanceId) {
          gameStore.cycleLoopCount(instanceId);
        }
        break;
      case "loop-action":
        if (instanceId) {
          gameStore.cycleLoopAction(instanceId);
        }
        break;
      case "if-condition":
        if (instanceId) {
          gameStore.cycleCondition(instanceId);
        }
        break;
      case "if-action":
        if (instanceId) {
          gameStore.cycleConditionAction(instanceId);
        }
        break;
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
      gameStore.addCommand(templateId);
    }
  };

  private render(state: AppState): string {
    const theme = getActiveTheme(state.profile);
    return `
      <div class="hud-layer screen-${state.screen}">
        ${this.renderScreen(state, theme)}
        ${state.selectedDrawer ? `<aside class="drawer-host">${drawerContent(state, theme)}</aside>` : ""}
      </div>
    `;
  }

  private renderScreen(state: AppState, theme: Theme): string {
    switch (state.screen) {
      case "title":
        return this.renderTitle(theme);
      case "map":
        return this.renderMap(state, theme);
      case "mission":
        return this.renderMission(state, theme);
      case "reward":
        return this.renderReward(state, theme);
    }
  }

  private renderTitle(theme: Theme): string {
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

  private renderMap(state: AppState, theme: Theme): string {
    const missionId = state.selectedMissionId ?? state.profile.unlockedMissionIds[0];
    const node = missionNodes.find((entry) => entry.missionId === missionId);
    const rank = bountyRankFor(theme, state.profile.bounty);

    return `
      <header class="top-strip">
        <div class="surface-card" style="padding:0.9rem 1.2rem;">
          <p class="eyebrow">Sea Chart</p>
          <h2 style="margin:0;font-family:var(--display-font);font-size:1.8rem;">Pick the next voyage</h2>
          <p style="margin:0.2rem 0 0;color:var(--ink-soft);font-size:0.9rem;">${escapeHtml(rank)}</p>
        </div>
        ${statsInline(state, theme)}
      </header>

      <nav class="rail-actions">
        <button data-action="toggle-drawer" data-drawer="map">🗺️ Routes</button>
        <button data-action="toggle-drawer" data-drawer="crew">🧑‍🎤 Crew</button>
        <button data-action="toggle-drawer" data-drawer="log">📜 Log</button>
        <button data-action="toggle-drawer" data-drawer="settings">⚙️ Settings</button>
      </nav>

      <section class="map-docket surface-card">
        <p class="eyebrow">${escapeHtml(node ? missionSea(theme, node.missionId) : "")}</p>
        <h3>${escapeHtml(node ? missionLabel(theme, node.missionId) : "")}</h3>
        <p>${escapeHtml(node ? missionPreview(theme, node.missionId) || missionBriefing(theme, node.missionId) : "")}</p>
        <div class="map-reward-row">
          <span>💰 ${escapeHtml(formatCurrency(theme, node?.rewards.berries ?? 0))}</span>
          <span>🏴‍☠️ ${escapeHtml(formatBountyFor(theme, node?.rewards.bounty ?? 0))}</span>
          <span>⭐ ${node?.rewards.stars ?? 0}</span>
          ${node?.rewards.crewId ? `<span>🧑‍🎤 ${escapeHtml(theme.crew[node.rewards.crewId]?.name ?? "")}</span>` : ""}
          ${node?.rewards.fruitPowerId ? `<span>🍎 ${escapeHtml(theme.fruits[node.rewards.fruitPowerId]?.name ?? "")}</span>` : ""}
        </div>
        <div class="mission-pill-row">
          ${missionNodes
            .map((entry) => {
              const unlocked = state.profile.unlockedMissionIds.includes(entry.missionId);
              const current = missionId === entry.missionId;
              return `<button ${unlocked ? "" : "disabled"} data-action="select-mission" data-mission-id="${entry.missionId}" class="route-pill ${current ? "is-current" : ""}">${escapeHtml(missionLabel(theme, entry.missionId))}</button>`;
            })
            .join("")}
        </div>
        <button data-action="open-selected-mission" class="primary-cta">${escapeHtml(theme.taglines.setSailCta)}</button>
      </section>
    `;
  }

  private renderMission(state: AppState, theme: Theme): string {
    const mission = state.activeMissionId ? missions[state.activeMissionId] : null;
    if (!mission) {
      return "";
    }

    const isRunning = state.missionPhase === "running";
    const queueMarkup = state.queuedCommands.length
      ? state.queuedCommands.map((command) => queueCard(command, isRunning)).join("")
      : '<div class="empty-queue">Tap stamps below to build a sailing plan.</div>';

    const palette = mission.palette
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

    return `
      <header class="objective-chip surface-card">
        <p class="eyebrow">${escapeHtml(missionSea(theme, mission.id))}</p>
        <h2>${escapeHtml(missionLabel(theme, mission.id))}</h2>
        <p>${escapeHtml(missionObjective(theme, mission.id))}</p>
      </header>

      ${statusStrip(state, theme)}

      <nav class="rail-actions mission-rail">
        <button data-action="leave-mission">🗺️ Map</button>
        <button data-action="toggle-drawer" data-drawer="crew">🧑‍🎤 Crew</button>
        <button data-action="toggle-drawer" data-drawer="log">📜 Log</button>
        <button aria-label="Settings" data-action="toggle-drawer" data-drawer="settings">⚙️</button>
      </nav>

      ${
        state.activeHint
          ? `
            <section class="hint-banner surface-card">
              <p class="eyebrow">💬 Gentle Rewind</p>
              <strong>${escapeHtml(state.activeHint.reason)}</strong>
              <p>${escapeHtml(state.activeHint.suggestion)}</p>
            </section>
          `
          : ""
      }

      <section class="command-dock surface-card">
        <div class="dock-head">
          <div>
            <p class="eyebrow">Command Queue</p>
            <h3>${isRunning ? "Captain's plan is sailing" : "Build the route"}</h3>
            <p>${escapeHtml(missionTutorial(theme, mission.id))}</p>
          </div>
          <div class="dock-actions">
            <button ${isRunning ? "disabled" : ""} data-action="clear-queue">Clear</button>
            <button ${isRunning ? "disabled" : ""} data-action="reset-queue">Reset</button>
            <button ${isRunning ? "disabled" : ""} data-action="run-mission" class="primary-cta">▶ Run Plan</button>
          </div>
        </div>
        <div class="queue-list" data-dropzone="queue">
          ${queueMarkup}
        </div>
        <div class="palette-grid">
          ${palette}
        </div>
      </section>
    `;
  }

  private renderReward(state: AppState, theme: Theme): string {
    const reward = state.lastRun?.reward;
    const lastLog = state.profile.captainLog.at(-1);
    const rewardLabel = state.rewardMissionId
      ? missionLabel(theme, state.rewardMissionId)
      : "Voyage Clear";

    return `
      <section class="reward-overlay">
        <div class="reward-copy">
          <p class="eyebrow">Treasure Recovered</p>
          <h2>${escapeHtml(rewardLabel)}</h2>
          <div class="reward-row">
            <span class="stat-pill">💰 ${escapeHtml(formatCurrency(theme, reward?.berries ?? 0))}</span>
            <span class="stat-pill bounty" aria-label="Bounty">🏴‍☠️ +${escapeHtml(formatBountyFor(theme, reward?.bounty ?? 0))}</span>
            <span class="stat-pill">⭐ +${reward?.stars ?? 0}</span>
          </div>
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
      </section>
    `;
  }
}
