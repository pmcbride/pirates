import Phaser from "phaser";
import { crewPortraitPaths } from "../../sim/portraits";
import {
  crewArtKey,
  goalArtKey,
  missionBackgrounds,
  shipArtKey,
  textureKeys,
  tileArtKeys,
  uiColors,
} from "../assets/manifest";

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

/**
 * Current token — a foam spiral on storm blue. The old sea-blue stamp
 * (uiColors.sea) was invisible against the water tiles it sat on; storm blue
 * contrasts with the board and the spiral telegraphs "swirling current"
 * without any reading.
 */
const drawCurrentStamp = (scene: Phaser.Scene, key: string): void => {
  const size = 96;
  const graphics = scene.add.graphics();
  graphics.setVisible(false);
  graphics.fillStyle(uiColors.storm, 1);
  graphics.fillRoundedRect(0, 0, size, size, 30);
  graphics.lineStyle(6, uiColors.ink, 1);
  graphics.strokeRoundedRect(3, 3, size - 6, size - 6, 30);
  // Archimedean spiral approximated as a polyline — cheap, crisp at token size.
  graphics.lineStyle(7, uiColors.foam, 1);
  graphics.beginPath();
  const center = size / 2;
  for (let theta = 0; theta <= Math.PI * 3.5; theta += Math.PI / 16) {
    const radius = 2 + theta * 3;
    const px = center + Math.cos(theta) * radius;
    const py = center + Math.sin(theta) * radius;
    if (theta === 0) {
      graphics.moveTo(px, py);
    } else {
      graphics.lineTo(px, py);
    }
  }
  graphics.strokePath();
  graphics.generateTexture(key, size, size);
  graphics.destroy();
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    // Painted art lives in public/art/. Load failures are non-fatal — scenes
    // check texture existence and fall back to the procedural tokens — but
    // log them so a 404/typo'd key is diagnosable and not just "looks plain".
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn(`[boot] painted art failed to load, using fallback: ${file.key} (${file.src})`);
    });
    this.load.image(shipArtKey, "art/ship.png");
    for (const [, key] of Object.entries(missionBackgrounds)) {
      this.load.image(key, `art/${key}.webp`);
    }
    // Hand-drawn tile icons (treasure chest, marine skiff, reef, crew mate,
    // current swirl, X-marks-the-spot goal). SVGs rasterized at 192px — about
    // 2× the largest on-board tile size — so they stay crisp on retina.
    const svgSize = { width: 192, height: 192 };
    for (const [, key] of Object.entries(tileArtKeys)) {
      this.load.svg(key, `art/tiles/${key}.svg`, svgSize);
    }
    this.load.svg(goalArtKey, `art/tiles/${goalArtKey}.svg`, svgSize);
    // Crew portrait badges — rasterized at 2× their largest on-screen size
    // so they stay crisp on retina tablets. Missing files degrade to the
    // badge simply not rendering (scenes check texture existence).
    for (const [crewId, path] of Object.entries(crewPortraitPaths)) {
      this.load.svg(crewArtKey(crewId), path, { width: 96, height: 96 });
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
    // Current — foam spiral on storm blue (sea blue vanished against water).
    drawCurrentStamp(this, textureKeys.current);

    // Hand off to the shell's scene router (main.ts) — it starts whichever
    // scene matches the store's current screen. Hardcoding `start("title")`
    // here raced the router when a deep-link opened a mission during boot.
    this.game.events.emit("soc-boot-complete");
  }
}
