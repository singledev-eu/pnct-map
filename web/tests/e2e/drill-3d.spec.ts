import type { Page } from "@playwright/test";
import { expect, searchAndPick, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// 3D drill-down selection (src/drill.ts): a selection tilts the camera and raises the selected
// feature as a slab; clearing it levels the camera. Off under prefers-reduced-motion and with the
// "3D" button off (kept in localStorage); on by default, phones included.
const VILA_REAL = "1714";
const MATEUS = "171415";
const EMPTY = (key: string) => ["==", ["get", key], ""];

const camera = (page: Page) => page.evaluate(() => ({ pitch: window.pnctMap.getPitch() as number, bearing: window.pnctMap.getBearing() as number }));
const slab = (page: Page, id: string) =>
  page.evaluate((layer) => {
    const m = window.pnctMap;
    return { filter: m.getFilter(layer), height: m.getPaintProperty(layer, "fill-extrusion-height") as number };
  }, id);
const veil = (page: Page) => page.evaluate(() => window.pnctMap.getPaintProperty("slab-veil", "background-opacity") as number);

function trackWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  return warnings;
}

async function selectVilaReal(page: Page): Promise<void> {
  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Vila Real");
  await waitForParishView(page);
}

async function closePanel(page: Page): Promise<void> {
  await page.getByTestId("panel").getByRole("button", { name: /close/i }).click();
  await expect(page).not.toHaveURL(/[#&](c|f)=/);
  await waitForParishView(page);
}

test("3D is on by default on desktop: select tilts and raises, drill swaps slabs, close levels", async ({ page }) => {
  const errors = trackErrors(page);
  const warnings = trackWarnings(page);
  await page.goto("/");
  await waitForParishes(page);
  await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-pressed", "true");

  await selectVilaReal(page);
  const tilted = await camera(page);
  expect(tilted.pitch).toBeCloseTo(50, 5);
  expect(Math.abs(tilted.bearing)).toBeGreaterThanOrEqual(8);
  expect(Math.abs(tilted.bearing)).toBeLessThanOrEqual(15);
  // The slab layer holds the selected concelho only.
  expect(await slab(page, "concelho-slab")).toMatchObject({ filter: ["==", ["get", "code"], VILA_REAL] });
  expect((await slab(page, "concelho-slab")).height).toBeGreaterThan(0);
  expect(await veil(page)).toBeGreaterThan(0);
  expect(await slab(page, "parish-slab")).toMatchObject({ filter: EMPTY("dicofre") });

  // Drill into a parish: the parish slab rises, the concelho slab lowers and is emptied.
  await searchAndPick(page, "Mateus", /Vila Real/);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Mateus");
  await waitForParishView(page);
  expect(await slab(page, "parish-slab")).toMatchObject({ filter: ["==", ["get", "dicofre"], MATEUS] });
  expect((await slab(page, "parish-slab")).height).toBeGreaterThan(0);
  await expect.poll(async () => (await slab(page, "concelho-slab")).filter).toEqual(EMPTY("code"));
  expect((await camera(page)).pitch).toBeCloseTo(50, 5);

  await closePanel(page);
  expect(await camera(page)).toEqual({ pitch: 0, bearing: 0 });
  await expect.poll(async () => (await slab(page, "parish-slab")).filter).toEqual(EMPTY("dicofre"));
  expect(await veil(page)).toBe(0);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("a click on empty map clears a 3D selection and returns the pitch to 0", async ({ page }) => {
  await page.goto("/#c=0808"); // Loulé, on the Algarve coast: open sea in view
  await waitForParishView(page);
  expect((await camera(page)).pitch).toBeCloseTo(50, 5);
  // A point over the sea: no parish or concelho there, and clear of the panel, legend and toolbar.
  const sea = await page.evaluate(() => {
    const m = window.pnctMap;
    for (let y = 860; y > 120; y -= 20) {
      for (let x = 320; x < 1000; x += 20) {
        if (!m.queryRenderedFeatures([x, y], { layers: ["parish-fill", "concelho-fill", "parish-slab", "concelho-slab"] }).length) return { x, y };
      }
    }
    return null;
  });
  expect(sea).not.toBeNull();
  await page.mouse.click(sea!.x, sea!.y);
  await expect(page).not.toHaveURL(/[#&]c=/);
  await expect.poll(() => camera(page)).toEqual({ pitch: 0, bearing: 0 });
});

test("reduced motion: no tilt, no slab, instant selection, the 3D button disabled", async ({ page }) => {
  const errors = trackErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForParishes(page);
  const button = page.getByTestId("view3d-button");
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button).toHaveAttribute("aria-label", /reduced motion/);

  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Vila Real");
  // The camera jumped: at rest on the next frame, already at the concelho.
  expect(await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(window.pnctMap.isMoving()))))).toBe(false);
  expect(await page.evaluate(() => window.pnctMap.getZoom())).toBeGreaterThan(9);
  expect(await camera(page)).toEqual({ pitch: 0, bearing: 0 });
  expect(await slab(page, "concelho-slab")).toMatchObject({ filter: EMPTY("code") });
  expect(await veil(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("turning reduced motion on during a 3D selection levels the camera and lowers the slab", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}`);
  await waitForParishView(page);
  expect((await camera(page)).pitch).toBeCloseTo(50, 5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => camera(page)).toEqual({ pitch: 0, bearing: 0 });
  await expect.poll(async () => (await slab(page, "concelho-slab")).filter).toEqual(EMPTY("code"));
  await expect(page.getByTestId("view3d-button")).toBeDisabled();
});

test("the 3D button turns 3D off and on, live and across a reload, in both languages", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}`);
  await waitForParishView(page);
  const button = page.getByTestId("view3d-button");
  await expect(button).toHaveAttribute("aria-label", "3D view: on");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => camera(page)).toEqual({ pitch: 0, bearing: 0 });
  await expect.poll(async () => (await slab(page, "concelho-slab")).filter).toEqual(EMPTY("code"));
  expect(await page.evaluate(() => localStorage.getItem("pnct-map:3d"))).toBe("off");

  await page.reload();
  await waitForParishView(page);
  await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-pressed", "false");
  expect(await camera(page)).toEqual({ pitch: 0, bearing: 0 });
  await page.getByTestId("lang-pt").click();
  await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-label", "Vista 3D: desligada");

  // On again: tilts onto the selection in place.
  await page.getByTestId("view3d-button").click();
  await expect.poll(async () => (await camera(page)).pitch).toBeCloseTo(50, 5);
  expect(await slab(page, "concelho-slab")).toMatchObject({ filter: ["==", ["get", "code"], VILA_REAL] });
});

test("a 3D selection survives a dark theme switch without console warnings", async ({ page }) => {
  const warnings = trackWarnings(page);
  const errors = trackErrors(page);
  await page.goto(`/#f=${MATEUS}`);
  await waitForParishView(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute("data-map-theme", "dark");
  await waitForParishView(page);
  expect(await slab(page, "parish-slab")).toMatchObject({ filter: ["==", ["get", "dicofre"], MATEUS] });
  expect((await camera(page)).pitch).toBeCloseTo(50, 5);
  await closePanel(page);
  expect(await camera(page)).toEqual({ pitch: 0, bearing: 0 });
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("3D is on on phones too, with a lower tilt; the selection sits above the bottom sheet", async ({ page }) => {
    await page.goto(`/#f=${MATEUS}`);
    await waitForParishView(page);
    await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-pressed", "true");
    expect((await camera(page)).pitch).toBeCloseTo(40, 5);
    expect(await slab(page, "parish-slab")).toMatchObject({ filter: ["==", ["get", "dicofre"], MATEUS] });
    // The parish centre lands in the middle of the map area above the sheet (groundOffset).
    const at = await page.evaluate((dicofre) => {
      const m = window.pnctMap;
      const coords: [number, number][] = m
        .querySourceFeatures("parishes", { filter: ["==", ["get", "dicofre"], dicofre] })
        .flatMap((f: { geometry: { coordinates: unknown } }) => (JSON.stringify(f.geometry.coordinates).match(/-?\d+\.?\d*,-?\d+\.?\d*/g) ?? []).map((p: string) => p.split(",").map(Number)));
      const xs = coords.map((c) => c[0]);
      const ys = coords.map((c) => c[1]);
      const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      return { y: m.project(centre).y, h: window.innerHeight, n: coords.length };
    }, MATEUS);
    expect(at.n).toBeGreaterThan(3);
    expect(at.y).toBeLessThan(at.h * 0.5);
  });
});

// ---- fit: the selection's projected footprint inside the visible area ----------------------------
// The visible area is the map minus main.ts fitPadding(true): the toolbar, and the panel (desktop) or
// the half-height bottom sheet (phone).
const visibleArea = (page: Page) =>
  page.evaluate(() => {
    const [w, h] = [innerWidth, innerHeight];
    const narrow = matchMedia("(max-width: 640px)").matches;
    return narrow ? { x0: 24, y0: 120, x1: w - 24, y1: h - Math.round(h * 0.5) } : { x0: 40, y0: 80, x1: w - 400, y1: h - 40 };
  });

/** Screen bbox of the feature's outer rings (MapLibre's own projection) and its share of the visible area. */
async function framing(page: Page, kind: "parish" | "concelho", code: string) {
  const area = await visibleArea(page);
  const box = await page.evaluate(
    async ({ kind, code }) => {
      const m = window.pnctMap;
      const data = await m.getSource(kind === "parish" ? "parishes" : "concelhos").getData();
      const f = data.features.find((x: { properties: Record<string, string> }) => x.properties[kind === "parish" ? "dicofre" : "code"] === code);
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const pts = polys.flatMap((p: number[][][]) => p[0]).map((c: number[]) => m.project(c));
      const xs = pts.map((p: { x: number }) => p.x);
      const ys = pts.map((p: { y: number }) => p.y);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    },
    { kind, code },
  );
  const share = Math.max((box.x1 - box.x0) / (area.x1 - area.x0), (box.y1 - box.y0) / (area.y1 - area.y0));
  const inside = box.x0 >= area.x0 - 2 && box.y0 >= area.y0 - 2 && box.x1 <= area.x1 + 2 && box.y1 <= area.y1 + 2;
  return { inside, share, box, area };
}

async function expectFramed(page: Page, kind: "parish" | "concelho", code: string) {
  await waitForParishView(page);
  const f = await framing(page, kind, code);
  expect(f.inside, JSON.stringify(f)).toBe(true);
  expect(f.share, JSON.stringify(f)).toBeGreaterThan(0.33);
  expect(f.share, JSON.stringify(f)).toBeLessThan(0.87);
}

/** A screen point inside the feature where the app hit-tests it (scans its projected bbox). */
async function pointIn(page: Page, dicofre: string) {
  const { box } = await framing(page, "parish", dicofre);
  return page.evaluate(
    ({ box, dicofre }) => {
      const m = window.pnctMap;
      for (let s = 2; s <= 16; s *= 2)
        for (let i = 1; i < s; i++)
          for (let j = 1; j < s; j++) {
            const p = [box.x0 + ((box.x1 - box.x0) * i) / s, box.y0 + ((box.y1 - box.y0) * j) / s];
            if (m.queryRenderedFeatures(p, { layers: ["parish-fill"] })[0]?.properties.dicofre === dicofre) return { x: p[0], y: p[1] };
          }
      return null;
    },
    { box, dicofre },
  );
}

/**
 * A point on the concelho slab's top above the parish: the top is drawn higher on screen than the
 * ground under it, so this walks up from a ground point inside the parish until the app's own hit
 * test (shown by the tooltip) names it.
 */
async function pointOnSlab(page: Page, dicofre: string, name: string) {
  const ground = (await pointIn(page, dicofre))!;
  for (let dy = 0; dy <= 120; dy += 3) {
    await page.mouse.move(ground.x, ground.y - dy);
    const text = await page.locator("#tooltip").textContent();
    if ((await page.locator("#tooltip").isVisible()) && text?.startsWith(name)) return { x: ground.x, y: ground.y - dy };
  }
  return null;
}

/** The same point by the camera maths (touch screens show no tooltip): the parish's ground point lifted to the slab top. */
async function liftedPoint(page: Page, dicofre: string) {
  const ground = (await pointIn(page, dicofre))!;
  const cam = await page.evaluate(({ x, y }) => {
    const m = window.pnctMap;
    const el = m.getContainer();
    const g = m.unproject([x, y]);
    return { g: [g.lng, g.lat], c: m.getCenter().toArray(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), fov: m.getVerticalFieldOfView(), w: el.clientWidth, h: el.clientHeight, top: m.getPaintProperty("concelho-slab", "fill-extrusion-height") };
  }, ground);
  const mx = (lng: number) => (lng + 180) / 360;
  const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const world = 512 * 2 ** cam.zoom;
  const mpp = (2 * Math.PI * 6_378_137 * Math.cos((cam.c[1] * Math.PI) / 180)) / world;
  // camera.ts projectGround (its outline.json import doesn't load in Node): MapLibre's perspective camera.
  const [dx, dy, e] = [(mx(cam.g[0]) - mx(cam.c[0])) * world, (my(cam.g[1]) - my(cam.c[1])) * world, cam.top / mpp];
  const [t, p] = [(cam.bearing * Math.PI) / 180, (cam.pitch * Math.PI) / 180];
  const d = cam.h / 2 / Math.tan((cam.fov * Math.PI) / 360);
  const [u, v] = [dx * Math.cos(t) + dy * Math.sin(t), -dx * Math.sin(t) + dy * Math.cos(t)];
  const depth = d - v * Math.sin(p) - e * Math.cos(p);
  return { x: (d * u) / depth + cam.w / 2, y: (d * (v * Math.cos(p) - e * Math.sin(p))) / depth + cam.h / 2 };
}

for (const [device, use] of [
  ["desktop", {}],
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`fit on ${device}`, () => {
    test.use(use);

    test("search: a parish and a concelho are framed inside the visible area", async ({ page }) => {
      await page.goto("/");
      await waitForParishes(page);
      await searchAndPick(page, "Mateus", /Vila Real/);
      await expectFramed(page, "parish", MATEUS);
      await searchAndPick(page, "Sabóia", /Odemira/);
      await expectFramed(page, "parish", "021103");
      await searchAndPick(page, "Viseu", /Concelho · Viseu/);
      await expectFramed(page, "concelho", "1823");
    });

    test("click: a parish inside the selected concelho is refitted, not left tiny", async ({ page }) => {
      await page.goto(`/#c=${VILA_REAL}`);
      await expectFramed(page, "concelho", VILA_REAL);
      const p = device === "phone" ? await liftedPoint(page, MATEUS) : await pointOnSlab(page, MATEUS, "Mateus");
      expect(p).not.toBeNull();
      if (device === "phone") await page.touchscreen.tap(p!.x, p!.y);
      else await page.mouse.click(p!.x, p!.y);
      await expect(page).toHaveURL(new RegExp(`[#&]f=${MATEUS}`));
      await expectFramed(page, "parish", MATEUS);
    });

    test("panel list: a parish picked from the concelho panel is framed", async ({ page }) => {
      await page.goto("/#c=1823");
      await waitForParishView(page);
      const entry = page.getByTestId("pnct-parish-list").locator("button").first();
      const name = (await entry.textContent())!.trim();
      await entry.click();
      await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText(name);
      const dicofre = new URLSearchParams(new URL(page.url()).hash.slice(1)).get("f")!;
      await expectFramed(page, "parish", dicofre);
    });
  });
}

// ---- hover ---------------------------------------------------------------------------------------
test("hover outside the slab: the outline is drawn above the veil", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}`);
  await waitForParishView(page);
  const order = await page.evaluate(() => window.pnctMap.getStyle().layers.map((l: { id: string }) => l.id));
  expect(order.indexOf("parish-hover-line")).toBeGreaterThan(order.indexOf("slab-veil"));
  const p = await pointIn(page, "171101"); // Alvações do Corgo, Santa Marta de Penaguião: outside Vila Real
  await page.mouse.move(p!.x, p!.y);
  await expect(page.locator("#tooltip")).toContainText("Alvações do Corgo");
  expect(await page.evaluate(() => window.pnctMap.getFeatureState({ source: "parishes", id: 171101 }).hover)).toBe(true);
  expect(await slab(page, "hover-pop")).toMatchObject({ filter: EMPTY("dicofre") }); // no pop-up outside a slab
});

test("hover inside a concelho slab: the parish under the slab top pops up", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}`);
  await waitForParishView(page);
  // On the slab top the pointer is above the ground point; the app finds the parish under it.
  const onTop = await pointOnSlab(page, MATEUS, "Mateus");
  expect(onTop).not.toBeNull();
  await expect(page.locator("#tooltip")).toContainText("Mateus");
  await expect.poll(async () => (await slab(page, "hover-pop")).filter).toEqual(["==", ["get", "dicofre"], MATEUS]);
  const concelhoTop = (await slab(page, "concelho-slab")).height;
  await expect.poll(async () => (await slab(page, "hover-pop")).height).toBeGreaterThan(concelhoTop);
  // Leaving drops it back and empties it.
  await page.mouse.move(5, 450);
  await expect.poll(async () => (await slab(page, "hover-pop")).filter).toEqual(EMPTY("dicofre"));
});

