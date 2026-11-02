// Cost of the relief prototype (terrain.ts) on a throttled mid-range phone, relief off vs on (3D on
// in both). Same profile and steps as perf_3d.mjs (Pixel 7, Fast 3G, 4x CPU; select Vila Real,
// then Mateus, then close). Per step: fps, worst frame, idle (ms to the next map idle), basemap
// tiles and DEM tiles (tiles.mapterhorn.com) requested. Headless WebGL is software: compare only.
// Usage (preview server on :4173): node scripts/perf_relief.mjs [--runs 3] [--out path.json]
// Usage (preview server on :4173): node scripts/perf_3d.mjs [--runs 3] [--out path.json]
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium, devices } = await import("@playwright/test");
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { runs: { type: "string", default: "3" }, out: { type: "string" }, url: { type: "string", default: "http://localhost:4173/" } } });
const RUNS = Math.max(1, Number(args.runs) || 3);
const NETWORK = { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 };
const STEPS = [
  { name: "concelho", query: "Vila Real", option: /Concelho · Vila Real/ },
  { name: "parish", query: "Mateus", option: /Vila Real/ },
  { name: "close" },
];

async function measure(page, act, tiles, dem) {
  await page.evaluate(() => {
    const m = window.pnctMap;
    const p = (window.__step = { frames: [], moved: false, idle: false });
    p.t0 = performance.now();
    const tick = (t) => {
      p.frames.push(t);
      if (!p.idle) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    m.once("moveend", () => (p.moveend = performance.now()));
  });
  const before = tiles.length;
  const demBefore = dem.length;
  await act();
  // The camera's moveend, or (a step that doesn't move it, e.g. closing a flat selection) 1.5 s at rest.
  await page.waitForFunction(() => window.__step.moveend !== undefined || (performance.now() - window.__step.t0 > 1500 && !window.pnctMap.isMoving()), null, { timeout: 60_000 });
  // The next idle after the move: tiles and labels for the new view are in.
  await page.evaluate(() => (window.pnctMap.loaded() && !window.pnctMap.isMoving() ? null : new Promise((r) => window.pnctMap.once("idle", r))));
  const result = await page.evaluate(() => {
    const p = window.__step;
    p.idle = true;
    const idle = Math.round(performance.now() - p.t0);
    if (p.moveend === undefined) return { fps: null, worst: null, idle };
    const anim = p.frames.filter((t) => t >= p.t0 && t <= p.moveend);
    const gaps = anim.slice(1).map((t, i) => t - anim[i]);
    const span = (p.moveend - p.t0) / 1000;
    return { fps: Math.round(anim.length / span), worst: Math.round(Math.max(0, ...gaps)), idle };
  });
  return { ...result, tiles: tiles.length - before, dem: dem.length - demBefore };
}

const results = { profile: { device: "Pixel 7", network: "Fast 3G", cpuThrottlingRate: 4 }, runs: [] };
const browser = await chromium.launch({ channel: "chromium" });
for (let run = 0; run < RUNS; run++) {
  for (const view3d of ["off", "on"]) {
    const context = await browser.newContext({ ...devices["Pixel 7"] });
    await context.addInitScript(() => localStorage.setItem("pnct-map:3d", "on"));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const tiles = [];
    const dem = [];
    page.on("request", (r) => /tiles\.mapterhorn\.com/.test(r.url()) && dem.push(r.url()));
    page.on("request", (r) => /tiles\.openfreemap\.org\/.*\.pbf/.test(r.url()) && tiles.push(r.url()));
    await page.goto(`${args.url}?relief=${view3d === "on" ? "1.5" : "0"}`);
    await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 180_000 });
    const steps = {};
    for (const step of STEPS) {
      steps[step.name] = await measure(
        page,
        step.query
          ? async () => {
              await page.fill("#search-input", step.query);
              await page.locator('#search-list li[role="option"]').filter({ hasText: step.option }).first().click();
            }
          : () => page.getByTestId("panel").getByRole("button", { name: /close/i }).click(),
        tiles,
        dem,
      );
    }
    console.log(`run ${run + 1} relief ${view3d}`, JSON.stringify(steps));
    results.runs.push({ run, view3d, steps });
    await context.close();
  }
}
await browser.close();

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
results.median = {};
for (const view3d of ["off", "on"]) {
  results.median[view3d] = {};
  for (const { name } of STEPS) {
    const xs = results.runs.filter((r) => r.view3d === view3d).map((r) => r.steps[name]);
    results.median[view3d][name] = Object.fromEntries(["fps", "worst", "idle", "tiles", "dem"].map((k) => [k, xs.some((x) => x[k] === null) ? null : median(xs.map((x) => x[k]))]));
  }
}
console.log(JSON.stringify(results.median, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(results, null, 2));
