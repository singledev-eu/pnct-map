// Screenshots of fixed map views, for before/after comparison of the display geometry.
// Usage (preview server running): node scripts/shots.mjs <out-dir>
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";

const VIEWS = {
  "1-country": "",
  "2-district-viana": "#map=9.2/41.86/-8.45&d=Viana%20do%20Castelo",
  "3-concelho-peso-da-regua": "#c=1708",
  "4-coast-ria-de-aveiro": "#map=10.6/40.66/-8.70",
  "5-coast-peniche": "#map=12/39.36/-9.37",
  "6-parish-vilarinho-dos-freires": "#f=170810",
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
for (const [name, hash] of Object.entries(VIEWS)) {
  // A fresh page per view: a hash-only goto would not reload the app.
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:4173/${hash}`);
  await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.body.dataset.mapIdle === "true", null, { timeout: 60_000 });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
  await page.close();
}
await browser.close();
