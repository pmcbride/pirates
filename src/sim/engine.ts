import { missions } from "./content";
import type {
  ActionCommandId,
  ConditionKind,
  HintResult,
  MissionDefinition,
  MissionRunResult,
  MissionState,
  MissionTile,
  PlannedCommand,
  PlayerProfile,
  Position,
  RewardBundle,
  RunEvent,
  RunStep,
} from "./types";

const leftTurnMap = {
  north: "west",
  west: "south",
  south: "east",
  east: "north",
} as const;

const rightTurnMap = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
} as const;

const deltaByFacing = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
} as const;

const clonePosition = (position: Position): Position => ({ ...position });

const cloneTiles = (tiles: MissionTile[]): MissionTile[] =>
  tiles.map((tile) => ({
    ...tile,
    position: clonePosition(tile.position),
  }));

const cloneReward = (reward: RewardBundle): RewardBundle => ({
  ...reward,
  unlockCommandIds: [...reward.unlockCommandIds],
});

const composeLogLine = (
  mission: MissionDefinition,
  state: MissionState,
): string => {
  const enemyCount = state.defeatedEnemyIds.length;
  const treasureCount = mission.tiles.filter(
    (tile) =>
      tile.kind === "treasure" &&
      !state.tiles.find((current) => current.id === tile.id && current.active),
  ).length;
  const recruited = mission.tiles.some(
    (tile) =>
      tile.kind === "crew" &&
      !state.tiles.find((current) => current.id === tile.id && current.active),
  );

  const parts: string[] = [`Cleared ${mission.label}`];
  if (enemyCount > 0) {
    parts.push(`splashed ${enemyCount} Marine${enemyCount === 1 ? "" : "s"}`);
  }
  if (treasureCount > 0) {
    parts.push(`hauled ${treasureCount} chest${treasureCount === 1 ? "" : "s"}`);
  }
  if (recruited) {
    parts.push("a new Straw Hat joined the crew");
  }
  return `${parts.join(", ")}.`;
};

const cloneShip = (ship: MissionState["ship"]): MissionState["ship"] => ({
  facing: ship.facing,
  position: clonePosition(ship.position),
});

export const cloneQueuedCommands = (
  commands: PlannedCommand[],
): PlannedCommand[] => commands.map((command) => ({ ...command }));

export const createMissionState = (
  mission: MissionDefinition,
  queuedCommands: PlannedCommand[],
): MissionState => ({
  missionId: mission.id,
  board: {
    width: mission.width,
    height: mission.height,
  },
  ship: {
    position: clonePosition(mission.start.position),
    facing: mission.start.facing,
  },
  tiles: cloneTiles(mission.tiles),
  queuedCommands: cloneQueuedCommands(queuedCommands),
  currentBeat: 0,
  status: "planning",
  objective: mission.objective,
  collectedBerries: 0,
  defeatedEnemyIds: [],
});

const positionsEqual = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const isInsideBoard = (
  mission: MissionDefinition,
  position: Position,
): boolean =>
  position.x >= 0 &&
  position.x < mission.width &&
  position.y >= 0 &&
  position.y < mission.height;

const positionAhead = (
  ship: MissionState["ship"],
  distance = 1,
): Position => {
  const delta = deltaByFacing[ship.facing];

  return {
    x: ship.position.x + delta.x * distance,
    y: ship.position.y + delta.y * distance,
  };
};

const activeTileAt = (
  tiles: MissionTile[],
  position: Position,
  kinds?: MissionTile["kind"][],
): MissionTile | undefined =>
  tiles.find(
    (tile) =>
      tile.active &&
      positionsEqual(tile.position, position) &&
      (!kinds || kinds.includes(tile.kind)),
  );

const deactivateTile = (tiles: MissionTile[], tileId: string): void => {
  const tile = tiles.find((item) => item.id === tileId);
  if (tile) {
    tile.active = false;
  }
};

const activeTileById = (tiles: MissionTile[], tileId: string): MissionTile | undefined =>
  tiles.find((tile) => tile.id === tileId && tile.active);

const findEnemyAhead = (
  state: MissionState,
  range: number,
): MissionTile | undefined => {
  for (let distance = 1; distance <= range; distance += 1) {
    const tile = activeTileAt(state.tiles, positionAhead(state.ship, distance), [
      "enemy",
    ]);
    if (tile) {
      return tile;
    }
  }

  return undefined;
};

const evaluateCondition = (
  state: MissionState,
  condition: ConditionKind,
  profile: PlayerProfile,
): boolean => {
  switch (condition) {
    case "enemyAhead":
      return Boolean(findEnemyAhead(state, fireRange(profile)));
    case "obstacleAhead":
      return Boolean(
        activeTileAt(state.tiles, positionAhead(state.ship, 1), ["obstacle"]),
      );
    case "treasureHere":
      return Boolean(
        activeTileAt(state.tiles, state.ship.position, ["treasure"]),
      );
    case "crewHere":
      return Boolean(activeTileAt(state.tiles, state.ship.position, ["crew"]));
  }
};

