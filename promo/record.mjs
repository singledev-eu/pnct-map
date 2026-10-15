// Records the app frames of the promo from the live site, deterministically: every frame sets the
// camera (and the tap/dissolve overlays) for its own time, waits until the map has all tiles for
// it, and is saved as a lossless PNG at device scale. Output: work/<format>/frames/*.png and
// work/<format>/timeline.json (marker times, for captions.mjs and encode.mjs).
//
// Why not real-time capture: Playwright's recordVideo writes the CSS-pixel page (1×) into the frame
// as ~750 kbps VP8, and CDP screencast also delivers CSS-pixel frames. Deterministic capture is
// sharp, can't show blank tiles, and its moves are slower than the app's own 0.9 s eases.
//
// Usage: node record.mjs [--format 4x5|1x1]   (default: all formats)
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0"; // Chromium lives in node_modules (npm run setup)
const { chromium } = await import("@playwright/test");
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { appSize, CONCELHO, FORMATS, FPS, PARISH, RIPPLE, SITE, TIMING as T } from "./storyboard.mjs";

const { values: args } = parseArgs({ options: { format: { type: "string" } } });
const formats = args.format ? [args.format] : Object.keys(FORMATS);
for (const name of formats) if (!FORMATS[name]) throw new Error(`Unknown format ${name}; use one of ${Object.keys(FORMATS)}`);

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lngOf = (x) => x * 360 - 180;
const latOf = (y) => (360 / Math.PI) * Math.atan(Math.exp((1 - 2 * y) * Math.PI)) - 90;

/**
 * Camera between a and b at eased progress t. The zoom is interpolated linearly and the centre
 * along the path that keeps one screen point fixed (like a pinch), so the target grows steadily
 * in place instead of sliding across. Each view lies inside the previous one, which also keeps
 * the path inside the app's camera limits.
 */
function cameraAt(a, b, t) {
  const zoom = a.zoom + (b.zoom - a.zoom) * t;
  const dz = b.zoom - a.zoom;
  const f = Math.abs(dz) < 1e-6 ? t : (1 - 2 ** -(zoom - a.zoom)) / (1 - 2 ** -dz);
  const x = mercX(a.center[0]) + (mercX(b.center[0]) - mercX(a.center[0])) * f;
  const y = mercY(a.center[1]) + (mercY(b.center[1]) - mercY(a.center[1])) * f;
  return { center: [lngOf(x), latOf(y)], zoom };
}

