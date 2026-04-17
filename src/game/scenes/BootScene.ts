import Phaser from "phaser";
import { textureKeys, uiColors } from "../assets/manifest";

const drawRoundedRect = (
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
  graphics.lineStyle(6, uiColors.foam, 0.9);
  graphics.strokeRoundedRect(0, 0, width, height, radius);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    drawRoundedRect(this, textureKeys.ship, uiColors.gold, 108, 86, 28);
    drawRoundedRect(this, textureKeys.enemy, uiColors.coral);
    drawRoundedRect(this, textureKeys.obstacle, uiColors.reef);
    drawRoundedRect(this, textureKeys.treasure, uiColors.sand);
    drawRoundedRect(this, textureKeys.crew, uiColors.plum);
    drawRoundedRect(this, textureKeys.goal, uiColors.mint, 110, 110, 40);
    drawRoundedRect(this, textureKeys.current, uiColors.storm, 96, 96, 30);

    this.scene.start("title");
  }
}
