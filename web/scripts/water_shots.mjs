// Review shots for the water names and river lines (basemap.ts waterLabels, layers.ts waterLine):
// Cota (Viseu) in 3D, flat, and zoomed in to 13, light and dark, with the water labels rendered
// on screen and the water layers' place in the stack (probe.json).
// Usage: node scripts/water_shots.mjs <out-dir> [base-url] (default: the preview server on :4173)
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync, writeFileSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const [out, base = "http://localhost:4173/", query = ""] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/water_shots.mjs <out-dir> [base-url] [query, e.g. ?relief=1.5]");
mkdirSync(out, { recursive: true });
const probes = {};
const browser = await chromium.launch({ channel: "chromium" });
for (const scheme of ["light", "dark"]) {
  for (const view of ["3d", "flat", "z13"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    if (view !== "3d") await context.addInitScript(() => localStorage.setItem("pnct-map:3d", "off"));
    const page = await context.newPage();
    await page.goto(new URL(`${query}#f=182310`, base).href);
    await waitForSettled(page, scheme, { timeout: 120_000 });
    if (view === "z13") {
      await page.evaluate(() => window.pnctMap.jumpTo({ zoom: 13 }));
      await waitForSettled(page, scheme, { timeout: 120_000 });
    }
    const id = `${scheme}-${view}`;
    await page.screenshot({ path: `${out}/${id}.png` });
    probes[id] = await page.evaluate(() => {
      const m = window.pnctMap;
      const ids = m.getStyle().layers.map((l) => l.id);
      const water = ids.filter((i) => /water/.test(i));
      const names = {};
      for (const w of water) if (m.getLayer(w)?.type === "symbol") names[w] = [...new Set(m.queryRenderedFeatures({ layers: [w] }).map((f) => f.properties.name))];
      return { zoom: +m.getZoom().toFixed(2), stack: Object.fromEntries(water.map((w) => [w, ids.indexOf(w)])), parishFill: ids.indexOf("parish-fill"), slabVeil: ids.indexOf("slab-veil"), hillshade: ids.indexOf("hillshade"), names };
    });
    console.log(id, JSON.stringify(probes[id]));
    await context.close();
  }
}
writeFileSync(`${out}/probe.json`, JSON.stringify(probes, null, 2));
await browser.close();
