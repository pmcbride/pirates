// Repro + diagnose main-thread wedges: load the game headless, click
// through title → map → mission → Play, and if the page stops responding,
// pause V8 via CDP and print the current stack.
//
// Usage: npm i --no-save puppeteer-core && node scripts/debug-wedge.mjs
// (puppeteer-core is intentionally not a devDependency — it drives the
// system Chrome at the path below and is only needed for this script.)
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:4173";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Eval with a watchdog — if it doesn't settle in `ms`, the page is wedged.
const tryEval = async (page, expr, ms = 3000) => {
  try {
    return await Promise.race([
      page.evaluate(expr),
      sleep(ms).then(() => Symbol.for("timeout")),
    ]);
  } catch (e) {
    return `eval-error: ${e.message}`;
  }
};

const dumpStackIfWedged = async (page, label) => {
  const probe = await tryEval(page, "1+1");
  if (probe !== Symbol.for("timeout")) return false;
  console.log(`\n=== WEDGED at: ${label} — pausing V8 for stack ===`);
  const client = await page.createCDPSession();
  await client.send("Debugger.enable");
  const paused = new Promise((resolve) =>
    client.once("Debugger.paused", (e) => resolve(e)),
  );
  await client.send("Debugger.pause");
  const evt = await Promise.race([paused, sleep(5000).then(() => null)]);
  if (!evt) {
    console.log("Could not pause (hard busy loop without interrupts?)");
    return true;
  }
  for (const frame of evt.callFrames.slice(0, 25)) {
    console.log(
      `  at ${frame.functionName || "(anon)"} (${frame.url.split("/").pop()}:${frame.location.lineNumber})`,
    );
  }
  await client.send("Debugger.resume");
  return true;
};

const main = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--window-size=820,1180"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 820, height: 1180 });

  page.on("console", (msg) => {
    const t = msg.text();
    if (!t.includes("vite") && !t.includes("Phaser v")) console.log("[console]", t.slice(0, 200));
  });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 400)));

  console.log("=== loading", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  if (await dumpStackIfWedged(page, "initial load")) return browser.close();
  console.log("loaded ok; state:", await tryEval(page, `({
    canvas: !!document.querySelector('canvas'),
    title: !!document.querySelector('[data-action="start-adventure"]'),
    captain: !!document.querySelector('.captain-overlay-host input, .captain-overlay-host button'),
  })`));

  // Handle first-launch captain picker if present.
  const hasCaptain = await tryEval(page, `!!document.querySelector('.captain-overlay-host')`);
  if (hasCaptain === true) {
    console.log("=== captain picker present — completing it");
    await tryEval(page, `(() => {
      const input = document.querySelector('.captain-overlay-host input');
      const btn = [...document.querySelectorAll('.captain-overlay-host button')].at(-1);
      if (input) { input.value = 'Tester'; input.dispatchEvent(new Event('input', {bubbles:true})); }
      btn?.click();
    })()`);
    await sleep(1500);
  }

  console.log("=== click: start-adventure");
  await tryEval(page, `document.querySelector('[data-action="start-adventure"]')?.click()`);
  await sleep(1200);
  if (await dumpStackIfWedged(page, "after start-adventure")) return browser.close();

  console.log("=== click: open-selected-mission");
  await tryEval(page, `document.querySelector('[data-action="open-selected-mission"]')?.click()`);
  await sleep(1500);
  if (await dumpStackIfWedged(page, "after open mission")) return browser.close();
  console.log("mission state:", await tryEval(page, `({
    queue: document.querySelectorAll('.queue-card').length,
    play: !!document.querySelector('[data-action="run-mission"]'),
  })`));

  console.log("=== click: run-mission (Play)");
  await tryEval(page, `document.querySelector('[data-action="run-mission"]')?.click()`);
  await sleep(1500);
  if (await dumpStackIfWedged(page, "after run-mission")) return browser.close();

  // Let playback play out.
  await sleep(5000);
  if (await dumpStackIfWedged(page, "during playback")) return browser.close();

  console.log("=== final state:", await tryEval(page, `({
    screen: document.querySelector('.hud-layer')?.className ?? null,
    errors: window.__socErrors ?? [],
  })`));
  await page.screenshot({ path: "/tmp/wedge-final.png" });
  console.log("screenshot: /tmp/wedge-final.png");
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
