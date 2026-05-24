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

    const sky = this.add.graphics();
    sky.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
    sky.fillRect(0, 0, width, height);

    // Foam bubbles for a sea-surface feel.
    sky.fillStyle(uiColors.foam, 0.18);
    for (let index = 0; index < 22; index += 1) {
      sky.fillCircle(60 + index * 42, 720 + (index % 4) * 180, 28 + (index % 5) * 8);
    }

    this.add
      .text(width / 2, 240, "SEA OF CODES", {
        fontFamily: "Fredoka, Georgia, Times New Roman, serif",
        fontSize: "108px",
        color: "#2b1d0e",
        fontStyle: "bold",
        stroke: "#fff1cf",
        strokeThickness: 12,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 360, "A pirate coding voyage for young captains", {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: "30px",
        color: "#2b1d0e",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        600,
        "Queue bold moves.\nWatch the Going Merry sail.\nChase the One Piece.",
        {
          align: "center",
          lineSpacing: 14,
          fontFamily: "Nunito, Trebuchet MS, sans-serif",
          fontSize: "48px",
          color: "#2b1d0e",
        },
      )
      .setOrigin(0.5);

    const startText = this.add
      .text(width / 2, height - 220, "⛵  Tap to set sail  ⛵", {
        fontFamily: "Fredoka, Georgia, serif",
        fontSize: "36px",
        color: "#2b1d0e",
        backgroundColor: "#ffb24a",
        padding: { x: 32, y: 20 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.pulse = this.tweens.add({
      targets: startText,
      scaleX: 1.05,
      scaleY: 1.05,
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
