// Fails a deploy that would ship without the land check files (docs/land-check/HOSTING.md): every
// file named in web/data/landcheck.meta.json must be in web/public/ with the recorded size and SHA-256.
// They are gitignored and built by `uv run make landcheck`.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const meta = JSON.parse(readFileSync(new URL("../data/landcheck.meta.json", import.meta.url), "utf8"));
let failed = false;
for (const [part, m] of Object.entries({ tiles: meta.hazard.tiles, cells: meta.hazard.cells })) {
  const path = new URL(`../public/${m.file}`, import.meta.url);
  if (!existsSync(path)) {
    console.error(`land check ${part}: ${m.file} is missing; run \`uv run make landcheck\` in the repo root`);
    failed = true;
    continue;
  }
  const data = readFileSync(path);
  const sha = createHash("sha256").update(data).digest("hex");
  if (data.length !== m.bytes || sha !== m.sha256) {
    console.error(`land check ${part}: ${m.file} does not match the meta (size ${data.length} vs ${m.bytes}); rebuild with \`uv run make landcheck\``);
    failed = true;
  } else console.log(`land check ${part}: ${m.file} ok (${(data.length / 2 ** 20).toFixed(1)} MiB)`);
}
process.exit(failed ? 1 : 0);
