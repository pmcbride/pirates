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
      briefing: "Tap arrows to plot the route, then scoop the first chest.",
      tutorial: "Try Right, Right, Right, Collect, Right, Right.",
      preview: "Tap arrows and grab the first chest.",
      objective: {
        primary: "Collect the chest, then move to the lighthouse.",
        short: "Collect chest, then reach the lighthouse.",
      },
    },
    "spark-shoals": {
      label: "Shells Town",
      sea: "East Blue",
      briefing: "A Marine skiff blocks the gold lane. Fire first, then move.",
      tutorial: "If a Marine is ahead, Fire before you Move.",
      preview: "Splash a Marine skiff and bring Zoro aboard.",
      objective: {
        primary: "Splash the Marine, grab the chest, dock at the bay.",
        short: "Fire, collect, then reach the dock.",
      },
    },
    "windrise-cove": {
      label: "Windrise Cove",
      sea: "East Blue",
      briefing: "Two Marine skiffs guard the cove. Splash one, move through, splash the next.",
      tutorial: "Fire when a Marine is ahead, then Move through the gap.",
      preview: "Two Marine skiffs guard the lane. Move, fire, move, fire.",
      objective: {
        primary: "Splash both Marines, then dock at the cove.",
        short: "Move, Fire, Move, Fire to the dock.",
      },
    },
    "barrel-bay": {
      label: "Barrel Bay",
      sea: "East Blue",
      briefing: "A chest, a Marine, and a reef line the bay. Use every move you know.",
      tutorial: "Collect the chest, Fire the Marine, Dodge the reef, then dock.",
      preview: "Dodge a reef, splash a Marine, scoop the chest.",
      objective: {
        primary: "Grab the chest, splash the Marine, dodge the reef, and reach the bay.",
        short: "Collect, Fire, Dodge, then dock.",
      },
    },
    "harbor-bend": {
      label: "Loguetown Bend",
      sea: "East Blue",
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
      briefing: "An open lagoon. Sail anywhere — no goal, no Marines, no losing.",
      tutorial: "Sandbox — play money. Try any blocks you've unlocked.",
      preview: "An open lagoon. No goal, no Marines, no failure — just sail.",
      objective: {
        primary: "Free play — sail, scoop play-treasure, try out your moves.",
        short: "Free play. Nothing breaks here.",
      },
    },
    "current-crescent": {
      label: "Reverse Mountain",
      sea: "Grand Line entry",
      briefing: "The current shoots into the Grand Line. Use Repeat to ride it.",
      tutorial: "Try Repeat Right x3, Right, Collect, Repeat Right x3.",
      preview: "Surf a long current using a Repeat plan.",
      objective: {
        primary: "Repeat Right to ride the current, then collect the chest.",
        short: "Repeat Right, Collect, Repeat Right.",
      },
    },
    "coral-lookout": {
      label: "Skypiea Lookout",
      sea: "Sky Island",
      briefing: "Train the crew to react when danger pops up in front.",
      tutorial: "Use If Enemy then Fire before moving the lookout lane.",
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
        short: "If Obstacle, Repeat Right, If Enemy, Talk, then finish.",
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
    "windrise-cove": {
      "windrise-enemy-1": "Marine",
      "windrise-enemy-2": "Marine",
    },
    "barrel-bay": {
      "barrel-chest": "Bay Chest",
      "barrel-enemy": "Marine",
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
