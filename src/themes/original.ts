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
      briefing: "Line up a sailing plan and scoop the first chest.",
      tutorial: "Try Sail, Sail, Sail, Collect, Sail, Sail.",
      preview: "Hoist the sail and grab the first chest.",
      objective: {
        primary: "Collect the chest, then sail to the lighthouse.",
        short: "Collect chest, then reach the lighthouse.",
      },
    },
    "spark-shoals": {
      label: "Shellrock Bay",
      sea: "Eastern Reach",
      briefing: "A patrol skiff blocks the gold lane. Splash it first, then sail.",
      tutorial: "If a patrol skiff is ahead, Splash before you Sail.",
      preview: "Splash a patrol skiff and bring Saber aboard.",
      objective: {
        primary: "Splash the skiff, grab the chest, dock at the bay.",
        short: "Splash, collect, then reach the dock.",
      },
    },
    "current-crescent": {
      label: "Crescent Falls",
      sea: "Crescent Pass",
      briefing: "The current shoots into the open sea. Use Repeat to ride it.",
      tutorial: "Try Repeat Sail x3, Collect, Repeat Sail x3.",
      preview: "Surf a long current using a Repeat plan.",
      objective: {
        primary: "Repeat Sail to ride the current, then collect the chest.",
        short: "Repeat Sail, Collect, Repeat Sail.",
      },
    },
    "coral-lookout": {
      label: "Cloudtop Lookout",
      sea: "Sky Reach",
      briefing: "Train the crew to react when danger pops up in front.",
      tutorial: "Use If Patrol then Splash before sailing the lookout lane.",
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
        short: "If Obstacle, Repeat Sail, If Patrol, Talk, then finish.",
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
