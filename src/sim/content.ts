import type {
  CommandBlock,
  CrewMate,
  FruitPower,
  MissionDefinition,
  MissionNode,
  PlannedCommand,
} from "./types";

// content.ts is the *structural* content layer — mission boards, tile
// positions, palettes, suggested queues, rewards, and the catalog of crew
// and fruit ids. All player-facing strings (mission labels, sea names, crew
// names, fruit names, tile labels, currency formatting, bounty ranks) live in
// the Theme layer at src/themes/*. See DESIGN.md §7 for the IP/theming note.

const makeCommand = (
  instanceId: string,
  templateId: string,
  partial: Partial<PlannedCommand> = {},
): PlannedCommand => ({
  instanceId,
  templateId,
  type:
    templateId === "repeat"
      ? "loop"
      : templateId === "if"
        ? "condition"
        : "action",
  ...partial,
});

// Command block labels/descriptions are intentionally NOT theme-driven for
// now — they're code-level concepts (Up/Down/Left/Right, Fire, Repeat, If)
// that should read the same in any theme. If a future theme wants to recolor
// "Fire" -> "Splash" we can promote these strings into the Theme interface.
//
// As of the absolute-direction model the four arrow blocks replace the
// older `sail` + `turn-left`/`turn-right` triad — no mental rotation
// required, since each arrow moves one tile in the matching compass
// direction regardless of which way the ship was facing.
export const commandLibrary: Record<string, CommandBlock> = {
  "move-up": {
    id: "move-up",
    type: "action",
    label: "Up",
    shortLabel: "Up",
    accent: "blue",
    description: "Move one tile up.",
    defaultAction: "move-up",
  },
  "move-down": {
    id: "move-down",
    type: "action",
    label: "Down",
    shortLabel: "Down",
    accent: "blue",
    description: "Move one tile down.",
    defaultAction: "move-down",
  },
  "move-left": {
    id: "move-left",
    type: "action",
    label: "Left",
    shortLabel: "Left",
    accent: "blue",
    description: "Move one tile left.",
    defaultAction: "move-left",
  },
  "move-right": {
    id: "move-right",
    type: "action",
    label: "Right",
    shortLabel: "Right",
    accent: "blue",
    description: "Move one tile right.",
    defaultAction: "move-right",
  },
  dodge: {
    id: "dodge",
    type: "action",
    label: "Dodge",
    shortLabel: "Dodge",
    accent: "coral",
    description: "Slide into a safe lane.",
    defaultAction: "dodge",
  },
  fire: {
    id: "fire",
    type: "action",
    label: "Fire",
    shortLabel: "Fire",
    accent: "gold",
    description: "Splash the foe in front of you.",
    defaultAction: "fire",
  },
  collect: {
    id: "collect",
    type: "action",
    label: "Collect",
    shortLabel: "Collect",
    accent: "mint",
    description: "Scoop the treasure on this wave.",
    defaultAction: "collect",
  },
  talk: {
    id: "talk",
    type: "action",
    label: "Talk",
    shortLabel: "Talk",
    accent: "plum",
    description: "Invite a new shipmate aboard.",
    defaultAction: "talk",
  },
  repeat: {
    id: "repeat",
    type: "loop",
    label: "Repeat",
    shortLabel: "Repeat",
    accent: "sunset",
    description: "Repeat one or two moves two or three times.",
    defaultCount: 2,
    defaultAction: "move-right",
    actionOptions: ["move-right", "move-left", "move-up", "move-down", "fire", "collect", "talk"],
    bodyMaxLength: 2,
  },
  if: {
    id: "if",
    type: "condition",
    label: "If",
    shortLabel: "If",
    accent: "storm",
    description: "Watch the sea, then do the matching move.",
    defaultCondition: "enemyAhead",
    defaultAction: "fire",
    conditionOptions: [
      "enemyAhead",
      "obstacleAhead",
      "treasureHere",
      "crewHere",
    ],
    actionOptions: ["fire", "dodge", "collect", "talk"],
  },
};

export const crewMates: Record<string, CrewMate> = {
  zoro: {
    id: "zoro",
    passiveType: "hint",
  },
  nami: {
    id: "nami",
    passiveType: "gold",
  },
};

export const fruitPowers: Record<string, FruitPower> = {
  gumgum: {
    id: "gumgum",
    modifier: "extraFireRange",
  },
};

