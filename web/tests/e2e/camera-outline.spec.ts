import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishView } from "./helpers";

// Shape-aware camera limits (0.2.3): the centre of the *visible* map area (the map minus the toolbar,
// and minus the side panel or bottom sheet when open) stays inside web/data/outline.json, mainland
// Portugal buffered by ~2 km along the Spanish border and ~20 km at sea (camera.ts: constrainView).
// The checks run in Node against the outline file, in Mercator like the app. The map is exposed as
// window.pnctMap (MapLibre Map); it is only inspected inside page.evaluate.

const OUTLINE: [number, number][] = JSON.parse(readFileSync("data/outline.json", "utf8")).ring;
const mx = (lng: number) => (lng + 180) / 360;
const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const RING = OUTLINE.map(([lng, lat]) => [mx(lng), my(lat)]);

/** Distance in Mercator world units from (x, y) to the outline: 0 inside. */
function outsideBy(x: number, y: number): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [ax, ay] = RING[j];
    const [bx, by] = RING[i];
    if (by > y !== ay > y && x < ((ax - bx) * (y - by)) / (ay - by) + bx) inside = !inside;
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return inside ? 0 : best;
}

// lat, lng as in the task.
const REJECTED = { Cádiz: [36.53, -6.29], Seville: [37.39, -5.98], Badajoz: [38.88, -6.97], Salamanca: [40.97, -5.66], Vigo: [42.24, -8.72], Ourense: [42.34, -7.86] } as const;
const REACHABLE = { Sagres: [37.01, -8.94], "Vila Real de Santo António": [37.19, -7.42], Elvas: [38.88, -7.16], "Miranda do Douro": [41.5, -6.27], Bragança: [41.81, -6.76], Caminha: [41.87, -8.84], "Cabo da Roca": [38.78, -9.5] } as const;
const ELVAS = "1207";

interface Camera {
  lng: number;
  lat: number;
  zoom: number;
  minZoom: number;
  /** Visible-area centre in Mercator world units, and the size of one CSS pixel in them. */
  vx: number;
  vy: number;
  px: number;
}

/**
 * The camera, with the centre of the visible area. Mirrors main.ts fitPadding: phones (≤ 640 px)
 * top 120, sides 24, bottom 60 or half the height with the sheet open; desktop top 80, sides and
 * bottom 40, right 400 with the panel open.
 */
function cameras(page: Page, targets: { lng: number; lat: number; zoom: number }[]): Promise<Camera[]> {
  return page.evaluate((targets) => {
    const map = window.pnctMap;
    const read = () => {
      const open = document.body.classList.contains("panel-open");
      const pad = window.matchMedia("(max-width: 640px)").matches
        ? { top: 120, left: 24, right: 24, bottom: open ? Math.round(window.innerHeight * 0.5) : 60 }
        : { top: 80, left: 40, bottom: 40, right: open ? 400 : 40 };
      const { lng, lat } = map.getCenter();
      const zoom = map.getZoom();
      const world = 512 * 2 ** zoom;
      const vx = (lng + 180) / 360 - (pad.right - pad.left) / 2 / world;
      const vy = (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2 - (pad.bottom - pad.top) / 2 / world;
      return { lng, lat, zoom, minZoom: map.getMinZoom(), vx, vy, px: 1 / world };
    };
    if (!targets.length) return [read()];
    // All jumps in one task, so no frame is rendered in between: the constraint doesn't need one.
    return targets.map(({ lng, lat, zoom }) => {
      map.jumpTo({ center: [lng, lat], zoom });
      return read();
    });
  }, targets);
}
const camera = async (page: Page): Promise<Camera> => (await cameras(page, []))[0];

/** The visible centre is inside the outline, or on it to within half a pixel. */
function expectInOutline(c: Camera, what: string): void {
  expect(outsideBy(c.vx, c.vy) / c.px, `${what}: px outside the outline (centre ${c.lng.toFixed(4)}, ${c.lat.toFixed(4)})`).toBeLessThan(0.5);
}

/** Jumps the camera to `[lng, lat]` at `zoom` (the constraint applies) and returns where it ended. */
const jump = async (page: Page, lng: number, lat: number, zoom: number): Promise<Camera> => (await cameras(page, [{ lng, lat, zoom }]))[0];

/** Records the visible-area centre of every rendered camera step from now on. */
async function recordFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { frames: { lng: number; lat: number; zoom: number }[] };
    w.frames = [];
    window.pnctMap.on("move", () => {
      const { lng, lat } = window.pnctMap.getCenter();
      w.frames.push({ lng, lat, zoom: window.pnctMap.getZoom() });
    });
  });
}
async function frames(page: Page): Promise<{ lng: number; lat: number; zoom: number }[]> {
  return page.evaluate(() => (window as unknown as { frames: { lng: number; lat: number; zoom: number }[] }).frames);
}

