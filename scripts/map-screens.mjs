// Capture world-map screenshots at several viewport sizes to verify the
// responsive chart layout. Usage:
//   npm i --no-save puppeteer-core && node scripts/map-screens.mjs [outdir]
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.GAME_URL ?? "http://localhost:4173";
const OUT = process.argv[2] ?? "/tmp/map-screens";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [
  { name: "portrait-768x1024", width: 768, height: 1024 },
  { name: "landscape-1280x720", width: 1280, height: 720 },
  { name: "short-1000x500", width: 1000, height: 500 },
];

const main = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--window-size=1280,1024"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 400)));

  await page.setViewport(SIZES[0]);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await sleep(3000);

  // Handle first-launch captain picker if present.
  const hasCaptain = await page.evaluate(
    `!!document.querySelector('.captain-overlay-host')`,
  );
  if (hasCaptain) {
    await page.evaluate(`(() => {
      const input = document.querySelector('.captain-overlay-host input');
      const btn = [...document.querySelectorAll('.captain-overlay-host button')].at(-1);
      if (input) { input.value = 'Tester'; input.dispatchEvent(new Event('input', {bubbles:true})); }
      btn?.click();
    })()`);
    await sleep(1200);
  }

  await page.evaluate(
    `document.querySelector('[data-action="start-adventure"]')?.click()`,
  );
  await sleep(1200);

  for (const size of SIZES) {
    await page.setViewport({ width: size.width, height: size.height });
    await sleep(900);
    const path = `${OUT}-${size.name}.png`;
    await page.screenshot({ path });
    console.log("saved", path);
  }
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
