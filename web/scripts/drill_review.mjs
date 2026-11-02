// Review screenshots of the 3D selection (drill.ts) across its interplay cases: fitting a parish
// or concelho (click, search, panel list), hover outside/inside a slab, slab colour by PNCT
// status, occlusion at pitch 50° (desktop) and 40° (phone), and the overlays, focus mode, theme and
// language switches mid-selection. Run it before and after a change to compare.
// Usage (preview server on :4173): node scripts/drill_review.mjs <out-dir> [name-filter]
//   → <out-dir>/<scenario>.png
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** A screen point inside the feature (`kind` "parish" | "concelho", by code) where the app hit-tests it. */
async function pointIn(page, kind, code) {
  return page.evaluate(
    async ({ kind, code }) => {
      const m = window.pnctMap;
      const source = kind === "parish" ? "parishes" : "concelhos";
      const key = kind === "parish" ? "dicofre" : "code";
      const data = await m.getSource(source).getData();
      const f = data.features.find((x) => x.properties[key] === code);
      const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
      const pts = rings.flat().map((c) => m.project(c));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const layer = kind === "parish" ? "parish-fill" : "concelho-fill";
      for (let s = 2; s <= 16; s *= 2)
        for (let i = 1; i < s; i++)
          for (let j = 1; j < s; j++) {
            const p = [x0 + ((x1 - x0) * i) / s, y0 + ((y1 - y0) * j) / s];
            if (p[0] < 0 || p[1] < 0 || p[0] > innerWidth || p[1] > innerHeight) continue;
            if (m.queryRenderedFeatures(p, { layers: [layer] })[0]?.properties[key] === code) return { x: p[0], y: p[1] };
          }
      return null;
    },
    { kind, code },
  );
}

const pick = async (page, query, option) => {
  await page.fill("#search-input", query);
  await page.locator('#search-list li[role="option"]').filter({ hasText: option }).first().click();
};

// name → { device, scheme?, hash, act?(page) }
const SCENARIOS = {};
for (const [dev, device] of [["phone", PHONE], ["desktop", DESKTOP]]) {
  SCENARIOS[`fit-${dev}-click-in-concelho`] = {
    device,
    hash: "#c=1714",
    act: async (page) => {
      const p = await pointIn(page, "parish", "171415");
      await page.mouse.click(p.x, p.y);
    },
  };
  SCENARIOS[`fit-${dev}-search-large-parish`] = { device, hash: "", act: (page) => pick(page, "Sabóia", /Odemira/) };
  SCENARIOS[`fit-${dev}-search-parish`] = { device, hash: "", act: (page) => pick(page, "Mateus", /Vila Real/) };
  SCENARIOS[`fit-${dev}-panel-list`] = {
    device,
    hash: "#c=1823",
    act: async (page) => {
      await page.getByTestId("pnct-parish-list").locator("button").first().click(); // a PNCT parish of Viseu
    },
  };
  SCENARIOS[`fit-${dev}-search-concelho`] = { device, hash: "", act: (page) => pick(page, "Odemira", /Concelho/) };
}
SCENARIOS["hover-outside-slab"] = {
  device: DESKTOP,
  hash: "#c=1714",
  act: async (page) => {
    const p = await pointIn(page, "parish", "171101"); // a parish of Sabrosa, next to Vila Real
    if (p) await page.mouse.move(p.x, p.y);
  },
};
SCENARIOS["hover-inside-slab"] = {
  device: DESKTOP,
  hash: "#c=1714",
  act: async (page) => {
    const p = await pointIn(page, "parish", "171415");
    await page.mouse.move(p.x, p.y - 12); // on the slab top above the ground point
  },
};
for (const scheme of ["light", "dark"]) {
  SCENARIOS[`colour-${scheme}-nonpnct-parish`] = { device: DESKTOP, scheme, hash: "#f=182339" };
  SCENARIOS[`colour-${scheme}-partial-concelho`] = { device: DESKTOP, scheme, hash: "#c=1823" };
  SCENARIOS[`colour-${scheme}-all-concelho`] = { device: DESKTOP, scheme, hash: "#c=1714" };
  SCENARIOS[`colour-${scheme}-none-concelho`] = { device: DESKTOP, scheme, hash: "#c=1009" };
  SCENARIOS[`occlusion-${scheme}-desktop-concelho`] = { device: DESKTOP, scheme, hash: "#c=1714" };
  SCENARIOS[`occlusion-${scheme}-desktop-parish`] = { device: DESKTOP, scheme, hash: "#f=171415" };
  SCENARIOS[`occlusion-${scheme}-phone-concelho`] = { device: PHONE, scheme, hash: "#c=1714" };
  SCENARIOS[`occlusion-${scheme}-phone-parish`] = { device: PHONE, scheme, hash: "#f=021103" };
}
SCENARIOS["interplay-overlays"] = { device: DESKTOP, hash: "#c=1714&pa=rnap,natura" };
SCENARIOS["interplay-overlays-parish"] = { device: DESKTOP, hash: "#f=171415&pa=rnap,natura" };
SCENARIOS["interplay-focus-partial"] = { device: DESKTOP, hash: "#c=1823&focus=1" };
SCENARIOS["interplay-lang-switch"] = { device: DESKTOP, hash: "#c=1823", act: (page) => page.getByTestId("lang-pt").click() };
SCENARIOS["interplay-theme-switch"] = {
  device: DESKTOP,
  hash: "#f=171415",
  act: async (page) => {
    await page.getByTestId("theme-button").click(); // Auto → Light
    await page.getByTestId("theme-button").click(); // Light → Dark
  },
  scheme: "light",
  settle: "dark",
};
SCENARIOS["interplay-phone-card"] = { device: PHONE, hash: "#c=1823", act: (page) => page.locator(".sheet-handle, [data-testid=sheet-handle]").first().click() };

const [out, filter] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/drill_review.mjs <out-dir> [name-filter]");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
for (const [name, s] of Object.entries(SCENARIOS)) {
  if (filter && !name.includes(filter)) continue;
  const scheme = s.scheme ?? "light";
  const context = await browser.newContext({ ...s.device, colorScheme: scheme });
  await context.addInitScript(() => localStorage.setItem("pnct-map:3d", "on"));
  const page = await context.newPage();
  await page.goto(`${BASE}${s.hash}`);
  await waitForSettled(page, scheme);
  if (s.act) {
    await s.act(page);
    await waitForSettled(page, s.settle ?? scheme);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name);
  await context.close();
}
await browser.close();
