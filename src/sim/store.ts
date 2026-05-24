import {
  commandLibrary,
  defaultSandboxPalette,
  missionNodes,
  missions,
  orderedMissionIds,
  sandboxMissionId,
} from "./content";
import { cloneQueuedCommands, getMission, runMission } from "./engine";
import { applyReward, defaultProfile, loadProfile, saveProfile } from "./profile";
import type { AppState, CommandBlock, PlannedCommand, PlayerProfile } from "./types";

type Listener = (state: AppState) => void;

const commandCounter = (() => {
  let value = 0;
  return () => {
    value += 1;
    return `cmd-${value}`;
  };
})();

const createCommandFromTemplate = (template: CommandBlock): PlannedCommand => ({
  instanceId: commandCounter(),
  templateId: template.id,
  type: template.type,
  action: template.defaultAction,
  count: template.defaultCount,
  condition: template.defaultCondition,
  thenAction: template.defaultAction,
});

const firstUnlockedMissionId = (profile: PlayerProfile): string =>
  orderedMissionIds.find((missionId) => profile.unlockedMissionIds.includes(missionId)) ??
  "tutorial-cove";

const nextMissionId = (missionId: string): string | undefined => {
  const index = orderedMissionIds.indexOf(missionId);
  if (index === -1) {
    return undefined;
  }
  return orderedMissionIds[index + 1];
};

const initialState = (): AppState => {
  const profile =
    typeof window === "undefined" ? defaultProfile() : loadProfile();

  return {
    screen: "title",
    profile,
    selectedMissionId: firstUnlockedMissionId(profile),
    activeMissionId: null,
    queuedCommands: [],
    missionPhase: "planning",
    lastRun: null,
    activeHint: null,
    selectedDrawer: null,
    playbackIndex: 0,
    rewardMissionId: null,
  };
};

