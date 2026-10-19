// Screenshots of both languages in both themes, desktop and a 375 px phone, for review (0.6.0).
// Usage (preview server running on :4173): node scripts/i18n_shots.mjs <out-dir>
// Files: <out-dir>/<device>-<lang>-<theme>-<view>.png. The theme is forced with the theme button's
// stored choice (pnct-map:theme) on a system in the opposite scheme, so the shots also show the override.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const VIEWS = {
  desktop: {
    country: { hash: "" },
    "concelho-card": { hash: "#c=0503" },
    "parish-panel": { hash: "#f=170810&pa=rnap,natura" },
    explainer: {
      hash: "#map=9/41.2/-7.9&pa=rnap,natura",
      after: (page) => page.click('[data-testid="protection-help"]'),
      until: () => !document.querySelector('[data-testid="protection-explainer"]')?.hidden,
    },
  },
  phone: {
    country: { hash: "" },
    "legend-open": {
      hash: "#pa=rnap",
      after: (page) => page.click("#legend-toggle"),
      until: () => document.getElementById("legend-toggle")?.getAttribute("aria-expanded") === "true",
    },
    "concelho-card": {
      hash: "#c=0503",
      after: (page) => page.click('[data-testid="sheet-handle"]'),
      until: () => document.querySelector('[data-testid="panel"]')?.dataset.sheet === "full",
    },
    "parish-panel": { hash: "#f=170810" },
  },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/i18n_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES)) {
  for (const lang of ["pt", "en"]) {
    for (const theme of ["light", "dark"]) {
      for (const [view, spec] of Object.entries(VIEWS[device])) {
        const context = await browser.newContext({ ...options, colorScheme: theme === "dark" ? "light" : "dark" });
        await context.addInitScript((t) => localStorage.setItem("pnct-map:theme", t), theme);
        const page = await context.newPage();
        await page.goto(`${BASE}?lang=${lang}${spec.hash}`);
        await page.waitForFunction(() => document.body.dataset.ready === "true", null, { polling: "raf", timeout: 60_000 });
        let waited = await waitForSettled(page, theme);
        if (spec.after) {
          await spec.after(page);
          await page.waitForFunction(spec.until, null, { polling: "raf", timeout: 10_000 });
          waited += await waitForSettled(page, theme);
        }
        const path = `${out}/${device}-${lang}-${theme}-${view}.png`;
        await page.screenshot({ path });
        console.log(`${path} (settled in ${waited} ms)`);
        await context.close();
      }
    }
  }
}
await browser.close();
