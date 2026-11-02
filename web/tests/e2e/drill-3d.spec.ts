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
