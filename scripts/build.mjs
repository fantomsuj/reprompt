import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist", "unpacked");
const tsc = join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const compilation = spawnSync(tsc, ["--project", join(root, "tsconfig.json")], {
  cwd: root,
  stdio: "inherit"
});
if (compilation.error) throw compilation.error;
if (compilation.status !== 0) process.exit(compilation.status ?? 1);

await Promise.all([
  cp(join(root, "manifest.json"), join(output, "manifest.json")),
  cp(join(root, "styles.css"), join(output, "styles.css")),
  cp(join(root, "assets"), join(output, "assets"), { recursive: true })
]);

const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
const referencedFiles = [
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])])
];
await Promise.all(referencedFiles.map((file) => access(join(output, file))));

console.log("Built loadable extension in dist/unpacked/");