for (const [name, viewport, mobile] of [
  ["desktop (1440×900)", { width: 1440, height: 900 }, false],
  ["phone portrait (390×844)", { width: 390, height: 844 }, true],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });

    test("Spanish cities are clamped at country zoom: the camera stays at the country view", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/");
      await waitForParishView(page);
      const country = await camera(page);
      expect(Math.abs(country.zoom - country.minZoom)).toBeLessThan(1e-6);
      const places = Object.entries(REJECTED);
      const out = await cameras(page, places.map(([, [lat, lng]]) => ({ lng, lat, zoom: country.minZoom })));
      places.forEach(([city], i) => {
        expect(Math.abs(out[i].lng - country.lng), city).toBeLessThan(1e-6);
        expect(Math.abs(out[i].lat - country.lat), city).toBeLessThan(1e-6);
      });
      expect(errors).toEqual([]);
    });

    test("Spanish cities are clamped back over Portugal at parish zoom", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/");
      await waitForParishView(page);
      const { minZoom } = await camera(page);
      // The first parish-level zoom, and z12 (a parish selection).
      for (const zoom of [minZoom + 2.01, 12]) {
        const places = Object.entries(REJECTED);
        const out = await cameras(page, places.map(([, [lat, lng]]) => ({ lng, lat, zoom })));
        places.forEach(([city, [lat, lng]], i) => {
          const c = out[i];
          expect(c.zoom).toBeCloseTo(zoom, 9);
          expectInOutline(c, `${city} at z${zoom.toFixed(2)}`);
          // It really moved: the requested centre is outside the outline.
          expect(outsideBy(mx(lng), my(lat)), city).toBeGreaterThan(0);
          expect(Math.hypot(mx(c.lng) - mx(lng), my(c.lat) - my(lat)) / c.px, `${city} moved (px)`).toBeGreaterThan(1);
        });
        await expect(page.locator("body")).toHaveAttribute("data-level", "parish");
      }
      expect(errors).toEqual([]);
    });

    test("border towns and capes stay reachable at high zoom", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/");
      await waitForParishView(page);
      for (const zoom of [12, 14]) {
        const places = Object.entries(REACHABLE);
        const out = await cameras(page, places.map(([, [lat, lng]]) => ({ lng, lat, zoom })));
        places.forEach(([place, [lat, lng]], i) => {
          expect(Math.abs(out[i].lng - lng), `${place} z${zoom}`).toBeLessThan(1e-6);
          expect(Math.abs(out[i].lat - lat), `${place} z${zoom}`).toBeLessThan(1e-6);
        });
      }
      expect(errors).toEqual([]);
    });

    test("a shared link centred on Badajoz opens clamped over Portugal", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/#map=12/38.88/-6.97");
      await waitForParishView(page);
      const c = await camera(page);
      expect(c.zoom).toBeCloseTo(12, 6);
      expectInOutline(c, "Badajoz link");
      expect(c.lng).toBeLessThan(-6.97);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("desktop (1440×900), dragging", () => {
  test("a mouse drag with inertia from Elvas toward Badajoz stops at the border, every frame inside", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=12/38.88/-7.16");
    await waitForParishView(page);
    await recordFrames(page);
    // Dragging left moves the view east, toward Badajoz (~16 km: ~1100 px at z12).
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(1100, 450);
      await page.mouse.down();
      await page.mouse.move(200, 450, { steps: 8 });
      await page.mouse.up();
    }
    await waitForParishView(page);
    const end = await camera(page);
    expectInOutline(end, "end of drag");
    expect(end.lng, "stopped west of Badajoz").toBeLessThan(-6.97);
    const steps = await frames(page);
    expect(steps.length, "move events").toBeGreaterThan(10);
    for (const f of steps) {
      const world = 512 * 2 ** f.zoom;
      // Panel closed: the visible centre is 20 px south of the map centre.
      expect(outsideBy(mx(f.lng), my(f.lat) + 20 / world) * world, `frame ${f.lng.toFixed(5)}, ${f.lat.toFixed(5)}`).toBeLessThan(0.5);
    }
    // At rest it is a fixed point: constraining it again doesn't move it.
    const again = await jump(page, end.lng, end.lat, end.zoom);
    expect(Math.abs(again.lng - end.lng) + Math.abs(again.lat - end.lat)).toBeLessThan(1e-9);
    expect(errors).toEqual([]);
  });

  test("a border concelho keeps its fit beside the panel, and closing the panel eases back inside", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/#c=${ELVAS}`);
    await expect(page.getByTestId("panel-title")).toHaveText("Elvas");
    await waitForParishView(page);
    const fitted = await camera(page);
    expectInOutline(fitted, "Elvas fit");
    // The concelho's east edge is left of the 400 px panel.
    const east = await page.evaluate(() => window.pnctMap.project([-7.03, 38.85]).x);
    expect(east).toBeLessThanOrEqual(1440 - 400);

    // Push the camera to the eastern limit with the panel open, then close the panel.
    await jump(page, -6.5, fitted.lat, fitted.zoom);
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(page.getByTestId("panel")).toBeHidden();
    await waitForParishView(page);
    expectInOutline(await camera(page), "after closing the panel");
    expect(errors).toEqual([]);
  });
});

test.describe("phone portrait (390×844), touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a touch fling from Caminha toward Vigo stops at the Minho, every frame inside", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=11/41.87/-8.84");
    await waitForParishView(page);
    await recordFrames(page);
    const cdp = await page.context().newCDPSession(page);
    // Swipe down fast: the view moves north, toward Vigo; the release speed starts inertia.
    for (let i = 0; i < 2; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 250 }] });
      for (let s = 1; s <= 8; s++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 250 + s * 50 }] });
        await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))));
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await waitForParishView(page);
    }
    const end = await camera(page);
    expectInOutline(end, "end of fling");
    expect(end.lat, "stopped south of Vigo").toBeLessThan(42.24);
    const steps = await frames(page);
    expect(steps.length, "move events").toBeGreaterThan(10);
    for (const f of steps) {
      const world = 512 * 2 ** f.zoom;
      // Sheet closed: the visible centre is 30 px south of the map centre.
      expect(outsideBy(mx(f.lng), my(f.lat) + 30 / world) * world, `frame ${f.lng.toFixed(5)}, ${f.lat.toFixed(5)}`).toBeLessThan(0.5);
    }
    expect(errors).toEqual([]);
  });
});
