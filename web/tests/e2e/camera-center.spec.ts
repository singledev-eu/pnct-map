import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishView } from "./helpers";

// Camera centre limits: a transformConstrain keeps the camera *centre* inside CENTER_BOX at every
// zoom, so a pan can't wander to Tangier or deep into Spain, while the country view (min zoom) and
// edge concelhos (Sagres, the Minho) stay reachable. The map is exposed as window.pnctMap
// (MapLibre Map); it is only inspected inside page.evaluate.

// CENTER_BOX from src/camera.ts: MAINLAND [-9.53, 36.95, -6.18, 42.16] ± CENTER_MARGIN (0.25°),
// as [west, south, east, north].
const CENTER_BOX = [-9.78, 36.7, -5.93, 42.41] as const;
const EPS = 1e-6;
const VILA_DO_BISPO = "Vila do Bispo";

const hash = (page: Page): string => new URL(page.url()).hash;
const minZoomOf = (page: Page): Promise<number> => page.evaluate(() => window.pnctMap.getMinZoom());
const zoomOf = (page: Page): Promise<number> => page.evaluate(() => window.pnctMap.getZoom());
const centerOf = async (page: Page): Promise<{ lng: number; lat: number }> => {
  const { lng, lat } = await page.evaluate(() => window.pnctMap.getCenter());
  return { lng, lat };
};

function expectCenterInBox({ lng, lat }: { lng: number; lat: number }): void {
  const [west, south, east, north] = CENTER_BOX;
  expect(lng, `centre lng ${lng}`).toBeGreaterThanOrEqual(west - EPS);
  expect(lng, `centre lng ${lng}`).toBeLessThanOrEqual(east + EPS);
  expect(lat, `centre lat ${lat}`).toBeGreaterThanOrEqual(south - EPS);
  expect(lat, `centre lat ${lat}`).toBeLessThanOrEqual(north + EPS);
}

/** Code of the rendered concelho called `name` (found at runtime; the country view shows them all). */
async function concelhoCode(page: Page, name: string): Promise<string> {
  const code = await page.evaluate(
    (name) => window.pnctMap.queryRenderedFeatures({ layers: ["concelho-fill"] }).find((f: any) => f.properties.name === name)?.properties.code ?? null,
    name,
  );
  expect(code, `a rendered concelho called ${name}`).not.toBeNull();
  return code as string;
}

/** Geographic bbox [west, south, east, north] of the rendered concelho-fill features with this code. */
async function concelhoBbox(page: Page, code: string): Promise<[number, number, number, number]> {
  const bbox = await page.evaluate((code) => {
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (c: any): void => {
      if (typeof c[0] === "number") [w, s, e, n] = [Math.min(w, c[0]), Math.min(s, c[1]), Math.max(e, c[0]), Math.max(n, c[1])];
      else c.forEach(grow);
    };
    for (const f of window.pnctMap.queryRenderedFeatures({ layers: ["concelho-fill"] })) {
      if (f.properties.code === code) grow(f.geometry.coordinates);
    }
    return Number.isFinite(w) ? [w, s, e, n] : null;
  }, code);
  expect(bbox, `rendered geometry of concelho ${code}`).not.toBeNull();
  return bbox as [number, number, number, number];
}

