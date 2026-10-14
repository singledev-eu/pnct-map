// Throttled load-time harness for the built app (run `npm run preview` first).
//
// Profile per run: fresh Chromium + fresh context (cold cache, cache disabled), Pixel 7 device
// emulation, DevTools "Fast 3G" (562.5 ms latency, 180000 B/s down, 84375 B/s up) and 4x CPU slowdown.
// Two milestones, both from navigation start (performance.now()):
//   parishes = body.dataset.parishesLoaded: first frame after the parish source has loaded (polygons drawn)
//   ready    = body.dataset.ready: first full map idle (also waits for basemap tiles and label glyphs)
//
// Usage: node scripts/perf.mjs [--runs 3] [--url http://localhost:4173/] [--label baseline] [--out path.json] [--toggles 0]
// --toggles N: after the map is ready, click "Only PNCT" N times and time each click to the next map idle.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0"; // Chromium lives in node_modules; must precede the import
const { chromium, devices } = await import("@playwright/test");
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    url: { type: "string", default: "http://localhost:4173/" },
    label: { type: "string", default: "baseline" },
    out: { type: "string" },
    toggles: { type: "string", default: "0" },
  },
});
const RUNS = Math.max(1, Number(args.runs) || 3);
const TOGGLES = Math.max(0, Number(args.toggles) || 0);
const URL_ = args.url;
const TIMEOUT_MS = 120_000;
const NETWORK = { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 };
const CPU_RATE = 4;
const profile = { device: "Pixel 7", network: "Fast 3G", ...NETWORK, cpuThrottlingRate: CPU_RATE };

// Runs in the page before any script: records when each milestone attribute first becomes "true".
function installReadyObserver() {
  window.__perf = {};
  const check = () => {
    const d = document.body?.dataset ?? {};
    if (window.__perf.parishes === undefined && d.parishesLoaded === "true") window.__perf.parishes = performance.now();
    if (window.__perf.ready === undefined && d.ready === "true") window.__perf.ready = performance.now();
    return window.__perf.parishes !== undefined && window.__perf.ready !== undefined;
  };
  const start = () => {
    if (check()) return;
    new MutationObserver((_, obs) => check() && obs.disconnect()).observe(document.body, {
      attributes: true,
      attributeFilter: ["data-ready", "data-parishes-loaded"],
    });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}

// Runs in the page after ready: navigation + resource timing entries.
function collectTimings() {
  const nav = performance.getEntriesByType("navigation")[0];
  const pick = (e) => ({
    name: e.name,
    transferSize: e.transferSize,
    encodedBodySize: e.encodedBodySize,
    decodedBodySize: e.decodedBodySize,
    startTime: Math.round(e.startTime),
    responseEnd: Math.round(e.responseEnd),
    initiatorType: e.initiatorType,
  });
  return {
    ready_ms: window.__perf.ready,
    parishes_ms: window.__perf.parishes,
    dcl_ms: nav.domContentLoadedEventEnd,
    load_ms: nav.loadEventEnd,
    entries: [nav, ...performance.getEntriesByType("resource")].map(pick),
  };
}

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

async function runOnce(origin) {
  // channel "chromium" = the full Chromium build (same as playwright.config.ts), not the headless shell
  const browser = await chromium.launch({ channel: "chromium" });
  const errors = [];
  let timedOut = false;
  let result = { parishes_ms: null, ready_ms: null, dcl_ms: null, load_ms: null, resources: [], cdp_bytes: {}, requests: [] };
  try {
    const context = await browser.newContext({ ...devices["Pixel 7"] });
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

    // requestId -> url, then url -> encodedDataLength (bytes over the wire incl. headers)
    const urlById = new Map();
    const cdpBytes = {};
    cdp.on("Network.responseReceived", (e) => urlById.set(e.requestId, e.response.url));
    cdp.on("Network.loadingFinished", (e) => {
      const url = urlById.get(e.requestId);
      if (url) cdpBytes[url] = (cdpBytes[url] ?? 0) + e.encodedDataLength;
    });

    // Playwright also reports requests made by dedicated workers (MapLibre fetches tiles there),
    // which the page-level CDP session above does not see.
    const t0 = Date.now();
    const pwRequests = [];
    context.on("requestfinished", async (req) => {
      const end = Date.now() - t0;
      const sizes = await req.sizes().catch(() => null);
      pwRequests.push({ url: req.url(), end_ms: end, bytes: sizes ? sizes.responseBodySize + sizes.responseHeadersSize : null });
    });

    await page.addInitScript(installReadyObserver);
    await page.goto(URL_, { waitUntil: "commit" });
    try {
      await page.waitForFunction(() => window.__perf?.ready !== undefined && window.__perf?.parishes !== undefined, null, { timeout: TIMEOUT_MS });
    } catch {
      timedOut = true;
      errors.push(`timeout: not ready after ${TIMEOUT_MS / 1000}s`);
    }

    // Focus-mode toggle: click → next MapLibre idle, measured in the page (CPU throttling still applies).
    const toggles = [];
    for (let i = 0; i < TOGGLES && !timedOut; i++) {
      await page.waitForFunction(() => document.body.dataset.mapIdle === "true", null, { timeout: TIMEOUT_MS });
      toggles.push(
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              const input = document.getElementById("only-pnct");
              const t0 = performance.now();
              input.click(); // synchronously sets data-map-idle="false"; "idle" sets it back
              const obs = new MutationObserver(() => {
                if (document.body.dataset.mapIdle === "true") {
                  obs.disconnect();
                  resolve({ on: input.checked, ms: Math.round(performance.now() - t0) });
                }
              });
              obs.observe(document.body, { attributes: true, attributeFilter: ["data-map-idle"] });
            }),
        ),
      );
    }

    const t = await page.evaluate(collectTimings).catch(() => ({ entries: [] }));
    const resources = t.entries.map((e) => ({
      ...e,
      name: e.name.startsWith(origin) ? e.name.slice(origin.length) || "/" : e.name,
      sameOrigin: e.name.startsWith(origin),
    }));
    result = { parishes_ms: t.parishes_ms ?? null, ready_ms: t.ready_ms ?? null, dcl_ms: t.dcl_ms ?? null, load_ms: t.load_ms ?? null, resources, cdp_bytes: cdpBytes, requests: pwRequests, toggles };
  } finally {
    await browser.close();
  }
  const sum = (list) => list.reduce((s, r) => s + (r.transferSize || 0), 0);
  const cdpSum = (same) =>
    Object.entries(result.cdp_bytes).reduce((s, [u, b]) => s + (u.startsWith(origin) === same ? b : 0), 0);
  return {
    ...result,
    transfer_same_origin: sum(result.resources.filter((r) => r.sameOrigin)),
    transfer_cross_origin: sum(result.resources.filter((r) => !r.sameOrigin)),
    cdp_same_origin: cdpSum(true),
    cdp_cross_origin: cdpSum(false),
    cdp_total: cdpSum(true) + cdpSum(false),
    tiles: result.requests.filter((r) => r.url.endsWith(".pbf")),
    errors,
    timedOut,
  };
}

