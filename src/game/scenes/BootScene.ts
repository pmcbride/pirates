import Phaser from "phaser";
import { missionBackgrounds, shipArtKey, textureKeys, uiColors } from "../assets/manifest";

const drawStamp = (
  scene: Phaser.Scene,
  key: string,
  fill: number,
  width = 96,
  height = 96,
  radius = 24,
): void => {
  const graphics = scene.add.graphics();
  graphics.setVisible(false);
  graphics.fillStyle(fill, 1);
  graphics.fillRoundedRect(0, 0, width, height, radius);
  graphics.lineStyle(6, uiColors.ink, 1);
  graphics.strokeRoundedRect(3, 3, width - 6, height - 6, radius);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    // Painted art lives in public/art/. Load failures are non-fatal — scenes
    // check texture existence and fall back to the procedural tokens.
    this.load.image(shipArtKey, "art/ship.png");
    for (const [, key] of Object.entries(missionBackgrounds)) {
      this.load.image(key, `art/${key}.png`);
    }
  }

  create(): void {
    // Going Merry — a sun-yellow rounded ship token with an ink outline.
    drawStamp(this, textureKeys.ship, uiColors.sun, 108, 86, 28);
    // Marine skiff — coral with ink outline.
    drawStamp(this, textureKeys.enemy, uiColors.coral);
    // Reef — muted green.
    drawStamp(this, textureKeys.obstacle, uiColors.reef);
    // Chest — parchment + gold.
    drawStamp(this, textureKeys.treasure, uiColors.gold);
    // Waiting Straw Hat — plum.
    drawStamp(this, textureKeys.crew, uiColors.plum);
    // Goal marker — bright sun.
    drawStamp(this, textureKeys.goal, uiColors.sunset, 110, 110, 40);
    // Current — sea blue.
    drawStamp(this, textureKeys.current, uiColors.sea, 96, 96, 30);

    // Hand off to the shell's scene router (main.ts) — it starts whichever
    // scene matches the store's current screen. Hardcoding `start("title")`
    // here raced the router when a deep-link opened a mission during boot.
    this.game.events.emit("soc-boot-complete");
  }
}
