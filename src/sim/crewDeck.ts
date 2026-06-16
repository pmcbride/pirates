// Where crew badges stand on the ship's deck, for a ship sprite that points
// north (bow up) in its own local space. Slots are fractions of the ship's
// display width/height so the same arrangement works on a 90px mission tile,
// a 50px dense board, or the small world-map marker. Captain first (bow),
// then mates fill rows toward the stern in boarding order.
//
// Kept Phaser-free so the arrangement can be unit-tested with the rest of
// `src/sim/*`.

export interface DeckSlot {
  /** Fraction of the ship's display width, negative = port side. */
  fx: number;
  /** Fraction of the ship's display height, negative = toward the bow. */
  fy: number;
}

const slotTable: DeckSlot[][] = [
  [],
  [{ fx: 0, fy: -0.18 }],
  [
    { fx: 0, fy: -0.26 },
    { fx: 0, fy: 0.14 },
  ],
  [
    { fx: 0, fy: -0.28 },
    { fx: -0.2, fy: 0.1 },
    { fx: 0.2, fy: 0.1 },
  ],
  [
    { fx: 0, fy: -0.3 },
    { fx: -0.2, fy: 0.0 },
    { fx: 0.2, fy: 0.0 },
    { fx: 0, fy: 0.3 },
  ],
  [
    { fx: 0, fy: -0.32 },
    { fx: -0.21, fy: -0.04 },
    { fx: 0.21, fy: -0.04 },
    { fx: -0.16, fy: 0.28 },
    { fx: 0.16, fy: 0.28 },
  ],
  [
    { fx: 0, fy: -0.34 },
    { fx: -0.21, fy: -0.07 },
    { fx: 0.21, fy: -0.07 },
    { fx: 0, fy: 0.16 },
    { fx: -0.2, fy: 0.36 },
    { fx: 0.2, fy: 0.36 },
  ],
];

export const maxDeckSlots = slotTable.length - 1;

/**
 * Deck arrangement for `count` crew badges. Counts above the table cap
 * return the densest arrangement (extras simply don't get a slot — callers
 * slice their crew list to the returned length).
 */
export const deckSlotsFor = (count: number): DeckSlot[] =>
  slotTable[Math.max(0, Math.min(count, maxDeckSlots))];
