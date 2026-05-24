import type { Theme } from "./types";

// Opt-in One Piece theme — direct character/place names for personal/family use.
// Identical structure to the original theme; only the strings differ. See
// DESIGN.md §7 for the IP/scope note.
export const onePieceTheme: Theme = {
  meta: {
    id: "one-piece",
    label: "One Piece",
    description: "Direct One Piece names — personal/family use only.",
  },
  ship: {
    name: "Going Merry",
  },
  seas: {
    starterCove: "Starter Cove",
    easternReach: "East Blue",
    crescentPass: "Grand Line entry",
    skyReach: "Sky Island",
    lastVoyage: "Final Voyage",
  },
  missions: {
    "tutorial-cove": {
      label: "Foosha Cove",
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
      label: "Shells Town",
      sea: "East Blue",
      briefing: "A Marine skiff blocks the gold lane. Fire first, then sail.",
      tutorial: "If a Marine is ahead, Fire before you Sail.",
      preview: "Splash a Marine skiff and bring Zoro aboard.",
      objective: {
        primary: "Splash the Marine, grab the chest, dock at the bay.",
        short: "Fire, collect, then reach the dock.",
      },
    },
    "current-crescent": {
      label: "Reverse Mountain",
      sea: "Grand Line entry",
      briefing: "The current shoots into the Grand Line. Use Repeat to ride it.",
      tutorial: "Try Repeat Sail x3, Collect, Repeat Sail x3.",
      preview: "Surf a long current using a Repeat plan.",
      objective: {
        primary: "Repeat Sail to ride the current, then collect the chest.",
        short: "Repeat Sail, Collect, Repeat Sail.",
      },
    },
    "coral-lookout": {
      label: "Skypiea Lookout",
      sea: "Sky Island",
      briefing: "Train the crew to react when danger pops up in front.",
      tutorial: "Use If Enemy then Fire before sailing the lookout lane.",
      preview: "Teach the crew to react with If-then plans.",
      objective: {
        primary: "React with If Enemy, then grab the sky treasure.",
        short: "If Enemy Fire, Collect, then dock.",
      },
    },
    "treasure-isle": {
      label: "Raftel",
      sea: "Final Voyage",
      briefing: "The last voyage needs smart reactions and a long push.",
      tutorial: "Dodge the reef, Fire the boss, Talk to the guide.",
      preview: "Mix Repeat and If to reach the One Piece.",
      objective: {
        primary:
          "Dodge the reef, splash the boss, recruit the guide, reach the treasure.",
        short: "If Obstacle, Repeat Sail, If Enemy, Talk, then finish.",
      },
    },
  },
  tileLabels: {
    "tutorial-cove": {
      "cove-chest": "Chest",
    },
    "spark-shoals": {
      "spark-enemy": "Marine",
      "spark-chest": "Sun Chest",
    },
    "current-crescent": {
      "current-chest": "Moon Chest",
      "current-wave-1": "Current",
      "current-wave-2": "Current",
    },
    "coral-lookout": {
      "coral-enemy": "Sky Marine",
      "coral-chest": "Sky Chest",
    },
    "treasure-isle": {
      "isle-reef": "Reef",
      "isle-boss": "Boss",
      "isle-guide": "Guide",
    },
  },
  crew: {
    zoro: {
      name: "Zoro",
      title: "Swordsman",
      description:
        "Adds a sparkly hint whenever the crew bumps into trouble.",
    },
    nami: {
      name: "Nami",
      title: "Navigator",
      description: "Finds one extra berry every time a voyage is cleared.",
    },
  },
  fruits: {
    gumgum: {
      name: "Gum-Gum Fruit",
      title: "Stretchy Strike",
      description: "Fire reaches two waves ahead.",
    },
  },
  currency: {
    symbol: "฿",
    nameSingular: "berry",
    namePlural: "berries",
  },
  bountyRanks: [
    { minBounty: 0, label: "Rookie Pirate" },
    { minBounty: 1, label: "Wanted Rookie" },
    { minBounty: 10_000_000, label: "East Blue Champion" },
    { minBounty: 50_000_000, label: "Grand Line Captain" },
    { minBounty: 100_000_000, label: "Yonko-class" },
  ],
  enemyKind: {
    singular: "Marine",
    plural: "Marines",
  },
  hintPrefixes: {
    withSparkleCrew: "Zoro points with a sparkle. ",
  },
  taglines: {
    titleHeadline: "Set sail for the One Piece.",
    titleSupport:
      "Drag big command stamps to plan a route. Splash Marines, scoop berries, recruit Straw Hats, and chase Devil Fruits across the Grand Line.",
    setSailCta: "⛵ Set Sail",
    titlePoster:
      "Queue bold moves.\nWatch the Going Merry sail.\nChase the One Piece.",
  },
};
