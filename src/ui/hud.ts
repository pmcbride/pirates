import { commandLibrary, crewMates, fruitPowers, missionNodes, missions } from "../sim/content";
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
  enemyAhead: "Enemy Ahead",
  obstacleAhead: "Obstacle Ahead",
  treasureHere: "Treasure Here",
  crewHere: "Crew Here",
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

const queueCard = (command: PlannedCommand, isRunning: boolean): string => {
  const template = commandLibrary[command.templateId];
  const accent = accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue";
  const disabled = isRunning ? "disabled" : "";

  if (command.type === "loop") {
    return `
      <article class="queue-card ${accent}">
        <div class="queue-main">
          <div class="queue-kicker">Repeat</div>
          <button ${disabled} data-action="loop-count" data-instance-id="${command.instanceId}" class="chip-button">x${command.count ?? 2}</button>
          <button ${disabled} data-action="loop-action" data-instance-id="${command.instanceId}" class="chip-button">${labelMap[(command.action ?? "sail") as keyof typeof labelMap]}</button>
        </div>
        <div class="queue-tools">
          <button ${disabled} data-action="move-left" data-instance-id="${command.instanceId}">Left</button>
          <button ${disabled} data-action="move-right" data-instance-id="${command.instanceId}">Right</button>
          <button ${disabled} data-action="remove-command" data-instance-id="${command.instanceId}">Remove</button>
        </div>
      </article>
    `;
  }

  if (command.type === "condition") {
    return `
      <article class="queue-card ${accent}">
        <div class="queue-main">
          <div class="queue-kicker">If</div>
          <button ${disabled} data-action="if-condition" data-instance-id="${command.instanceId}" class="chip-button">${labelMap[(command.condition ?? "enemyAhead") as keyof typeof labelMap]}</button>
          <span class="queue-word">then</span>
          <button ${disabled} data-action="if-action" data-instance-id="${command.instanceId}" class="chip-button">${labelMap[(command.thenAction ?? "fire") as keyof typeof labelMap]}</button>
        </div>
        <div class="queue-tools">
          <button ${disabled} data-action="move-left" data-instance-id="${command.instanceId}">Left</button>
          <button ${disabled} data-action="move-right" data-instance-id="${command.instanceId}">Right</button>
          <button ${disabled} data-action="remove-command" data-instance-id="${command.instanceId}">Remove</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="queue-card ${accent}">
      <div class="queue-main">
        <div class="queue-kicker">${escapeHtml(template.label)}</div>
        <strong>${labelMap[(command.action ?? template.defaultAction ?? "sail") as keyof typeof labelMap]}</strong>
      </div>
      <div class="queue-tools">
        <button ${disabled} data-action="move-left" data-instance-id="${command.instanceId}">Left</button>
        <button ${disabled} data-action="move-right" data-instance-id="${command.instanceId}">Right</button>
        <button ${disabled} data-action="remove-command" data-instance-id="${command.instanceId}">Remove</button>
      </div>
    </article>
  `;
};

const drawerContent = (state: AppState): string => {
  switch (state.selectedDrawer) {
    case "crew": {
      const crewList = state.profile.crewRoster.length
        ? state.profile.crewRoster
            .map((crewId) => {
              const crew = crewMates[crewId];
              return `
                <li>
                  <strong>${escapeHtml(crew.name)}</strong>
                  <span>${escapeHtml(crew.title)}</span>
                  <p>${escapeHtml(crew.description)}</p>
                </li>
              `;
            })
            .join("")
        : "<li><strong>No crew yet</strong><p>Win voyages to invite more friends aboard.</p></li>";

      const fruitList = state.profile.fruitPowers.length
        ? state.profile.fruitPowers
            .map((fruitId) => {
              const fruit = fruitPowers[fruitId];
              return `
                <li>
                  <strong>${escapeHtml(fruit.name)}</strong>
                  <span>${escapeHtml(fruit.title)}</span>
                  <p>${escapeHtml(fruit.description)}</p>
                </li>
              `;
            })
            .join("")
        : "<li><strong>No fruits yet</strong><p>Sea 3 carries the first glowing fruit power.</p></li>";

      return `
        <section class="drawer-panel">
          <h3>Crew Log</h3>
          <ul class="drawer-list">${crewList}</ul>
          <h3>Fruit Powers</h3>
          <ul class="drawer-list">${fruitList}</ul>
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
          <p class="drawer-copy">Keeps the mission feedback clear while softening long movement animations.</p>
        </section>
      `;
    case "map": {
      const routeList = missionNodes
        .map((node) => {
          const unlocked = state.profile.unlockedMissionIds.includes(node.missionId);
          const complete = state.profile.completedMissionIds.includes(node.missionId);
          return `
            <li>
              <button ${unlocked ? "" : "disabled"} data-action="select-mission" data-mission-id="${node.missionId}">
                ${escapeHtml(node.label)} ${complete ? "Cleared" : unlocked ? "Ready" : "Locked"}
              </button>
            </li>
          `;
        })
        .join("");

      return `
        <section class="drawer-panel">
          <h3>Route List</h3>
          <ul class="drawer-route-list">${routeList}</ul>
        </section>
      `;
    }
    default:
      return "";
  }
};

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
        return `
          <section class="title-overlay">
            <div class="poster-copy">
              <p class="eyebrow">Early Child Coding Adventure</p>
              <h1>Cross the sea with pirate plans.</h1>
              <p class="support-copy">Big buttons, short missions, and bright command blocks that teach sequencing, repeat, and if.</p>
              <button data-action="start-adventure" class="primary-cta">Start Sailing</button>
            </div>
          </section>
        `;
      case "map":
        return this.renderMap(state);
      case "mission":
        return this.renderMission(state);
      case "reward":
        return this.renderReward(state);
    }
  }

  private renderMap(state: AppState): string {
    const missionId = state.selectedMissionId ?? state.profile.unlockedMissionIds[0];
    const node = missionNodes.find((entry) => entry.missionId === missionId);
    const mission = missionId ? missions[missionId] : null;

    return `
      <header class="top-strip top-strip-map">
        <div>
          <p class="eyebrow">Sea Chart</p>
          <h2>Pick the next voyage</h2>
        </div>
        <div class="stats-inline">
          <span>Gold ${state.profile.gold}</span>
          <span>Stars ${state.profile.stars}</span>
        </div>
      </header>

      <nav class="rail-actions">
        <button data-action="toggle-drawer" data-drawer="map">Routes</button>
        <button data-action="toggle-drawer" data-drawer="crew">Crew</button>
        <button data-action="toggle-drawer" data-drawer="settings">Settings</button>
      </nav>

      <section class="map-docket surface-card">
        <p class="eyebrow">${escapeHtml(node?.sea ?? "Starter Cove")}</p>
        <h3>${escapeHtml(node?.label ?? "Tutorial Cove")}</h3>
        <p>${escapeHtml(node?.preview ?? mission?.briefing ?? "")}</p>
        <div class="map-reward-row">
          <span>Gold +${node?.rewards.gold ?? 0}</span>
          <span>Stars +${node?.rewards.stars ?? 0}</span>
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
        <button data-action="open-selected-mission" class="primary-cta">
          Set Sail
        </button>
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
      : '<div class="empty-queue">Tap or drag blocks here to build a sailing plan.</div>';

    const palette = mission.palette
      .map((templateId) => {
        const template = commandLibrary[templateId];
        return `
          <button
            ${isRunning ? "disabled" : ""}
            class="palette-card ${accentMap[template.accent as keyof typeof accentMap] ?? "accent-blue"}"
            data-action="add-command"
            data-template-id="${templateId}"
            draggable="true"
          >
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

      <aside class="status-stack surface-card">
        <div><strong>Gold</strong><span>${state.profile.gold}</span></div>
        <div><strong>Stars</strong><span>${state.profile.stars}</span></div>
        <div><strong>Crew</strong><span>${state.profile.crewRoster.length}</span></div>
        <div><strong>Fruit</strong><span>${state.profile.fruitPowers.length}</span></div>
      </aside>

      <nav class="rail-actions mission-rail">
        <button data-action="leave-mission">Map</button>
        <button data-action="toggle-drawer" data-drawer="crew">Crew</button>
        <button data-action="toggle-drawer" data-drawer="settings">Settings</button>
      </nav>

      ${
        state.activeHint
          ? `
            <section class="hint-banner surface-card">
              <p class="eyebrow">Gentle Rewind</p>
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
            <button ${isRunning ? "disabled" : ""} data-action="reset-queue">Reset Sample</button>
            <button ${isRunning ? "disabled" : ""} data-action="run-mission" class="primary-cta">Run Plan</button>
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

    return `
      <section class="reward-overlay">
        <div class="reward-copy">
          <p class="eyebrow">Treasure Recovered</p>
          <h2>${escapeHtml(mission?.label ?? "Voyage Clear")}</h2>
          <p>Gold +${reward?.gold ?? 0} and Stars +${reward?.stars ?? 0}</p>
          ${
            reward?.crewId
              ? `<p>New crew mate: ${escapeHtml(crewMates[reward.crewId].name)}</p>`
              : reward?.fruitPowerId
                ? `<p>New fruit power: ${escapeHtml(fruitPowers[reward.fruitPowerId].name)}</p>`
                : ""
          }
          <button data-action="claim-reward" class="primary-cta">Back to Chart</button>
        </div>
      </section>
    `;
  }
}
