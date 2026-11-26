// Nearby services review: the panel block (parish, concelho), the land check rows and the overlay,
// light/dark, phone (375) and desktop (1440), EN and one PT; plus a table of what each view showed.
// Usage (preview server running on :4173, or SHOT_BASE): node scripts/services_shots.mjs <out-dir>
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

const tiles = (page) => page.waitForSelector('[data-testid="service-tiles"], [data-testid="nearby-error"]', { state: "attached", timeout: 30_000 });
// Phones: the sheet opens at half; pull it up so the block is in view, and scroll to it.
const showBlock = async (page, device) => {
  await tiles(page);
  if (device === "phone") {
    const handle = page.locator('[data-testid="sheet-handle"]');
    if ((await page.locator("#panel").getAttribute("data-sheet")) !== "full") await handle.click();
  }
  await page.locator('[data-testid="nearby"], [data-testid="check-nearby"]').first().scrollIntoViewIfNeeded();
};

const VIEWS = {
  // Monsanto (Idanha-a-Nova), a PNCT parish far from everything.
  parish: { hash: "#f=050520", after: showBlock },
  concelho: { hash: "#c=0505", after: showBlock },
  "parish-pt": { hash: "#f=050520", query: "?lang=pt", after: showBlock },
  // Land checks: Monchique town, and a remote spot in the Serra do Caldeirão.
  check: { hash: "#chk=37.31700,-8.55300", after: showBlock },
  "check-remote": { hash: "#chk=37.27000,-7.95000", after: showBlock },
  // "Show on the map" from the parish panel.
  show: {
    hash: "#f=050520",
    after: async (page, device) => {
      await tiles(page);
      if (device === "phone") await page.locator('[data-testid="sheet-handle"]').click();
      await page.locator('[data-testid="service-show-emergency"]').click();
    },
  },
  overlay: { hash: "#map=10.5/40.0/-7.3&sv=1" },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/services_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const browser = await chromium.launch({ channel: "chromium" });
const rows = [];
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS)) {
      if (only && !only.includes(view)) continue;
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      const requests = [];
      page.on("response", (r) => {
        if (r.url().includes("/services/") || r.url().includes("services-")) requests.push(`${r.url().split("/").pop()} ${r.status()}`);
      });
      await page.goto(`${BASE}${spec.query ?? ""}${spec.hash}`);
      let waited = await waitForSettled(page, scheme);
      if (spec.after) {
        await spec.after(page, device);
        waited += await waitForSettled(page, scheme);
      }
      const path = `${out}/${device}-${scheme}-${view}.png`;
      await page.screenshot({ path });
      if (device === "desktop" && scheme === "light") {
        rows.push(
          await page.evaluate(
            ({ view, requests }) => ({
              view,
              title: document.querySelector('[data-testid="panel-title"]')?.textContent ?? "",
              from: document.querySelector('[data-testid="nearby-from"]')?.textContent ?? "",
              rows: [...document.querySelectorAll('[data-testid^="service-"][data-cat]')].map((li) => `${li.dataset.cat}:${li.dataset.mode}`).join(" "),
              requests: [...new Set(requests)].join(", "),
            }),
            { view, requests },
          ),
        );
      }
      console.log(`${path} (settled in ${waited} ms)`);
      await context.close();
    }
  }
}
await browser.close();
console.table(rows);
