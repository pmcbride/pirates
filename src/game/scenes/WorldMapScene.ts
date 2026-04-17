import Phaser from "phaser";
import { missionNodes } from "../../sim/content";
import { gameStore } from "../../sim/store";
import { uiColors } from "../assets/manifest";

export class WorldMapScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super("world-map");
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    this.unsubscribe = gameStore.subscribe(() => {
      if (gameStore.getState().screen === "map") {
        this.renderMap();
      }
    });
    this.renderMap();
  }

  private renderMap(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layer?.removeAll(true);

    const backdrop = this.add.graphics();
    backdrop.fillGradientStyle(
      uiColors.seaDeep,
      uiColors.sea,
      uiColors.seaDeep,
      uiColors.storm,
      1,
    );
    backdrop.fillRect(0, 0, width, height);
    backdrop.fillStyle(uiColors.foam, 0.07);
    for (let row = 0; row < 8; row += 1) {
      backdrop.fillRoundedRect(70, 140 + row * 150, width - 140, 34, 16);
    }
    this.layer?.add(backdrop);

    const title = this.add.text(64, 72, "Sea Chart", {
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: "62px",
      color: "#fff5cc",
      fontStyle: "bold",
    });
    this.layer?.add(title);

    const subtitle = this.add.text(
      64,
      140,
      "Choose the next route and teach the crew a fresh trick.",
      {
        fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
        fontSize: "26px",
        color: "#d7f6f7",
      },
    );
    this.layer?.add(subtitle);

    const state = gameStore.getState();

    for (let index = 0; index < missionNodes.length - 1; index += 1) {
      const current = missionNodes[index];
      const next = missionNodes[index + 1];
      const line = this.add.graphics();
      line.lineStyle(8, uiColors.foam, 0.28);
      line.lineBetween(
        (current.x / 100) * width,
        (current.y / 100) * height,
        (next.x / 100) * width,
        (next.y / 100) * height,
      );
      this.layer?.add(line);
    }

    missionNodes.forEach((node) => {
      const x = (node.x / 100) * width;
      const y = (node.y / 100) * height;
      const unlocked = state.profile.unlockedMissionIds.includes(node.missionId);
      const complete = state.profile.completedMissionIds.includes(node.missionId);
      const selected = state.selectedMissionId === node.missionId;
      const nodeGraphics = this.add.circle(
        x,
        y,
        selected ? 46 : 38,
        complete ? uiColors.mint : unlocked ? uiColors.gold : uiColors.storm,
      );
      nodeGraphics.setStrokeStyle(8, uiColors.foam, unlocked ? 1 : 0.4);
      nodeGraphics.setInteractive({ useHandCursor: unlocked });
      nodeGraphics.on("pointerdown", () => {
        if (unlocked) {
          gameStore.selectMission(node.missionId);
        }
      });

      const label = this.add.text(x, y + 66, node.label, {
        fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
        fontSize: "24px",
        color: unlocked ? "#fff6d6" : "#9ab2c1",
        align: "center",
      });
      label.setOrigin(0.5, 0);

      this.layer?.add([nodeGraphics, label]);
    });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
