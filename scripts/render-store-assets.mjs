import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "marketing", "chrome-web-store");

function findChrome() {
  const candidates = [
    process.env.REPROMPT_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error("Chrome or Chromium was not found. Set REPROMPT_CHROME_PATH.");
  return browser;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const demoUrl = new URL(pathToFileURL(join(root, "marketing", "reprompt-demo.html")));
  demoUrl.searchParams.set("frame", "48");
  await page.goto(demoUrl.href, { waitUntil: "load" });
  await page.waitForFunction(() => window.__DEMO_READY__ === true);
  await page.evaluate(() => {
    document.querySelector(".camera").style.height = "800px";
  });
  await page.screenshot({ path: join(output, "screenshot-pencil.png"), animations: "disabled" });

  await page.evaluate(() => window.renderDemoFrame(72));
  await page.screenshot({ path: join(output, "screenshot-editor.png"), animations: "disabled" });

  const promo = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await promo.goto(pathToFileURL(join(output, "small-promo.svg")).href, { waitUntil: "load" });
  await promo.screenshot({ path: join(output, "small-promo.png"), animations: "disabled" });
} finally {
  await browser.close();
}

console.log("Created Chrome Web Store screenshots and small promo tile.");
