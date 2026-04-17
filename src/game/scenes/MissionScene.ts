import Phaser from "phaser";
import { missions } from "../../sim/content";
import { createMissionState } from "../../sim/engine";
import { gameStore } from "../../sim/store";
import type { MissionDefinition, MissionTile, RunStep } from "../../sim/types";
import { kindTextureMap, textureKeys, uiColors } from "../assets/manifest";

export class MissionScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  private boardLayer?: Phaser.GameObjects.Container;

  private statusText?: Phaser.GameObjects.Text;

  private activePlaybackToken = 0;

  private renderedMissionId: string | null = null;

  constructor() {
    super("mission");
  }

  create(): void {
    this.boardLayer = this.add.container(0, 0);
    this.statusText = this.add
      .text(this.scale.width / 2, 120, "", {
        fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
        fontSize: "28px",
        color: "#fff6d6",
        backgroundColor: "#163b52",
        padding: { x: 22, y: 14 },
      })
      .setOrigin(0.5);

    this.unsubscribe = gameStore.subscribe((state) => {
      if (state.screen !== "mission") {
        return;
      }

      const missionId = state.activeMissionId;
      if (!missionId) {
        return;
      }

      const mission = missions[missionId];
      if (this.renderedMissionId !== missionId || state.missionPhase === "planning") {
        this.activePlaybackToken += 1;
        this.renderedMissionId = missionId;
        this.renderBoard(
          mission,
          createMissionState(mission, state.queuedCommands).ship,
          createMissionState(mission, state.queuedCommands).tiles,
        );
        this.statusText?.setText(mission.briefing);
      }

      if (state.missionPhase === "running" && state.lastRun) {
        const playbackToken = ++this.activePlaybackToken;
        this.playRun(mission, state.lastRun.steps, playbackToken);
      }
    });
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

  private renderBoard(
    mission: MissionDefinition,
    ship: { position: { x: number; y: number }; facing: string },
    tiles: MissionTile[],
  ): void {
    this.boardLayer?.removeAll(true);
    const { tileSize, offsetX, offsetY } = this.boardMetrics(mission);

    const water = this.add.graphics();
    water.fillGradientStyle(
      uiColors.sea,
      uiColors.seaDeep,
      uiColors.sea,
      uiColors.storm,
      1,
    );
    water.fillRect(0, 0, this.scale.width, this.scale.height);
    this.boardLayer?.add(water);

    const grid = this.add.graphics();
    for (let y = 0; y < mission.height; y += 1) {
      for (let x = 0; x < mission.width; x += 1) {
        grid.fillStyle((x + y) % 2 === 0 ? 0x12435f : 0x10374f, 1);
        grid.fillRoundedRect(
          offsetX + x * tileSize,
          offsetY + y * tileSize,
          tileSize - 8,
          tileSize - 8,
          24,
        );
      }
    }
    this.boardLayer?.add(grid);

    const goal = this.add
      .image(
        offsetX + mission.goal.x * tileSize + tileSize / 2,
        offsetY + mission.goal.y * tileSize + tileSize / 2,
        textureKeys.goal,
      )
      .setDisplaySize(tileSize - 18, tileSize - 18)
      .setAlpha(0.9);
    this.boardLayer?.add(goal);

    tiles
      .filter((tile) => tile.active)
      .forEach((tile) => {
        const key = kindTextureMap[tile.kind as keyof typeof kindTextureMap];
        if (!key) {
          return;
        }
        const image = this.add
          .image(
            offsetX + tile.position.x * tileSize + tileSize / 2,
            offsetY + tile.position.y * tileSize + tileSize / 2,
            key,
          )
          .setDisplaySize(tileSize - 22, tileSize - 22);
        const text = this.add
          .text(image.x, image.y, tile.label.slice(0, 2).toUpperCase(), {
            fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
            fontSize: `${Math.max(tileSize * 0.18, 18)}px`,
            color: "#08273a",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        this.boardLayer?.add([image, text]);
      });

    const shipImage = this.add
      .image(
        offsetX + ship.position.x * tileSize + tileSize / 2,
        offsetY + ship.position.y * tileSize + tileSize / 2,
        textureKeys.ship,
      )
      .setDisplaySize(tileSize - 8, tileSize - 20);

    shipImage.setAngle(
      ship.facing === "east"
        ? 90
        : ship.facing === "south"
          ? 180
          : ship.facing === "west"
            ? 270
            : 0,
    );
    this.boardLayer?.add(shipImage);
  }

  private playRun(
    mission: MissionDefinition,
    steps: RunStep[],
    token: number,
    index = 0,
  ): void {
    if (token !== this.activePlaybackToken) {
      return;
    }

    const step = steps[index];
    if (!step) {
      gameStore.finishPlayback();
      return;
    }

    this.renderBoard(mission, step.ship, step.tiles);
    this.statusText?.setText(step.message);
    gameStore.setPlaybackIndex(index);

    const reduced = gameStore.getState().profile.settings.reducedMotion;
    const delay = reduced ? 240 : step.status === "success" ? 900 : 540;

    this.time.delayedCall(delay, () => {
      if (token !== this.activePlaybackToken) {
        return;
      }

      if (index >= steps.length - 1) {
        gameStore.finishPlayback();
        return;
      }

      this.playRun(mission, steps, token, index + 1);
    });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
