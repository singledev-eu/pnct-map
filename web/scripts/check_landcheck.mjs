// Fails a deploy that would ship without the land check files (docs/land-check/HOSTING.md): each
// directory named in web/data/landcheck.meta.json must be in web/public/ with the recorded file count,
// size and tree SHA-256 (scripts/build_hazard.py tree_sha256: "<relative path>\0<file sha256>\n" per
// file, sorted by path). They are gitignored and built by `uv run make landcheck`.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const meta = JSON.parse(readFileSync(new URL("../data/landcheck.meta.json", import.meta.url), "utf8"));
// The nearby-services grid (docs/nearby-services/DATA.md) follows the same scheme: built by `uv run make services`.
const services = JSON.parse(readFileSync(new URL("../data/services.meta.json", import.meta.url), "utf8"));
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

let failed = false;
const BUILD = { tiles: "landcheck", cells: "landcheck", "services grid": "services" };
for (const [part, m] of Object.entries({ tiles: meta.hazard.tiles, cells: meta.hazard.cells, "services grid": services.grid })) {
  const dir = join(publicDir, m.dir);
  if (!existsSync(dir)) {
    console.error(`land check ${part}: ${m.dir} is missing (gitignored, so a fresh checkout doesn't have it). Run \`uv run make ${BUILD[part]}\` in the repo root before deploying.`);
    failed = true;
    continue;
  }
  const files = walk(dir)
    .map((path) => [relative(dir, path).split(sep).join("/"), path])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)); // byte order, as Python's sorted()
  const tree = createHash("sha256");
  let bytes = 0;
  for (const [rel, path] of files) {
    const data = readFileSync(path);
    bytes += data.length;
    tree.update(`${rel}\0${createHash("sha256").update(data).digest("hex")}\n`);
  }
  const sha = tree.digest("hex");
  if (files.length !== m.files || bytes !== m.bytes || sha !== m.tree_sha256) {
    console.error(`land check ${part}: ${m.dir} does not match the meta (${files.length} files, ${bytes} bytes); rebuild with \`uv run make ${BUILD[part]}\``);
    failed = true;
  } else console.log(`land check ${part}: ${m.dir} ok (${files.length} files, ${(bytes / 2 ** 20).toFixed(1)} MiB)`);
}
process.exit(failed ? 1 : 0);
