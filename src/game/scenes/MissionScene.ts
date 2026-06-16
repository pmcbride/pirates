import Phaser from "phaser";
import { missions } from "../../sim/content";
import { createMissionState } from "../../sim/engine";
import { gameStore } from "../../sim/store";
import { getActiveTheme } from "../../themes";
import type {
  AppState,
  HintResult,
  MissionDefinition,
  MissionTile,
  Position,
  RunEvent,
  RunStep,
} from "../../sim/types";
import { playSfx } from "../../ui/audio";
import { haptic } from "../../ui/haptic";
import {
  goalArtKey,
  goalGlyph,
  kindGlyphMap,
  kindTextureMap,
  missionBackgrounds,
  shipArtKey,
  textureKeys,
  tileArtKeys,
  uiColors,
} from "../assets/manifest";

interface TileSprite {
  image: Phaser.GameObjects.Image;
  /** Two-letter label — only present on the procedural fallback stamps. The
   * hand-drawn tile icons carry their meaning visually, so they skip text
   * (the audience is pre-readers anyway). */
  text?: Phaser.GameObjects.Text;
}

const facingAngle = (facing: string): number => {
  switch (facing) {
    case "east":
      return 90;
    case "south":
      return 180;
    case "west":
      return 270;
    default:
      return 0;
  }
};

const shortestAngleDelta = (from: number, to: number): number => {
  let delta = ((to - from) % 360 + 540) % 360 - 180;
  // Avoid -180 vs 180 ambiguity — pick clockwise on exact opposite.
  if (delta === -180) {
    delta = 180;
  }
  return delta;
};