export class GameStore {
  private state: AppState = initialState();

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): AppState {
    return this.state;
  }

  private setState(next: AppState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(this.state));
  }

  private update(mutator: (state: AppState) => AppState): void {
    this.setState(mutator(this.state));
  }

  private persistProfile(profile: PlayerProfile): void {
    if (typeof window !== "undefined") {
      saveProfile(profile);
    }
  }

  startAdventure(): void {
    this.update((state) => ({
      ...state,
      screen: "map",
      selectedMissionId: firstUnlockedMissionId(state.profile),
      rewardMissionId: null,
    }));
  }

  selectMission(missionId: string): void {
    if (!this.state.profile.unlockedMissionIds.includes(missionId)) {
      return;
    }

    this.update((state) => ({
      ...state,
      selectedMissionId: missionId,
    }));
  }

  openMission(missionId = this.state.selectedMissionId): void {
    if (!missionId || !this.state.profile.unlockedMissionIds.includes(missionId)) {
      return;
    }

    if (missionId === sandboxMissionId) {
      this.openSandbox();
      return;
    }

    const mission = getMission(missionId);
    this.update((state) => ({
      ...state,
      screen: "mission",
      activeMissionId: missionId,
      queuedCommands: cloneQueuedCommands(mission.suggestedQueue),
      missionPhase: "planning",
      lastRun: null,
      activeHint: null,
      selectedDrawer: null,
      playbackIndex: 0,
    }));
  }

  openSandbox(): void {
    const mission = getMission(sandboxMissionId);
    if (!mission) {
      return;
    }

    // Build the sandbox palette from what the player has unlocked. Brand-new
    // players (no unlocks beyond defaults) still get sail/turn/collect.
    const unlockSet = new Set<string>(this.state.profile.commandUnlocks);
    defaultSandboxPalette.forEach((id) => unlockSet.add(id));
    const palette = Object.keys(commandLibrary).filter((id) => unlockSet.has(id));
    mission.palette = palette.length > 0 ? palette : [...defaultSandboxPalette];

    this.update((state) => ({
      ...state,
      screen: "sandbox",
      activeMissionId: sandboxMissionId,
      queuedCommands: cloneQueuedCommands(mission.suggestedQueue),
      missionPhase: "planning",
      lastRun: null,
      activeHint: null,
      selectedDrawer: null,
      playbackIndex: 0,
    }));
  }

  leaveMission(): void {
    this.update((state) => ({
      ...state,
      screen: "map",
      activeMissionId: null,
      missionPhase: "planning",
      lastRun: null,
      activeHint: null,
      selectedDrawer: null,
      playbackIndex: 0,
    }));
  }

  addCommand(templateId: string): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    const mission = missions[missionId];
    if (!mission.palette.includes(templateId)) {
      return;
    }

    const template = commandLibrary[templateId];
    if (!template) {
      return;
    }

    this.update((state) => ({
      ...state,
      queuedCommands: [...state.queuedCommands, createCommandFromTemplate(template)],
      activeHint: null,
      lastRun: null,
    }));
  }

  clearQueue(): void {
    this.update((state) => ({
      ...state,
      queuedCommands: [],
      activeHint: null,
      lastRun: null,
    }));
  }

  resetQueue(): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    this.update((state) => ({
      ...state,
      queuedCommands: cloneQueuedCommands(missions[missionId].suggestedQueue),
      activeHint: null,
      lastRun: null,
    }));
  }

  removeCommand(instanceId: string): void {
    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.filter(
        (command) => command.instanceId !== instanceId,
      ),
      activeHint: null,
      lastRun: null,
    }));
  }

  moveCommand(instanceId: string, direction: -1 | 1): void {
    this.update((state) => {
      const index = state.queuedCommands.findIndex(
        (command) => command.instanceId === instanceId,
      );
      const nextIndex = index + direction;
      if (index === -1 || nextIndex < 0 || nextIndex >= state.queuedCommands.length) {
        return state;
      }

      const queuedCommands = [...state.queuedCommands];
      const [command] = queuedCommands.splice(index, 1);
      queuedCommands.splice(nextIndex, 0, command);

      return {
        ...state,
        queuedCommands,
        activeHint: null,
        lastRun: null,
      };
    });
  }

  cycleLoopCount(instanceId: string): void {
    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) =>
        command.instanceId === instanceId && command.type === "loop"
          ? { ...command, count: command.count === 3 ? 2 : 3 }
          : command,
      ),
      activeHint: null,
      lastRun: null,
    }));
  }

  cycleLoopAction(instanceId: string): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    const allowedActions = missions[missionId].palette.filter(
      (commandId) => commandLibrary[commandId]?.type === "action",
    );

    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "loop") {
          return command;
        }

        const currentIndex = allowedActions.indexOf(command.action ?? "sail");
        const nextAction =
          allowedActions[(currentIndex + 1) % allowedActions.length] ?? "sail";

        return {
          ...command,
          action: nextAction as PlannedCommand["action"],
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  cycleCondition(instanceId: string): void {
    const options = commandLibrary.if.conditionOptions ?? [];
    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "condition") {
          return command;
        }

        const currentIndex = options.indexOf(command.condition ?? options[0]);
        return {
          ...command,
          condition: options[(currentIndex + 1) % options.length],
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  cycleConditionAction(instanceId: string): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    const options = missions[missionId].palette.filter((commandId) =>
      ["fire", "dodge", "collect", "talk"].includes(commandId),
    );

    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "condition") {
          return command;
        }

        const currentIndex = options.indexOf(command.thenAction ?? options[0]);
        return {
          ...command,
          thenAction: options[(currentIndex + 1) % options.length] as PlannedCommand["thenAction"],
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  runActiveMission(): void {
    const missionId = this.state.activeMissionId;
    if (!missionId || this.state.queuedCommands.length === 0) {
      return;
    }

    const result = runMission(
      missions[missionId],
      cloneQueuedCommands(this.state.queuedCommands),
      this.state.profile,
    );

    this.update((state) => ({
      ...state,
      missionPhase: "running",
      lastRun: result,
      activeHint: null,
      playbackIndex: 0,
    }));
  }

  setPlaybackIndex(index: number): void {
    this.update((state) => ({
      ...state,
      playbackIndex: index,
    }));
  }

  finishPlayback(): void {
    const missionId = this.state.activeMissionId;
    const result = this.state.lastRun;
    if (!missionId || !result) {
      return;
    }

    // Sandbox runs never persist rewards, never bump captain's log, never
    // unlock new missions, and never switch to the reward screen. They just
    // reset the queue/phase back to planning so the player can keep playing.
    const mission = missions[missionId];
    if (mission?.sandbox) {
      this.update((state) => ({
        ...state,
        missionPhase: "planning",
        activeHint: null,
        playbackIndex: 0,
      }));
      return;
    }

    if (!result.success || !result.reward) {
      this.update((state) => ({
        ...state,
        missionPhase: "planning",
        activeHint: state.lastRun?.hint ?? null,
      }));
      return;
    }

    const unlockedNext = nextMissionId(missionId);
    const profile = applyReward(
      this.state.profile,
      missionId,
      result.reward,
      unlockedNext,
    );
    this.persistProfile(profile);

    this.update((state) => ({
      ...state,
      profile,
      screen: "reward",
      rewardMissionId: missionId,
      selectedMissionId: unlockedNext ?? missionId,
      missionPhase: "planning",
      activeHint: null,
    }));
  }

  claimReward(): void {
    this.update((state) => ({
      ...state,
      screen: "map",
      activeMissionId: null,
      rewardMissionId: null,
      selectedDrawer: null,
      playbackIndex: 0,
      lastRun: null,
    }));
  }

  toggleDrawer(drawer: AppState["selectedDrawer"]): void {
    this.update((state) => ({
      ...state,
      selectedDrawer: state.selectedDrawer === drawer ? null : drawer,
    }));
  }

  toggleReducedMotion(): void {
    const profile: PlayerProfile = {
      ...this.state.profile,
      settings: {
        ...this.state.profile.settings,
        reducedMotion: !this.state.profile.settings.reducedMotion,
      },
    };
    this.persistProfile(profile);

    this.update((state) => ({
      ...state,
      profile,
    }));
  }
}

export const gameStore = new GameStore();

export const mapNodeForMission = (missionId: string) =>
  missionNodes.find((node) => node.missionId === missionId);