export const missionNodes: MissionNode[] = [
  {
    id: "tutorial-cove",
    missionId: "tutorial-cove",
    x: 12,
    y: 78,
    difficulty: "cove",
    rewards: {
      berries: 60,
      bounty: 0,
      stars: 1,
      unlockCommandIds: ["fire"],
    },
    unlockMissionIds: [],
  },
  {
    id: "spark-shoals",
    missionId: "spark-shoals",
    x: 30,
    y: 64,
    difficulty: "breeze",
    rewards: {
      berries: 100,
      bounty: 1_000_000,
      stars: 2,
      crewId: "zoro",
      unlockCommandIds: ["dodge"],
    },
    unlockMissionIds: ["tutorial-cove"],
  },
  {
    id: "windrise-cove",
    missionId: "windrise-cove",
    x: 37,
    y: 58,
    difficulty: "breeze",
    rewards: {
      berries: 110,
      bounty: 1_000_000,
      stars: 2,
      unlockCommandIds: [],
    },
    unlockMissionIds: ["spark-shoals"],
  },
  {
    id: "barrel-bay",
    missionId: "barrel-bay",
    x: 44,
    y: 52,
    difficulty: "breeze",
    rewards: {
      berries: 130,
      bounty: 2_000_000,
      stars: 2,
      unlockCommandIds: [],
    },
    unlockMissionIds: ["windrise-cove"],
  },
  {
    id: "harbor-bend",
    missionId: "harbor-bend",
    x: 47,
    y: 50,
    difficulty: "breeze",
    rewards: {
      berries: 120,
      bounty: 1_000_000,
      stars: 2,
      unlockCommandIds: ["move-up", "move-down"],
    },
    unlockMissionIds: ["barrel-bay"],
  },
  {
    id: "current-crescent",
    missionId: "current-crescent",
    x: 51,
    y: 48,
    difficulty: "breeze",
    rewards: {
      berries: 140,
      bounty: 0,
      stars: 2,
      unlockCommandIds: ["repeat"],
    },
    unlockMissionIds: ["harbor-bend"],
  },
  {
    id: "coral-lookout",
    missionId: "coral-lookout",
    x: 71,
    y: 36,
    difficulty: "brave",
    rewards: {
      berries: 180,
      bounty: 2_000_000,
      stars: 3,
      fruitPowerId: "gumgum",
      unlockCommandIds: ["if", "talk"],
    },
    unlockMissionIds: ["current-crescent"],
  },
  {
    id: "treasure-isle",
    missionId: "treasure-isle",
    x: 87,
    y: 22,
    difficulty: "captain",
    rewards: {
      berries: 240,
      bounty: 5_000_000,
      stars: 3,
      crewId: "nami",
      unlockCommandIds: [],
    },
    unlockMissionIds: ["coral-lookout"],
  },
  {
    id: "sandbox-isle",
    missionId: "sandbox-isle",
    x: 15,
    y: 30,
    difficulty: "cove",
    rewards: {
      berries: 0,
      bounty: 0,
      stars: 0,
      unlockCommandIds: [],
    },
    unlockMissionIds: [],
  },
];

export const sandboxNodeId = "sandbox-isle";
export const sandboxMissionId = "sandbox-isle";
export const defaultSandboxPalette: string[] = [
  "move-up",
  "move-down",
  "move-left",
  "move-right",
  "collect",
];

