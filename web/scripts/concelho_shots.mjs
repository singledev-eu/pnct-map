// Screenshots of the concelho card, light and dark, desktop and phone, for review.
// Usage (preview server running on :4173, or SHOT_BASE): node scripts/concelho_shots.mjs <out-dir>
// Files: <out-dir>/<device>-<scheme>-<view>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = process.env.SHOT_BASE ?? "http://localhost:4173/";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// The panel body scrolls; `scroll` brings the card into view before the shot.
const openDetails = (page) => page.click('[data-testid="concelho-details"] summary');
const VIEWS = {
  "concelho-curated": { hash: "#c=0505", scroll: '[data-testid="concelho-card"]' }, // Idanha-a-Nova
  "concelho-partly": { hash: "#c=0101", scroll: '[data-testid="concelho-card"]' }, // Águeda: partly PNCT note
  "concelho-contacts": { hash: "#c=0505", scroll: '[data-testid="concelho-contacts"]' },
  "concelho-not-yet": { hash: "#c=0104", scroll: '[data-testid="concelho-contacts"]' }, // Arouca: PNCT, not curated yet
  "parish-collapsed": { hash: "#f=050505", scroll: '[data-testid="concelho-details"]' }, // Ladoeiro, Idanha-a-Nova
  "parish-open": { hash: "#f=050505", after: openDetails, scroll: '[data-testid="concelho-details"]' },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/concelho_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS)) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(`${BASE}${spec.hash}`);
      let waited = await waitForSettled(page, scheme);
      if (spec.after) {
        await spec.after(page);
        waited += await waitForSettled(page, scheme);
      }
      await page.locator(spec.scroll).scrollIntoViewIfNeeded();
      waited += await waitForSettled(page, scheme);
      const path = `${out}/${device}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      console.log(`${path} (settled in ${waited} ms)`);
      await context.close();
    }
  }
}
await browser.close();
