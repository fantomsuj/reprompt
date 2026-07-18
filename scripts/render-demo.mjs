import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const frameDirectory = await mkdtemp(join(tmpdir(), "reprompt-demo-"));
const output = join(root, "marketing", "reprompt-demo.mp4");
const frameCount = 102;
const frameRate = 30;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}.`);
  }
}

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
  if (!browser) {
    throw new Error("Chrome or Chromium was not found. Set REPROMPT_CHROME_PATH to its executable.");
  }
  return browser;
}

let browser;
try {
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const url = new URL(pathToFileURL(join(root, "marketing", "reprompt-demo.html")));
  url.searchParams.set("frame", "0");
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => window.__DEMO_READY__ === true);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const state = await page.evaluate((value) => window.renderDemoFrame(value), frame);
    if (frame >= 29 && !state.editBeforeCopy) {
      throw new Error(`Extension pencil is not immediately before Copy at frame ${frame}.`);
    }
    const filename = `frame-${String(frame).padStart(3, "0")}.png`;
    await page.screenshot({ path: join(frameDirectory, filename), animations: "disabled" });
    if (frame % 15 === 0 || frame === frameCount - 1) {
      process.stdout.write(`Captured frame ${frame + 1}/${frameCount}\n`);
    }
  }

  await browser.close();
  browser = undefined;
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-framerate", String(frameRate),
    "-i", join(frameDirectory, "frame-%03d.png"),
    "-frames:v", String(frameCount),
    "-c:v", "libx264",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output
  ]);
  console.log("Created marketing/reprompt-demo.mp4 (1280x720, 30 fps, 3.4s)." );
} finally {
  await browser?.close();
  await rm(frameDirectory, { recursive: true, force: true });
}
