// Screenshots of the protected areas on the 3D selection's slab (drill.ts setProtected), light and
// dark, desktop and phone: Odemira (parish São Salvador e Santa Maria and the concelho), a partly
// protected parish (Gimonde, Bragança), each overlay alone and both on.
// Usage: node scripts/protected_slab_shots.mjs <out-dir> [base-url] [name-filter]
//   base-url defaults to the preview server on :4173 (a deployed preview works too, for "before").
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const [out, BASE = "http://localhost:4173/", only] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/protected_slab_shots.mjs <out-dir> [base-url] [name-filter]");
mkdirSync(out, { recursive: true });
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const CASES = {
  "odemira-parish-both": "#f=021120&pa=rnap,natura",
  "odemira-parish-rnap": "#f=021120&pa=rnap",
  "odemira-parish-natura": "#f=021120&pa=natura",
  "odemira-concelho-both": "#c=0211&pa=rnap,natura",
  "gimonde-both": "#f=040216&pa=rnap,natura",
};
const PHONE_CASES = new Set(["odemira-parish-both", "odemira-concelho-both"]);
const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES))
  for (const scheme of ["light", "dark"])
    for (const [name, hash] of Object.entries(CASES)) {
      if (device === "phone" && !PHONE_CASES.has(name)) continue;
      const id = `${device}-${scheme}-${name}`;
      if (only && !id.includes(only)) continue;
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(`${BASE}${hash}`);
      await waitForSettled(page, scheme);
      await page.waitForTimeout(1800); // slab paint transitions (task 03 makes settled.mjs wait for them)
      await waitForSettled(page, scheme);
      await page.screenshot({ path: `${out}/${id}.png` });
      console.log(`${out}/${id}.png`);
      await context.close();
    }
await browser.close();
