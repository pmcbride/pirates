/**
 * Inline Twemoji SVGs for the command-block icons.
 *
 * Why bundle these instead of using Unicode emoji?
 *   - The emoji code points render with whatever font the host OS ships
 *     (Apple Color Emoji on macOS/iOS, Segoe UI Emoji on Windows, Noto on
 *     Android). The visuals diverge between platforms and the "designed
 *     look" of the game falls apart — and the `🧑‍🎤` ZWJ sequence is
 *     unsupported on older Android entirely, where it splits into two
 *     separate glyphs.
 *   - Bundling Twemoji SVGs makes the same icon render identically on
 *     every device. Curated subset = small bundle (under ~10 KB gzip).
 *
 * SVG payloads are imported as raw strings via Vite's `?raw` suffix and
 * spliced directly into HTML. Each SVG carries its own `viewBox` so a
 * single `.icon-svg` CSS rule can size them as a unit. The `aria-hidden`
 * attribute is added by the consumer (`iconFor`) so screen readers see
 * the adjacent label, not the icon.
 */
import sailSvg from "./sail.svg?raw";
import turnLeftSvg from "./turn-left.svg?raw";
import turnRightSvg from "./turn-right.svg?raw";
import dodgeSvg from "./dodge.svg?raw";
import fireSvg from "./fire.svg?raw";
import collectSvg from "./collect.svg?raw";
import talkSvg from "./talk.svg?raw";
import repeatSvg from "./repeat.svg?raw";
import ifSvg from "./if.svg?raw";
import enemyAheadSvg from "./enemy-ahead.svg?raw";
import obstacleAheadSvg from "./obstacle-ahead.svg?raw";
import treasureHereSvg from "./treasure-here.svg?raw";
import crewHereSvg from "./crew-here.svg?raw";

/**
 * Marker class added to every inline icon SVG so a single CSS rule
 * (`.icon-svg { … }`) can size them uniformly without per-call style
 * attributes. The rule lives in `styles.css`.
 */
const ICON_CLASS = "icon-svg";

/**
 * Inject `class` and `aria-hidden` into the raw SVG markup. Cheap regex
 * (no DOM round trip) — we control every input file, so the assumptions
 * (root `<svg …>` with no existing `class` attribute) hold.
 */
const decorate = (raw: string, label: string): string =>
  raw.replace(
    /^<svg\b/,
    `<svg class="${ICON_CLASS}" role="img" aria-label="${label}"`,
  );

export const iconSvgMap = {
  sail: decorate(sailSvg, "Sail"),
  "turn-left": decorate(turnLeftSvg, "Turn left"),
  "turn-right": decorate(turnRightSvg, "Turn right"),
  dodge: decorate(dodgeSvg, "Dodge"),
  fire: decorate(fireSvg, "Fire"),
  collect: decorate(collectSvg, "Collect"),
  talk: decorate(talkSvg, "Talk"),
  repeat: decorate(repeatSvg, "Repeat"),
  if: decorate(ifSvg, "If"),
  enemyAhead: decorate(enemyAheadSvg, "Foe ahead"),
  obstacleAhead: decorate(obstacleAheadSvg, "Reef ahead"),
  treasureHere: decorate(treasureHereSvg, "Treasure here"),
  crewHere: decorate(crewHereSvg, "Crew here"),
} as const;

export type IconKey = keyof typeof iconSvgMap;