/** Screen-space bbox (CSS px, relative to the map canvas) of a geographic bbox, at the current camera. */
function projectBbox(page: Page, bbox: [number, number, number, number]): Promise<{ minX: number; minY: number; maxX: number; maxY: number }> {
  return page.evaluate(([w, s, e, n]) => {
    const map = window.pnctMap;
    const pts = [map.project([w, s]), map.project([w, n]), map.project([e, s]), map.project([e, n])];
    const xs = pts.map((p: { x: number }) => p.x);
    const ys = pts.map((p: { y: number }) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }, bbox);
}

/**
 * Page coordinates of a point inside the rendered feature of `layer` whose property `key` equals
 * `value`, found by sampling a grid over its rendered bbox (ring vertices alone can fall outside
 * concave shapes). Points under the toolbar, legend or any other DOM overlay are skipped, so the
 * point can be clicked or tapped.
 */
async function pointInside(page: Page, layer: string, key: string, value: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({ layer, key, value }) => {
      const map = window.pnctMap;
      const canvas: HTMLCanvasElement = map.getCanvas();
      const origin = canvas.getBoundingClientRect();
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      const grow = (c: any): void => {
        if (typeof c[0] === "number") {
          const p = map.project(c);
          [minX, minY, maxX, maxY] = [Math.min(minX, p.x), Math.min(minY, p.y), Math.max(maxX, p.x), Math.max(maxY, p.y)];
        } else c.forEach(grow);
      };
      for (const f of map.queryRenderedFeatures({ layers: [layer] })) {
        if (f.properties[key] === value) grow(f.geometry.coordinates);
      }
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const x = minX + ((maxX - minX) * i) / steps;
          const y = minY + ((maxY - minY) * j) / steps;
          if (x < 0 || y < 0 || x > canvas.clientWidth || y > canvas.clientHeight) continue;
          const top = document.elementFromPoint(origin.left + x, origin.top + y);
          if (top !== canvas && !canvas.contains(top)) continue;
          if (map.queryRenderedFeatures([x, y], { layers: [layer] })[0]?.properties[key] === value) {
            return { x: origin.left + x, y: origin.top + y };
          }
        }
      }
      return null;
    },
    { layer, key, value },
  );
  expect(point, `a visible point inside ${layer} ${key}=${value}`).not.toBeNull();
  return point!;
}

/**
 * The initial fit is the country view. From z12 at Sagres, a wheel zoom-out anchored on Sagres (the
 * worst case: it pulls the view south-west) must end at that same camera: maxBounds are the min-zoom
 * view itself, so there is no slack at min zoom on either axis (camera.ts: cameraLimits, constrainView).
 */
async function zoomOutFromSagres(page: Page): Promise<void> {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  const country = { center: await centerOf(page), zoom: await zoomOf(page) };
  expect(Math.abs(country.zoom - (await minZoomOf(page)))).toBeLessThan(1e-6);

  await page.goto("about:blank");
  await page.goto("/#map=12/37.0/-8.94");
  await waitForParishView(page);
  // Sagres must be centrable: no clamp there.
  const start = await centerOf(page);
  expect(Math.abs(start.lng - -8.94)).toBeLessThan(0.01);
  expect(Math.abs(start.lat - 37.0)).toBeLessThan(0.01);

  const sagres = await page.evaluate(() => {
    const p = window.pnctMap.project([-8.94, 37.0]);
    const r = window.pnctMap.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.move(sagres.x, sagres.y);
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 800);
        return Math.abs((await zoomOf(page)) - country.zoom);
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBeLessThan(1e-6);
  await waitForParishView(page);

  const end = await centerOf(page);
  expect(Math.abs(end.lng - country.center.lng), `lng ${end.lng} vs ${country.center.lng}`).toBeLessThan(1e-4);
  expect(Math.abs(end.lat - country.center.lat), `lat ${end.lat} vs ${country.center.lat}`).toBeLessThan(1e-4);
  expect(errors).toEqual([]);
}

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("panning toward Tangier at zoom ≥ 9 stops with the centre inside the box", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=10/37.0/-7.0");
    await waitForParishView(page);

    // panBy([+x, +y]) moves the view right and down, i.e. south-east, toward Tangier.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.pnctMap.panBy([2000, 2000], { duration: 0 }));
      expectCenterInBox(await centerOf(page));
    }
    await waitForParishView(page);
    expectCenterInBox(await centerOf(page));

    // A flyTo to Tangier isn't blocked, only its centre is clamped.
    await page.evaluate(() => window.pnctMap.flyTo({ center: [-5.81, 35.77], zoom: 10, duration: 500 }));
    await waitForParishView(page);
    expectCenterInBox(await centerOf(page));
    expect(await zoomOf(page)).toBeGreaterThanOrEqual(9);
    expect(errors).toEqual([]);
  });

  test("a concelho click near the Algarve lands with the concelho above the bottom sheet", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishView(page);
    await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");

    const code = await concelhoCode(page, VILA_DO_BISPO);
    // Measured while the whole concelho is on screen, before the camera moves.
    const bbox = await concelhoBbox(page, code);
    const spot = await pointInside(page, "concelho-fill", "code", code);
    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByTestId("panel-title")).toHaveText(VILA_DO_BISPO);
    await expect.poll(() => hash(page)).toMatch(new RegExp(`[#&]c=${code}(&|$)`));
    await waitForParishView(page);

    expectCenterInBox(await centerOf(page));
    await expect(page.locator("body")).toHaveAttribute("data-level", "parish");

    const panel = await page.getByTestId("panel").boundingBox();
    expect(panel, "the panel is shown").not.toBeNull();
    const panelTop = panel!.y;
    const tol = 2;
    const box = await projectBbox(page, bbox);
    expect(box.minX, "concelho left edge").toBeGreaterThanOrEqual(0 - tol);
    expect(box.maxX, "concelho right edge").toBeLessThanOrEqual(390 + tol);
    expect(box.minY, "concelho top edge").toBeGreaterThanOrEqual(0 - tol);
    expect(box.maxY, `concelho bottom edge above the sheet (top ${panelTop})`).toBeLessThanOrEqual(panelTop + tol);
    expect(errors).toEqual([]);
  });
});

