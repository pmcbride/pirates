import type {
  CommandBlock,
  CrewMate,
  FruitPower,
  MissionDefinition,
  MissionNode,
  PlannedCommand,
} from "./types";

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

export const commandLibrary: Record<string, CommandBlock> = {
  sail: {
    id: "sail",
    type: "action",
    label: "Sail",
    shortLabel: "Sail",
    accent: "blue",
    description: "Move one wave forward.",
    defaultAction: "sail",
  },
  "turn-left": {
    id: "turn-left",
    type: "action",
    label: "Turn Left",
    shortLabel: "Left",
    accent: "teal",
    description: "Swing the bow to port.",
    defaultAction: "turn-left",
  },
  "turn-right": {
    id: "turn-right",
    type: "action",
    label: "Turn Right",
    shortLabel: "Right",
    accent: "teal",
    description: "Swing the bow to starboard.",
    defaultAction: "turn-right",
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
    description: "Splash the Marine in front of you.",
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
    description: "Invite a new Straw Hat aboard.",
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
    defaultAction: "sail",
    actionOptions: ["sail", "fire", "collect", "talk"],
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
    name: "Zoro",
    title: "Swordsman",
    description: "Adds a sparkly hint whenever the crew bumps into trouble.",
    passiveType: "hint",
  },
  nami: {
    id: "nami",
    name: "Nami",
    title: "Navigator",
    description: "Finds one extra berry every time a voyage is cleared.",
    passiveType: "gold",
  },
};

export const fruitPowers: Record<string, FruitPower> = {
  gumgum: {
    id: "gumgum",
    name: "Gum-Gum Fruit",
    title: "Stretchy Strike",
    description: "Fire reaches two waves ahead.",
    modifier: "extraFireRange",
  },
};

export const missionNodes: MissionNode[] = [
  {
    id: "tutorial-cove",
    missionId: "tutorial-cove",
    label: "Foosha Cove",
    sea: "Starter Cove",
    x: 12,
    y: 78,
    difficulty: "cove",
    preview: "Hoist the sail and grab the first chest.",
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
    label: "Shells Town",
    sea: "East Blue",
    x: 30,
    y: 64,
    difficulty: "breeze",
    preview: "Splash a Marine skiff and bring Zoro aboard.",
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
    id: "current-crescent",
    missionId: "current-crescent",
    label: "Reverse Mountain",
    sea: "Grand Line entry",
    x: 51,
    y: 48,
    difficulty: "breeze",
    preview: "Surf a long current using a Repeat plan.",
    rewards: {
      berries: 140,
      bounty: 0,
      stars: 2,
      unlockCommandIds: ["repeat"],
    },
    unlockMissionIds: ["spark-shoals"],
  },
  {
    id: "coral-lookout",
    missionId: "coral-lookout",
    label: "Skypiea Lookout",
    sea: "Sky Island",
    x: 71,
    y: 36,
    difficulty: "brave",
    preview: "Teach the crew to react with If-then plans.",
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
    label: "Raftel",
    sea: "Final Voyage",
    x: 87,
    y: 22,
    difficulty: "captain",
    preview: "Mix Repeat and If to reach the One Piece.",
    rewards: {
      berries: 240,
      bounty: 5_000_000,
      stars: 3,
      crewId: "nami",
      unlockCommandIds: [],
    },
    unlockMissionIds: ["coral-lookout"],
  },
];