// ---- colour by eligibility -------------------------------------------------------------------------
for (const scheme of ["light", "dark"] as const) {
  test.describe(`slab colour (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    const colour = (page: Page, layer: string) => page.evaluate((id) => window.pnctMap.getPaintProperty(id, "fill-extrusion-color"), layer);
    const rendered = (page: Page, layer: string) =>
      page.evaluate((id) => [...new Set(window.pnctMap.queryRenderedFeatures({ layers: [id] }).map((f: { properties: Record<string, unknown> }) => JSON.stringify(f.properties)))].map((s) => JSON.parse(s as string)), layer);

    test("a non-PNCT parish rises neutral, a PNCT one in the PNCT colour", async ({ page }) => {
      const { PALETTES } = await import("../../src/theme");
      const pal = PALETTES[scheme];
      await page.goto("/#f=182339"); // Repeses e São Salvador, Viseu: not PNCT
      await waitForParishView(page);
      expect(await colour(page, "parish-slab")).toEqual(["case", ["==", ["get", "pnct"], true], pal.slab, pal.slabNeutral]);
      const [f] = await rendered(page, "parish-slab");
      expect(f).toMatchObject({ dicofre: "182339", pnct: false });
      await searchAndPick(page, "Mateus", /Vila Real/);
      await waitForParishView(page);
      expect((await rendered(page, "parish-slab"))[0]).toMatchObject({ dicofre: MATEUS, pnct: true });
    });

    test("a partly-PNCT concelho is neutral with exactly its PNCT parishes raised in the PNCT colour", async ({ page }) => {
      const { PALETTES } = await import("../../src/theme");
      const pal = PALETTES[scheme];
      await page.goto("/#c=1823"); // Viseu: 6 of 25 parishes PNCT
      await waitForParishView(page);
      expect(await colour(page, "concelho-slab")).toEqual(["case", ["==", ["get", "pnct_count"], ["get", "parish_count"]], pal.slab, pal.slabNeutral]);
      expect((await rendered(page, "concelho-slab"))[0]).toMatchObject({ code: "1823", pnct_count: 6, parish_count: 25 });
      expect(await colour(page, "concelho-pnct-top")).toBe(pal.slab);
      const tops = await rendered(page, "concelho-pnct-top");
      expect(new Set(tops.map((t: { dicofre: string }) => t.dicofre)).size).toBe(6);
      expect(tops.every((t: { dicofre: string; pnct: boolean }) => t.dicofre.startsWith("1823") && t.pnct)).toBe(true);
      // A whole-PNCT concelho has no raised tops: the slab itself is PNCT-coloured.
      await page.goto(`/#c=${VILA_REAL}`);
      await page.reload();
      await waitForParishView(page);
      expect(await rendered(page, "concelho-pnct-top")).toEqual([]);
    });
  });
}

