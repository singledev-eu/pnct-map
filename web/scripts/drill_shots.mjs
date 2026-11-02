// Screenshots of the 3D selection's design options (drill.ts, layers.ts slabLayers), each pair
// from the same settled view with one option switched on the live map (setPaintProperty /
// setLayoutProperty), so no option needs a switch in the app:
//   outline   rim on the slab top (shipped) | no outline (walls and gradient only)
//   inner     parish boundaries as rims on a concelho slab (shipped) | hidden
//   partial   partly-PNCT concelho: neutral slab + raised PNCT parishes (shipped) | one "partial" colour
//   overlays  protected areas on: opaque slab (shipped) | translucent slab showing the overlay
// Usage (preview server on :4173): node scripts/drill_shots.mjs <out-dir>
//   → <out-dir>/<option>-<device>-<scheme>-<case>-<a|b>.png (a: shipped, b: alternative)
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const OPTIONS = {
  // Each alt runs in the page from its source text (no closures).
  outline: { alt: (m) => ["concelho-rim", "parish-rim", "concelho-inner-rim"].forEach((id) => m.setLayoutProperty(id, "visibility", "none")) },
  inner: { alt: (m) => m.setLayoutProperty("concelho-inner-rim", "visibility", "none") },
  partial: {
    alt: (m) => {
      m.setLayoutProperty("concelho-pnct-top", "visibility", "none");
      const dark = document.documentElement.dataset.theme === "dark";
      // Between the PNCT teal and the neutral slab, like the legend's partly-PNCT swatch.
      const partial = dark ? "#3f8f86" : "#7fbdb6";
      m.setPaintProperty("concelho-slab", "fill-extrusion-color", ["case", ["==", ["get", "pnct_count"], ["get", "parish_count"]], dark ? "#22b8a7" : "#0f8a7e", [">", ["get", "pnct_count"], 0], partial, dark ? "#5a6571" : "#a3adb7"]);
    },
  },
  overlays: {
    alt: (m) => {
      for (const id of ["concelho-slab", "parish-slab", "concelho-pnct-top"]) {
        m.setPaintProperty(id, "fill-extrusion-opacity-transition", { duration: 0 });
        m.setPaintProperty(id, "fill-extrusion-opacity", 0.55);
      }
    },
  },
};
const CASES = [
  { option: "outline", device: "desktop", scheme: "light", name: "parish", hash: "#f=171415" },
  { option: "outline", device: "desktop", scheme: "dark", name: "concelho", hash: "#c=1714" },
  { option: "outline", device: "phone", scheme: "light", name: "concelho", hash: "#c=1714" },
  { option: "inner", device: "desktop", scheme: "light", name: "concelho", hash: "#c=1714" },
  { option: "inner", device: "desktop", scheme: "dark", name: "concelho", hash: "#c=1823" },
  { option: "inner", device: "phone", scheme: "dark", name: "concelho", hash: "#c=1714" },
  { option: "partial", device: "desktop", scheme: "light", name: "viseu", hash: "#c=1823" },
  { option: "partial", device: "desktop", scheme: "dark", name: "viseu", hash: "#c=1823" },
  { option: "overlays", device: "desktop", scheme: "light", name: "concelho", hash: "#c=1714&pa=rnap,natura" },
  { option: "overlays", device: "desktop", scheme: "dark", name: "parish", hash: "#f=021103&pa=rnap,natura" },
];

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/drill_shots.mjs <out-dir>");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
for (const c of CASES) {
  const context = await browser.newContext({ ...DEVICES[c.device], colorScheme: c.scheme });
  await context.addInitScript(() => localStorage.setItem("pnct-map:3d", "on"));
  const page = await context.newPage();
  await page.goto(`${BASE}${c.hash}`);
  await waitForSettled(page, c.scheme);
  const base = `${out}/${c.option}-${c.device}-${c.scheme}-${c.name}`;
  await page.screenshot({ path: `${base}-a.png` });
  await page.evaluate(`(${OPTIONS[c.option].alt.toString()})(window.pnctMap)`);
  await waitForSettled(page, c.scheme);
  await page.screenshot({ path: `${base}-b.png` });
  console.log(base);
  await context.close();
}
await browser.close();
