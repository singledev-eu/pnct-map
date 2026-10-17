// Screenshots of the protected-areas overlays, light and dark, desktop and phone, for review.
// Usage (preview server running on :4173): node scripts/protected_shots.mjs <out-dir>
// Files: <out-dir>/<device>-<scheme>-<view>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4173/";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// Hash per view (both overlays on unless noted). `after` runs once the view is settled, and `until` waits for its result.
const BOTH = "pa=rnap,natura";
const common = {
  country: { hash: `#${BOTH}` },
  "geres-parish": { hash: `#${BOTH}&f=031017` }, // Vilar da Veiga, inside Peneda-Gerês
  "geres-concelho": { hash: `#${BOTH}&c=0310` }, // Terras de Bouro
  "estuary-parish": { hash: `#${BOTH}&f=110662` }, // Parque das Nações, Lisbon: Tejo estuary ZPE
};
const VIEWS = {
  desktop: {
    ...common,
    "focus-north": { hash: `#${BOTH}&focus=1&map=8.6/41.55/-7.9` },
    "rnap-only": { hash: "#pa=rnap&map=9/38.6/-9.0" },
    "natura-only": { hash: "#pa=natura&map=9/38.6/-9.0" },
    about: {
      hash: "",
      after: (page) => page.click("#about-open"),
      until: () => document.getElementById("about")?.hasAttribute("open") === true,
    },
  },
  phone: {
    ...common,
    "legend-open": {
      hash: `#${BOTH}`,
      after: (page) => page.click("#legend-toggle"),
      until: () => document.getElementById("legend-toggle")?.getAttribute("aria-expanded") === "true",
    },
    "attribution-open": {
      hash: "",
      after: (page) => page.click(".maplibregl-ctrl-attrib-button"),
      until: () => document.querySelector(".maplibregl-ctrl-attrib")?.classList.contains("maplibregl-compact-show") === true,
    },
  },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/protected_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

/**
 * Resolves once the app has started and drawn in `scheme`, the camera is at rest, the map (basemap
 * included) is loaded, and no finite CSS transition is running. Checked two animation frames in a
 * row, like settled() in tests/e2e/helpers.ts, polled on every frame (no fixed sleeps).
 */
const settled = (page, scheme) =>
  page.waitForFunction(
    (scheme) =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const map = window.pnctMap;
            if (document.body.dataset.ready !== "true" || document.body.dataset.mapTheme !== scheme) return resolve(false);
            // The overlays named in the hash are in the style (main.ts sets data-overlays once they are).
            const wanted = (new URLSearchParams(location.hash.slice(1)).get("pa") ?? "").split(",").filter(Boolean).sort().join(",");
            if ((document.body.dataset.overlays ?? "") !== wanted) return resolve(false);
            // The protection section has filled in.
            if (document.querySelector('[data-testid="protection"]') && !document.querySelector('[data-testid="protection-summary"]')) return resolve(false);
            if (!map || map.isMoving() || !map.loaded()) return resolve(false);
            const running = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
            resolve(running.length === 0);
          }),
        ),
      ),
    scheme,
    { polling: "raf", timeout: 60_000 },
  );

const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS[device])) {
      // A fresh context and page per view: a hash-only goto would not reload the app, and the legend
      // choice is kept in localStorage, which would leak from one view to the next.
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(`${BASE}${spec.hash}`);
      await page.waitForFunction(() => document.body.dataset.ready === "true", null, { polling: "raf", timeout: 60_000 });
      await page.waitForFunction(() => !!window.pnctMap, null, { polling: "raf", timeout: 60_000 });
      await settled(page, scheme);
      if (spec.after) {
        await spec.after(page);
        await page.waitForFunction(spec.until, null, { polling: "raf", timeout: 10_000 });
        await settled(page, scheme);
      }
      const path = `${out}/${device}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      console.log(path);
      await context.close();
    }
  }
}
await browser.close();