const kb = (b) => (b / 1024).toFixed(1);
const fmt = (n) => (n == null ? "-" : Math.round(n));

if (!(await reachable(URL_))) {
  console.error(`Cannot reach ${URL_}. Start the preview server first: npm run build && npm run preview`);
  process.exit(2);
}
const origin = new URL(URL_).origin;

console.log(`profile: ${JSON.stringify(profile)}\nurl: ${URL_}  label: ${args.label}\n`);
console.log("run  parishes_ms  ready_ms  dcl_ms  same KB (cdp)  cross KB (cdp)");
const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const r = await runOnce(origin);
  runs.push(r);
  console.log(
    `${String(i).padEnd(4)} ${String(fmt(r.parishes_ms)).padStart(11)} ${String(fmt(r.ready_ms)).padStart(9)} ${String(fmt(r.dcl_ms)).padStart(7)}  ` +
      `${kb(r.transfer_same_origin).padStart(7)} (${kb(r.cdp_same_origin)})  ${kb(r.transfer_cross_origin).padStart(7)} (${kb(r.cdp_cross_origin)})` +
      `  tiles ${r.tiles.length} / ${kb(r.tiles.reduce((s, t) => s + (t.bytes ?? 0), 0))} KB` +
      (r.errors.length ? `  ERRORS: ${r.errors.length}` : ""),
  );
}

const done = runs.filter((r) => r.ready_ms != null && r.parishes_ms != null).sort((a, b) => a.parishes_ms - b.parishes_ms);
const median = done.length ? done[Math.floor((done.length - 1) / 2)] : null; // lower median for even counts; by parishes_ms
const medianOf = (key) => {
  const v = done.map((r) => r[key]).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
if (median) {
  for (const key of ["parishes_ms", "ready_ms"]) {
    const v = done.map((r) => r[key]);
    console.log(`${key} median ${fmt(medianOf(key))}  min ${fmt(Math.min(...v))}  max ${fmt(Math.max(...v))}`);
  }
  console.log(`\nTop same-origin resources (median run), transferSize / responseEnd:`);
  const top = median.resources.filter((r) => r.sameOrigin).sort((a, b) => b.transferSize - a.transferSize).slice(0, 10);
  for (const r of top) {
    console.log(`  ${kb(r.transferSize).padStart(8)} KB  ${String(r.responseEnd).padStart(6)} ms  ${r.name}`);
  }
} else {
  console.log("\nNo run reached ready.");
}

// Basemap glyph ranges, across all runs. Only 0-255 is expected: labels are Latin-only (src/basemap.ts).
const glyphRanges = [...new Set(runs.flatMap((r) => r.requests.map((q) => decodeURIComponent(q.url).match(/\/fonts\/[^/]+\/(\d+-\d+)\.pbf/)?.[1]).filter(Boolean)))];
console.log(`\nglyph ranges requested: ${glyphRanges.sort((a, b) => parseInt(a) - parseInt(b)).join(", ") || "none"}`);

const failures = runs.flatMap((r, i) => r.errors.map((e) => `run ${i + 1}: ${e}`));
if (failures.length) console.error(`\nProblems:\n  ${failures.join("\n  ")}`);

if (TOGGLES) {
  const all = runs.flatMap((r) => r.toggles ?? []);
  for (const on of [true, false]) {
    const ms = all.filter((t) => t.on === on).map((t) => t.ms).sort((a, b) => a - b);
    if (ms.length) console.log(`toggle ${on ? "on " : "off"}: median ${ms[Math.floor((ms.length - 1) / 2)]} ms  min ${ms[0]}  max ${ms.at(-1)}  (n=${ms.length})`);
  }
}

if (args.out) {
  const json = { label: args.label, url: URL_, profile, runs, median_parishes_ms: medianOf("parishes_ms"), median_ready_ms: medianOf("ready_ms") };
  writeFileSync(args.out, JSON.stringify(json, null, 2));
  console.log(`\nwrote ${args.out}`);
}
process.exit(failures.length ? 1 : 0);
