import Phaser from "phaser";
import { missions } from "../../sim/content";
import { createMissionState } from "../../sim/engine";
import { gameStore } from "../../sim/store";
import { getActiveTheme } from "../../themes";
import type {
  AppState,
  MissionDefinition,
  MissionTile,
  Position,
  RunEvent,
  RunStep,
} from "../../sim/types";
import { playSfx } from "../../ui/audio";
import { haptic } from "../../ui/haptic";
import { kindTextureMap, textureKeys, uiColors } from "../assets/manifest";

interface TileSprite {
  image: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
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

  private statusText?: Phaser.GameObjects.Text;

  private shipSprite?: Phaser.GameObjects.Image;

  private goalSprite?: Phaser.GameObjects.Image;

  private goalPulseTween?: Phaser.Tweens.Tween;

  private shipBobTween?: Phaser.Tweens.Tween;

  private tileSprites = new Map<string, TileSprite>();

  private activePlaybackToken = 0;

  private renderedMissionId: string | null = null;

  private renderedPhase: AppState["missionPhase"] | null = null;

  constructor() {
    super("mission");
  }

  create(): void {
    this.boardLayer = this.add.container(0, 0);
    this.predictLayer = this.add.container(0, 0).setVisible(false);
    this.statusText = this.add
      .text(this.scale.width / 2, 220, "", {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: "26px",
        color: "#2b1d0e",
        backgroundColor: "#fff1cf",
        padding: { x: 22, y: 14 },
      })
      .setOrigin(0.5);

    this.unsubscribe = gameStore.subscribe((state) => {
      if (state.screen !== "mission" && state.screen !== "sandbox") {
        this.predictLayer?.setVisible(false);
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

      if (state.missionPhase === "predicting") {
        this.renderPredictLayer(mission, state.predictedEndPosition);
      } else {
        this.predictLayer?.setVisible(false);
        this.predictLayer?.removeAll(true);
      }

      if (state.missionPhase === "running" && state.lastRun) {
        const playbackToken = ++this.activePlaybackToken;
        this.playRun(mission, state.lastRun.steps, playbackToken);
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

  private boardMetrics(mission: MissionDefinition) {
    const width = this.scale.width;
    const height = this.scale.height;
    const tileSize = Math.min(
      (width - 150) / mission.width,
      (height - 540) / mission.height,
    );
    const boardWidth = mission.width * tileSize;

    return {
      tileSize,
      offsetX: (width - boardWidth) / 2,
      offsetY: 320,
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

    this.boardLayer?.removeAll(true);
    this.tileSprites.clear();
    this.shipSprite = undefined;
    this.goalSprite = undefined;

    const { tileSize, offsetX, offsetY } = this.boardMetrics(mission);
    const theme = getActiveTheme(gameStore.getState().profile);
    const tileLabels = theme.tileLabels[mission.id] ?? {};

    const water = this.add.graphics();
    water.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
    water.fillRect(0, 0, this.scale.width, this.scale.height);
    this.boardLayer?.add(water);

    const grid = this.add.graphics();
    for (let y = 0; y < mission.height; y += 1) {
      for (let x = 0; x < mission.width; x += 1) {
        grid.fillStyle((x + y) % 2 === 0 ? 0x6fd0e8 : 0x4ec3df, 1);
        grid.fillRoundedRect(
          offsetX + x * tileSize,
          offsetY + y * tileSize,
          tileSize - 8,
          tileSize - 8,
          24,
        );
        grid.lineStyle(3, uiColors.ink, 0.18);
        grid.strokeRoundedRect(
          offsetX + x * tileSize,
          offsetY + y * tileSize,
          tileSize - 8,
          tileSize - 8,
          24,
        );
      }
    }
    this.boardLayer?.add(grid);

    const goalCenter = this.worldXY(mission, mission.goal);
    const goal = this.add
      .image(goalCenter.x, goalCenter.y, textureKeys.goal)
      .setDisplaySize(tileSize - 18, tileSize - 18)
      .setAlpha(0.9);
    this.boardLayer?.add(goal);
    this.goalSprite = goal;

    tiles
      .filter((tile) => tile.active)
      .forEach((tile) => {
        const key = kindTextureMap[tile.kind as keyof typeof kindTextureMap];
        if (!key) {
          return;
        }
        const center = this.worldXY(mission, tile.position);
        const image = this.add
          .image(center.x, center.y, key)
          .setDisplaySize(tileSize - 22, tileSize - 22);
        const label = tileLabels[tile.id] ?? "";
        const text = this.add
          .text(image.x, image.y, label.slice(0, 2).toUpperCase(), {
            fontFamily: "Fredoka, Georgia, serif",
            fontSize: `${Math.max(tileSize * 0.18, 18)}px`,
            color: "#2b1d0e",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        this.boardLayer?.add([image, text]);
        this.tileSprites.set(tile.id, { image, text });
      });

    const shipCenter = this.worldXY(mission, ship.position);
    const shipImage = this.add
      .image(shipCenter.x, shipCenter.y, textureKeys.ship)
      .setDisplaySize(tileSize - 8, tileSize - 20);
    shipImage.setAngle(facingAngle(ship.facing));
    this.boardLayer?.add(shipImage);
    this.shipSprite = shipImage;
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
        sprite.text.destroy();
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
    sprite.text.destroy();
    this.tileSprites.delete(tileId);
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
        targets: [sprite.image, sprite.text],
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
        targets: [sprite.image, sprite.text],
        scale: peak,
        duration: up,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: [sprite.image, sprite.text],
            scale: 0,
            alpha: 0,
            duration: down,
            ease: "Sine.easeIn",
            onComplete: finalize,
          });
        },
      });
      this.floatBerryGain(sprite.image.x, sprite.image.y);
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
    const baseScale = this.goalSprite.scale;
    this.goalPulseTween = this.tweens.add({
      targets: this.goalSprite,
      scale: baseScale * 1.15,
      duration: 500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private startShipBob(): void {
    if (!this.shipSprite || this.shipBobTween) {
      return;
    }
    const baseY = this.shipSprite.y;
    this.shipBobTween = this.tweens.add({
      targets: this.shipSprite,
      y: baseY - 6,
      duration: 600,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private async playStep(
    mission: MissionDefinition,
    prev: RunStep | null,
    step: RunStep,
    durations: { move: number; turn: number; dodge: number; tile: number },
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

    // Always tween angle if it changed (turn-left/turn-right or facing differs).
    if (prevShip.facing !== step.ship.facing) {
      this.fireSfxFor("turn");
      tasks.push(this.tweenShipAngle(step.ship.facing, durations.turn));
    }

    if (primary?.kind === "move") {
      this.fireSfxFor("sail");
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
        tasks.push(this.tweenShipTo(mission, step.ship.position, durations.move));
      }
    }

    if (tasks.length === 0) {
      // Minimum beat so messages remain readable.
      await new Promise<void>((resolve) =>
        this.time.delayedCall(Math.max(120, durations.move * 0.5), () => resolve()),
      );
    } else {
      await Promise.all(tasks);
    }

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

    let prev: RunStep | null = null;
    for (let i = 0; i < steps.length; i += 1) {
      if (token !== this.activePlaybackToken) {
        return;
      }
      const step = steps[i];
      this.statusText?.setText(step.message);
      gameStore.setPlaybackIndex(i);

      await this.playStep(mission, prev, step, durations);

      if (token !== this.activePlaybackToken) {
        return;
      }

      // Final success step gets a moment to linger so the player feels the win.
      if (i === steps.length - 1 && step.status === "success") {
        await new Promise<void>((resolve) =>
          this.time.delayedCall(reduced ? 240 : 500, () => resolve()),
        );
      }

      // Warning beats (no-op fire/collect/talk) dwell longer so the player
      // actually notices the wasted move and the "💨 nothing here" status text.
      // Reduced-motion still gets a short dwell — we never *skip* informational
      // beats, just shorten them.
      if (step.status === "warning") {
        await new Promise<void>((resolve) =>
          this.time.delayedCall(reduced ? 220 : 480, () => resolve()),
        );
      }
      prev = step;
    }

    if (token !== this.activePlaybackToken) {
      return;
    }
    gameStore.finishPlayback();
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.predictLayer?.removeAll(true);
    this.renderedPhase = null;
  }
}
