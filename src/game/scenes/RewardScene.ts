import Phaser from "phaser";
import { formatBerries, formatBounty, missions } from "../../sim/content";
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
      bg.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
      bg.fillRect(0, 0, width, height);

      // Floating berries + stars confetti.
      for (let index = 0; index < 24; index += 1) {
        const circle = this.add.circle(
          Phaser.Math.Between(40, width - 40),
          Phaser.Math.Between(80, height - 80),
          Phaser.Math.Between(10, 22),
          index % 2 === 0 ? uiColors.gold : uiColors.parchment,
          0.7,
        );
        circle.setStrokeStyle(3, uiColors.ink, 0.8);
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
        .text(width / 2, 260, "Voyage Clear", {
          fontFamily: "Fredoka, Georgia, serif",
          fontSize: "82px",
          color: "#2b1d0e",
          fontStyle: "bold",
          stroke: "#fff1cf",
          strokeThickness: 10,
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, 370, mission?.label ?? "Treasure Found", {
          fontFamily: "Nunito, Trebuchet MS, sans-serif",
          fontSize: "34px",
          color: "#2b1d0e",
        })
        .setOrigin(0.5);

      this.add
        .text(
          width / 2,
          560,
          `💰 +${formatBerries(reward?.berries ?? 0)}\n📜 +${formatBounty(reward?.bounty ?? 0)}\n⭐ +${reward?.stars ?? 0}`,
          {
            align: "center",
            lineSpacing: 16,
            fontFamily: "Nunito, Trebuchet MS, sans-serif",
            fontSize: "48px",
            color: "#2b1d0e",
            fontStyle: "bold",
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
