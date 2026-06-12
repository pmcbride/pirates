// Screenshot every mission board via the `?mission=<id>` dev deep-link.
// Used to verify painted board backgrounds in a real browser at the
// tablet-portrait viewport from the PR definition of done.
//
// Usage: npm i --no-save puppeteer-core && node scripts/screenshot-missions.mjs [suffix]
// Writes art/screenshots/<mission-id>-<suffix>.png (default suffix: "shot").
// Requires a running vite dev server (`npm run dev`). The dev port roams
// (see vite.config.ts), so point SOC_URL at whatever vite printed.
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.SOC_URL ?? "http://localhost:5173";
const OUT_DIR = "art/screenshots";
const SUFFIX = process.argv[2] ?? "shot";

const MISSIONS = [
  "tutorial-cove",
  "spark-shoals",
  "windrise-cove",
  "barrel-bay",
  "harbor-bend",
  "current-crescent",
  "coral-lookout",
  "treasure-isle",
  "sandbox-isle",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--window-size=768,1024"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 768, height: 1024 });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 300)));

  // Seed a captain with every mission unlocked so the `?mission=` deep-link
  // can open boards beyond the fresh-profile unlock frontier. The profile
  // loader merges this over defaults, so a partial profile is fine.
  await page.evaluateOnNewDocument(`
    localStorage.setItem(
      "sea-of-codes/profiles/v3",
      JSON.stringify([{ name: "Tester", profile: { unlockedMissionIds: ${JSON.stringify(MISSIONS)} } }]),
    );
    localStorage.setItem("sea-of-codes/active-profile/v3", "Tester");
  `);

  for (const id of MISSIONS) {
    await page.goto(`${URL}/?mission=${id}`, { waitUntil: "domcontentloaded" });
    await sleep(4000); // boot + texture load + scene fade-in
    const path = `${OUT_DIR}/${id}-${SUFFIX}.png`;
    await page.screenshot({ path });
    console.log("saved", path);
  }

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
