import { commandLibrary, missionNodes, missions, orderedMissionIds } from "./content";
import { cloneQueuedCommands, getMission, runMission } from "./engine";
import { applyReward, defaultProfile, loadProfile, saveProfile } from "./profile";
import type {
  ActionCommandId,
  AppState,
  CommandBlock,
  ConditionKind,
  MissionDefinition,
  MissionRunResult,
  PickerAnchor,
  PickerType,
  PlannedCommand,
  PlayerProfile,
  Position,
} from "./types";

/**
 * Missions where prediction is required. Tutorial is exempt so the very first
 * experience stays friction-free.
 */
const PREDICTION_EXEMPT_MISSION_IDS = new Set<string>(["tutorial-cove"]);

/**
 * Pure helper: does the player need to predict before running this mission?
 * - Tutorial is exempt.
 * - Player can opt out via settings (skipPrediction).
 */
export const shouldPredictForMission = (
  missionId: string,
  profile: PlayerProfile,
): boolean => {
  if (profile.settings.skipPrediction) {
    return false;
  }
  return !PREDICTION_EXEMPT_MISSION_IDS.has(missionId);
};

/**
 * Pure helper: pick the queue to pre-load when opening a mission, based on
 * how many times the player has attempted it and their settings.
 *
 * - First attempt (or alwaysShowSuggested true): full suggested queue.
 * - Subsequent attempts: stub queue with only the first command (so the
 *   canvas isn't empty for a pre-reader). Empty suggested queue → empty stub.
 */
export const pickInitialQueue = (
  mission: MissionDefinition,
  profile: PlayerProfile,
): PlannedCommand[] => {
  const attempts = profile.attemptCounts[mission.id] ?? 0;
  if (attempts === 0 || profile.settings.alwaysShowSuggested) {
    return cloneQueuedCommands(mission.suggestedQueue);
  }
  if (mission.suggestedQueue.length === 0) {
    return [];
  }
  return cloneQueuedCommands([mission.suggestedQueue[0]]);
};

/**
 * Pure helper: where did the ship actually end up?
 *
 * - On success: finalState.ship.position.
 * - On failure: the position right *before* the failing step — that's where
 *   the kid's plan effectively ran out, which is the fairest comparison for
 *   their prediction.
 */
export const shipEndPositionForPrediction = (
  result: MissionRunResult,
): Position => {
  if (result.success) {
    return result.finalState.ship.position;
  }

  // Walk back from the end to find the last non-failed step's ship position.
  const lastNonFailed = [...result.steps]
    .reverse()
    .find((step) => step.status !== "failed");
  if (lastNonFailed) {
    return lastNonFailed.ship.position;
  }

  // No successful steps at all → fall back to final state.
  return result.finalState.ship.position;
};

/**
 * Pure helper: compare a predicted position to the actual ship end position.
 * Returns null when there is no prediction to score.
 */
