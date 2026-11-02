// Screenshots of the 3D selection's slab tops for the label-contrast check (src/contrast.ts), light
// and dark, desktop and phone: a PNCT parish, a non-PNCT parish, a partly-PNCT concelho (Viseu), the
// hover pop-up and the Natura 2000 overlay on. Next to each PNG it writes the most common colour in
// the middle of the screen (the slab top), so the rendered colour can be checked against
// extrusionTop() in src/contrast.ts.
// Usage (preview server on :4173): node scripts/slab_contrast_shots.mjs <out-dir> [name-filter]
//   → <out-dir>/<device>-<scheme>-<case>.png and <out-dir>/samples.json
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { mkdirSync, writeFileSync } from "node:fs";
import { waitForSettled } from "./settled.mjs";

const BASE = "http://localhost:4173/";
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

/** A screen point over the hovered parish's ground (inside a concelho slab, the app hit-tests the ground under the slab). */
async function hoverParish(page, dicofre) {
  const p = await page.evaluate(async (code) => {
    const m = window.pnctMap;
    const data = await m.getSource("parishes").getData();
    const f = data.features.find((x) => x.properties.dicofre === code);
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]);
    return m.project(c);
  }, dicofre);
  await page.mouse.move(p.x, p.y);
}

const CASES = {
  pnct: { hash: "#f=150902" }, // Alvalade, Santiago do Cacém (the bug report)
  other: { hash: "#f=110654" }, // Alvalade, Lisboa: not PNCT
  partial: { hash: "#c=1823" }, // Viseu: 6 of 25 parishes PNCT
  hover: { hash: "#c=1823", desktopOnly: true, act: (page) => hoverParish(page, "182310") },
  natura: { hash: "#f=150902&pa=natura" },
};

const out = process.argv[2];
const only = process.argv[3];
if (!out) throw new Error("usage: node scripts/slab_contrast_shots.mjs <out-dir> [name-filter]");
mkdirSync(out, { recursive: true });

const samples = {};
const browser = await chromium.launch({ channel: "chromium" });
for (const [device, options] of Object.entries(DEVICES)) {
  for (const scheme of ["light", "dark"]) {
    for (const [name, spec] of Object.entries(CASES)) {
      if (spec.desktopOnly && device !== "desktop") continue;
      const id = `${device}-${scheme}-${name}`;
      if (only && !id.includes(only)) continue;
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(`${BASE}${spec.hash}`);
      await waitForSettled(page, scheme);
      if (spec.act) await spec.act(page);
      // The slab's paint transitions (1.4 s) are not seen by waitForSettled (task 03 fixes that).
      await page.waitForTimeout(1800);
      await waitForSettled(page, scheme);
      const path = `${out}/${id}.png`;
      await page.screenshot({ path });
      // Most common colour in the central box, on the canvas at device pixels.
      samples[id] = await page.evaluate(() => {
        const canvas = window.pnctMap.getCanvas();
        const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
        window.pnctMap.triggerRepaint();
        return new Promise((resolve) =>
          window.pnctMap.once("render", () => {
            const w = gl.drawingBufferWidth;
            const h = gl.drawingBufferHeight;
            const bw = Math.round(w * 0.3);
            const bh = Math.round(h * 0.3);
            const px = new Uint8Array(bw * bh * 4);
            gl.readPixels(Math.round((w - bw) / 2), Math.round(h * 0.45), bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const counts = new Map();
            for (let i = 0; i < px.length; i += 4) {
              const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
              counts.set(k, (counts.get(k) ?? 0) + 1);
            }
            const [k, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
            resolve({ mode: `#${k.toString(16).padStart(6, "0")}`, share: +(n / (bw * bh)).toFixed(3) });
          }),
        );
      });
      console.log(`${path} ${JSON.stringify(samples[id])}`);
      await context.close();
    }
  }
}
await browser.close();
writeFileSync(`${out}/samples.json`, JSON.stringify(samples, null, 2));
