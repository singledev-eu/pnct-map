// Screenshots of the 3D selection (drill.ts) for review: the two slab looks compared in the
// 3d-drilldown report, in both themes, desktop and phone.
//   (a) "glass": a tall, pale, semi-transparent slab; the map shows through it.
//   (b) "plate": a thin, near-opaque slab with a strong outline over the normal basemap.
// The look is set on the live map with setPaintProperty after the selection settles, so neither
// needs a switch in the app. Usage (preview server running on :4173):
//   node scripts/drill_shots.mjs <out-dir>   →   <out-dir>/<device>-<scheme>-<view>-<look>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
// Selections made through search, so the camera move and the slab are the app's own.
const VIEWS = {
  concelho: { query: "Vila Real", option: /Concelho · Vila Real/ },
  parish: { query: "Mateus", option: /Vila Real/ },
};
// Paint per look, per theme; null keeps what the app set.
const LOOKS = {
  glass: {
    light: { color: "#dff3ef", opacity: 0.55, heightScale: 1, line: "#0b3d39", lineWidth: 2 },
    dark: { color: "#bdeee6", opacity: 0.35, heightScale: 1, line: "#c9f5ee", lineWidth: 2 },
  },
  plate: {
    light: { color: null, opacity: 0.92, heightScale: 0.25, line: "#0b3d39", lineWidth: 3 },
    dark: { color: null, opacity: 0.92, heightScale: 0.25, line: "#c9f5ee", lineWidth: 3 },
  },
};

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/drill_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [view, spec] of Object.entries(VIEWS)) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      await context.addInitScript(() => localStorage.setItem("pnct-map:3d", "on"));
      const page = await context.newPage();
      await page.goto(BASE);
      await waitForSettled(page, scheme);
      await page.fill("#search-input", spec.query);
      await page.locator('#search-list li[role="option"]').filter({ hasText: spec.option }).first().click();
      await waitForSettled(page, scheme);
      const base = await page.evaluate(() => {
        const m = window.pnctMap;
        return Object.fromEntries(["concelho-slab", "parish-slab"].map((id) => [id, { h: m.getPaintProperty(id, "fill-extrusion-height"), c: m.getPaintProperty(id, "fill-extrusion-color") }]));
      });
      for (const [look, paints] of Object.entries(LOOKS)) {
        await page.evaluate(
          ({ p, base }) => {
            const m = window.pnctMap;
            for (const id of ["concelho-slab", "parish-slab"]) {
              for (const prop of ["fill-extrusion-height", "fill-extrusion-opacity", "fill-extrusion-color"]) m.setPaintProperty(id, `${prop}-transition`, { duration: 0 });
              m.setPaintProperty(id, "fill-extrusion-color", p.color ?? base[id].c);
              m.setPaintProperty(id, "fill-extrusion-height", base[id].h * p.heightScale);
              if (base[id].h) m.setPaintProperty(id, "fill-extrusion-opacity", p.opacity);
            }
            for (const id of ["concelho-slab-line", "parish-slab-line"]) {
              m.setPaintProperty(id, "line-color", p.line);
              m.setPaintProperty(id, "line-width", p.lineWidth);
            }
          },
          { p: paints[scheme], base },
        );
        await waitForSettled(page, scheme);
        const file = `${out}/${device}-${scheme}-${view}-${look}.png`;
        await page.screenshot({ path: file });
        console.log(file);
      }
      await context.close();
    }
  }
}
await browser.close();
