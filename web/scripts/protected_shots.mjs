// Screenshots of the protected-areas overlays, light and dark, desktop and phone, for review.
// Usage (preview server running on :4173): node scripts/protected_shots.mjs <out-dir>
// Files: <out-dir>/<device>-<scheme>-<view>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

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
      let waited = await waitForSettled(page, scheme);
      if (spec.after) {
        await spec.after(page);
        await page.waitForFunction(spec.until, null, { polling: "raf", timeout: 10_000 });
        waited += await waitForSettled(page, scheme);
      }
      const path = `${out}/${device}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      console.log(`${path} (settled in ${waited} ms)`);
      await context.close();
    }
  }
}
await browser.close();
