import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import manifest from "../manifest.json" with { type: "json" };

const archive = resolve(import.meta.dirname, "..", "dist", `reprompt-${manifest.version}.zip`);
const expected = [
  "assets/icon-128.png",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon.svg",
  "content.js",
  "manifest.json",
  "styles.css"
].sort();
const listing = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
if (listing.status !== 0) throw new Error(listing.stderr || "Could not inspect package");
const actual = listing.stdout.trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected package contents: ${actual.join(", ")}`);
}

const archiveManifest = spawnSync("unzip", ["-p", archive, "manifest.json"], {
  encoding: "utf8"
});
const packagedVersion = JSON.parse(archiveManifest.stdout).version;
if (packagedVersion !== manifest.version) throw new Error("Packaged manifest version mismatch");
await readFile(archive);
console.log(`Verified dist/reprompt-${manifest.version}.zip`);
