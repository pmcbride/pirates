import Phaser from "phaser";
import { createGame } from "./game/createGame";
import { gameStore } from "./sim/store";
import "./styles.css";
import { Hud } from "./ui/hud";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <main class="app-shell">
    <section id="game-root" class="game-root" aria-label="Sea of Codes playfield"></section>
    <section id="hud-root" class="hud-root" aria-label="Sea of Codes controls"></section>
  </main>
`;

const gameRoot = document.querySelector<HTMLDivElement>("#game-root");
const hudRoot = document.querySelector<HTMLDivElement>("#hud-root");

if (!gameRoot || !hudRoot) {
  throw new Error("Game shell failed to mount.");
}

const game = createGame(gameRoot);
new Hud(hudRoot);

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

game.events.once(Phaser.Core.Events.READY, () => {
  gameStore.subscribe((state) => {
    routeScene(state.screen);
  });
});