const fireRange = (profile: PlayerProfile): number =>
  profile.fruitPowers.includes("gumgum") ? 2 : 1;

const goalReached = (
  mission: MissionDefinition,
  state: MissionState,
): boolean => positionsEqual(mission.goal, state.ship.position);

const remainingRequiredTiles = (
  mission: MissionDefinition,
  state: MissionState,
): MissionTile[] =>
  mission.requiredTileIds
    .map((tileId) => activeTileById(state.tiles, tileId))
    .filter((tile): tile is MissionTile => Boolean(tile));

const hintPrefix = (profile: PlayerProfile): string =>
  profile.crewRoster.includes("zoro") ? "Zoro points with a sparkle. " : "";

const makeHint = (
  profile: PlayerProfile,
  reason: string,
  suggestion: string,
  retryFromStep: number,
  focusTemplateId: string | undefined,
  highlightPositions: Position[],
): HintResult => ({
  reason,
  suggestion: `${hintPrefix(profile)}${suggestion}`,
  focusTemplateId,
  highlightPositions,
  retryFromStep,
});

const findDodgeTarget = (
  mission: MissionDefinition,
  state: MissionState,
): Position | null => {
  const vertical =
    state.ship.facing === "east" || state.ship.facing === "west";

  const candidates = vertical
    ? [
        { x: state.ship.position.x, y: state.ship.position.y - 1 },
        { x: state.ship.position.x, y: state.ship.position.y + 1 },
      ]
    : [
        { x: state.ship.position.x + 1, y: state.ship.position.y },
        { x: state.ship.position.x - 1, y: state.ship.position.y },
      ];

  const ordered = [...candidates].sort(
    (left, right) =>
      Math.abs(left.y - mission.goal.y) +
      Math.abs(left.x - mission.goal.x) -
      (Math.abs(right.y - mission.goal.y) + Math.abs(right.x - mission.goal.x)),
  );

  return (
    ordered.find(
      (candidate) =>
        isInsideBoard(mission, candidate) &&
        !activeTileAt(state.tiles, candidate, ["enemy", "obstacle"]),
    ) ?? null
  );
};

const snapshotStep = (
  state: MissionState,
  index: number,
  commandId: string,
  title: string,
  message: string,
  status: RunStep["status"],
  events: RunEvent[],
): RunStep => ({
  index,
  commandId,
  title,
  message,
  status,
  ship: cloneShip(state.ship),
  tiles: cloneTiles(state.tiles),
  events,
});

const rewardForMission = (
  mission: MissionDefinition,
  state: MissionState,
  profile: PlayerProfile,
): RewardBundle => {
  const reward = cloneReward(mission.reward);

  if (profile.crewRoster.includes("nami")) {
    reward.berries += 1;
  }

  reward.bounty += state.defeatedEnemyIds.length * 1_000_000;
  reward.logLine = composeLogLine(mission, state);

  return reward;
};

