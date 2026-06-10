import { resolveActiveCaptain } from "./ui/captainPicker";
import type { AppState } from "./sim/types";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

// Dev-only crash visibility: uncaught exceptions inside Phaser's render loop
// kill the game silently (black canvas). Surface them on a window array and
// the console so headless previews and playtests can read what broke.
if (import.meta.env.DEV) {
  const errors: string[] = ((window as never as Record<string, unknown>).__socErrors = []);
  window.addEventListener("error", (event) => {
    errors.push(String(event.error?.stack ?? event.message).slice(0, 800));
    console.error("[soc] uncaught:", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    errors.push(String((event.reason as Error)?.stack ?? event.reason).slice(0, 800));
    console.error("[soc] unhandled rejection:", event.reason);
  });
}

// Pre-mount: resolve which captain is sailing BEFORE the GameStore singleton
// initializes (it reads the active profile from localStorage at import time).
// On first launch this shows the welcome/name screen; with one captain it's
// a synchronous no-op; with multiple it shows the picker.
const bootstrap = async (): Promise<void> => {
  const pickerHost = document.createElement("div");
  pickerHost.className = "captain-overlay-host";
  app.appendChild(pickerHost);

  await resolveActiveCaptain(pickerHost);

  // Tear down the pre-mount overlay before the game shell takes over the root.
  pickerHost.remove();
  // Two-row grid: the playfield (canvas + HUD overlay) takes the remaining
  // height, and the bottom dock row carries the command queue + palette so
  // they never overlap the board. See `.app-shell` rules in `styles.css`.
  app.innerHTML = `
    <main class="app-shell">
      <div class="playfield-region">
        <section id="game-root" class="game-root" aria-label="Sea of Codes playfield"></section>
        <section id="hud-root" class="hud-root" aria-label="Sea of Codes controls"></section>
      </div>
      <section id="dock-root" class="dock-root" aria-label="Command dock"></section>
    </main>
  `;

  const gameRoot = document.querySelector<HTMLDivElement>("#game-root");
  const hudRoot = document.querySelector<HTMLDivElement>("#hud-root");
  const dockRoot = document.querySelector<HTMLDivElement>("#dock-root");
  const appShell = app.querySelector<HTMLElement>(".app-shell");

  if (!gameRoot || !hudRoot || !dockRoot || !appShell) {
    throw new Error("Game shell failed to mount.");
  }

  // Dynamic imports so the store / Phaser bundle don't initialize until the
  // active captain has been resolved.
  const [
    { createGame },
    { gameStore },
    { Hud },
    { missions },
    { getActiveTheme },
    { createAriaLiveRegion },
  ] = await Promise.all([
    import("./game/createGame"),
    import("./sim/store"),
    import("./ui/hud"),
    import("./sim/content"),
    import("./themes"),
    import("./ui/aria-live"),
  ]);

  // Boot Phaser only once the shell has real layout — WebGL renderer
  // creation fails against a 0×0 host. Hidden/embedded windows throttle
  // timers (and never fire rAF), so don't poll: a ResizeObserver fires once
  // on observe and again the moment the host gets real dimensions. Race it
  // against a short timeout so a permanently-hidden context still boots —
  // createGame falls back to a nonzero stage size and the observer below
  // pushes the true size when it exists.
  if (gameRoot.clientHeight === 0) {
    await new Promise<void>((resolve) => {
      const bootObserver = new ResizeObserver(() => {
        if (gameRoot.clientHeight > 0) {
          bootObserver.disconnect();
          resolve();
        }
      });
      bootObserver.observe(gameRoot);
      setTimeout(() => {
        bootObserver.disconnect();
        resolve();
      }, 2000);
    });
  }

  const game = createGame(gameRoot);
  new Hud(hudRoot, dockRoot);

  // Dev deep-link: jump straight into a mission for fast manual testing —
  // `?mission=tutorial-cove` in the URL, or the equivalent localStorage key
  // (handy when the URL isn't editable, e.g. embedded previews).
  if (import.meta.env.DEV) {
    const devMission =
      new URLSearchParams(window.location.search).get("mission") ??
      window.localStorage.getItem("soc-dev-open-mission");
    if (devMission) {
      gameStore.startAdventure();
      gameStore.openMission(devMission);
    }
  }

  // Phaser's RESIZE scale mode only reacts to *window* resizes. The playfield
  // row also changes size when the dock mounts/unmounts (screen swaps), so
  // watch the host element directly and push its box into the scale manager.
  const resizeObserver = new ResizeObserver(() => {
    const { clientWidth, clientHeight } = gameRoot;
    if (clientWidth > 0 && clientHeight > 0) {
      game.scale.resize(clientWidth, clientHeight);
    }
  });
  resizeObserver.observe(gameRoot);

  // Screen-reader narration channel. Mounted in the app shell so it survives
  // every screen swap (the HUD layer is replaced when the screen changes).
  const aria = createAriaLiveRegion(appShell);

  const screenSceneMap: Record<string, string> = {
    title: "title",
    map: "world-map",
    mission: "mission",
    sandbox: "mission",
    reward: "reward",
  };

  const routeScene = (screen: keyof typeof screenSceneMap): void => {
    const targetScene = screenSceneMap[screen];
    const activeSceneKeys = new Set(
      game.scene.getScenes(true).map((scene) => scene.scene.key),
    );

    (Object.values(screenSceneMap) as string[]).forEach((sceneKey) => {
      if (sceneKey === targetScene) {
        if (!activeSceneKeys.has(sceneKey)) {
          game.scene.start(sceneKey);
        }
        return;
      }

      if (activeSceneKeys.has(sceneKey)) {
        game.scene.stop(sceneKey);
      }
    });
  };

  // — Screen-reader narration —
  // Watch state for screen / phase / playback / reward transitions and pipe a
  // human-readable sentence to the aria-live region. The element is throttled
  // internally so rapid-fire ticks don't flood the SR queue.
  let lastScreen: AppState["screen"] | null = null;
  let lastPhase: AppState["missionPhase"] | null = null;
  let lastPlaybackKey: string | null = null;
  let lastRewardMissionId: string | null = null;

  const describePhase = (state: AppState): string => {
    const mission = state.activeMissionId ? missions[state.activeMissionId] : null;
    const theme = getActiveTheme(state.profile);
    const label = mission
      ? (theme.missions[mission.id]?.label ?? mission.id)
      : "this voyage";
    switch (state.missionPhase) {
      case "planning":
        return `Build your plan for ${label}.`;
      case "predicting":
        return `Predict where the ship will land for ${label}.`;
      case "running":
        return `Running the plan for ${label}.`;
      default:
        return "";
    }
  };

  const narrate = (state: AppState): void => {
    // Screen change.
    if (state.screen !== lastScreen) {
      lastScreen = state.screen;
      // Reset phase/playback tracking when switching screens so we re-announce
      // the next phase even if it happens to match the previous one.
      lastPhase = null;
      lastPlaybackKey = null;
      if (state.screen === "title") {
        aria.announce("Sea of Codes. Tap Set Sail to begin.");
      } else if (state.screen === "map") {
        aria.announce("Sea chart. Pick the next voyage.");
      } else if (state.screen === "reward") {
        const reward = state.lastRun?.reward;
        const lastLog = state.profile.captainLog.at(-1);
        const parts = ["Voyage cleared."];
        if (reward) {
          parts.push(
            `Earned ${reward.berries} berries, ${reward.bounty} bounty, ${reward.stars} stars.`,
          );
        }
        if (lastLog) {
          parts.push(lastLog.oneLine);
        }
        aria.announce(parts.join(" "));
        lastRewardMissionId = state.rewardMissionId;
      }
    }

    // Mission phase change.
    if (
      (state.screen === "mission" || state.screen === "sandbox") &&
      state.missionPhase !== lastPhase
    ) {
      lastPhase = state.missionPhase;
      aria.announce(describePhase(state));
    }

    // Playback tick — read step.message as the ship moves.
    if (state.missionPhase === "running" && state.lastRun) {
      const step = state.lastRun.steps[state.playbackIndex];
      if (step) {
        const key = `${state.activeMissionId}|${state.playbackIndex}|${step.status}`;
        if (key !== lastPlaybackKey) {
          lastPlaybackKey = key;
          if (step.message) {
            aria.announce(step.message);
          }
        }
      }
    } else if (state.missionPhase !== "running") {
      lastPlaybackKey = null;
    }

    // Reward overlay change (different mission cleared back-to-back).
    if (
      state.screen === "reward" &&
      state.rewardMissionId &&
      state.rewardMissionId !== lastRewardMissionId
    ) {
      lastRewardMissionId = state.rewardMissionId;
    }
  };

  // Wait for BootScene to finish generating/loading textures before routing —
  // routing on Phaser READY raced the boot preload (scenes started without
  // their textures). BootScene emits this once its assets are in place.
  game.events.once("soc-boot-complete", () => {
    gameStore.subscribe((state) => {
      routeScene(state.screen);
      narrate(state);
    });
  });
};

void bootstrap();
