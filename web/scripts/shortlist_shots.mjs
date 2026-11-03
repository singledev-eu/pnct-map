// Screenshots of the shortlist (shortlist.ts): the own list open with a parish selected, and a shared
// link, desktop and phone, light and dark. Usage (preview server on :4173): node scripts/shortlist_shots.mjs <out-dir>
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/shortlist_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES))
  for (const scheme of ["light", "dark"])
    for (const view of ["own", "shared-pt"]) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      await context.addInitScript(() => localStorage.setItem("pnct-map:shortlist", JSON.stringify(["140911", "0211", "150902"])));
      const page = await context.newPage();
      await page.goto(view === "own" ? "http://localhost:4173/#f=140911" : "http://localhost:4173/?lang=pt#list=021120,1823,040216");
      await waitForSettled(page, scheme);
      if (view === "own") await page.getByTestId("shortlist-button").click();
      await waitForSettled(page, scheme);
      await page.screenshot({ path: `${out}/${device}-${scheme}-${view}.png` });
      console.log(`${out}/${device}-${scheme}-${view}.png`);
      await context.close();
    }
await browser.close();
