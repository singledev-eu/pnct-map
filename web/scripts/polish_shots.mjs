// Review shots for the visual polish pass: 375, 768 and 1440 px wide, light and dark, PT.
// Run before and after a change. Usage (preview server on :4173): node scripts/polish_shots.mjs <out-dir> [view…]
// Files: <out-dir>/<width>-<scheme>-<view>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";

const SIZES = {
  375: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  768: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 },
  1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

// `storage`: localStorage set before the app starts. `after` runs once the view is settled.
const FLAT = { "pnct-map:3d": "off" };
const SEEN = { "pnct-map:intro": "dismissed" };
const VIEWS = {
  first: { hash: "" }, // a first visit: the intro is up
  country: { hash: "", storage: SEEN },
  "legend-open": { hash: "", storage: { ...SEEN, "pnct-map:legend": "open" } },
  seats: { hash: "#map=8/40.35/-7.75", storage: SEEN }, // Tábua / Oliveira do Hospital / Belmonte
  "seats-close": { hash: "#map=9.6/40.35/-7.75", storage: SEEN },
  parishes: { hash: "#map=11.5/40.36/-7.86", storage: SEEN }, // close zoom: parish borders
  "concelho-flat": { hash: "#c=0505", storage: { ...SEEN, ...FLAT } },
  "parish-flat": { hash: "#f=050505", storage: { ...SEEN, ...FLAT } },
  "concelho-3d": { hash: "#c=0505", storage: SEEN },
  focus: { hash: "#focus=1", storage: SEEN },
  "sheet-full": {
    hash: "#c=0505",
    storage: { ...SEEN, ...FLAT },
    only: [375],
    after: (page) => page.getByTestId("sheet-handle").click(),
  },
};

const [out, ...wanted] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/polish_shots.mjs <out-dir> [view…]");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
for (const [width, options] of Object.entries(SIZES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS)) {
      if (wanted.length && !wanted.includes(view)) continue;
      if (spec.only && !spec.only.includes(Number(width))) continue;
      const context = await browser.newContext({ ...options, colorScheme: scheme, locale: "pt-PT" });
      await context.addInitScript((items) => {
        for (const [k, v] of Object.entries(items)) window.localStorage.setItem(k, v);
      }, spec.storage ?? {});
      const page = await context.newPage();
      await page.goto(`${BASE}${spec.hash}`);
      await page.waitForFunction(() => document.body.dataset.ready === "true" && !!window.pnctMap, null, { polling: "raf", timeout: 60_000 });
      await waitForSettled(page, scheme);
      if (spec.after) {
        await spec.after(page);
        await waitForSettled(page, scheme);
      }
      const path = `${out}/${width}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      console.log(path);
      await context.close();
    }
  }
}
await browser.close();
