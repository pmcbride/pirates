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
import type { AppState, PlannedCommand } from "../sim/types";
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

const statsInline = (state: AppState): string => `
  <div class="stats-inline">
    <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatBerries(state.profile.berries))}</span>
    <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBounty(state.profile.bounty))}</span>
    <span class="stat-pill"><span class="stat-icon">⭐</span>${state.profile.stars}</span>
  </div>
`;

const statusStrip = (state: AppState): string => `
  <div class="status-strip">
    <span class="stat-pill"><span class="stat-icon">💰</span>${escapeHtml(formatBerries(state.profile.berries))}</span>
    <span class="stat-pill bounty" aria-label="Bounty"><span class="stat-icon" aria-hidden="true">🏴‍☠️</span>${escapeHtml(formatBounty(state.profile.bounty))}</span>
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
      setMuted(state.profile.settings.muted);
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
      case "if-condition":
        if (instanceId) {
          haptic("tap");
          gameStore.cycleCondition(instanceId);
        }
        break;
      case "if-action":
        if (instanceId) {
          haptic("tap");
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
      playSfx("stamp-drop");
      haptic("tap");
      gameStore.addCommand(templateId);
    }
  };

  private render(state: AppState): string {
    return `
      <div class="hud-layer screen-${state.screen}">
        ${this.renderScreen(state)}
        ${state.selectedDrawer ? `<aside class="drawer-host">${drawerContent(state)}</aside>` : ""}
      </div>
    `;
  }

  private renderScreen(state: AppState): string {
    switch (state.screen) {
      case "title":
        return this.renderTitle();
      case "map":
        return this.renderMap(state);
      case "mission":
        return this.renderMission(state);
      case "reward":
        return this.renderReward(state);
    }
  }

  private renderTitle(): string {
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

  private renderMap(state: AppState): string {
    const missionId = state.selectedMissionId ?? state.profile.unlockedMissionIds[0];
    const node = missionNodes.find((entry) => entry.missionId === missionId);
    const mission = missionId ? missions[missionId] : null;
    const rank = bountyRank(state.profile.bounty);

    return `
      <header class="top-strip">
        <div class="surface-card" style="padding:0.9rem 1.2rem;">
          <p class="eyebrow">Sea Chart</p>
          <h2 style="margin:0;font-family:var(--display-font);font-size:1.8rem;">Pick the next voyage</h2>
          <p style="margin:0.2rem 0 0;color:var(--ink-soft);font-size:0.9rem;">${escapeHtml(rank)}</p>
        </div>
        ${statsInline(state)}
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
    `;
  }

  private renderMission(state: AppState): string {
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
        <p class="eyebrow">${escapeHtml(mission.sea)}</p>
        <h2>${escapeHtml(mission.label)}</h2>
        <p>${escapeHtml(mission.objective.primary)}</p>
      </header>

      ${statusStrip(state)}

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
            <p>${escapeHtml(mission.tutorial)}</p>
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

  private renderReward(state: AppState): string {
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
}
