import type { Theme } from "./types";

// Default theme — original pirate world. Child-friendly, shareable, no IP
// collisions. Keep tone gentle: "patrol skiffs", not "pirates we shoot".
export const originalTheme: Theme = {
  meta: {
    id: "original",
    label: "Open Seas",
    description: "An original pirate world — safe for sharing.",
  },
  ship: {
    name: "Sunny Skipper",
  },
  seas: {
    starterCove: "Starter Cove",
    easternReach: "Eastern Reach",
    crescentPass: "Crescent Pass",
    skyReach: "Sky Reach",
    lastVoyage: "Last Voyage",
  },
  missions: {
    "tutorial-cove": {
      label: "Foglight Cove",
      sea: "Starter Cove",
      briefing: "Tap arrows to plot the route, then scoop the first chest.",
      tutorial: "Try Right, Right, Right, Collect, Right, Right.",
      preview: "Tap arrows and grab the first chest.",
      objective: {
        primary: "Collect the chest, then move to the lighthouse.",
        short: "Collect chest, then reach the lighthouse.",
      },
    },
    "spark-shoals": {
      label: "Shellrock Bay",
      sea: "Eastern Reach",
      briefing: "A patrol skiff blocks the gold lane. Splash it first, then move.",
      tutorial: "If a patrol skiff is ahead, Splash before you Move.",
      preview: "Splash a patrol skiff and bring Saber aboard.",
      objective: {
        primary: "Splash the skiff, grab the chest, dock at the bay.",
        short: "Splash, collect, then reach the dock.",
      },
    },
    "windrise-cove": {
      label: "Windrise Cove",
      sea: "Eastern Reach",
      briefing: "Two patrol skiffs guard the cove. Splash one, move through, splash the next.",
      tutorial: "Fire when a skiff is ahead, then Move through the gap.",
      preview: "Two patrol skiffs guard the lane. Move, fire, move, fire.",
      objective: {
        primary: "Splash both patrol skiffs, then dock at the cove.",
        short: "Move, Fire, Move, Fire to the dock.",
      },
    },
    "barrel-bay": {
      label: "Barrel Bay",
      sea: "Eastern Reach",
      briefing: "A chest, a skiff, and a reef line the bay. Use every move you know.",
      tutorial: "Collect the chest, Fire the skiff, Dodge the reef, then dock.",
      preview: "Dodge a reef, splash a skiff, scoop the chest.",
      objective: {
        primary: "Grab the chest, splash the skiff, dodge the reef, and reach the bay.",
        short: "Collect, Fire, Dodge, then dock.",
      },
    },
    "harbor-bend": {
      label: "Harbor Bend",
      sea: "Eastern Reach",
      briefing:
        "The chest sits up the bay, off the straight lane. Tap Up to reach it before docking.",
      tutorial: "Right, Right, Up, Collect, Right, Right.",
      preview: "Tap Up to grab the chest off the main lane.",
      objective: {
        primary:
          "Use Up to reach the side chest, then continue Right to the far buoy.",
        short: "Right, Right, Up, Collect, Right, Right.",
      },
    },
    "sandbox-isle": {
      label: "Free Play Isle",
      sea: "Open Ocean",
      briefing: "An open lagoon. Sail anywhere — no goal, no patrol, no losing.",
      tutorial: "Free play — try any blocks you've unlocked.",
      preview: "An open lagoon. No goal, no skiffs, no failure — just sail.",
      objective: {
        primary: "Free play — sail, scoop play-treasure, try out your moves.",
        short: "Free play. Nothing breaks here.",
      },
    },
    "current-crescent": {
      label: "Crescent Falls",
      sea: "Crescent Pass",
      briefing: "The current shoots into the open sea. Use Repeat to ride it.",
      tutorial: "Try Repeat Right x3, Right, Collect, Repeat Right x3.",
      preview: "Surf a long current using a Repeat plan.",
      objective: {
        primary: "Repeat Right to ride the current, then collect the chest.",
        short: "Repeat Right, Collect, Repeat Right.",
      },
    },
    "coral-lookout": {
      label: "Cloudtop Lookout",
      sea: "Sky Reach",
      briefing: "Train the crew to react when danger pops up in front.",
      tutorial: "Use If Patrol then Splash before moving the lookout lane.",
      preview: "Teach the crew to react with If-then plans.",
      objective: {
        primary: "React with If Patrol, then grab the sky treasure.",
        short: "If Patrol Splash, Collect, then dock.",
      },
    },
    "treasure-isle": {
      label: "Last Isle",
      sea: "Last Voyage",
      briefing: "The last voyage needs smart reactions and a long push.",
      tutorial: "Dodge the reef, Splash the captain, Talk to the guide.",
      preview: "Mix Repeat and If to reach the great treasure.",
      objective: {
        primary:
          "Dodge the reef, splash the captain, recruit the guide, reach the treasure.",
        short: "If Obstacle, Repeat Right, If Patrol, Talk, then finish.",
      },
    },
  },
  tileLabels: {
    "tutorial-cove": {
      "cove-chest": "Chest",
    },
    "spark-shoals": {
      "spark-enemy": "Skiff",
      "spark-chest": "Sun Chest",
    },
    "windrise-cove": {
      "windrise-enemy-1": "Skiff",
      "windrise-enemy-2": "Skiff",
    },
    "barrel-bay": {
      "barrel-chest": "Bay Chest",
      "barrel-enemy": "Skiff",
      "barrel-reef": "Reef",
    },
    "harbor-bend": {
      "bend-chest": "Bay Chest",
    },
    "sandbox-isle": {
      "sandbox-chest-1": "Play Chest",
      "sandbox-chest-2": "Play Chest",
      "sandbox-chest-3": "Play Chest",
      "sandbox-island-1": "Palm Isle",
      "sandbox-island-2": "Palm Isle",
    },
    "current-crescent": {
      "current-chest": "Moon Chest",
      "current-wave-1": "Current",
      "current-wave-2": "Current",
    },
    "coral-lookout": {
      "coral-enemy": "Sky Patrol",
      "coral-chest": "Sky Chest",
    },
    "treasure-isle": {
      "isle-reef": "Reef",
      "isle-boss": "Captain",
      "isle-guide": "Guide",
    },
  },
  crew: {
    zoro: {
      name: "Saber",
      title: "Swordsman",
      description:
        "Adds a sparkly hint whenever the crew bumps into trouble.",
    },
    nami: {
      name: "Compass",
      title: "Navigator",
      description: "Finds one extra coin every time a voyage is cleared.",
    },
  },
  fruits: {
    gumgum: {
      name: "Stretch Fruit",
      title: "Stretchy Strike",
      description: "Splash reaches two waves ahead.",
    },
  },
  currency: {
    symbol: "D",
    nameSingular: "doubloon",
    namePlural: "doubloons",
  },
  bountyRanks: [
    { minBounty: 0, label: "Cabin Hand" },
    { minBounty: 1_000_000, label: "Deckhand" },
    { minBounty: 10_000_000, label: "Skipper" },
    { minBounty: 50_000_000, label: "Captain" },
    { minBounty: 100_000_000, label: "Pirate King" },
  ],
  enemyKind: {
    singular: "patrol skiff",
    plural: "patrol skiffs",
  },
  hintPrefixes: {
    withSparkleCrew: "Saber points with a sparkle. ",
  },
  taglines: {
    titleHeadline: "Set sail for the great treasure.",
    titleSupport:
      "Drag big command stamps to plan a route. Splash skiffs, scoop doubloons, recruit shipmates, and chase strange fruits across the seas.",
    setSailCta: "⛵ Set Sail",
    titlePoster:
      "Queue bold moves.\nWatch the Sunny Skipper sail.\nChase the great treasure.",
  },
};