export const missions: Record<string, MissionDefinition> = {
  "tutorial-cove": {
    id: "tutorial-cove",
    nodeId: "tutorial-cove",
    label: "Foosha Cove",
    sea: "Starter Cove",
    briefing: "Line up a sailing plan and scoop the first chest.",
    tutorial: "Try Sail, Sail, Sail, Collect, Sail, Sail.",
    width: 6,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 5, y: 1 },
    objective: {
      primary: "Collect the chest, then sail to the lighthouse.",
      short: "Collect chest, then reach the lighthouse.",
    },
    palette: ["sail", "collect"],
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
        label: "Chest",
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("cove-1", "sail", { action: "sail" }),
      makeCommand("cove-2", "sail", { action: "sail" }),
      makeCommand("cove-3", "sail", { action: "sail" }),
      makeCommand("cove-4", "collect", { action: "collect" }),
      makeCommand("cove-5", "sail", { action: "sail" }),
      makeCommand("cove-6", "sail", { action: "sail" }),
    ],
  },
  "spark-shoals": {
    id: "spark-shoals",
    nodeId: "spark-shoals",
    label: "Shells Town",
    sea: "East Blue",
    briefing: "A Marine skiff blocks the gold lane. Fire first, then sail.",
    tutorial: "If a Marine is ahead, Fire before you Sail.",
    width: 7,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 6, y: 1 },
    objective: {
      primary: "Splash the Marine, grab the chest, dock at the bay.",
      short: "Fire, collect, then reach the dock.",
    },
    palette: ["fire", "sail", "collect"],
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
        label: "Marine",
        active: true,
      },
      {
        id: "spark-chest",
        kind: "treasure",
        position: { x: 4, y: 1 },
        label: "Sun Chest",
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("spark-1", "fire", { action: "fire" }),
      makeCommand("spark-2", "sail", { action: "sail" }),
      makeCommand("spark-3", "sail", { action: "sail" }),
      makeCommand("spark-4", "sail", { action: "sail" }),
      makeCommand("spark-5", "sail", { action: "sail" }),
      makeCommand("spark-6", "collect", { action: "collect" }),
      makeCommand("spark-7", "sail", { action: "sail" }),
      makeCommand("spark-8", "sail", { action: "sail" }),
    ],
  },
  "current-crescent": {
    id: "current-crescent",
    nodeId: "current-crescent",
    label: "Reverse Mountain",
    sea: "Grand Line entry",
    briefing: "The current shoots into the Grand Line. Use Repeat to ride it.",
    tutorial: "Try Repeat Sail x3, Collect, Repeat Sail x3.",
    width: 8,
    height: 5,
    start: {
      position: { x: 0, y: 2 },
      facing: "east",
    },
    goal: { x: 7, y: 2 },
    objective: {
      primary: "Repeat Sail to ride the current, then collect the chest.",
      short: "Repeat Sail, Collect, Repeat Sail.",
    },
    palette: ["sail", "collect", "repeat"],
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
        label: "Moon Chest",
        active: true,
      },
      {
        id: "current-wave-1",
        kind: "current",
        position: { x: 2, y: 2 },
        label: "Current",
        active: true,
      },
      {
        id: "current-wave-2",
        kind: "current",
        position: { x: 3, y: 2 },
        label: "Current",
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("current-1", "repeat", {
        count: 3,
        action: "sail",
      }),
      makeCommand("current-2", "sail", { action: "sail" }),
      makeCommand("current-3", "collect", { action: "collect" }),
      makeCommand("current-4", "repeat", {
        count: 3,
        action: "sail",
      }),
    ],
  },
  "coral-lookout": {
    id: "coral-lookout",
    nodeId: "coral-lookout",
    label: "Skypiea Lookout",
    sea: "Sky Island",
    briefing: "Train the crew to react when danger pops up in front.",
    tutorial: "Use If Enemy then Fire before sailing the lookout lane.",
    width: 8,
    height: 3,
    start: {
      position: { x: 0, y: 1 },
      facing: "east",
    },
    goal: { x: 7, y: 1 },
    objective: {
      primary: "React with If Enemy, then grab the sky treasure.",
      short: "If Enemy Fire, Collect, then dock.",
    },
    palette: ["if", "fire", "sail", "collect"],
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
        label: "Sky Marine",
        active: true,
      },
      {
        id: "coral-chest",
        kind: "treasure",
        position: { x: 5, y: 1 },
        label: "Sky Chest",
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("coral-1", "if", {
        condition: "enemyAhead",
        thenAction: "fire",
      }),
      makeCommand("coral-2", "sail", { action: "sail" }),
      makeCommand("coral-3", "sail", { action: "sail" }),
      makeCommand("coral-4", "sail", { action: "sail" }),
      makeCommand("coral-5", "sail", { action: "sail" }),
      makeCommand("coral-6", "sail", { action: "sail" }),
      makeCommand("coral-7", "collect", { action: "collect" }),
      makeCommand("coral-8", "sail", { action: "sail" }),
      makeCommand("coral-9", "sail", { action: "sail" }),
    ],
  },
  "treasure-isle": {
    id: "treasure-isle",
    nodeId: "treasure-isle",
    label: "Raftel",
    sea: "Final Voyage",
    briefing: "The last voyage needs smart reactions and a long push.",
    tutorial: "Dodge the reef, Fire the boss, Talk to the guide.",
    width: 10,
    height: 5,
    start: {
      position: { x: 0, y: 3 },
      facing: "east",
    },
    goal: { x: 9, y: 2 },
    objective: {
      primary: "Dodge the reef, splash the boss, recruit the guide, reach the treasure.",
      short: "If Obstacle, Repeat Sail, If Enemy, Talk, then finish.",
    },
    palette: ["sail", "dodge", "fire", "talk", "repeat", "if"],
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
        label: "Reef",
        active: true,
      },
      {
        id: "isle-boss",
        kind: "enemy",
        position: { x: 7, y: 2 },
        label: "Boss",
        active: true,
      },
      {
        id: "isle-guide",
        kind: "crew",
        position: { x: 8, y: 2 },
        label: "Guide",
        active: true,
      },
    ],
    suggestedQueue: [
      makeCommand("isle-1", "sail", { action: "sail" }),
      makeCommand("isle-2", "if", {
        condition: "obstacleAhead",
        thenAction: "dodge",
      }),
      makeCommand("isle-3", "repeat", {
        count: 2,
        action: "sail",
        body: [
          makeCommand("isle-3a", "sail", { action: "sail" }),
          makeCommand("isle-3b", "sail", { action: "sail" }),
        ],
      }),
      makeCommand("isle-4", "sail", { action: "sail" }),
      makeCommand("isle-5", "if", {
        condition: "enemyAhead",
        thenAction: "fire",
      }),
      makeCommand("isle-6", "sail", { action: "sail" }),
      makeCommand("isle-7", "sail", { action: "sail" }),
      makeCommand("isle-8", "talk", { action: "talk" }),
      makeCommand("isle-9", "sail", { action: "sail" }),
    ],
  },
};

export const orderedMissionIds = missionNodes.map((node) => node.missionId);

export const bountyRank = (bounty: number): string => {
  if (bounty >= 100_000_000) return "Yonko-class";
  if (bounty >= 50_000_000) return "Grand Line Captain";
  if (bounty >= 10_000_000) return "East Blue Champion";
  if (bounty > 0) return "Wanted Rookie";
  return "Rookie Pirate";
};

export const formatBerries = (amount: number): string =>
  `${amount.toLocaleString("en-US")} ฿`;

export const formatBounty = (amount: number): string =>
  amount >= 1_000_000
    ? `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M ฿`
    : `${amount.toLocaleString("en-US")} ฿`;
