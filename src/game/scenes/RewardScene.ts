import Phaser from "phaser";
import { gameStore } from "../../sim/store";
import { shipArtKey, uiColors } from "../assets/manifest";

/**
 * Reward-screen *celebration* scene. All readable reward content (mission
 * label, berries/bounty/stars, the claim CTA) lives in the DOM HUD card —
 * this scene intentionally renders NO text. Duplicating "Voyage Clear" +
 * numbers on the canvas behind the DOM card just doubled the noise for a
 * pre-reader. Pure cosmetic atmosphere instead: gradient sea, confetti,
 * rising bubbles, and the Going Merry bobbing under the card. Every tween
 * here is cosmetic-only and skipped under reduced motion.
 */
export class RewardScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  constructor() {
    super("reward");
  }

  create(): void {
    // Phaser 3 never calls a method named `shutdown` — unhook the store
    // subscription on the real lifecycle event so it doesn't leak across
    // scene stops and render into destroyed objects.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    });
    this.unsubscribe = gameStore.subscribe((state) => {
      if (state.screen !== "reward") {
        return;
      }

      const width = this.scale.width;
      const height = this.scale.height;
      // Re-rendering: kill prior tweens BEFORE destroying their targets so
      // repeat:-1 confetti tweens never pile up across notifications.
      this.tweens.killAll();
      this.children.removeAll(true);
      const reduced = state.profile.settings.reducedMotion;

      const bg = this.add.graphics();
      bg.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
      bg.fillRect(0, 0, width, height);

      // Floating berries + parchment-coin confetti.
      for (let index = 0; index < 24; index += 1) {
        const circle = this.add.circle(
          Phaser.Math.Between(40, width - 40),
          Phaser.Math.Between(80, height - 80),
          Phaser.Math.Between(10, 22),
          index % 2 === 0 ? uiColors.gold : uiColors.parchment,
          0.7,
        );
        circle.setStrokeStyle(3, uiColors.ink, 0.8);
        if (!reduced) {
          this.tweens.add({
            targets: circle,
            y: circle.y - Phaser.Math.Between(10, 36),
            duration: Phaser.Math.Between(1200, 2200),
            yoyo: true,
            repeat: -1,
          });
        }
      }

      // Spinning gold-star confetti drifting down from the top edge.
      if (!reduced) {
        for (let index = 0; index < 10; index += 1) {
          const star = this.add.star(
            Phaser.Math.Between(30, width - 30),
            Phaser.Math.Between(-160, -20),
            5,
            7,
            16,
            uiColors.gold,
            0.95,
          );
          star.setStrokeStyle(2, uiColors.ink, 0.7);
          this.tweens.add({
            targets: star,
            y: height + 40,
            angle: Phaser.Math.Between(180, 540),
            duration: Phaser.Math.Between(2400, 4200),
            delay: Phaser.Math.Between(0, 1400),
            repeat: -1,
            ease: "Sine.easeIn",
          });
        }
      }

      // Rising sea-foam bubbles.
      for (let index = 0; index < 12; index += 1) {
        const bubble = this.add.circle(
          Phaser.Math.Between(30, width - 30),
          reduced
            ? Phaser.Math.Between(Math.floor(height * 0.5), height - 40)
            : height + Phaser.Math.Between(10, 220),
          Phaser.Math.Between(5, 12),
          uiColors.foam,
          0.5,
        );
        if (!reduced) {
          this.tweens.add({
            targets: bubble,
            y: -30,
            duration: Phaser.Math.Between(2600, 4800),
            delay: Phaser.Math.Between(0, 1200),
            repeat: -1,
            ease: "Sine.easeIn",
          });
        }
      }

      // The Going Merry bobbing proudly below the DOM card (painted art only —
      // no procedural fallback; the token would read as a random rectangle).
      if (this.textures.exists(shipArtKey)) {
        const ship = this.add.image(width / 2, height * 0.64, shipArtKey);
        const targetW = Math.min(width * 0.3, 260);
        ship.setScale(targetW / ship.width);
        if (!reduced) {
          this.tweens.add({
            targets: ship,
            y: ship.y - 14,
            angle: 3,
            duration: 1400,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
        }
      }
    });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
