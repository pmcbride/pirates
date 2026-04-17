import Phaser from "phaser";
import { missions } from "../../sim/content";
import { gameStore } from "../../sim/store";
import { uiColors } from "../assets/manifest";

export class RewardScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  constructor() {
    super("reward");
  }

  create(): void {
    this.unsubscribe = gameStore.subscribe((state) => {
      if (state.screen !== "reward") {
        return;
      }

      const width = this.scale.width;
      const height = this.scale.height;
      this.children.removeAll(true);

      const bg = this.add.graphics();
      bg.fillGradientStyle(
        uiColors.seaDeep,
        uiColors.sea,
        uiColors.plum,
        uiColors.coral,
        1,
      );
      bg.fillRect(0, 0, width, height);

      for (let index = 0; index < 24; index += 1) {
        const circle = this.add.circle(
          Phaser.Math.Between(40, width - 40),
          Phaser.Math.Between(80, height - 80),
          Phaser.Math.Between(12, 26),
          index % 2 === 0 ? uiColors.gold : uiColors.foam,
          0.18,
        );
        this.tweens.add({
          targets: circle,
          y: circle.y - Phaser.Math.Between(10, 36),
          duration: Phaser.Math.Between(1200, 2200),
          yoyo: true,
          repeat: -1,
        });
      }

      const mission = state.rewardMissionId ? missions[state.rewardMissionId] : null;
      const reward = state.lastRun?.reward;

      this.add
        .text(width / 2, 280, "Voyage Clear", {
          fontFamily: "Georgia, Times New Roman, serif",
          fontSize: "80px",
          color: "#fff6d6",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, 390, mission?.label ?? "Treasure Found", {
          fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
          fontSize: "34px",
          color: "#d7f6f7",
        })
        .setOrigin(0.5);

      this.add
        .text(
          width / 2,
          580,
          `Gold +${reward?.gold ?? 0}\nStars +${reward?.stars ?? 0}`,
          {
            align: "center",
            lineSpacing: 20,
            fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
            fontSize: "54px",
            color: "#ffffff",
          },
        )
        .setOrigin(0.5);
    });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
