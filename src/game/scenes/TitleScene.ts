import Phaser from "phaser";
import { uiColors } from "../assets/manifest";

/**
 * Title-screen *background* scene. The actual title affordance (heading +
 * Set Sail CTA) is rendered by the DOM HUD's `renderTitleMarkup` — the
 * parchment poster card — so this scene intentionally renders no text and
 * no tap handler. Two stacked title overlays + two "tap to sail" buttons
 * confused first-time players badly (see PR #16 brief). Now it's pure
 * atmosphere: sky-to-sea gradient + foam bubbles, behind the DOM card.
 */
export class TitleScene extends Phaser.Scene {
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
  }
}
