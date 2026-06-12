import Phaser from "phaser";
import { missionNodes, sandboxMissionId } from "../../sim/content";
import { missionPortraits } from "../../sim/portraits";
import { gameStore } from "../../sim/store";
import { getActiveTheme } from "../../themes";
import { playSfx } from "../../ui/audio";
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
    // Re-layout on canvas resize (Scale.RESIZE mode).
    const onResize = (): void => {
      if (gameStore.getState().screen === "map") {
        this.renderMap();
      }
    };
    this.scale.on("resize", onResize);
    // Phaser 3 never calls a method named `shutdown` — clean up listeners on
    // the real lifecycle event so they don't leak across scene stops.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", onResize);
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    });
    this.renderMap();
  }

  private renderMap(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layer?.removeAll(true);

    // During boot/resize the canvas can briefly report tiny (or zero)
    // dimensions — rounded rects with non-positive sizes can wedge the
    // Graphics pipeline, so wait for a real surface. The scale manager's
    // "resize" listener re-renders once the true size lands.
    if (width < 80 || height < 80) {
      return;
    }

    // Sea backdrop.
    const sea = this.add.graphics();
    sea.fillGradientStyle(uiColors.sky, uiColors.sun, uiColors.sea, uiColors.seaDeep, 1);
    sea.fillRect(0, 0, width, height);
    this.layer?.add(sea);

    // ── Layout ────────────────────────────────────────────────────
    // The DOM HUD overlays this canvas: the top-strip header covers the
    // top corners and the map docket card is pinned to the bottom-left.
    // Derive the parchment chart from the real canvas size (RESIZE scale
    // mode — no fixed stage) so it fills the band between them, with
    // clamps so short landscape windows keep a usable chart instead of
    // the old fixed-offset math collapsing it to a negative height.
    const minSide = Math.min(width, height);
    const pad = Math.max(16, Math.round(minSide * 0.035));
    const chartX = pad;
    const chartWidth = width - pad * 2;
    const chartTop = Math.min(140, Math.max(pad, Math.round(height * 0.14)));
    // Mirrors the .map-docket max-height cap in styles.css (45% of the
    // playfield) so islands and labels stay above the card.
    const docketReserve = Math.min(Math.round(height * 0.42), 360);
    const chartBottom = Math.min(
      height - pad,
      Math.max(
        height - pad - docketReserve,
        // Never let the docket reservation squash the chart below ~45%
        // of the canvas — better to slip under the card's top edge than
        // to vanish entirely.
        chartTop + Math.round(height * 0.45),
      ),
    );
    const chartHeight = chartBottom - chartTop;
    const corner = Math.max(
      8,
      Math.min(40, chartWidth * 0.05, chartHeight * 0.2),
    );
    // Markers/labels shrink proportionally on small canvases, floored so
    // islands stay ≥64px touch targets and labels stay readable.
    const ui = Phaser.Math.Clamp(minSide / 880, 0.6, 1);

    const chart = this.add.graphics();
    chart.fillStyle(uiColors.parchment, 0.96);
    chart.fillRoundedRect(chartX, chartTop, chartWidth, chartHeight, corner);
    chart.lineStyle(6, uiColors.ink, 0.85);
    chart.strokeRoundedRect(chartX, chartTop, chartWidth, chartHeight, corner);
    // subtle parchment hatching
    chart.lineStyle(2, uiColors.ink, 0.06);
    for (let y = chartTop + 24; y < chartBottom - 16; y += 36) {
      chart.lineBetween(chartX + 20, y, chartX + chartWidth - 20, y);
    }
    this.layer?.add(chart);

    const state = gameStore.getState();
    const theme = getActiveTheme(state.profile);
    // Theme drives the chart's name — "Open Seas Chart" in the original
    // theme, "Grand Line Chart" in the one-piece overlay.
    const chartTitle = `${theme.meta.label} Chart`;

    // Centered along the chart's top edge — the DOM top-strip owns the
    // canvas corners, but its space-between layout leaves the middle free.
    const titleSize = Math.round(Phaser.Math.Clamp(minSide * 0.05, 24, 56));
    const subtitleSize = Math.max(14, Math.round(titleSize * 0.42));
    const title = this.add
      .text(width / 2, chartTop + Math.max(14, Math.round(chartHeight * 0.04)), chartTitle, {
        fontFamily: "Fredoka, Georgia, serif",
        fontSize: `${titleSize}px`,
        color: "#2b1d0e",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.layer?.add(title);

    const subtitle = this.add
      .text(width / 2, title.y + titleSize + 10, "Tap an island to plot the next voyage.", {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: `${subtitleSize}px`,
        color: "#4b3a23",
      })
      .setOrigin(0.5, 0);
    this.layer?.add(subtitle);

    // Island node geometry, shared by route dots and markers below. Node
    // x/y are authored percentages with built-in margins (x 12–87,
    // y 22–78) — normalize against their actual bounds and map into the
    // chart's inner area rather than raw canvas space, so islands never
    // land off-parchment or under the DOM docket and the route uses the
    // whole chart even on short canvases. Islands share the title band:
    // the title hugs the center while the top-row islands hug the edges.
    const nodeRadius = Math.max(32, Math.round(36 * ui));
    const selectedRadius = nodeRadius + 8;
    const labelSize = Math.max(14, Math.round(22 * ui));
    const portraitSize = Math.max(26, Math.round(44 * ui));
    const labelOffset = nodeRadius + 18;
    // Fixed DOM chrome overlays the canvas regardless of its size: the
    // top-strip header covers roughly the top 150px and the rail-actions
    // buttons run down the right ~150px. Inset the island area so corner
    // islands stay out from under them (and stay tappable — the DOM
    // chrome captures pointer events).
    const topChrome = 150;
    const railChrome = 150;
    const innerMarginX = Math.max(24, Math.round(chartWidth * 0.05)) + nodeRadius;
    const innerLeft = chartX + innerMarginX;
    const innerRight = Math.max(
      innerLeft + 1,
      Math.min(chartX + chartWidth - innerMarginX, width - railChrome - nodeRadius),
    );
    const innerTop =
      Math.max(chartTop + Math.max(16, Math.round(chartHeight * 0.05)), topChrome) +
      nodeRadius;
    // The chart rect may slip under the docket's top edge (45% floor
    // above), but islands and their labels must not — clamp the island
    // band to the docket-safe bottom (.map-docket caps at 45% + 1rem).
    const docketSafeBottom = Math.min(chartBottom, Math.round(height * 0.55));
    const innerBottom = docketSafeBottom - labelOffset - Math.round(labelSize * 2);
    const spanX = Math.max(innerRight - innerLeft, 1);
    const spanY = Math.max(innerBottom - innerTop, 1);
    const minNodeX = Math.min(...missionNodes.map((node) => node.x));
    const maxNodeX = Math.max(...missionNodes.map((node) => node.x));
    const minNodeY = Math.min(...missionNodes.map((node) => node.y));
    const maxNodeY = Math.max(...missionNodes.map((node) => node.y));
    const nodePoint = (node: { x: number; y: number }): { x: number; y: number } => ({
      x: innerLeft + ((node.x - minNodeX) / Math.max(maxNodeX - minNodeX, 1)) * spanX,
      y: innerTop + ((node.y - minNodeY) / Math.max(maxNodeY - minNodeY, 1)) * spanY,
    });

    // Dotted route lines between successive islands. Sandbox sits off the
    // main route — skip it so the dashed line follows the curriculum.
    const routeNodes = missionNodes.filter(
      (node) => node.missionId !== sandboxMissionId,
    );
    for (let index = 0; index < routeNodes.length - 1; index += 1) {
      const current = nodePoint(routeNodes[index]);
      const next = nodePoint(routeNodes[index + 1]);
      const dots = this.add.graphics();
      dots.fillStyle(uiColors.ink, 0.55);
      const steps = 18;
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        dots.fillCircle(
          current.x + (next.x - current.x) * t,
          current.y + (next.y - current.y) * t,
          Math.max(2.5, 4 * ui),
        );
      }
      this.layer?.add(dots);
    }

    missionNodes.forEach((node) => {
      const { x, y } = nodePoint(node);
      const isSandbox = node.missionId === sandboxMissionId;
      const unlocked = state.profile.unlockedMissionIds.includes(node.missionId);
      const complete = state.profile.completedMissionIds.includes(node.missionId);
      const selected = state.selectedMissionId === node.missionId;

      // Sea-foam halo around selected island.
      if (selected) {
        const halo = this.add.circle(x, y, selectedRadius + 18, uiColors.foam, 0.55);
        this.layer?.add(halo);
      }

      const nodeGraphics = this.add.circle(
        x,
        y,
        selected ? selectedRadius : nodeRadius,
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

      // Portrait glyph hints at what awaits on this island — visible even
      // when locked so the player gets pulled toward the boss/treasure ahead.
      // Locked islands render dimmer with a padlock badge; completed
      // islands get a small checkmark badge.
      const portrait = missionPortraits[node.missionId] ?? "★";
      const portraitText = this.add
        .text(x, y, portrait, {
          fontFamily: "Fredoka, Georgia, serif",
          fontSize: `${portraitSize}px`,
          color: "#2b1d0e",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      // Desaturate locked portraits (sandbox is always "unlocked-ish" in feel).
      if (!unlocked && !isSandbox) {
        portraitText.setAlpha(0.55);
      }
      this.layer?.add([nodeGraphics, portraitText]);

      // Everything that visually belongs to the island wiggles together on a
      // locked tap — the lock badge is created below and pushed in, so the
      // padlock can't shear off its island mid-shake.
      const wiggleTargets: Phaser.GameObjects.GameObject[] = [
        nodeGraphics,
        portraitText,
      ];

      nodeGraphics.on("pointerdown", () => {
        if (!unlocked) {
          // Locked: soft fail tone + a quick head-shake wiggle (cosmetic —
          // skipped under reduced motion; the tone still answers the tap).
          playSfx("fail");
          // isTweening guard: the wiggle is a *relative* tween (x: "+=7"),
          // so stacking a second one mid-shake (rapid double-tap) would
          // compound the offset and drift the island off its anchor.
          if (
            !gameStore.getState().profile.settings.reducedMotion &&
            !this.tweens.isTweening(nodeGraphics)
          ) {
            this.tweens.add({
              targets: wiggleTargets,
              x: "+=7",
              duration: 55,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: 3,
            });
          }
          return;
        }
        if (selected) {
          // Second tap on the already-selected island sails — the DOM
          // Set Sail CTA stays as the redundant affordance.
          gameStore.openMission(node.missionId);
          return;
        }
        gameStore.selectMission(node.missionId);
      });

      // Corner badge: lock for locked nodes, small check for completed.
      // Rendered as a contrasting circle + glyph in the bottom-right corner
      // of the portrait so the portrait itself stays the dominant visual.
      const badgeOffset = Math.round((selected ? selectedRadius : nodeRadius) * 0.72);
      const badgeRadius = Math.max(9, Math.round(12 * ui));
      if (!unlocked && !isSandbox) {
        // Lock badge runs ~2x the other badges — locked-vs-open is the one
        // state a pre-reader must read at arm's length on a tablet.
        const lockRadius = Math.max(18, Math.round(22 * ui));
        const badgeBg = this.add.circle(
          x + badgeOffset,
          y + badgeOffset,
          lockRadius,
          uiColors.ink,
          0.85,
        );
        const badgeText = this.add
          .text(x + badgeOffset, y + badgeOffset, "🔒", {
            fontFamily: "Fredoka, Georgia, serif",
            fontSize: `${Math.max(20, Math.round(26 * ui))}px`,
            color: "#fff1cf",
          })
          .setOrigin(0.5);
        this.layer?.add([badgeBg, badgeText]);
        wiggleTargets.push(badgeBg, badgeText);
      } else if (complete) {
        const badgeBg = this.add.circle(
          x + badgeOffset,
          y + badgeOffset,
          badgeRadius,
          uiColors.mint,
          1,
        );
        badgeBg.setStrokeStyle(2, uiColors.ink, 1);
        const badgeText = this.add
          .text(x + badgeOffset, y + badgeOffset, "✓", {
            fontFamily: "Fredoka, Georgia, serif",
            fontSize: `${Math.max(12, Math.round(16 * ui))}px`,
            color: "#2b1d0e",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        this.layer?.add([badgeBg, badgeText]);
      }

      const nodeLabel = theme.missions[node.missionId]?.label ?? node.missionId;
      const label = this.add.text(x, y + labelOffset, nodeLabel, {
        fontFamily: "Nunito, Trebuchet MS, sans-serif",
        fontSize: `${labelSize}px`,
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
