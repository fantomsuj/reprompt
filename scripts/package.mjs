import { cp, mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import manifest from "../manifest.json" with { type: "json" };

const root = resolve(import.meta.dirname, "..");
const archiveName = `reprompt-${manifest.version}.zip`;
const output = join(root, "dist", archiveName);
const source = join(root, "dist", "unpacked");
const staging = await mkdtemp(join(tmpdir(), "reprompt-package-"));
const files = [
  "content.js",
  "manifest.json",
  "styles.css",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "assets/icon.svg"
].sort();
const stableTime = new Date("2020-01-01T00:00:00.000Z");

try {
  for (const file of files) {
    const destination = join(staging, file);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await cp(join(source, file), destination);
    await utimes(destination, stableTime, stableTime);
  }

  await mkdir(join(root, "dist"), { recursive: true });
  await rm(output, { force: true });
  const result = spawnSync("zip", ["-X", "-q", output, ...files], {
    cwd: staging,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" }
  });
  if (result.status !== 0) throw new Error(result.stderr || "zip failed");
  console.log(`Created dist/${basename(output)}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