export const runMission = (
  mission: MissionDefinition,
  queuedCommands: PlannedCommand[],
  profile: PlayerProfile,
): MissionRunResult => {
  const state = createMissionState(mission, queuedCommands);
  state.status = "running";

  const steps: RunStep[] = [];
  let stepIndex = 0;
  let failedHint: HintResult | null = null;

  const pushStep = (
    commandId: string,
    title: string,
    message: string,
    status: RunStep["status"],
    events: RunEvent[],
  ): void => {
    steps.push(snapshotStep(state, stepIndex, commandId, title, message, status, events));
    state.currentBeat = stepIndex;
    stepIndex += 1;
  };

  const failRun = (
    commandId: string,
    title: string,
    message: string,
    focusTemplateId: string | undefined,
    highlightPositions: Position[],
  ): MissionRunResult => {
    // Sandbox missions never truly fail. Bounce the ship back to start with a
    // soft "splash" beat, mark the run successful (so no hint banner), and let
    // the player keep playing. No reward is awarded — store.finishPlayback gates
    // on mission.sandbox to skip persistence.
    if (mission.sandbox) {
      state.ship.position = clonePosition(mission.start.position);
      state.ship.facing = mission.start.facing;
      pushStep(commandId, "Splash!", "Splash! The ship bounces back to the dock.", "running", [
        { kind: "move", text: "Splash! Try a different plan.", positions: highlightPositions },
      ]);
      state.status = "success";
      return {
        success: true,
        steps,
        finalState: {
          ...state,
          tiles: cloneTiles(state.tiles),
          ship: cloneShip(state.ship),
        },
      };
    }

    state.status = "failed";
    failedHint = makeHint(
      profile,
      title,
      message,
      Math.max(stepIndex - 1, 0),
      focusTemplateId,
      highlightPositions,
    );
    pushStep(commandId, title, message, "failed", [
      { kind: "fail", text: message, positions: highlightPositions },
    ]);

    return {
      success: false,
      steps,
      finalState: {
        ...state,
        tiles: cloneTiles(state.tiles),
        ship: cloneShip(state.ship),
      },
      hint: failedHint,
    };
  };

  const maybeFinishAtGoal = (
    commandId: string,
    title: string,
  ): MissionRunResult | null => {
    if (!goalReached(mission, state)) {
      return null;
    }

    const remaining = remainingRequiredTiles(mission, state);
    if (remaining.length > 0) {
      const [tile] = remaining;
      const suggestion =
        tile.kind === "treasure"
          ? "Collect the glowing chest before docking."
          : "Talk to the waiting friend before finishing the trip.";

      return failRun(
        commandId,
        "Not done yet",
        suggestion,
        tile.kind === "treasure" ? "collect" : "talk",
        [tile.position],
      );
    }

    state.status = "success";
    const reward = rewardForMission(mission, state, profile);

    pushStep(commandId, title, "The crew reaches the treasure marker.", "success", [
      { kind: "goal", text: "Goal reached.", positions: [clonePosition(mission.goal)] },
      {
        kind: "reward",
        text: `Earn ${reward.berries} berries and ${reward.stars} star${reward.stars === 1 ? "" : "s"}.`,
      },
    ]);

    return {
      success: true,
      steps,
      finalState: {
        ...state,
        tiles: cloneTiles(state.tiles),
        ship: cloneShip(state.ship),
      },
      reward,
    };
  };

  const applyAction = (
    commandId: string,
    title: string,
    action: ActionCommandId,
  ): MissionRunResult | null => {
    switch (action) {
      case "sail": {
        const next = positionAhead(state.ship, 1);
        if (!isInsideBoard(mission, next)) {
          return failRun(
            commandId,
            "The sea edge is too close",
            "Turn the ship before sailing beyond the map.",
            "turn-right",
            [state.ship.position],
          );
        }

        state.ship.position = next;
        const collision = activeTileAt(state.tiles, next, ["enemy", "obstacle"]);

        if (collision?.kind === "enemy") {
          return failRun(
            commandId,
            "An enemy was still in the lane",
            "Splash the skiff with Fire before sailing into it.",
            "fire",
            [collision.position],
          );
        }

        if (collision?.kind === "obstacle") {
          return failRun(
            commandId,
            "The ship bumped a reef",
            "Use Dodge when an obstacle is directly ahead.",
            "dodge",
            [collision.position],
          );
        }

        pushStep(commandId, title, "The ship glides one tile forward.", "running", [
          { kind: "move", text: "Sailed ahead.", positions: [clonePosition(next)] },
        ]);
        return maybeFinishAtGoal(commandId, title);
      }
      case "turn-left":
      case "turn-right": {
        state.ship.facing =
          action === "turn-left"
            ? leftTurnMap[state.ship.facing]
            : rightTurnMap[state.ship.facing];

        pushStep(commandId, title, "The bow turns to a new heading.", "running", [
          { kind: "turn", text: "Turned the ship." },
        ]);
        return maybeFinishAtGoal(commandId, title);
      }
      case "dodge": {
        const dodgeTarget = findDodgeTarget(mission, state);
        if (!dodgeTarget) {
          return failRun(
            commandId,
            "No safe lane to dodge into",
            "Try turning the ship or clearing the lane before dodging.",
            "turn-right",
            [state.ship.position],
          );
        }

        state.ship.position = dodgeTarget;
        pushStep(commandId, title, "The crew slips into a safer lane.", "running", [
          { kind: "dodge", text: "Dodged the obstacle.", positions: [clonePosition(dodgeTarget)] },
        ]);
        return maybeFinishAtGoal(commandId, title);
      }
      case "fire": {
        const enemy = findEnemyAhead(state, fireRange(profile));
        if (enemy) {
          deactivateTile(state.tiles, enemy.id);
          state.defeatedEnemyIds.push(enemy.id);
          pushStep(commandId, title, "A splash cannon clears the lane.", "running", [
            { kind: "fire", text: "Marine splashed away.", positions: [enemy.position] },
          ]);
        } else {
          pushStep(commandId, title, "The cannon splashes water, but no foe was there.", "running", [
            { kind: "fire", text: "No enemy ahead." },
          ]);
        }
        return maybeFinishAtGoal(commandId, title);
      }
      case "collect": {
        const treasure = activeTileAt(state.tiles, state.ship.position, ["treasure"]);
        if (treasure) {
          deactivateTile(state.tiles, treasure.id);
          state.collectedBerries += 30;
          pushStep(commandId, title, "Treasure aboard. The crew cheers.", "running", [
            { kind: "collect", text: "Collected treasure.", positions: [treasure.position] },
          ]);
        } else {
          pushStep(commandId, title, "The crew checks the deck. No treasure here yet.", "running", [
            { kind: "collect", text: "No treasure on this tile." },
          ]);
        }
        return maybeFinishAtGoal(commandId, title);
      }
      case "talk": {
        const crewTile = activeTileAt(state.tiles, state.ship.position, ["crew"]);
        if (crewTile) {
          deactivateTile(state.tiles, crewTile.id);
          pushStep(commandId, title, "A new friend joins the crew.", "running", [
            { kind: "talk", text: "Crew mate recruited.", positions: [crewTile.position] },
          ]);
        } else {
          pushStep(commandId, title, "The crew says hello to the wind. Nobody is waiting here.", "running", [
            { kind: "talk", text: "No crew mate here." },
          ]);
        }
        return maybeFinishAtGoal(commandId, title);
      }
    }
  };

  for (const command of queuedCommands) {
    if (command.type === "action") {
      const result = applyAction(
        command.instanceId,
        command.templateId.replace("-", " "),
        command.action ?? "sail",
      );
      if (result) {
        return result;
      }
      continue;
    }

    if (command.type === "loop") {
      const count = command.count ?? 2;
      const action = command.action ?? "sail";

      for (let index = 0; index < count; index += 1) {
        pushStep(
          command.instanceId,
          `Repeat ${index + 1}/${count}`,
          `The crew prepares to ${action} again.`,
          "running",
          [{ kind: "repeat", text: `Repeat ${action}.` }],
        );
        const result = applyAction(
          command.instanceId,
          `Repeat ${index + 1}/${count}`,
          action,
        );
        if (result) {
          return result;
        }
      }
      continue;
    }

    const condition = command.condition ?? "enemyAhead";
    const thenAction = command.thenAction ?? "fire";
    const matches = evaluateCondition(state, condition, profile);
    if (!matches) {
      pushStep(
        command.instanceId,
        `If ${condition}`,
        "The sea stays calm, so the crew waits.",
        "running",
        [{ kind: "condition", text: "Condition skipped." }],
      );
      continue;
    }

    pushStep(
      command.instanceId,
      `If ${condition}`,
      `The condition is true, so the crew will ${thenAction}.`,
      "running",
      [{ kind: "condition", text: `Condition matched ${condition}.` }],
    );
    const result = applyAction(command.instanceId, `If ${condition}`, thenAction);
    if (result) {
      return result;
    }
  }

  if (mission.sandbox) {
    // Sandbox: queue ran out, no failure. Mark success without a reward so the
    // store can finish playback and return to free-play planning.
    state.status = "success";
    pushStep("finish", "Free play", "End of plan. Try another route!", "success", [
      { kind: "goal", text: "Free play complete." },
    ]);
    return {
      success: true,
      steps,
      finalState: {
        ...state,
        tiles: cloneTiles(state.tiles),
        ship: cloneShip(state.ship),
      },
    };
  }

  if (!goalReached(mission, state)) {
    return failRun(
      queuedCommands.at(-1)?.instanceId ?? "finish",
      "The lighthouse is still ahead",
      "Add more Sail blocks or a Repeat Sail to reach the goal.",
      "sail",
      [clonePosition(mission.goal)],
    );
  }

  const remaining = remainingRequiredTiles(mission, state);
  if (remaining.length > 0) {
    const [tile] = remaining;
    return failRun(
      queuedCommands.at(-1)?.instanceId ?? "finish",
      "One job is still waiting",
      tile.kind === "crew"
        ? "Talk to the island guide before finishing the voyage."
        : "Collect the treasure before heading to the dock.",
      tile.kind === "crew" ? "talk" : "collect",
      [tile.position],
    );
  }

  state.status = "success";
  const reward = rewardForMission(mission, state, profile);
  pushStep("finish", "Mission clear", "The whole route is complete.", "success", [
    { kind: "goal", text: "Route complete." },
    {
      kind: "reward",
      text: `Earn ${reward.berries} berries and ${reward.stars} stars.`,
    },
  ]);

  return {
    success: true,
    steps,
    finalState: {
      ...state,
      tiles: cloneTiles(state.tiles),
      ship: cloneShip(state.ship),
    },
    reward,
  };
};

export const getMission = (missionId: string): MissionDefinition => missions[missionId];
