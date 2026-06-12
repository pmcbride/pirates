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

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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

  // The game intentionally degrades a failed background load to the gradient
  // fallback, so this harness is the only place an art 404 can surface —
  // collect failures and fail the run instead of screenshotting the fallback.
  const artFailures = [];
  page.on("requestfailed", (req) => {
    if (req.url().includes("/art/")) {
      artFailures.push(`${req.url()} — ${req.failure()?.errorText}`);
    }
  });
  page.on("response", (res) => {
    if (!res.url().includes("/art/")) return;
    const type = res.headers()["content-type"] ?? "";
    // Vite's dev server answers missing public/ files with the SPA fallback
    // (200 text/html), so a plain status check misses 404s in dev.
    if (res.status() >= 400 || type.includes("text/html")) {
      artFailures.push(`${res.url()} — HTTP ${res.status()} (${type || "no content-type"})`);
    }
  });
  page.on("console", (msg) => {
    // BootScene warns when a painted texture fails to decode/load.
    if (msg.text().includes("painted art failed to load")) {
      artFailures.push(msg.text());
    }
  });

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

  try {
    for (const id of MISSIONS) {
      await page.goto(`${URL}/?mission=${id}`, { waitUntil: "domcontentloaded" });
      // The deep-link silently no-ops for unknown/locked ids (openMission
      // guard) — assert the mission screen actually mounted rather than
      // screenshotting whatever screen we landed on.
      await page
        .waitForFunction(`!!document.querySelector('[data-action="run-mission"]')`, {
          timeout: 15000,
        })
        .catch(() => {
          throw new Error(
            `mission "${id}" never opened — bad id, locked profile seed, or non-DEV build`,
          );
        });
      await sleep(1500); // texture swap + scene fade-in settle
      const path = `${OUT_DIR}/${id}-${SUFFIX}.png`;
      await page.screenshot({ path });
      console.log("saved", path);
    }
  } finally {
    await browser.close();
  }

  if (artFailures.length > 0) {
    console.error("art requests failed (screenshots show the gradient fallback):");
    for (const f of artFailures) console.error("  " + f);
    process.exit(1);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