// ---- occlusion -----------------------------------------------------------------------------------
test("every line layer is below the slabs, which are opaque; edges are rims on the slab top", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}`);
  await waitForParishView(page);
  const layers: { id: string; type: string }[] = await page.evaluate(() => window.pnctMap.getStyle().layers.map((l: { id: string; type: string }) => ({ id: l.id, type: l.type })));
  const firstExtrusion = layers.findIndex((l) => l.type === "fill-extrusion");
  const lastLine = layers.map((l) => l.type).lastIndexOf("line");
  expect(lastLine).toBeLessThan(firstExtrusion);
  // After the first extrusion: only extrusions, then the basemap's labels.
  expect(new Set(layers.slice(firstExtrusion).map((l) => l.type))).toEqual(new Set(["fill-extrusion", "symbol"]));
  const opacity = (id: string) => page.evaluate((layer) => window.pnctMap.getPaintProperty(layer, "fill-extrusion-opacity"), id);
  expect(await opacity("concelho-slab")).toBe(1);
  // The rim sits on the slab top.
  const slabTop = (await slab(page, "concelho-slab")).height;
  expect(await page.evaluate(() => window.pnctMap.getPaintProperty("concelho-rim", "fill-extrusion-base"))).toBe(slabTop);
  expect(await page.evaluate(() => window.pnctMap.querySourceFeatures("slab-edges", { filter: ["==", ["get", "role"], "concelho"] }).length)).toBeGreaterThan(0);
});

test("with a protected-areas overlay on, the slab turns translucent so the overlay shows; rims stay opaque", async ({ page }) => {
  await page.goto(`/#c=${VILA_REAL}&pa=natura`);
  await waitForParishView(page);
  await expect(page.locator("body")).toHaveAttribute("data-overlays", "natura");
  const opacity = (id: string) => page.evaluate((layer) => window.pnctMap.getPaintProperty(layer, "fill-extrusion-opacity"), id);
  await expect.poll(() => opacity("concelho-slab")).toBeLessThan(1);
  expect(await opacity("concelho-rim")).toBe(1);
  await page.getByTestId("overlay-natura").uncheck();
  await expect.poll(() => opacity("concelho-slab")).toBe(1);
});
