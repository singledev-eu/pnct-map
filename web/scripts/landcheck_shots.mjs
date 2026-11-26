// Land check review: screenshots of the report at the verification points (light/dark, desktop/phone,
// EN and one PT), and a table of what the app reported, with the HTTP status of every land check
// file request.
// Usage (preview server running on :4173, or SHOT_BASE): node scripts/landcheck_shots.mjs <out-dir>
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

const VIEWS = {
  pedrogao: { hash: "#chk=39.92681,-8.15187&hz=1" },
  porto: { hash: "#chk=41.14960,-8.61100" },
  braganca: { hash: "#chk=41.89600,-6.73300" },
  "braganca-rio-de-onor": { hash: "#chk=41.94000,-6.61300" },
  sea: { hash: "#chk=39.50000,-10.00000" },
  spain: { hash: "#chk=40.00000,-6.00000" },
  "pedrogao-pt": { hash: "#chk=39.92681,-8.15187", query: "?lang=pt" },
  mode: { hash: "#hz=1", after: (page) => page.click('[data-testid="check-button"]') },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/landcheck_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const reportDone = (page) => page.waitForSelector('[data-testid="check-hazard"], [data-testid="check-outside"]', { state: "attached", timeout: 30_000 }); // phones: the report body is hidden behind the peek row

const browser = await chromium.launch({ channel: "chromium" });
const rows = [];
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS)) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      const requests = [];
      page.on("response", (r) => {
        if (r.url().includes("/landcheck/")) requests.push(`${r.url().split("/").pop()} ${r.status()}`);
      });
      await page.goto(`${BASE}${spec.query ?? ""}${spec.hash}`);
      let waited = await waitForSettled(page, scheme);
      if (spec.after) {
        await spec.after(page);
        waited += await waitForSettled(page, scheme);
      } else {
        await reportDone(page);
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
              pnct: document.querySelector('[data-testid="check-pnct"]')?.getAttribute("data-pnct") ?? "",
              hazard: document.querySelector('[data-testid="check-hazard"]')?.textContent ?? (document.querySelector('[data-testid="check-outside"]') ? "outside" : ""),
              links: document.querySelectorAll('[data-testid="property-link"]').length,
              hash: location.hash,
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
