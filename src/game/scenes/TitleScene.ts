import Phaser from "phaser";
import { gameStore } from "../../sim/store";
import { uiColors } from "../assets/manifest";

export class TitleScene extends Phaser.Scene {
  private pulse?: Phaser.Tweens.Tween;

  constructor() {
    super("title");
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(
      uiColors.seaDeep,
      uiColors.sea,
      uiColors.seaDeep,
      uiColors.sea,
      1,
    );
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(uiColors.foam, 0.08);
    for (let index = 0; index < 18; index += 1) {
      graphics.fillCircle(
        80 + index * 50,
        180 + (index % 3) * 260,
        64 + (index % 4) * 12,
      );
    }

    this.add
      .text(width / 2, 260, "SEA OF CODES", {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "86px",
        color: "#fff6d6",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 360, "A touch-first pirate quest for young coders", {
        fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
        fontSize: "28px",
        color: "#d7f6f7",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        560,
        "Queue bold moves.\nWatch them sail.\nFind treasure with loops and ifs.",
        {
          align: "center",
          lineSpacing: 12,
          fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
          fontSize: "48px",
          color: "#ffffff",
        },
      )
      .setOrigin(0.5);

    const startText = this.add
      .text(width / 2, height - 220, "Tap anywhere to start", {
        fontFamily: "Trebuchet MS, Avenir Next, Segoe UI, sans-serif",
        fontSize: "32px",
        color: "#fff6d6",
        backgroundColor: "#163b52",
        padding: { x: 26, y: 18 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.pulse = this.tweens.add({
      targets: startText,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    this.input.once("pointerdown", () => {
      gameStore.startAdventure();
      this.scene.start("world-map");
    });
  }

  shutdown(): void {
    this.pulse?.stop();
  }
}
