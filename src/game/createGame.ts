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
    width: 900,
    height: 1500,
    backgroundColor: "#08273a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, TitleScene, WorldMapScene, MissionScene, RewardScene],
    render: {
      antialias: true,
      pixelArt: false,
    },
  });