export const missions: Record<string, MissionDefinition> = {
  // Sequencing only. Ship starts at (0,1) facing east. Chest at (3,1),
  // goal at (5,1). Pure straight line — five Rights and a Collect in the
  // middle.
  "tutorial-cove": {
    id: "tutorial-cove",
    nodeId: "tutorial-cove",
    width: 6,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 5, y: 1 },
    palette: ["move-right", "collect"],
    requiredTileIds: ["cove-chest"],
    reward: {
      berries: 60,
      bounty: 0,
      stars: 1,
      unlockCommandIds: ["fire"],
    },
    tiles: [
      {
        id: "cove-chest",
        kind: "treasure",
        position: { x: 3, y: 1 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("cove-1", "move-right", { action: "move-right" }),
      makeCommand("cove-2", "move-right", { action: "move-right" }),
      makeCommand("cove-3", "move-right", { action: "move-right" }),
      makeCommand("cove-4", "collect", { action: "collect" }),
      makeCommand("cove-5", "move-right", { action: "move-right" }),
      makeCommand("cove-6", "move-right", { action: "move-right" }),
    ],
  },
  // Sequencing + Fire. Enemy at (1,1) blocks the lane. Fire splashes one
  // tile in the direction the ship last moved — but on turn 1 the ship is
  // still on its mission.start.facing (east), so the first Fire splashes
  // the Marine sitting one tile to the east before any movement.
  "spark-shoals": {
    id: "spark-shoals",
    nodeId: "spark-shoals",
    width: 7,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 6, y: 1 },
    palette: ["fire", "move-right", "collect"],
    requiredTileIds: ["spark-chest"],
    reward: {
      berries: 100,
      bounty: 1_000_000,
      stars: 2,
      crewId: "zoro",
      unlockCommandIds: ["dodge"],
    },
    tiles: [
      {
        id: "spark-enemy",
        kind: "enemy",
        position: { x: 1, y: 1 },
        active: true,
      },
      {
        id: "spark-chest",
        kind: "treasure",
        position: { x: 4, y: 1 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("spark-1", "fire", { action: "fire" }),
      makeCommand("spark-2", "move-right", { action: "move-right" }),
      makeCommand("spark-3", "move-right", { action: "move-right" }),
      makeCommand("spark-4", "move-right", { action: "move-right" }),
      makeCommand("spark-5", "move-right", { action: "move-right" }),
      makeCommand("spark-6", "collect", { action: "collect" }),
      makeCommand("spark-7", "move-right", { action: "move-right" }),
      makeCommand("spark-8", "move-right", { action: "move-right" }),
    ],
  },
  // Two Marines guard the lane at (2,1) and (4,1). Move one tile to set
  // forward direction, Fire, move, move, Fire, move, move, move to dock.
  "windrise-cove": {
    id: "windrise-cove",
    nodeId: "windrise-cove",
    width: 7,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 6, y: 1 },
    palette: ["fire", "move-right"],
    requiredTileIds: [],
    reward: {
      berries: 110,
      bounty: 1_000_000,
      stars: 2,
      unlockCommandIds: [],
    },
    tiles: [
      {
        id: "windrise-enemy-1",
        kind: "enemy",
        position: { x: 2, y: 1 },
        active: true,
      },
      {
        id: "windrise-enemy-2",
        kind: "enemy",
        position: { x: 4, y: 1 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("windrise-1", "move-right", { action: "move-right" }),
      makeCommand("windrise-2", "fire", { action: "fire" }),
      makeCommand("windrise-3", "move-right", { action: "move-right" }),
      makeCommand("windrise-4", "move-right", { action: "move-right" }),
      makeCommand("windrise-5", "fire", { action: "fire" }),
      makeCommand("windrise-6", "move-right", { action: "move-right" }),
      makeCommand("windrise-7", "move-right", { action: "move-right" }),
      makeCommand("windrise-8", "move-right", { action: "move-right" }),
    ],
  },
  // Sequencing + Collect + Fire + Dodge. Start (0,1). Chest (1,1), enemy
  // (3,1), reef (4,1). Goal (5,0). Right → Collect → Right → Fire → Right
  // (now (3,1)) → Dodge slips up to (3,0) (perpendicular to east-facing) →
  // Right → Right to dock at (5,0).
  "barrel-bay": {
    id: "barrel-bay",
    nodeId: "barrel-bay",
    width: 6,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 5, y: 0 },
    palette: ["move-right", "collect", "fire", "dodge"],
    requiredTileIds: ["barrel-chest"],
    reward: {
      berries: 130,
      bounty: 2_000_000,
      stars: 2,
      unlockCommandIds: [],
    },
    tiles: [
      {
        id: "barrel-chest",
        kind: "treasure",
        position: { x: 1, y: 1 },
        active: true,
      },
      {
        id: "barrel-enemy",
        kind: "enemy",
        position: { x: 3, y: 1 },
        active: true,
      },
      {
        id: "barrel-reef",
        kind: "obstacle",
        position: { x: 4, y: 1 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("barrel-1", "move-right", { action: "move-right" }),
      makeCommand("barrel-2", "collect", { action: "collect" }),
      makeCommand("barrel-3", "move-right", { action: "move-right" }),
      makeCommand("barrel-4", "fire", { action: "fire" }),
      makeCommand("barrel-5", "move-right", { action: "move-right" }),
      makeCommand("barrel-6", "dodge", { action: "dodge" }),
      makeCommand("barrel-7", "move-right", { action: "move-right" }),
      makeCommand("barrel-8", "move-right", { action: "move-right" }),
    ],
  },
  // Practice mission for the two new direction blocks (Up/Down). The chest
  // sits up the bay at (2,0), off the straight east lane. Start (0,1),
  // goal (4,0). Path: Right, Right, Up, Collect, Right, Down... no wait
  // goal is at (4,0). Path: Right (1,1), Right (2,1), Up (2,0), Collect,
  // Right (3,0), Right (4,0) dock.
  "harbor-bend": {
    id: "harbor-bend",
    nodeId: "harbor-bend",
    width: 5,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 4, y: 0 },
    palette: ["move-right", "move-up", "move-down", "collect"],
    requiredTileIds: ["bend-chest"],
    reward: {
      berries: 120,
      bounty: 1_000_000,
      stars: 2,
      unlockCommandIds: ["move-up", "move-down"],
    },
    tiles: [
      {
        id: "bend-chest",
        kind: "treasure",
        position: { x: 2, y: 0 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("bend-1", "move-right", { action: "move-right" }),
      makeCommand("bend-2", "move-right", { action: "move-right" }),
      makeCommand("bend-3", "move-up", { action: "move-up" }),
      makeCommand("bend-4", "collect", { action: "collect" }),
      makeCommand("bend-5", "move-right", { action: "move-right" }),
      makeCommand("bend-6", "move-right", { action: "move-right" }),
    ],
  },
  // Loops! Start (0,2), chest (4,2), goal (7,2). Repeat Right x3 + Right
  // (lands on 4,2) + Collect + Repeat Right x3 = 7 rights total. Note that
  // Repeat with a single-action `action` field still works for old saves;
  // here we use the body-less legacy form for parity with the existing
  // shape.
  "current-crescent": {
    id: "current-crescent",
    nodeId: "current-crescent",
    width: 8,
    height: 5,
    start: {
      position: { x: 0, y: 2 },
      facing: "east",
    },
    goal: { x: 7, y: 2 },
    palette: ["move-right", "collect", "repeat"],
    requiredTileIds: ["current-chest"],
    reward: {
      berries: 140,
      bounty: 0,
      stars: 2,
      unlockCommandIds: ["repeat"],
    },
    tiles: [
      {
        id: "current-chest",
        kind: "treasure",
        position: { x: 4, y: 2 },
        active: true,
      },
      {
        id: "current-wave-1",
        kind: "current",
        position: { x: 2, y: 2 },
        active: true,
      },
      {
        id: "current-wave-2",
        kind: "current",
        position: { x: 3, y: 2 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("current-1", "repeat", {
        count: 3,
        action: "move-right",
      }),
      makeCommand("current-2", "move-right", { action: "move-right" }),
      makeCommand("current-3", "collect", { action: "collect" }),
      makeCommand("current-4", "repeat", {
        count: 3,
        action: "move-right",
      }),
    ],
  },
  // If-then. Enemy at (1,1). Default facing is east, so `If enemy ahead`
  // matches on turn 1 and Fire splashes the Marine. Then 6 Rights, a
  // Collect at (5,1), two more Rights to dock at (7,1).
  "coral-lookout": {
    id: "coral-lookout",
    nodeId: "coral-lookout",
    width: 8,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 7, y: 1 },
    palette: ["if", "fire", "move-right", "collect"],
    requiredTileIds: ["coral-chest"],
    reward: {
      berries: 180,
      bounty: 2_000_000,
      stars: 3,
      fruitPowerId: "gumgum",
      unlockCommandIds: ["if", "talk"],
    },
    tiles: [
      {
        id: "coral-enemy",
        kind: "enemy",
        position: { x: 1, y: 1 },
        active: true,
      },
      {
        id: "coral-chest",
        kind: "treasure",
        position: { x: 5, y: 1 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("coral-1", "if", {
        condition: "enemyAhead",
        thenAction: "fire",
      }),
      makeCommand("coral-2", "move-right", { action: "move-right" }),
      makeCommand("coral-3", "move-right", { action: "move-right" }),
      makeCommand("coral-4", "move-right", { action: "move-right" }),
      makeCommand("coral-5", "move-right", { action: "move-right" }),
      makeCommand("coral-6", "move-right", { action: "move-right" }),
      makeCommand("coral-7", "collect", { action: "collect" }),
      makeCommand("coral-8", "move-right", { action: "move-right" }),
      makeCommand("coral-9", "move-right", { action: "move-right" }),
    ],
  },
  // The final voyage. Start (0,3), reef (2,3), boss enemy (7,2), guide
  // crew (8,2), goal (9,2). Path:
  //   Right (1,3, facing east)
  //   If obstacle ahead -> Dodge (reef at (2,3) ahead, slip up to (1,2))
  //   Repeat 2x [Right, Right] -> (5,2)
  //   Right (6,2)
  //   If enemy ahead -> Fire (boss at (7,2), splashed)
  //   Right (7,2)
  //   Right (8,2)
  //   Talk (recruit guide)
  //   Right (9,2 dock)
  "treasure-isle": {
    id: "treasure-isle",
    nodeId: "treasure-isle",
    width: 10,
    height: 5,
    start: {
      position: { x: 0, y: 3 },
      facing: "east",
    },
    goal: { x: 9, y: 2 },
    palette: ["move-right", "move-up", "move-down", "dodge", "fire", "talk", "repeat", "if"],
    requiredTileIds: ["isle-guide"],
    reward: {
      berries: 240,
      bounty: 5_000_000,
      stars: 3,
      crewId: "nami",
      unlockCommandIds: [],
    },
    tiles: [
      {
        id: "isle-reef",
        kind: "obstacle",
        position: { x: 2, y: 3 },
        active: true,
      },
      {
        id: "isle-boss",
        kind: "enemy",
        position: { x: 7, y: 2 },
        active: true,
      },
      {
        id: "isle-guide",
        kind: "crew",
        position: { x: 8, y: 2 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("isle-1", "move-right", { action: "move-right" }),
      makeCommand("isle-2", "if", {
        condition: "obstacleAhead",
        thenAction: "dodge",
      }),
      makeCommand("isle-3", "repeat", {
        count: 2,
        action: "move-right",
        body: [
          makeCommand("isle-3a", "move-right", { action: "move-right" }),
          makeCommand("isle-3b", "move-right", { action: "move-right" }),
        ],
      }),
      makeCommand("isle-4", "move-right", { action: "move-right" }),
      makeCommand("isle-5", "if", {
        condition: "enemyAhead",
        thenAction: "fire",
      }),
      makeCommand("isle-6", "move-right", { action: "move-right" }),
      makeCommand("isle-7", "move-right", { action: "move-right" }),
      makeCommand("isle-8", "talk", { action: "talk" }),
      makeCommand("isle-9", "move-right", { action: "move-right" }),
    ],
  },
  "sandbox-isle": {
    id: "sandbox-isle",
    nodeId: "sandbox-isle",
    width: 10,
    height: 6,
    start: {
      position: { x: 0, y: 3 },
      facing: "east",
    },
    // Off-board goal — sandbox missions never finish at a goal tile.
    goal: { x: -1, y: -1 },
    palette: [...defaultSandboxPalette],
    requiredTileIds: [],
    sandbox: true,
    reward: {
      berries: 0,
      bounty: 0,
      stars: 0,
      unlockCommandIds: [],
    },
    tiles: [
      {
        id: "sandbox-chest-1",
        kind: "treasure",
        position: { x: 3, y: 1 },
        active: true,
      },
      {
        id: "sandbox-chest-2",
        kind: "treasure",
        position: { x: 6, y: 4 },
        active: true,
      },
      {
        id: "sandbox-chest-3",
        kind: "treasure",
        position: { x: 8, y: 2 },
        active: true,
      },
      {
        id: "sandbox-island-1",
        kind: "obstacle",
        position: { x: 4, y: 3 },
        active: true,
      },
      {
        id: "sandbox-island-2",
        kind: "obstacle",
        position: { x: 7, y: 0 },
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("sandbox-1", "move-right", { action: "move-right" }),
      makeCommand("sandbox-2", "move-right", { action: "move-right" }),
      makeCommand("sandbox-3", "move-right", { action: "move-right" }),
    ],
  },
};

// Sandbox is always-unlocked free play — excluded from the curriculum ordering
// so completion progression (`nextMissionId`) skips over it.
export const orderedMissionIds = missionNodes
  .filter((node) => node.missionId !== sandboxMissionId)
  .map((node) => node.missionId);
