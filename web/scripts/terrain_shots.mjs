// Screenshots of the relief prototype (terrain.ts): Serra da Estrela, Gerês and a flat Alentejo
// parish, relief off and on at exaggeration 1 / 1.5 / 2, light and dark, desktop and phone.
// Usage (preview server on :4173): node scripts/terrain_shots.mjs <out-dir> [name-filter]
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const [out, only] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/terrain_shots.mjs <out-dir> [name-filter]");
mkdirSync(out, { recursive: true });
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const PLACES = { estrela: "#c=0906", geres: "#f=031017", alentejo: "#f=150902" };
const CASES = [];
for (const [place, hash] of Object.entries(PLACES)) {
  CASES.push({ id: `desktop-light-${place}-off`, device: "desktop", scheme: "light", url: `?relief=0${hash}` });
  for (const x of ["1", "1.5", "2"]) CASES.push({ id: `desktop-light-${place}-x${x}`, device: "desktop", scheme: "light", url: `?relief=${x}${hash}` });
  CASES.push({ id: `desktop-dark-${place}-x1.5`, device: "desktop", scheme: "dark", url: `?relief=1.5${hash}` });
  CASES.push({ id: `phone-light-${place}-x1.5`, device: "phone", scheme: "light", url: `?relief=1.5${hash}` });
}
CASES.push({ id: "desktop-light-country-x1.5", device: "desktop", scheme: "light", url: "?relief=1.5" });
const browser = await chromium.launch({ channel: "chromium" });
for (const c of CASES) {
  if (only && !c.id.includes(only)) continue;
  const context = await browser.newContext({ ...DEVICES[c.device], colorScheme: c.scheme });
  const page = await context.newPage();
  await page.goto(`http://localhost:4173/${c.url}`);
  await waitForSettled(page, c.scheme, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await waitForSettled(page, c.scheme, { timeout: 120_000 });
  await page.screenshot({ path: `${out}/${c.id}.png` });
  console.log(`${out}/${c.id}.png`);
  await context.close();
}
await browser.close();