/** In-page helpers: overlays for the tap ripple, dissolves and per-frame settling. */
function installPromo({ ripple }) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const fade = document.createElement("img");
  fade.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;display:none";
  const dot = document.createElement("div");
  const ring = document.createElement("div");
  for (const el of [dot, ring]) el.style.cssText = "position:absolute;border-radius:50%;opacity:0;transform:translate(-50%,-50%)";
  dot.style.background = `rgba(${ripple.color}, 0.35)`;
  ring.style.border = `3px solid rgba(${ripple.color}, 0.9)`;
  root.append(fade, dot, ring);
  document.body.append(root);

  window.__promo = {
    /** p in [0, 1] through the ripple, or null to hide it. */
    ripple(x, y, p) {
      if (p === null || p >= 1) return (dot.style.opacity = ring.style.opacity = "0");
      const ease = 1 - (1 - p) ** 3;
      const r = ripple.dot + (ripple.ring - ripple.dot) * ease;
      Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${2 * r}px`, height: `${2 * r}px`, opacity: String(1 - p) });
      const d = ripple.dot * (p < 0.15 ? 0.7 + 2 * p : 1);
      Object.assign(dot.style, { left: `${x}px`, top: `${y}px`, width: `${2 * d}px`, height: `${2 * d}px`, opacity: String(p < 0.5 ? 1 : 2 - 2 * p) });
    },
    /** Shows an earlier frame over the page at `opacity` (a cross-dissolve to the live state). */
    dissolve(src, opacity) {
      if (src) fade.src = src;
      fade.style.display = opacity > 0 ? "block" : "none";
      fade.style.opacity = String(opacity);
    },
    /** Resolves once the map has rendered the current camera with all its tiles. */
    settle() {
      const map = window.pnctMap;
      return new Promise((resolve) => {
        const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        map.once("render", () => (map.loaded() && !map.isMoving() ? done() : map.once("idle", done)));
        map.triggerRepaint();
      });
    },
    camera() {
      const map = window.pnctMap;
      return { center: map.getCenter().toArray(), zoom: map.getZoom() };
    },
    /** A visible point (page CSS px) inside the rendered feature of `layer` with `key` = `value`. */
    pointInside(layer, key, value) {
      const map = window.pnctMap;
      const canvas = map.getCanvas();
      const origin = canvas.getBoundingClientRect();
      const feats = map.queryRenderedFeatures({ layers: [layer] }).filter((f) => f.properties[key] === value);
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      const grow = (c) => {
        if (typeof c[0] === "number") {
          const p = map.project(c);
          [minX, minY, maxX, maxY] = [Math.min(minX, p.x), Math.min(minY, p.y), Math.max(maxX, p.x), Math.max(maxY, p.y)];
        } else c.forEach(grow);
      };
      for (const f of feats) grow(f.geometry.coordinates);
      // Prefer points near the middle of the shape: walk a grid outward from the bbox centre.
      const steps = 16;
      const cells = [];
      for (let i = 1; i < steps; i++) for (let j = 1; j < steps; j++) cells.push([i, j, Math.hypot(i - steps / 2, j - steps / 2)]);
      cells.sort((a, b) => a[2] - b[2]);
      for (const [i, j] of cells) {
        const x = minX + ((maxX - minX) * i) / steps;
        const y = minY + ((maxY - minY) * j) / steps;
        const top = document.elementFromPoint(origin.left + x, origin.top + y);
        if (top !== canvas && !canvas.contains(top)) continue;
        if (map.queryRenderedFeatures([x, y], { layers: [layer] })[0]?.properties[key] === value) return { x: origin.left + x, y: origin.top + y };
      }
      return null;
    },
  };
}

async function record(name) {
  const format = FORMATS[name];
  const app = appSize(format);
  // Written to a temporary folder and swapped in at the end, so a failed run keeps the last good one.
  const final = new URL(`./work/${name}/`, import.meta.url).pathname;
  const dir = new URL(`./work/${name}.tmp/`, import.meta.url).pathname;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}frames`, { recursive: true });

  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ viewport: app, deviceScaleFactor: format.scale, isMobile: true, hasTouch: true, locale: "en-GB" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE);
  await page.waitForSelector("body[data-ready=true]", { timeout: 60_000 });
  await page.evaluate(installPromo, { ripple: RIPPLE });
  await page.evaluate(() => window.__promo.settle());

  let frame = 0;
  const markers = {};
  const mark = (key) => (markers[key] = frame / FPS);
  const frames = (seconds) => Math.max(1, Math.round(seconds * FPS));

  // Overlay state, applied before every frame.
  let tap = null; // { x, y, start }
  let fade = null; // { src, start, frames }
  async function shoot() {
    const p = tap ? (frame - tap.start) / (RIPPLE.duration * FPS) : null;
    const f = fade ? 1 - easeInOutCubic(Math.min(1, (frame - fade.start) / fade.frames)) : 0;
    await page.evaluate(([tap, p, f]) => {
      window.__promo.ripple(tap?.x ?? 0, tap?.y ?? 0, p);
      window.__promo.dissolve(null, f);
    }, [tap, p, f]);
    if (fade && f === 0) fade = null;
    await page.evaluate(() => window.__promo.settle());
    await page.screenshot({ path: `${dir}frames/${String(frame).padStart(5, "0")}.png` });
    frame += 1;
    if (frame % FPS === 0) process.stdout.write(`\r${name}: ${frame / FPS}s recorded`);
  }
  const hold = async (seconds, each) => {
    const n = frames(seconds);
    for (let i = 0; i < n; i++) {
      if (each) await each((i + 1) / n);
      await shoot();
    }
  };
  /** Eases the camera from a to b. jumpTo per frame, so only this script moves the map. */
  const move = (a, b, seconds) =>
    hold(seconds, (t) => page.evaluate((c) => window.pnctMap.jumpTo(c), cameraAt(a, b, easeInOutCubic(t))));
  /** Snapshot of the current state; the next frames dissolve from it to whatever the page shows. */
  async function dissolveFrom(seconds) {
    const png = await page.screenshot();
    await page.evaluate((src) => window.__promo.dissolve(src, 1), `data:image/png;base64,${png.toString("base64")}`);
    return () => (fade = { start: frame, frames: frames(seconds) });
  }
  async function tapAt(point) {
    if (!point) throw new Error("tap target not visible");
    tap = { ...point, start: frame };
    await page.touchscreen.tap(point.x, point.y);
  }
  const pointOf = (layer, key, value) => page.evaluate(([l, k, v]) => window.__promo.pointInside(l, k, v), [layer, key, value]);
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const camera = () => page.evaluate(() => window.__promo.camera());
  /** Lets the app's own camera animation finish, reads where it ends, then puts the camera back. */
  async function interceptMove(from) {
    await page.evaluate(() => new Promise((r) => (window.pnctMap.isMoving() ? window.pnctMap.once("moveend", r) : r())));
    const to = await camera();
    await page.evaluate((c) => window.pnctMap.jumpTo(c), from);
    return to;
  }

  // 1. Country view.
  const country = await camera();
  mark("intro");
  await hold(T.intro);

  // 2. "Only PNCT": the non-PNCT areas fade out.
  mark("toggle");
  await hold(T.toggleLead);
  let startFade = await dissolveFrom(T.toggleDissolve);
  await tapAt(await centreOf(page.locator("label.toggle")));
  await page.waitForFunction(() => document.body.classList.contains("focus-mode"));
  startFade();
  await hold(T.toggleDissolve + T.toggleHold);

  // 3. Tap the concelho; the sheet appears and the camera eases down to its parishes.
  mark("concelho");
  await hold(T.concelhoLead);
  startFade = await dissolveFrom(T.sheetDissolve);
  await tapAt(await pointOf("concelho-fill", "code", CONCELHO.code));
  await page.getByTestId("panel-title").filter({ hasText: CONCELHO.name }).waitFor();
  const concelho = await interceptMove(country);
  startFade();
  await hold(T.sheetDissolve);
  await move(country, concelho, T.zoomIn);
  await hold(T.zoomInHold);

  // 4. Tap a parish: the sheet shows it; scroll to its Idealista links.
  mark("parish");
  await hold(T.parishLead);
  startFade = await dissolveFrom(T.panelDissolve);
  await tapAt(await pointOf("parish-fill", "dicofre", PARISH.dicofre));
  await page.getByTestId("panel-title").filter({ hasText: PARISH.name }).waitFor();
  startFade();
  await hold(T.panelDissolve + T.scrollLead);
  mark("links");
  // The sheet's .panel-body scrolls; scroll until the Idealista links sit at its bottom edge, with the
  // search options above them still in view.
  const scroll = await page.evaluate(() => {
    const body = document.querySelector("#panel .panel-body");
    const links = [...body.querySelectorAll('[data-testid="property-link"]')];
    if (!links.length) throw new Error("no property links in the parish panel");
    const bottom = Math.max(...links.map((l) => l.getBoundingClientRect().bottom));
    const target = body.scrollTop + bottom - body.getBoundingClientRect().bottom + 16;
    return { from: body.scrollTop, to: Math.max(0, Math.min(target, body.scrollHeight - body.clientHeight)) };
  });
  await hold(T.scroll, (t) => page.evaluate((y) => (document.querySelector("#panel .panel-body").scrollTop = y), scroll.from + (scroll.to - scroll.from) * easeInOutCubic(t)));
  await hold(T.linksHold);

  // 5. Close the sheet and ease back out to the country view.
  mark("close");
  await hold(T.closeLead);
  startFade = await dissolveFrom(T.closeDissolve);
  await tapAt(await centreOf(page.getByRole("button", { name: "Close panel" })));
  await page.getByTestId("panel").waitFor({ state: "hidden" });
  startFade();
  await hold(T.closeDissolve);
  await move(await camera(), country, T.zoomOut);
  await hold(T.outroHold);

  // 6. End card: composed by encode.mjs over a hold of the last frame.
  mark("end");
  await hold(T.endCard);

  const timeline = { format: name, fps: FPS, frames: frame, duration: frame / FPS, app, markers, cameras: { country, concelho }, errors };
  writeFileSync(`${dir}timeline.json`, JSON.stringify(timeline, null, 2));
  await browser.close();
  rmSync(final, { recursive: true, force: true });
  renameSync(dir, final);
  process.stdout.write(`\r${name}: ${frame} frames (${(frame / FPS).toFixed(2)} s) → ${final}\n`);
  if (errors.length) console.warn(`page errors:\n  ${errors.join("\n  ")}`);
}

for (const name of formats) await record(name);
