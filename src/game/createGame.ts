import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MissionScene } from "./scenes/MissionScene";
import { RewardScene } from "./scenes/RewardScene";
import { TitleScene } from "./scenes/TitleScene";
import { WorldMapScene } from "./scenes/WorldMapScene";

export const createGame = (parent: HTMLElement): Phaser.Game =>
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#4ec3df",
    scale: {
      // Fill the playfield grid row — the dock owns the bottom row of the
      // page, so the canvas should take every pixel it is given rather than
      // letterboxing a fixed portrait stage. Explicit nonzero numbers (not
      // "100%") so the WebGL renderer never initializes against a 0×0 host
      // (embedded previews report a zero viewport briefly at load); the
      // ResizeObserver in main.ts pushes the real size as soon as it exists.
      mode: Phaser.Scale.RESIZE,
      width: Math.max(parent.clientWidth, 960),
      height: Math.max(parent.clientHeight, 640),
    },
    scene: [BootScene, TitleScene, WorldMapScene, MissionScene, RewardScene],
    render: {
      antialias: true,
      pixelArt: false,
    },
  });
