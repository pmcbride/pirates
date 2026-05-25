export type Direction = "north" | "east" | "south" | "west";

export type ActionCommandId =
  | "move-up"
  | "move-down"
  | "move-left"
  | "move-right"
  | "dodge"
  | "fire"
  | "collect"
  | "talk";

export type ConditionKind =
  | "enemyAhead"
  | "obstacleAhead"
  | "treasureHere"
  | "crewHere";

export type CommandBlockType = "action" | "condition" | "loop";

export type TileKind =
  | "enemy"
  | "obstacle"
  | "treasure"
  | "crew"
  | "goal"
  | "current";

export interface Position {
  x: number;
  y: number;
}

export interface PlayerSettings {
  reducedMotion: boolean;
  soundOn: boolean;
  muted: boolean;
  skipPrediction: boolean;
  alwaysShowSuggested: boolean;
  // Which visual/copy theme to render. "original" is the default for new
  // profiles; "one-piece" is the direct-IP theme for personal/family use.
  // See src/themes/* and DESIGN.md §7.
  themeId: "original" | "one-piece";
}

export interface CaptainLogEntry {
  day: number;
  missionId: string;
  oneLine: string;
}

export interface PlayerProfile {
  unlockedMissionIds: string[];
  completedMissionIds: string[];
  berries: number;
  bounty: number;
  stars: number;
  crewRoster: string[];
  fruitPowers: string[];
  commandUnlocks: string[];
  bestStars: Record<string, number>;
  captainLog: CaptainLogEntry[];
  attemptCounts: Record<string, number>;
  settings: PlayerSettings;
}

export interface RewardBundle {
  berries: number;
  bounty: number;
  stars: number;
  crewId?: string;
  fruitPowerId?: string;
  unlockCommandIds: string[];
  logLine?: string;
}

// Crew and fruit definitions are structural only — names/titles/descriptions
// come from the active Theme (see src/themes/types.ts).
export interface CrewMate {
  id: string;
  passiveType: "hint" | "gold" | "range" | "safeCollect";
}

export interface FruitPower {
  id: string;
  modifier: "extraFireRange" | "bonusGold" | "safeCollect";
}

export interface MissionNode {
  id: string;
  missionId: string;
  // Map coordinates (percent of screen width/height).
  x: number;
  y: number;
  difficulty: "cove" | "breeze" | "brave" | "captain";
  rewards: RewardBundle;
  unlockMissionIds: string[];
}

export interface MissionTile {
  id: string;
  kind: TileKind;
  position: Position;
  active: boolean;
}

export interface MissionObjective {
  primary: string;
  short: string;
}

export interface CommandBlock {
  id: string;
  type: CommandBlockType;
  label: string;
  shortLabel: string;
  accent: string;
  description: string;
  defaultAction?: ActionCommandId;
  defaultCount?: number;
  defaultCondition?: ConditionKind;
  actionOptions?: ActionCommandId[];
  conditionOptions?: ConditionKind[];
  bodyMaxLength?: number;
}

export interface PlannedCommand {
  instanceId: string;
  templateId: string;
  type: CommandBlockType;
  action?: ActionCommandId;
  count?: number;
  condition?: ConditionKind;
  thenAction?: ActionCommandId;
  /**
   * Optional inner sequence for loop commands. When present and non-empty,
   * the engine runs each body action per iteration; the legacy `action`
   * field is ignored. Cap is enforced by the picker / store helpers
   * (see `CommandBlock.bodyMaxLength`).
   */
  body?: PlannedCommand[];
}

export type PickerType = "ifCondition" | "ifAction";

export interface PickerAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OpenPicker {
  type: PickerType;
  instanceId: string;
  anchor: PickerAnchor;
}

// MissionDefinition is the *structural* spec of a mission — board geometry,
// starting state, tile positions, palette, rewards, and the suggested queue.
// All player-facing strings (label, sea, briefing, tutorial, objective, tile
// labels) live in the active Theme — see src/themes/types.ts. Resolve a
// mission's labels via getMissionStrings(theme, mission.id).
export interface MissionDefinition {
  id: string;
  nodeId: string;
  width: number;
  height: number;
  start: {
    position: Position;
    facing: Direction;
  };
  goal: Position;
  palette: string[];
  requiredTileIds: string[];
  reward: RewardBundle;
  tiles: MissionTile[];
  suggestedQueue: PlannedCommand[];
  /**
   * Marks a free-play sandbox mission: no rewards persist, failures bounce
   * the ship instead of showing the hint banner, and attemptCounts/captain's
   * log are not advanced. Sandbox missions are always-unlocked play-money zones.
   */
  sandbox?: boolean;
}

export interface MissionState {
  missionId: string;
  board: {
    width: number;
    height: number;
  };
  ship: {
    position: Position;
    facing: Direction;
  };
  tiles: MissionTile[];
  queuedCommands: PlannedCommand[];
  currentBeat: number;
  status: "planning" | "running" | "success" | "failed";
  collectedBerries: number;
  defeatedEnemyIds: string[];
}

export interface RunEvent {
  kind:
    | "move"
    | "turn"
    | "dodge"
    | "fire"
    | "collect"
    | "talk"
    | "condition"
    | "repeat"
    | "fail"
    | "goal"
    | "reward";
  text: string;
  positions?: Position[];
}

export interface RunStep {
  index: number;
  commandId: string;
  title: string;
  ship: MissionState["ship"];
  tiles: MissionTile[];
  message: string;
  /**
   * Per-step status:
   * - "running": a normal effective beat (sail glides, fire splashes a foe, collect grabs treasure).
   * - "warning": the move ran but had no effect (fire with no enemy, collect with no treasure,
   *   talk with no crew). The mission still succeeds, but playback dwells longer and the HUD
   *   gives a visible "💨 nothing here" cue so young players notice the wasted move.
   * - "success": the final beat of a winning run.
   * - "failed": the engine stopped the run; a hint follows.
   */
  status: "running" | "warning" | "success" | "failed";
  events: RunEvent[];
}

export interface HintResult {
  reason: string;
  suggestion: string;
  focusTemplateId?: string;
  highlightPositions: Position[];
  retryFromStep: number;
}

export interface MissionRunResult {
  success: boolean;
  steps: RunStep[];
  finalState: MissionState;
  reward?: RewardBundle;
  hint?: HintResult;
}

export interface AppState {
  screen: "title" | "map" | "mission" | "reward" | "sandbox";
  profile: PlayerProfile;
  selectedMissionId: string | null;
  activeMissionId: string | null;
  queuedCommands: PlannedCommand[];
  missionPhase: "planning" | "predicting" | "running";
  lastRun: MissionRunResult | null;
  activeHint: HintResult | null;
  selectedDrawer: "crew" | "settings" | "map" | "log" | null;
  playbackIndex: number;
  rewardMissionId: string | null;
  openPicker: OpenPicker | null;
  predictedEndPosition: Position | null;
  lastPredictionCorrect: boolean | null;
}
