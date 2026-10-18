// The README screenshot: light theme, desktop, both protected-areas overlays on at full strength
// (zoomed in past the fade, camera.ts protectedFade), a parish panel open with its protection share.
// Usage: `npm run build && npm run preview` (in another shell), then `npm run shots:readme`.
// SHOT_BASE=https://preview.pnct-map.pages.dev/ takes it from a deployed build instead; SHOT_VIEW
// overrides the hash (to try other places). Writes docs/screenshots/desktop-protected.jpg.
// JPEG, not PNG: no optimiser is needed, and the map stays under the 400 KB budget (checked below).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SHOT_BASE ?? "http://localhost:4173/";
// Soajo (Arcos de Valdevez), in Peneda-Gerês: 92% protected, RNAP outline and Natura hatch around it,
// PNCT parishes next to non-PNCT ones (Ponte de Lima, Braga). Chosen over Serra da Estrela, where every
// parish in view is PNCT. z9.7 is past the fade on a 1440×900 viewport (full from minZoom + 2 ≈ 8.3).
const VIEW = process.env.SHOT_VIEW ?? "map=9.7/41.78/-8.38&pa=rnap,natura&f=160146";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots/desktop-protected.jpg");
const MAX_BYTES = 400 * 1024;

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
const page = await context.newPage();
await page.goto(`${BASE}#${VIEW}`);
// Settled: the app is ready in the light theme, the overlays are in the style, the panel's protection
// share has filled in, the map (basemap included) is loaded and no CSS transition is running. Checked
// two animation frames later (page.evaluate awaits the promise; waitForFunction would take any
// promise as truthy), until it holds or a minute has passed.
const settled = () =>
  page.evaluate(
    () =>
    new Promise((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const map = window.pnctMap;
          if (document.body.dataset.ready !== "true" || document.body.dataset.mapTheme !== "light") return resolve(false);
          if (document.body.dataset.overlays !== "natura,rnap") return resolve(false);
          if (!document.querySelector('[data-testid="protection-summary"]')) return resolve(false);
          if (!map || map.isMoving() || !map.loaded()) return resolve(false);
          resolve(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length === 0);
        }),
      ),
    ),
  );
for (const deadline = Date.now() + 60_000; !(await settled()); ) {
  if (Date.now() > deadline) throw new Error("the map did not settle within 60 s");
}
const opacity = await page.evaluate(() => window.pnctMap.getLayer("protected-natura-fill").paint.get("fill-opacity").constantOr(NaN));
if (opacity !== 1) throw new Error(`the overlays are not at full strength (Natura fill opacity ${opacity}); zoom in further`);
await page.screenshot({ path: OUT, type: "jpeg", quality: 82 });
await browser.close();

const bytes = statSync(OUT).size;
console.log(`${OUT}: ${(bytes / 1024).toFixed(0)} KB`);
if (bytes > MAX_BYTES) throw new Error(`over the ${MAX_BYTES / 1024} KB budget; lower the JPEG quality`);
