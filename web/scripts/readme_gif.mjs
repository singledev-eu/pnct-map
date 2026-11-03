// The README GIF of the 3D selection, recorded from production (or SHOT_BASE): the country view,
// a concelho (Vila Real) rising as a slab, the drill into one of its parishes (Mateus), starring it
// for the shortlist, and the "All" button back to the whole country. Real-time Playwright video at 1280×800, then ffmpeg:
// 560 px wide, 10 fps, a 96-colour palette without dithering (~2.5 MB; 640 px / 12 fps was 5 MB).
// Usage: node scripts/readme_gif.mjs   →   docs/screenshots/3d-drilldown.gif (and .mp4 next to the
// recording in .artifacts/readme-gif/, not committed). Needs ffmpeg.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForSettled } from "./settled.mjs";

const BASE = process.env.SHOT_BASE ?? "https://pnct.singledev.eu/";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = join(ROOT, ".artifacts/readme-gif");
const OUT = join(ROOT, "docs/screenshots/3d-drilldown.gif");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const pause = (page, ms) => page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
const pick = async (page, query, option) => {
  await page.fill("#search-input", query);
  await page.locator('#search-list li[role="option"]').filter({ hasText: option }).first().click();
};

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light", recordVideo: { dir: WORK, size: { width: 1280, height: 800 } } });
await context.addInitScript(() => {
  localStorage.setItem("pnct-map:3d", "on");
  localStorage.removeItem("pnct-map:shortlist"); // start with an empty shortlist
});
const page = await context.newPage();
const start = Date.now();
await page.goto(`${BASE}?lang=en`);
await waitForSettled(page, "light");
const trimStart = (Date.now() - start) / 1000; // cut the loading from the GIF
await pause(page, 900);
await pick(page, "Vila Real", /Concelho · Vila Real/);
await waitForSettled(page, "light");
await pause(page, 1200);
await pick(page, "Mateus", /Vila Real/);
await waitForSettled(page, "light");
await pause(page, 1000);
await page.getByTestId("panel-star").click(); // the shortlist (0.8.0): the toolbar's ★ 1 appears
await pause(page, 1100);
await page.getByTestId("country-button").click(); // back to the whole country, selection cleared
await waitForSettled(page, "light");
await pause(page, 900);
await context.close();
await browser.close();

const video = join(WORK, readdirSync(WORK).find((f) => f.endsWith(".webm")));
const from = (trimStart + 0.3).toFixed(2); // the recording lags the clock a little: start just after the load
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", from, "-i", video, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(WORK, "3d-drilldown.mp4")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", from, "-i", video, "-vf", "fps=10,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", OUT]);
console.log(`${OUT}: ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
