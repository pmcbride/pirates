import Phaser from "phaser";
import { missionNodes, sandboxMissionId } from "../../sim/content";
import { gameStore } from "../../sim/store";
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

    const title = this.add.text(120, 110, "Grand Line Chart", {
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

    const state = gameStore.getState();

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

      // X-marks-the-spot for the final island, palm tree for sandbox,
      // lock for the rest.
      const marker = isSandbox
        ? "🌴"
        : node.missionId === "treasure-isle"
          ? "✕"
          : complete
            ? "✓"
            : unlocked
              ? "★"
              : "🔒";
      const markerText = this.add
        .text(x, y, marker, {
          fontFamily: "Fredoka, Georgia, serif",
          fontSize: "28px",
          color: "#2b1d0e",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.layer?.add([nodeGraphics, markerText]);

      const label = this.add.text(x, y + 56, node.label, {
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