test.describe("phone portrait (390×844), zoom-out", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("zooming out from zoom 12 near Sagres ends at the country view", ({ page }) => zoomOutFromSagres(page));
});

test.describe("desktop (1440×900)", () => {
  test("dragging toward Madrid at zoom 10 stops with the centre inside the box", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=10/40.4/-6.6");
    await waitForParishView(page);

    // Record the centre of every rendered camera step (drag frames and inertia), not just the end state:
    // the constrain clamps each frame, so no frame may leave the box (no overshoot and ease-back).
    await page.evaluate(() => {
      const w = window as unknown as { centres: [number, number][] };
      w.centres = [];
      window.pnctMap.on("move", () => w.centres.push(window.pnctMap.getCenter().toArray()));
    });
    // Dragging left moves the view east, toward Madrid.
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(1000, 450);
      await page.mouse.down();
      await page.mouse.move(100, 450, { steps: 10 });
      await page.mouse.up();
    }
    await waitForParishView(page);
    const center = await centerOf(page);
    expect(center.lng).toBeLessThanOrEqual(-5.93 + EPS);
    expectCenterInBox(center);
    const centres: [number, number][] = await page.evaluate(() => (window as unknown as { centres: [number, number][] }).centres);
    expect(centres.length, "move events during the drags").toBeGreaterThan(10);
    for (const [lng, lat] of centres) expectCenterInBox({ lng, lat });

    // Programmatic moves are clamped too.
    await page.evaluate(() => window.pnctMap.jumpTo({ center: [-3.7, 40.4] }));
    const jumped = await centerOf(page);
    expect(jumped.lng).toBeLessThanOrEqual(-5.93 + EPS);
    expectCenterInBox(jumped);
    expect(errors).toEqual([]);
  });

  test("zooming out from zoom 12 near Sagres ends at the country view", ({ page }) => zoomOutFromSagres(page));

  test("the country view is unchanged at min zoom", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishView(page);

    const before = await centerOf(page);
    const minZoom = await minZoomOf(page);
    await page.evaluate((z) => window.pnctMap.jumpTo({ zoom: z }), minZoom);

    const after = await centerOf(page);
    expect(Math.abs(after.lng - before.lng)).toBeLessThan(EPS);
    expect(Math.abs(after.lat - before.lat)).toBeLessThan(EPS);
    expect(Math.abs((await zoomOf(page)) - minZoom)).toBeLessThan(EPS);
    expect(errors).toEqual([]);
  });
});
