import Phaser from "phaser";
import { missionNodes, sandboxMissionId } from "../../sim/content";
import { missionPortraits } from "../../sim/portraits";
import { gameStore } from "../../sim/store";
import { getActiveTheme } from "../../themes";
import { uiColors } from "../assets/manifest";

export class WorldMapScene extends Phaser.Scene {
  private unsubscribe?: () => void;

  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super("world-map");
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    this.unsubscribe = gameStore.subscribe(() => {
      if (gameStore.getState().screen === "map") {
        this.renderMap();
      }
    });
    this.renderMap();
  }

  private renderMap(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layer?.removeAll(true);

    // Sea backdrop.
    const sea = this.add.graphics();
    sea.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
    sea.fillRect(0, 0, width, height);
    this.layer?.add(sea);

    // Parchment scroll for the chart, with torn-edge effect via two ellipses.
    const padding = 80;
    const chart = this.add.graphics();
    chart.fillStyle(uiColors.parchment, 0.96);
    chart.fillRoundedRect(padding, padding + 60, width - padding * 2, height - padding * 2 - 360, 40);
    chart.lineStyle(6, uiColors.ink, 0.85);
    chart.strokeRoundedRect(padding, padding + 60, width - padding * 2, height - padding * 2 - 360, 40);
    // subtle parchment hatching
    chart.lineStyle(2, uiColors.ink, 0.06);
    for (let y = padding + 80; y < height - padding - 320; y += 36) {
      chart.lineBetween(padding + 20, y, width - padding - 20, y);
    }
    this.layer?.add(chart);

    const state = gameStore.getState();
    const theme = getActiveTheme(state.profile);
    // Theme drives the chart's name — "Open Seas Chart" in the original
    // theme, "Grand Line Chart" in the one-piece overlay.
    const chartTitle = `${theme.meta.label} Chart`;

    const title = this.add.text(120, 110, chartTitle, {
      fontFamily: "Fredoka, Georgia, serif",
      fontSize: "62px",
      color: "#2b1d0e",
      fontStyle: "bold",
    });
    this.layer?.add(title);

    const subtitle = this.add.text(
      120,
      180,
      "Tap an island to plot the next voyage.",
      {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: "26px",
        color: "#4b3a23",
      },
    );
    this.layer?.add(subtitle);

    // Dotted route lines between successive islands. Sandbox sits off the
    // main route — skip it so the dashed line follows the curriculum.
    const routeNodes = missionNodes.filter(
      (node) => node.missionId !== sandboxMissionId,
    );
    for (let index = 0; index < routeNodes.length - 1; index += 1) {
      const current = routeNodes[index];
      const next = routeNodes[index + 1];
      const x1 = (current.x / 100) * width;
      const y1 = (current.y / 100) * height;
      const x2 = (next.x / 100) * width;
      const y2 = (next.y / 100) * height;
      const dots = this.add.graphics();
      dots.fillStyle(uiColors.ink, 0.55);
      const steps = 18;
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        dots.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4);
      }
      this.layer?.add(dots);
    }

    missionNodes.forEach((node) => {
      const x = (node.x / 100) * width;
      const y = (node.y / 100) * height;
      const isSandbox = node.missionId === sandboxMissionId;
      const unlocked = state.profile.unlockedMissionIds.includes(node.missionId);
      const complete = state.profile.completedMissionIds.includes(node.missionId);
      const selected = state.selectedMissionId === node.missionId;

      // Sea-foam halo around selected island.
      if (selected) {
        const halo = this.add.circle(x, y, 64, uiColors.foam, 0.55);
        this.layer?.add(halo);
      }

      const nodeGraphics = this.add.circle(
        x,
        y,
        selected ? 44 : 36,
        isSandbox
          ? uiColors.mint
          : complete
            ? uiColors.mint
            : unlocked
              ? uiColors.sun
              : uiColors.parchmentDeep,
      );
      nodeGraphics.setStrokeStyle(6, uiColors.ink, 1);
      nodeGraphics.setInteractive({ useHandCursor: unlocked });
      nodeGraphics.on("pointerdown", () => {
        if (unlocked) {
          gameStore.selectMission(node.missionId);
        }
      });

      // Portrait glyph hints at what awaits on this island — visible even
      // when locked so the player gets pulled toward the boss/treasure ahead.
      // Locked islands render dimmer with a tiny padlock badge; completed
      // islands get a small checkmark badge.
      const portrait = missionPortraits[node.missionId] ?? "★";
      const portraitText = this.add
        .text(x, y, portrait, {
          fontFamily: "Fredoka, Georgia, serif",
          fontSize: "44px",
          color: "#2b1d0e",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      // Desaturate locked portraits (sandbox is always "unlocked-ish" in feel).
      if (!unlocked && !isSandbox) {
        portraitText.setAlpha(0.55);
      }
      this.layer?.add([nodeGraphics, portraitText]);

      // Corner badge: small lock for locked nodes, small check for completed.
      // Rendered as a contrasting circle + glyph in the bottom-right corner
      // of the portrait so the portrait itself stays the dominant visual.
      const badgeOffsetX = selected ? 32 : 26;
      const badgeOffsetY = selected ? 32 : 26;
      if (!unlocked && !isSandbox) {
        const badgeBg = this.add.circle(
          x + badgeOffsetX,
          y + badgeOffsetY,
          12,
          uiColors.ink,
          0.85,
        );
        const badgeText = this.add
          .text(x + badgeOffsetX, y + badgeOffsetY, "🔒", {
            fontFamily: "Fredoka, Georgia, serif",
            fontSize: "14px",
            color: "#fff1cf",
          })
          .setOrigin(0.5);
        this.layer?.add([badgeBg, badgeText]);
      } else if (complete) {
        const badgeBg = this.add.circle(
          x + badgeOffsetX,
          y + badgeOffsetY,
          12,
          uiColors.mint,
          1,
        );
        badgeBg.setStrokeStyle(2, uiColors.ink, 1);
        const badgeText = this.add
          .text(x + badgeOffsetX, y + badgeOffsetY, "✓", {
            fontFamily: "Fredoka, Georgia, serif",
            fontSize: "16px",
            color: "#2b1d0e",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        this.layer?.add([badgeBg, badgeText]);
      }

      const nodeLabel = theme.missions[node.missionId]?.label ?? node.missionId;
      const label = this.add.text(x, y + 56, nodeLabel, {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: "22px",
        color: unlocked ? "#2b1d0e" : "#4b3a23",
        fontStyle: "bold",
        backgroundColor: "#fff1cf",
        padding: { x: 10, y: 4 },
      });
      label.setOrigin(0.5, 0);

      this.layer?.add(label);
    });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