export class MissionScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  private boardLayer?: Phaser.GameObjects.Container;

  private predictLayer?: Phaser.GameObjects.Container;

  /** Pulsing gold rings over `activeHint.highlightPositions` while planning —
   * the board-side half of the gentle-rewind hint. Cleared whenever the hint
   * clears (any queue edit) or the board re-renders. */
  private hintLayer?: Phaser.GameObjects.Container;

  private statusText?: Phaser.GameObjects.Text;

  private shipSprite?: Phaser.GameObjects.Image;

  private goalSprite?: Phaser.GameObjects.Image;

  private goalPulseTween?: Phaser.Tweens.Tween;

  private goalBaseScale = 1;

  private shipBobTween?: Phaser.Tweens.Tween;

  private shipBaseY = 0;

  /** Ship sprite's resting scale (set by renderBoard's setDisplaySize). The
   * cosmetic hop tween scales relative to this, and snapToStep restores it so
   * a hop killed mid-flight (hidden page) can never leave the ship inflated. */
  private shipBaseScale = { x: 1, y: 1 };

  private waveOffset = { value: 0 };

  /** Tracks transient FX nodes (wake droplets, sparkles, splash rings) so
   * `renderBoard` can wipe them between missions without leaking GameObjects. */
  private effectsLayer?: Phaser.GameObjects.Container;

  /** Count of wake particles currently alive — tests + cleanup helpers read
   * this to confirm the effects layer is reset between mission renders. */
  private wakeParticleCount = 0;

  /** Total sparkle bursts spawned this lifetime of the scene. Tests assert
   * `popTreasure` adds at least one burst to the board. */
  private sparkleBurstCount = 0;

  private tileSprites = new Map<string, TileSprite>();

  private activePlaybackToken = 0;

  private renderedMissionId: string | null = null;

  private renderedPhase: AppState["missionPhase"] | null = null;

  constructor() {
    super("mission");
  }

  create(): void {
    this.boardLayer = this.add.container(0, 0);
    this.effectsLayer = this.add.container(0, 0);
    this.hintLayer = this.add.container(0, 0);
    this.predictLayer = this.add.container(0, 0).setVisible(false);
    // Status / briefing text sits in a reserved strip at the bottom of the
    // canvas (just above the dock) so it never covers the board.
    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height - 38, "", {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: "22px",
        color: "#2b1d0e",
        backgroundColor: "#fff1cf",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Re-layout when the canvas size changes (Scale.RESIZE mode). Skip while
    // a run is playing back — the next planning render picks up the new size.
    const onResize = (): void => {
      const state = gameStore.getState();
      this.statusText?.setPosition(this.scale.width / 2, this.scale.height - 38);
      if (
        (state.screen !== "mission" && state.screen !== "sandbox") ||
        state.missionPhase === "running" ||
        !state.activeMissionId
      ) {
        return;
      }
      const mission = missions[state.activeMissionId];
      const fresh = createMissionState(mission, state.queuedCommands);
      this.renderBoard(mission, fresh.ship, fresh.tiles);
      // The predict overlay (dim rect + tap zones + marker) is laid out with
      // the same board metrics — rebuild it too, or its tap zones would keep
      // pointing at the pre-resize tile positions. The dock grows when it
      // swaps into predict mode, so this resize fires on every predict entry.
      if (state.missionPhase === "predicting") {
        this.renderPredictLayer(mission, state.predictedEndPosition);
      }
      // Hint rings are board-metric-anchored too — re-place them on resize.
      this.renderHintHighlights(
        mission,
        state.missionPhase === "planning" ? state.activeHint : null,
      );
    };
    this.scale.on("resize", onResize);

    // Phaser 3 never calls a method named `shutdown` — listeners registered
    // on global emitters (scale manager, game store) leak across scene stops
    // and fire against destroyed GameObjects. Clean up on the real event.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", onResize);
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.activePlaybackToken += 1;
    });

    this.unsubscribe = gameStore.subscribe((state) => {
      if (state.screen !== "mission" && state.screen !== "sandbox") {
        this.predictLayer?.setVisible(false);
        this.hintLayer?.removeAll(true);
        return;
      }

      const missionId = state.activeMissionId;
      if (!missionId) {
        return;
      }

      const mission = missions[missionId];
      const theme = getActiveTheme(state.profile);
      const phaseChanged = this.renderedPhase !== state.missionPhase;
      if (
        this.renderedMissionId !== missionId ||
        state.missionPhase === "planning" ||
        (phaseChanged && state.missionPhase === "predicting")
      ) {
        this.activePlaybackToken += 1;
        this.renderedMissionId = missionId;
        const fresh = createMissionState(mission, state.queuedCommands);
        this.renderBoard(mission, fresh.ship, fresh.tiles);
        this.statusText?.setText(
          state.missionPhase === "predicting"
            ? "Where will the ship end up? Tap a tile."
            : theme.missions[mission.id]?.briefing ?? "",
        );
      }

      this.renderedPhase = state.missionPhase;

      // Board-side hint highlights: pulsing gold rings on the tiles the engine
      // flagged. Redrawn on every notification — the store nulls activeHint on
      // any queue edit, and renderBoard (which runs on every planning tick)
      // kills the pulse tweens, so clear-and-redraw keeps both in sync.
      this.renderHintHighlights(
        mission,
        state.missionPhase === "planning" ? state.activeHint : null,
      );

      if (state.missionPhase === "predicting") {
        this.renderPredictLayer(mission, state.predictedEndPosition);
      } else {
        this.predictLayer?.setVisible(false);
        this.predictLayer?.removeAll(true);
      }

      // Only START playback on the planning→running transition. Playback
      // itself dispatches store updates (setPlaybackIndex) that re-enter this
      // listener synchronously — restarting on every "running" notification
      // recursed forever and wedged the page.
      if (phaseChanged && state.missionPhase === "running" && state.lastRun) {
        this.stopShipBob();
        this.stopGoalPulse();
        const playbackToken = ++this.activePlaybackToken;
        this.playRun(mission, state.lastRun.steps, playbackToken);
      } else if (state.missionPhase === "planning" || state.missionPhase === "predicting") {
        // Idle phases — gentle bob + goal pulse so the ship feels alive at sea
        // and the destination keeps inviting the player. Both honor reduced
        // motion (no infinite tweens spawned when the player opted out).
        this.startShipBob();
        this.startGoalPulse();
      }
    });
  }

  private renderPredictLayer(
    mission: MissionDefinition,
    predicted: Position | null,
  ): void {
    if (!this.predictLayer) {
      return;
    }
    this.predictLayer.setVisible(true);
    this.predictLayer.removeAll(true);

    const { tileSize, offsetX, offsetY } = this.boardMetrics(mission);
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.18);
    overlay.fillRect(
      offsetX,
      offsetY,
      mission.width * tileSize,
      mission.height * tileSize,
    );
    this.predictLayer.add(overlay);

    for (let y = 0; y < mission.height; y += 1) {
      for (let x = 0; x < mission.width; x += 1) {
        const cellX = offsetX + x * tileSize;
        const cellY = offsetY + y * tileSize;
        const cellSize = tileSize - 8;
        const hit = this.add.zone(
          cellX + cellSize / 2,
          cellY + cellSize / 2,
          cellSize,
          cellSize,
        );
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerdown", () => {
          gameStore.setPrediction({ x, y });
        });
        this.predictLayer.add(hit);
      }
    }

    if (predicted) {
      const markX = offsetX + predicted.x * tileSize + tileSize / 2;
      const markY = offsetY + predicted.y * tileSize + tileSize / 2;
      const ring = this.add.graphics();
      ring.lineStyle(6, 0xffd166, 1);
      ring.strokeCircle(markX, markY, tileSize * 0.36);
      ring.fillStyle(0xffd166, 0.35);
      ring.fillCircle(markX, markY, tileSize * 0.36);
      this.predictLayer.add(ring);
      const star = this.add
        .text(markX, markY, "⭐", {
          fontFamily: "Nunito, sans-serif",
          fontSize: `${Math.max(tileSize * 0.4, 24)}px`,
        })
        .setOrigin(0.5);
      this.predictLayer.add(star);
    }
  }

  /**
   * Draw the active hint's highlight rings onto the board (same gold ring +
   * soft fill language as the predict marker). Clears and redraws the whole
   * layer each call; passing a null hint just clears it. Static rings (no
   * pulse tween) under reduced motion — the highlight itself is information,
   * the pulse is cosmetic.
   */
  private renderHintHighlights(
    mission: MissionDefinition,
    hint: HintResult | null,
  ): void {
    if (!this.hintLayer) {
      return;
    }
    this.hintLayer.removeAll(true);
    if (!hint || hint.highlightPositions.length === 0) {
      return;
    }

    const { tileSize } = this.boardMetrics(mission);
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    hint.highlightPositions.forEach((position) => {
      const { x, y } = this.worldXY(mission, position);
      // Draw at (0,0) and position the Graphics so the pulse scales from the
      // ring center (same pattern as spawnMoveSplash).
      const ring = this.add.graphics();
      ring.lineStyle(6, 0xffd166, 1);
      ring.strokeCircle(0, 0, tileSize * 0.36);
      ring.fillStyle(0xffd166, 0.35);
      ring.fillCircle(0, 0, tileSize * 0.36);
      ring.setPosition(x, y);
      this.hintLayer?.add(ring);
      if (!reduced) {
        this.tweens.add({
          targets: ring,
          scale: 1.15,
          alpha: 0.6,
          duration: 600,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
        });
      }
    });
  }

  private boardMetrics(mission: MissionDefinition) {
    const width = this.scale.width;
    const height = this.scale.height;
    // Chrome on the playfield: objective chip + stat strip at the top, side
    // rail buttons on the right. The dock lives outside the canvas now, so
    // the board can use most of the remaining space.
    const topChrome = Math.min(150, height * 0.22);
    // Reserve a strip at the bottom for the status/briefing text.
    const bottomPad = 76;
    // Clear the right-hand rail (≈128px wide incl. margin) — at 110 the
    // rightmost column of 8-wide boards tucked under the Settings button.
    const sidePad = 132;
    const tileSize = Math.min(
      (width - sidePad * 2) / mission.width,
      (height - topChrome - bottomPad) / mission.height,
    );
    const boardWidth = mission.width * tileSize;
    const boardHeight = mission.height * tileSize;

    return {
      tileSize,
      offsetX: (width - boardWidth) / 2,
      offsetY: topChrome + (height - topChrome - bottomPad - boardHeight) / 2,
    };
  }

  private worldXY(mission: MissionDefinition, position: Position) {
    const { tileSize, offsetX, offsetY } = this.boardMetrics(mission);
    return {
      x: offsetX + position.x * tileSize + tileSize / 2,
      y: offsetY + position.y * tileSize + tileSize / 2,
    };
  }

  private renderBoard(
    mission: MissionDefinition,
    ship: { position: { x: number; y: number }; facing: string },
    tiles: MissionTile[],
  ): void {
    // Stop any lingering tweens before we wipe their targets.
    this.tweens.killAll();
    this.goalPulseTween = undefined;
    this.shipBobTween = undefined;
    this.waveOffset.value = 0;

    this.boardLayer?.removeAll(true);
    this.effectsLayer?.removeAll(true);
    this.wakeParticleCount = 0;
    this.tileSprites.clear();
    this.shipSprite = undefined;
    this.goalSprite = undefined;

    const { tileSize, offsetX, offsetY } = this.boardMetrics(mission);

    const bgKey = missionBackgrounds[mission.id];
    const hasPaintedBg = Boolean(bgKey) && this.textures.exists(bgKey);
    if (hasPaintedBg) {
      // Painted backdrop — scale to cover the canvas, centered.
      const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, bgKey);
      const cover = Math.max(
        this.scale.width / bg.width,
        this.scale.height / bg.height,
      );
      bg.setScale(cover);
      this.boardLayer?.add(bg);
    } else {
      const water = this.add.graphics();
      water.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
      water.fillRect(0, 0, this.scale.width, this.scale.height);
      this.boardLayer?.add(water);
    }

    // Animated wave shimmer behind the board — soft horizontal foam bands that
    // scroll slowly so the playfield reads as actual ocean. Drawn into its own
    // Graphics so the per-frame redraw doesn't churn the rest of the board.
    const boardWidth = mission.width * tileSize;
    const boardHeight = mission.height * tileSize;
    const waves = this.add.graphics();
    waves.setAlpha(0.55);
    this.boardLayer?.add(waves);
    const drawWaves = () => {
      waves.clear();
      const bands = 6;
      for (let i = 0; i < bands; i += 1) {
        const t = i / bands;
        const y = offsetY + boardHeight * t;
        const amplitude = 6 + 4 * Math.sin(this.waveOffset.value * 0.8 + i);
        const phase = this.waveOffset.value + i * 1.3;
        waves.fillStyle(i % 2 === 0 ? uiColors.foam : uiColors.white, 0.18);
        // Two-segment sinusoidal band approximated with overlapping ellipses —
        // cheap, scales with screen, no per-frame string parsing.
        const segments = 14;
        for (let s = 0; s <= segments; s += 1) {
          const sx = offsetX - 40 + (boardWidth + 80) * (s / segments);
          const sy = y + Math.sin(phase + s * 0.9) * amplitude;
          waves.fillEllipse(sx, sy, 70, 10);
        }
      }
    };
    drawWaves();
    const reducedMotion = gameStore.getState().profile.settings.reducedMotion;
    if (!reducedMotion) {
      // Tween isn't stored — it's killed implicitly by `tweens.killAll()` in
      // the next `renderBoard`, and its target (`this.waveOffset`) persists.
      this.tweens.add({
        targets: this.waveOffset,
        value: Math.PI * 2,
        duration: 6400,
        ease: "Linear",
        repeat: -1,
        onUpdate: drawWaves,
      });
    }

    const grid = this.add.graphics();
    // Scale the corner radius with the cell — a fixed 24px turns the small
    // cells of wide boards (8 cols ≈ 55px cells) into circles.
    const cellRadius = Math.min(24, (tileSize - 8) * 0.3);
    for (let y = 0; y < mission.height; y += 1) {
      for (let x = 0; x < mission.width; x += 1) {
        if (hasPaintedBg) {
          // Translucent cells so the painted ocean reads through.
          grid.fillStyle(uiColors.white, (x + y) % 2 === 0 ? 0.26 : 0.18);
        } else {
          grid.fillStyle((x + y) % 2 === 0 ? 0x6fd0e8 : 0x4ec3df, 1);
        }
        grid.fillRoundedRect(
          offsetX + x * tileSize,
          offsetY + y * tileSize,
          tileSize - 8,
          tileSize - 8,
          cellRadius,
        );
        grid.lineStyle(hasPaintedBg ? 2 : 3, uiColors.ink, hasPaintedBg ? 0.14 : 0.18);
        grid.strokeRoundedRect(
          offsetX + x * tileSize,
          offsetY + y * tileSize,
          tileSize - 8,
          tileSize - 8,
          cellRadius,
        );
      }
    }
    this.boardLayer?.add(grid);

    const goalCenter = this.worldXY(mission, mission.goal);
    const hasGoalArt = this.textures.exists(goalArtKey);
    const goal = this.add
      .image(goalCenter.x, goalCenter.y, hasGoalArt ? goalArtKey : textureKeys.goal)
      .setDisplaySize(tileSize - 12, tileSize - 12)
      .setAlpha(hasGoalArt ? 1 : 0.9);
    this.boardLayer?.add(goal);
    this.goalSprite = goal;
    // Finish-flag pictogram so pre-readers spot the destination instantly —
    // but only as the fallback. The hand-drawn goal icon already reads as an
    // X-marks-the-spot landing pad; stacking the flag emoji on top of it is
    // two competing glyphs. Static (the goal sprite pulses behind it); the
    // ship is added later in this method, so it sails over the flag.
    if (!hasGoalArt) {
      const goalFlag = this.add
        .text(goalCenter.x, goalCenter.y, goalGlyph, {
          fontFamily: "Nunito, sans-serif",
          fontSize: `${Math.max(Math.round(tileSize * 0.42), 22)}px`,
        })
        .setOrigin(0.5)
        .setAlpha(0.95);
      this.boardLayer?.add(goalFlag);
    }

    tiles
      .filter((tile) => tile.active)
      .forEach((tile) => {
        if (tile.kind === "goal") {
          // The goal renders above as a dedicated sprite + icon — content
          // never places goal *tiles*, but the type allows it.
          return;
        }
        // Hand-drawn SVG icon is the primary token art; the procedural stamp
        // + emoji pictogram is the fallback when the icon fails to load.
        const artKey = tileArtKeys[tile.kind];
        const hasArt = Boolean(artKey) && this.textures.exists(artKey);
        const key = hasArt ? artKey : kindTextureMap[tile.kind];
        if (!key) {
          return;
        }
        const center = this.worldXY(mission, tile.position);
        const inset = hasArt ? 10 : 22;
        const image = this.add
          .image(center.x, center.y, key)
          .setDisplaySize(tileSize - inset, tileSize - inset);
        if (hasArt) {
          // Painted icons speak for themselves — no glyph overlay.
          this.boardLayer?.add(image);
          this.tileSprites.set(tile.id, { image });
          return;
        }
        // Fallback: colored backplate + emoji pictogram, never letters — the
        // target player can't read yet. The backplate carries the color code.
        const glyph = kindGlyphMap[tile.kind];
        const text = this.add
          .text(image.x, image.y, glyph, {
            fontFamily: "Nunito, sans-serif",
            fontSize: `${Math.max(Math.round(tileSize * 0.5), 24)}px`,
          })
          .setOrigin(0.5);
        this.boardLayer?.add([image, text]);
        this.tileSprites.set(tile.id, { image, text });
      });

    const shipCenter = this.worldXY(mission, ship.position);
    const hasShipArt = this.textures.exists(shipArtKey);
    const shipImage = this.add.image(
      shipCenter.x,
      shipCenter.y,
      hasShipArt ? shipArtKey : textureKeys.ship,
    );
    if (hasShipArt) {
      // Preserve the painted sprite's aspect ratio (portrait, bow up).
      const targetH = tileSize * 0.94;
      shipImage.setDisplaySize(targetH * (shipImage.width / shipImage.height), targetH);
    } else {
      shipImage.setDisplaySize(tileSize - 8, tileSize - 20);
    }
    shipImage.setAngle(facingAngle(ship.facing));
    this.boardLayer?.add(shipImage);
    this.shipSprite = shipImage;
    this.shipBaseScale = { x: shipImage.scaleX, y: shipImage.scaleY };
  }

  /**
   * Reconcile non-ship tile state to the engine's snapshot for this step.
   * Tiles that *disappeared* are handled by per-event animations below — but
   * if for any reason a tile became inactive without an animated event (e.g.
   * a future engine change), make sure the sprite is gone.
   */
  private syncTilesToStep(tiles: MissionTile[]): void {
    const activeIds = new Set(tiles.filter((tile) => tile.active).map((tile) => tile.id));
    for (const [id, sprite] of this.tileSprites) {
      if (!activeIds.has(id) && sprite.image.alpha > 0 && sprite.image.scale > 0) {
        // Untouched by a fade animation — drop instantly.
        sprite.image.destroy();
        sprite.text?.destroy();
        this.tileSprites.delete(id);
      }
    }
  }

  private removeTileSprite(tileId: string): void {
    const sprite = this.tileSprites.get(tileId);
    if (!sprite) {
      return;
    }
    sprite.image.destroy();
    sprite.text?.destroy();
    this.tileSprites.delete(tileId);
  }

  /** Tween targets for a tile — image plus the fallback caption when present. */
  private tileTargets(sprite: TileSprite): Array<Phaser.GameObjects.Image | Phaser.GameObjects.Text> {
    return sprite.text ? [sprite.image, sprite.text] : [sprite.image];
  }

  private tweenShipTo(
    mission: MissionDefinition,
    position: Position,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const ship = this.shipSprite;
      if (!ship) {
        resolve();
        return;
      }
      const target = this.worldXY(mission, position);
      if (duration <= 0) {
        ship.setPosition(target.x, target.y);
        resolve();
        return;
      }
      this.tweens.add({
        targets: ship,
        x: target.x,
        y: target.y,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => resolve(),
      });
    });
  }

  private tweenShipDodge(
    mission: MissionDefinition,
    arcTarget: Position,
    finalPosition: Position,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const ship = this.shipSprite;
      if (!ship) {
        resolve();
        return;
      }
      const arc = this.worldXY(mission, arcTarget);
      const settle = this.worldXY(mission, finalPosition);
      if (duration <= 0) {
        ship.setPosition(settle.x, settle.y);
        resolve();
        return;
      }
      const half = Math.max(60, duration * 0.55);
      this.tweens.add({
        targets: ship,
        x: arc.x,
        y: arc.y,
        duration: half,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: ship,
            x: settle.x,
            y: settle.y,
            duration: Math.max(60, duration - half),
            ease: "Sine.easeIn",
            onComplete: () => resolve(),
          });
        },
      });
    });
  }

  private tweenShipAngle(targetFacing: string, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const ship = this.shipSprite;
      if (!ship) {
        resolve();
        return;
      }
      const target = facingAngle(targetFacing);
      const current = ship.angle;
      const delta = shortestAngleDelta(current, target);
      const next = current + delta;
      if (duration <= 0 || delta === 0) {
        ship.setAngle(target);
        resolve();
        return;
      }
      this.tweens.add({
        targets: ship,
        angle: next,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          ship.setAngle(target);
          resolve();
        },
      });
    });
  }

  private fadeTileOut(tileId: string, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const sprite = this.tileSprites.get(tileId);
      if (!sprite) {
        resolve();
        return;
      }
      const finalize = () => {
        this.removeTileSprite(tileId);
        resolve();
      };
      if (duration <= 0) {
        finalize();
        return;
      }
      this.tweens.add({
        targets: this.tileTargets(sprite),
        alpha: 0,
        scale: 0,
        duration,
        ease: "Sine.easeIn",
        onComplete: finalize,
      });
    });
  }

  private popTreasure(tileId: string, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const sprite = this.tileSprites.get(tileId);
      if (!sprite) {
        resolve();
        return;
      }
      const finalize = () => {
        this.removeTileSprite(tileId);
        resolve();
      };
      if (duration <= 0) {
        finalize();
        return;
      }
      const baseScale = sprite.image.scale;
      const peak = baseScale * 1.3;
      const up = Math.max(60, duration * 0.4);
      const down = Math.max(60, duration - up);
      this.tweens.add({
        targets: this.tileTargets(sprite),
        scale: peak,
        duration: up,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: this.tileTargets(sprite),
            scale: 0,
            alpha: 0,
            duration: down,
            ease: "Sine.easeIn",
            onComplete: finalize,
          });
        },
      });
      this.floatBerryGain(sprite.image.x, sprite.image.y);
      this.spawnSparkleBurst(sprite.image.x, sprite.image.y);
    });
  }

  private floatBerryGain(x: number, y: number): void {
    const label = this.add
      .text(x, y - 12, "+30", {
        fontFamily: "Fredoka, Georgia, serif",
        fontSize: "28px",
        color: "#fff1cf",
        stroke: "#2b1d0e",
        strokeThickness: 4,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: label,
      y: y - 80,
      alpha: 0,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private startGoalPulse(): void {
    if (!this.goalSprite || this.goalPulseTween) {
      return;
    }
    if (gameStore.getState().profile.settings.reducedMotion) {
      // Reduced-motion mode never spawns infinite cosmetic tweens — the goal
      // sprite is still legible without the pulse.
      return;
    }
    const baseScale = this.goalSprite.scale;
    this.goalBaseScale = baseScale;
    this.goalPulseTween = this.tweens.add({
      targets: this.goalSprite,
      scale: baseScale * 1.15,
      duration: 500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopGoalPulse(): void {
    if (this.goalPulseTween) {
      this.goalPulseTween.stop();
      this.goalPulseTween = undefined;
    }
    if (this.goalSprite && this.goalBaseScale > 0) {
      this.goalSprite.setScale(this.goalBaseScale);
    }
  }

  private startShipBob(): void {
    if (!this.shipSprite || this.shipBobTween) {
      return;
    }
    if (gameStore.getState().profile.settings.reducedMotion) {
      return;
    }
    const baseY = this.shipSprite.y;
    this.shipBaseY = baseY;
    this.shipBobTween = this.tweens.add({
      targets: this.shipSprite,
      y: baseY - 3,
      duration: 800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopShipBob(): void {
    if (this.shipBobTween) {
      this.shipBobTween.stop();
      this.shipBobTween = undefined;
    }
    // Restore base Y so any subsequent move-tween starts from the snapped cell
    // center, not a bob offset.
    if (this.shipSprite) {
      this.shipSprite.setY(this.shipBaseY);
    }
  }

  /**
   * Drop a fading water-foam ellipse behind the ship's prior tile to suggest
   * a wake trail. Used by every `move-*` action. Counts toward
   * `wakeParticleCount`; the count resets on `renderBoard`.
   */
  private spawnWakeTrail(mission: MissionDefinition, from: Position): void {
    if (!this.effectsLayer) {
      return;
    }
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    const count = reduced ? 1 : 3;
    const { x: cx, y: cy } = this.worldXY(mission, from);
    const { tileSize } = this.boardMetrics(mission);
    for (let i = 0; i < count; i += 1) {
      const drop = this.add.graphics();
      const jitterX = (Math.random() - 0.5) * tileSize * 0.4;
      const jitterY = (Math.random() - 0.5) * tileSize * 0.4;
      drop.fillStyle(uiColors.foam, 0.85);
      drop.fillEllipse(0, 0, 18, 10);
      drop.fillStyle(uiColors.white, 0.6);
      drop.fillEllipse(0, -2, 10, 5);
      drop.setPosition(cx + jitterX, cy + jitterY);
      this.effectsLayer.add(drop);
      this.wakeParticleCount += 1;
      this.tweens.add({
        targets: drop,
        alpha: 0,
        scale: 1.6,
        duration: reduced ? 220 : 800,
        ease: "Sine.easeOut",
        delay: i * 90,
        onComplete: () => {
          drop.destroy();
          this.wakeParticleCount = Math.max(0, this.wakeParticleCount - 1);
        },
      });
    }
  }

  /**
   * Quick fading splash beneath the ship's prior tile when it moves off it.
   * Distinct from wake: a single round burst rather than a trail.
   */
  private spawnMoveSplash(mission: MissionDefinition, at: Position): void {
    if (!this.effectsLayer) {
      return;
    }
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    const { x: cx, y: cy } = this.worldXY(mission, at);
    // Draw the circle at (0,0) and position the Graphics object at (cx,cy) so
    // scale tweens grow from the splash center, not toward (0,0).
    const ring = this.add.graphics();
    ring.lineStyle(3, uiColors.white, 0.7);
    ring.strokeCircle(0, 0, 14);
    ring.setPosition(cx, cy);
    this.effectsLayer.add(ring);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: reduced ? 1.4 : 2.2,
      duration: reduced ? 220 : 520,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sparkle burst — 6 tiny ✨ glyphs radiating outward from a tile, fading
   * over 500ms. Layered on top of the existing `popTreasure` scale animation.
   */
  private spawnSparkleBurst(x: number, y: number): void {
    if (!this.effectsLayer) {
      return;
    }
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    this.sparkleBurstCount += 1;
    const sparkleCount = reduced ? 0 : 6;
    if (sparkleCount === 0) {
      return;
    }
    for (let i = 0; i < sparkleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / sparkleCount;
      const distance = 36;
      const sparkle = this.add
        .text(x, y, "✨", {
          fontFamily: "Nunito, sans-serif",
          fontSize: "20px",
        })
        .setOrigin(0.5)
        .setDepth(55);
      this.effectsLayer.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 1.4,
        duration: 500,
        ease: "Sine.easeOut",
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  /**
   * Expanding white ring + two splash droplets when fire hits an enemy.
   * The ring grows from 0→80px radius with alpha 1→0; the droplets hop
   * above the tile then fade.
   */
  private spawnEnemySplash(mission: MissionDefinition, at: Position): void {
    if (!this.effectsLayer) {
      return;
    }
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    const { x: cx, y: cy } = this.worldXY(mission, at);
    const ring = this.add.graphics();
    ring.lineStyle(4, uiColors.white, 1);
    ring.strokeCircle(0, 0, 4);
    ring.setPosition(cx, cy);
    this.effectsLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: reduced ? 4 : 20,
      alpha: 0,
      duration: reduced ? 240 : 520,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
    if (reduced) {
      return;
    }
    for (let i = 0; i < 2; i += 1) {
      const direction = i === 0 ? -1 : 1;
      const drop = this.add.graphics();
      drop.fillStyle(uiColors.foam, 0.95);
      drop.fillCircle(0, 0, 5);
      drop.setPosition(cx, cy);
      this.effectsLayer.add(drop);
      this.tweens.add({
        targets: drop,
        x: cx + direction * 26,
        y: cy - 32,
        alpha: 0,
        duration: 460,
        ease: "Sine.easeOut",
        onComplete: () => drop.destroy(),
      });
    }
  }

  /**
   * Coral ring flash on a failing tile so the kid sees WHERE the plan went
   * wrong. The ring itself is information — under reduced motion it renders
   * static (no flash tween) and is wiped by the post-run board re-render.
   */
  private flashFailRing(
    mission: MissionDefinition,
    at: Position,
    reduced: boolean,
  ): void {
    if (!this.effectsLayer) {
      return;
    }
    const { tileSize } = this.boardMetrics(mission);
    const { x, y } = this.worldXY(mission, at);
    const ring = this.add.graphics();
    ring.lineStyle(6, uiColors.coral, 1);
    ring.strokeCircle(0, 0, tileSize * 0.36);
    ring.fillStyle(uiColors.coral, 0.25);
    ring.fillCircle(0, 0, tileSize * 0.36);
    ring.setPosition(x, y);
    this.effectsLayer.add(ring);
    if (reduced) {
      return;
    }
    // Two flash pulses, sized to finish inside the ~900ms fail hold.
    this.tweens.add({
      targets: ring,
      alpha: 0.25,
      scale: 1.18,
      duration: 220,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 1,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Cosmetic fail lunge: nudge the ship halfway from `from` toward the flagged
   * tile, then bounce back. Never awaited — snapToStep corrects the position
   * at the end of the step regardless of whether the tween ran.
   */
  private bumpShipToward(
    mission: MissionDefinition,
    from: Position,
    toward: Position,
  ): void {
    const ship = this.shipSprite;
    if (!ship) {
      return;
    }
    const bump = this.worldXY(mission, {
      x: from.x + (toward.x - from.x) * 0.5,
      y: from.y + (toward.y - from.y) * 0.5,
    });
    this.tweens.add({
      targets: ship,
      x: bump.x,
      y: bump.y,
      duration: 220,
      ease: "Sine.easeOut",
      yoyo: true,
    });
  }

  /**
   * Tiny scale-hop at the start of each move so consecutive moves read as
   * distinct hops instead of one long glide. Cosmetic — skipped under reduced
   * motion, never awaited; snapToStep restores the resting scale either way.
   */
  private hopShip(): void {
    const ship = this.shipSprite;
    if (!ship || gameStore.getState().profile.settings.reducedMotion) {
      return;
    }
    this.tweens.add({
      targets: ship,
      scaleX: this.shipBaseScale.x * 1.06,
      scaleY: this.shipBaseScale.y * 1.06,
      duration: 70,
      ease: "Sine.easeOut",
      yoyo: true,
      onComplete: () => ship.setScale(this.shipBaseScale.x, this.shipBaseScale.y),
    });
  }

  /**
   * Victory wiggle at the goal tile — a quick side-to-side rock layered on the
   * final success linger. Cosmetic; skipped under reduced motion.
   */
  private wiggleShip(): void {
    const ship = this.shipSprite;
    if (!ship || gameStore.getState().profile.settings.reducedMotion) {
      return;
    }
    const baseAngle = ship.angle;
    this.tweens.add({
      targets: ship,
      angle: baseAngle + 8,
      duration: 120,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 2,
      onComplete: () => ship.setAngle(baseAngle),
    });
  }

  /**
   * Wall-clock pause. Phaser's clock (tweens, delayedCall) stops whenever the
   * page is hidden — a backgrounded tablet mid-run, or a headless preview —
   * and a playback loop awaiting it freezes forever. window.setTimeout keeps
   * firing in hidden pages (throttled, but it fires), so every pacing wait in
   * the run loop goes through here: playback semantics must never depend on
   * the animator's clock.
   */
  private beat(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  /**
   * Hard-set the ship sprite (and any mid-animation tile sprites) to a step's
   * true end state. Idempotent when the tweens already completed; corrective
   * when they never ran because the page was hidden.
   */
  private snapToStep(mission: MissionDefinition, step: RunStep): void {
    const ship = this.shipSprite;
    if (ship) {
      this.tweens.killTweensOf(ship);
      const { x, y } = this.worldXY(mission, step.ship.position);
      ship.setPosition(x, y);
      ship.setAngle(facingAngle(step.ship.facing));
      // Restore resting scale — a cosmetic hop killed mid-flight (hidden page)
      // must never leave the ship stuck inflated.
      ship.setScale(this.shipBaseScale.x, this.shipBaseScale.y);
      this.shipBaseY = y;
    }
    const activeIds = new Set(
      step.tiles.filter((tile) => tile.active).map((tile) => tile.id),
    );
    for (const [id, sprite] of this.tileSprites) {
      if (!activeIds.has(id)) {
        // Kill frozen fade/pop tweens so they can't resume once the page is
        // visible again and replay against a sprite syncTilesToStep is about
        // to destroy (its alpha/scale guard only spares fully-faded sprites).
        this.tweens.killTweensOf([sprite.image, sprite.text]);
      }
    }
  }

  private async playStep(
    mission: MissionDefinition,
    prev: RunStep | null,
    step: RunStep,
    durations: { move: number; turn: number; dodge: number; tile: number },
    token: number,
  ): Promise<void> {
    const prevShip = prev?.ship ?? { position: mission.start.position, facing: mission.start.facing };

    // Pick the primary visible event so we know which animation to favor.
    const events = step.events ?? [];
    const primary: RunEvent | undefined =
      events.find((event) =>
        ["move", "turn", "dodge", "fire", "collect", "talk", "goal", "fail"].includes(
          event.kind,
        ),
      ) ?? events[0];

    const tasks: Promise<void>[] = [];

    // Set by the fail branch — replaces the default minimum beat with a longer
    // informational hold so the kid SEES the bump before the board resets.
    let failHoldMs = 0;

    // Always tween angle if facing changed. With the absolute-direction model
    // facing is auto-set to the last-moved direction, so this fires whenever
    // the player switches between Up/Down/Left/Right blocks.
    if (prevShip.facing !== step.ship.facing) {
      this.fireSfxFor("turn");
      tasks.push(this.tweenShipAngle(step.ship.facing, durations.turn));
    }

    if (primary?.kind === "move") {
      this.fireSfxFor("sail");
      this.spawnWakeTrail(mission, prevShip.position);
      this.spawnMoveSplash(mission, prevShip.position);
      this.hopShip();
      tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
    } else if (primary?.kind === "dodge") {
      this.fireSfxFor("dodge");
      // Arc: overshoot by half a cell on the perpendicular, then settle.
      const dx = step.ship.position.x - prevShip.position.x;
      const dy = step.ship.position.y - prevShip.position.y;
      const arcPosition: Position = {
        x: prevShip.position.x + dx * 0.5 + (dy === 0 ? 0 : 0.4),
        y: prevShip.position.y + dy * 0.5 + (dx === 0 ? 0 : -0.4),
      };
      tasks.push(this.tweenShipDodge(mission, arcPosition, step.ship.position, durations.dodge));
    } else if (primary?.kind === "fire") {
      this.fireSfxFor("fire");
      // Move (if any) + fade the targeted enemy
      if (
        prevShip.position.x !== step.ship.position.x ||
        prevShip.position.y !== step.ship.position.y
      ) {
        tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
      }
      const removedEnemyId = this.findRemovedTileId(prev, step, "enemy");
      if (removedEnemyId) {
        // Locate the enemy tile we're about to fade and burst a splash ring on it.
        const enemyTile = (prev?.tiles ?? []).find((t) => t.id === removedEnemyId);
        if (enemyTile) {
          this.spawnEnemySplash(mission, enemyTile.position);
        }
        tasks.push(this.fadeTileOut(removedEnemyId, durations.tile));
      }
    } else if (primary?.kind === "collect") {
      this.fireSfxFor("collect");
      if (
        prevShip.position.x !== step.ship.position.x ||
        prevShip.position.y !== step.ship.position.y
      ) {
        tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
      }
      const removedTreasureId = this.findRemovedTileId(prev, step, "treasure");
      if (removedTreasureId) {
        tasks.push(this.popTreasure(removedTreasureId, durations.tile));
      }
    } else if (primary?.kind === "talk") {
      this.fireSfxFor("talk");
      const removedCrewId = this.findRemovedTileId(prev, step, "crew");
      if (removedCrewId) {
        tasks.push(this.fadeTileOut(removedCrewId, durations.tile));
      }
    } else if (primary?.kind === "fail") {
      this.fireSfxFor("fail");
      haptic("fail");
      const reduced = gameStore.getState().profile.settings.reducedMotion;
      // The engine puts the colliding tile(s) on the fail event; the hint's
      // highlightPositions carry the same data as a fallback.
      const failPositions =
        primary.positions && primary.positions.length > 0
          ? primary.positions
          : gameStore.getState().lastRun?.hint?.highlightPositions ?? [];
      failPositions.forEach((position) =>
        this.flashFailRing(mission, position, reduced),
      );
      if (!reduced && failPositions.length > 0) {
        // Cosmetic lunge-and-bounce toward the collision — not awaited. Lunge
        // from where the sprite visually sits (the previous step's tile): the
        // engine parks the failed step's ship.position ON the collision tile,
        // which would degenerate the bump into a full-tile jump.
        this.bumpShipToward(mission, prevShip.position, failPositions[0]);
      }
      // Readable failure beat — shortened under reduced motion, never skipped.
      failHoldMs = reduced ? 400 : 900;
    } else if (primary?.kind === "goal") {
      // success sfx + haptic when we reach the goal
      this.fireSfxFor("success");
      haptic("success");
      if (
        prevShip.position.x !== step.ship.position.x ||
        prevShip.position.y !== step.ship.position.y
      ) {
        tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
      }
    } else {
      // No specialized animation — still advance position if it changed.
      if (
        prevShip.position.x !== step.ship.position.x ||
        prevShip.position.y !== step.ship.position.y
      ) {
        this.fireSfxFor("sail");
        this.spawnWakeTrail(mission, prevShip.position);
        this.spawnMoveSplash(mission, prevShip.position);
        this.hopShip();
        tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
      }
    }

    if (failHoldMs > 0) {
      // Wall-clock hold while the bump/flash tweens play out (they finish
      // inside the hold). The fail step queues no awaited tasks of its own.
      await this.beat(failHoldMs);
    } else if (tasks.length === 0) {
      // Minimum beat so messages remain readable.
      await this.beat(Math.max(120, durations.move * 0.5));
    } else {
      // Tween promises resolve on Phaser's clock, which freezes while the
      // page is hidden. Race them against a wall-clock deadline and converge
      // on the step's true state either way — the run must always finish.
      const deadline =
        Math.max(durations.move, durations.turn, durations.dodge, durations.tile) + 200;
      await Promise.race([Promise.all(tasks), this.beat(deadline)]);
    }

    // Wall-clock beats keep firing after a token bump (newer run, scene
    // shutdown) — never snap a stale step onto the new run's sprites.
    if (token !== this.activePlaybackToken) {
      return;
    }

    this.snapToStep(mission, step);
    this.syncTilesToStep(step.tiles);

    if (step.status === "success") {
      this.startShipBob();
      this.startGoalPulse();
    }
  }

  private findRemovedTileId(
    prev: RunStep | null,
    step: RunStep,
    kind: MissionTile["kind"],
  ): string | undefined {
    const prevActive = (prev?.tiles ?? []).filter(
      (tile) => tile.active && tile.kind === kind,
    );
    const nowActive = new Set(
      step.tiles.filter((tile) => tile.active && tile.kind === kind).map((tile) => tile.id),
    );
    const removed = prevActive.find((tile) => !nowActive.has(tile.id));
    return removed?.id;
  }

  private fireSfxFor(kind:
    | "sail"
    | "turn"
    | "dodge"
    | "fire"
    | "collect"
    | "talk"
    | "fail"
    | "success"): void {
    playSfx(kind);
  }

  private playRun(
    mission: MissionDefinition,
    steps: RunStep[],
    token: number,
  ): void {
    void this.playRunAsync(mission, steps, token);
  }

  private async playRunAsync(
    mission: MissionDefinition,
    steps: RunStep[],
    token: number,
  ): Promise<void> {
    const reduced = gameStore.getState().profile.settings.reducedMotion;
    const durations = reduced
      ? { move: 120, turn: 90, dodge: 140, tile: 160 }
      : { move: 260, turn: 200, dodge: 320, tile: 300 };

    try {
      let prev: RunStep | null = null;
      for (let i = 0; i < steps.length; i += 1) {
        if (token !== this.activePlaybackToken) {
          return;
        }
        const step = steps[i];
        this.statusText?.setText(step.message);
        gameStore.setPlaybackIndex(i);

        await this.playStep(mission, prev, step, durations, token);

        if (token !== this.activePlaybackToken) {
          return;
        }

        // Final success step gets a moment to linger so the player feels the
        // win BEFORE the screen swaps to the reward card: sparkle burst + ship
        // wiggle at the goal tile (cosmetic), riding a wall-clock hold
        // (informational — shortened under reduced motion, never skipped).
        if (i === steps.length - 1 && step.status === "success") {
          const goalPoint = this.worldXY(mission, step.ship.position);
          this.spawnSparkleBurst(goalPoint.x, goalPoint.y);
          this.wiggleShip();
          await this.beat(reduced ? 400 : 900);
        }

        // Warning beats (no-op fire/collect/talk) dwell longer so the player
        // actually notices the wasted move and the "💨 nothing here" status
        // text. Reduced-motion still gets a short dwell — we never *skip*
        // informational beats, just shorten them.
        if (step.status === "warning") {
          await this.beat(reduced ? 220 : 480);
        }

        // Fixed inter-step breath so back-to-back commands read as separate
        // beats instead of one continuous slide. Wall clock, like every pacing
        // wait in this loop.
        if (i < steps.length - 1) {
          await this.beat(reduced ? 50 : 110);
        }
        prev = step;
      }
    } catch (err) {
      // An animation/subscriber bug must never wedge the mission in "running"
      // (board frozen, every control locked, reward silently dropped).
      console.error("[mission] playback aborted by error", err);
    } finally {
      // Completion is structurally guaranteed for the run that still owns the
      // playback token: success lands on the reward screen, failure lands in
      // gentle rewind. Cancelled runs (token bumped by a newer run or scene
      // shutdown) skip it — the canceller owns the state transition.
      if (token === this.activePlaybackToken) {
        gameStore.finishPlayback();
      }
    }
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.predictLayer?.removeAll(true);
    this.hintLayer?.removeAll(true);
    this.effectsLayer?.removeAll(true);
    this.wakeParticleCount = 0;
    this.renderedPhase = null;
  }
}
