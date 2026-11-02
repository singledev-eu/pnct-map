// Screenshots of the concelho seats and district capitals (cities.ts): country view, Erra (Coruche)
// selected, the concelho, in PT; desktop and phone, light and dark.
// Usage (preview server on :4173): node scripts/cities_shots.mjs <out-dir>
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const VIEWS = { country: "", erra: "#f=140911", coruche: "#c=1409", "erra-pt": "?lang=pt#f=140911" };
const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/cities_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES))
  for (const scheme of ["light", "dark"])
    for (const [view, hash] of Object.entries(VIEWS)) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(`${BASE}${hash}`);
      await waitForSettled(page, scheme);
      const path = `${out}/${device}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      console.log(path);
      await context.close();
    }
await browser.close();