export const computePredictionCorrect = (
  predicted: Position | null,
  result: MissionRunResult,
): boolean | null => {
  if (!predicted) {
    return null;
  }
  const actual = shipEndPositionForPrediction(result);
  return predicted.x === actual.x && predicted.y === actual.y;
};

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
    openPicker: null,
    predictedEndPosition: null,
    lastPredictionCorrect: null,
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

    const mission = getMission(missionId);
    this.update((state) => ({
      ...state,
      screen: "mission",
      activeMissionId: missionId,
      queuedCommands: pickInitialQueue(mission, state.profile),
      missionPhase: "planning",
      lastRun: null,
      activeHint: null,
      selectedDrawer: null,
      playbackIndex: 0,
      openPicker: null,
      predictedEndPosition: null,
      lastPredictionCorrect: null,
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
      openPicker: null,
      predictedEndPosition: null,
      lastPredictionCorrect: null,
    }));
  }

  /**
   * Wherever the queue gets mutated, we kick back to planning and forget any
   * pending prediction — the plan changed, so a previous mark or run is stale.
   */
  private resetPlanningAfterEdit(state: AppState): Partial<AppState> {
    return {
      activeHint: null,
      lastRun: null,
      missionPhase: state.missionPhase === "running" ? state.missionPhase : "planning",
      predictedEndPosition: null,
      lastPredictionCorrect: null,
    };
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
      ...this.resetPlanningAfterEdit(state),
    }));
  }

  clearQueue(): void {
    this.update((state) => ({
      ...state,
      queuedCommands: [],
      ...this.resetPlanningAfterEdit(state),
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
      ...this.resetPlanningAfterEdit(state),
    }));
  }

  removeCommand(instanceId: string): void {
    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.filter(
        (command) => command.instanceId !== instanceId,
      ),
      ...this.resetPlanningAfterEdit(state),
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
        ...this.resetPlanningAfterEdit(state),
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

  addLoopBodyAction(instanceId: string, templateId: string): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    const template = commandLibrary[templateId];
    if (!template || template.type !== "action") {
      return;
    }

    const loopTemplate = commandLibrary.repeat;
    const maxLength = loopTemplate?.bodyMaxLength ?? 2;

    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "loop") {
          return command;
        }
        const body = command.body ?? [];
        if (body.length >= maxLength) {
          return command;
        }
        const inner: PlannedCommand = {
          instanceId: commandCounter(),
          templateId: template.id,
          type: "action",
          action: template.defaultAction ?? "sail",
        };
        return {
          ...command,
          body: [...body, inner],
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  removeLoopBodyAction(instanceId: string, innerInstanceId: string): void {
    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "loop") {
          return command;
        }
        const body = (command.body ?? []).filter(
          (inner) => inner.instanceId !== innerInstanceId,
        );
        return {
          ...command,
          body,
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  cycleLoopBodyAction(instanceId: string, innerInstanceId: string): void {
    const missionId = this.state.activeMissionId;
    if (!missionId) {
      return;
    }

    const allowedActions = missions[missionId].palette.filter(
      (commandId) => commandLibrary[commandId]?.type === "action",
    );
    if (allowedActions.length === 0) {
      return;
    }

    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== instanceId || command.type !== "loop") {
          return command;
        }
        const body = command.body ?? [];
        return {
          ...command,
          body: body.map((inner) => {
            if (inner.instanceId !== innerInstanceId) {
              return inner;
            }
            const currentIndex = allowedActions.indexOf(inner.action ?? "sail");
            const nextAction =
              allowedActions[(currentIndex + 1) % allowedActions.length] ?? "sail";
            return {
              ...inner,
              templateId: nextAction,
              action: nextAction as ActionCommandId,
            };
          }),
        };
      }),
      activeHint: null,
      lastRun: null,
    }));
  }

  openPicker(type: PickerType, instanceId: string, anchor: PickerAnchor): void {
    this.update((state) => ({
      ...state,
      openPicker: { type, instanceId, anchor },
    }));
  }

  closePicker(): void {
    if (!this.state.openPicker) {
      return;
    }
    this.update((state) => ({
      ...state,
      openPicker: null,
    }));
  }

  selectPickerOption(value: string): void {
    const picker = this.state.openPicker;
    if (!picker) {
      return;
    }

    this.update((state) => ({
      ...state,
      queuedCommands: state.queuedCommands.map((command) => {
        if (command.instanceId !== picker.instanceId || command.type !== "condition") {
          return command;
        }
        if (picker.type === "ifCondition") {
          return { ...command, condition: value as ConditionKind };
        }
        return { ...command, thenAction: value as ActionCommandId };
      }),
      openPicker: null,
      activeHint: null,
      lastRun: null,
    }));
  }

  /**
   * Press Run. Either transitions into the predict beat (most missions) or
   * straight into playback (tutorial, or when the player has opted out).
   */
  runActiveMission(): void {
    const missionId = this.state.activeMissionId;
    if (!missionId || this.state.queuedCommands.length === 0) {
      return;
    }

    if (shouldPredictForMission(missionId, this.state.profile)) {
      this.update((state) => ({
        ...state,
        missionPhase: "predicting",
        activeHint: null,
        lastRun: null,
        predictedEndPosition: null,
        lastPredictionCorrect: null,
      }));
      return;
    }

    this.executeRun();
  }

  /**
   * Predict-mode action: drop a marker on a tile. Replaces any existing mark.
   */
  setPrediction(position: Position): void {
    if (this.state.missionPhase !== "predicting") {
      return;
    }
    this.update((state) => ({
      ...state,
      predictedEndPosition: { x: position.x, y: position.y },
    }));
  }

  /**
   * Commit the prediction and kick off playback. No-op if there's no marker.
   */
  confirmPrediction(): void {
    if (this.state.missionPhase !== "predicting") {
      return;
    }
    if (!this.state.predictedEndPosition) {
      return;
    }
    this.executeRun();
  }

  /**
   * Internal: actually call the engine, bump attempt counts, and score any
   * prediction. Used by both the predict-flow and the skip-prediction path.
   */
  private executeRun(): void {
    const missionId = this.state.activeMissionId;
    if (!missionId || this.state.queuedCommands.length === 0) {
      return;
    }

    const result = runMission(
      missions[missionId],
      cloneQueuedCommands(this.state.queuedCommands),
      this.state.profile,
    );

    const predicted = this.state.predictedEndPosition;
    const lastPredictionCorrect = computePredictionCorrect(predicted, result);

    const profile: PlayerProfile = {
      ...this.state.profile,
      attemptCounts: {
        ...this.state.profile.attemptCounts,
        [missionId]: (this.state.profile.attemptCounts[missionId] ?? 0) + 1,
      },
    };
    this.persistProfile(profile);

    this.update((state) => ({
      ...state,
      profile,
      missionPhase: "running",
      lastRun: result,
      activeHint: null,
      playbackIndex: 0,
      openPicker: null,
      lastPredictionCorrect,
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

  toggleMuted(): void {
    const profile: PlayerProfile = {
      ...this.state.profile,
      settings: {
        ...this.state.profile.settings,
        muted: !this.state.profile.settings.muted,
      },
    };
    this.persistProfile(profile);

    this.update((state) => ({
      ...state,
      profile,
    }));
  }

  toggleSkipPrediction(): void {
    const profile: PlayerProfile = {
      ...this.state.profile,
      settings: {
        ...this.state.profile.settings,
        skipPrediction: !this.state.profile.settings.skipPrediction,
      },
    };
    this.persistProfile(profile);

    this.update((state) => ({
      ...state,
      profile,
    }));
  }

  toggleAlwaysShowSuggested(): void {
    const profile: PlayerProfile = {
      ...this.state.profile,
      settings: {
        ...this.state.profile.settings,
        alwaysShowSuggested: !this.state.profile.settings.alwaysShowSuggested,
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
