import { expect, test, trackErrors, waitForParishes } from "./helpers";

// Nearby services (src/services.ts, nearby.ts): the block in the parish and concelho panels, the land
// check rows (1 km grid, straight-line fallback), "show on the map", the legend overlay and its
// explainer. Expected values are from web/data/services.json (scripts/build_services.py).
const CATS = ["health", "emergency", "supermarket", "school1", "school3", "pharmacy", "station"];
const MONSANTO = "050520"; // Monsanto e Idanha-a-Velha (Idanha-a-Nova), PNCT
const MONCHIQUE = "37.31700,-8.55300";

test("the parish panel lists the nearest service per category, measured from the main village", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#f=${MONSANTO}`);
  await waitForParishes(page);
  const block = page.getByTestId("nearby");
  await expect(block.getByTestId("nearby-from")).toHaveText("From Monsanto, by car");
  for (const cat of CATS) await expect(block.getByTestId(`service-${cat}`)).toHaveAttribute("data-mode", "road");
  // The village has its own primary school; the emergency service is Castelo Branco's hospital.
  await expect(block.getByTestId("service-school1")).toContainText("Escola Básica de Monsanto");
  const emergency = block.getByTestId("service-emergency");
  await expect(emergency).toContainText("Amato Lusitano");
  await expect(emergency).toContainText(/\d+ min/);
  await expect(emergency).toContainText(/\d+ km by road/);
  await expect(emergency.getByRole("link", { name: /OpenStreetMap/ })).toHaveAttribute("href", /openstreetmap\.org\/\?mlat=/);
  await expect(block).toContainText("© OpenStreetMap contributors");
  await expect(block).toContainText("In an emergency, call 112.");
  expect(errors).toEqual([]);
});

test("the concelho panel measures from the seat; Portuguese labels", async ({ page }) => {
  await page.goto("/?lang=pt#c=0505");
  await waitForParishes(page);
  const block = page.getByTestId("nearby");
  await expect(block.getByTestId("nearby-from")).toHaveText("A partir de Idanha-a-Nova (sede do concelho), de carro");
  await expect(block.getByTestId("service-health")).toContainText("Centro de saúde");
  await expect(block.getByTestId("service-station")).toContainText("Estação de comboios");
  await expect(block.getByTestId("service-pharmacy")).toContainText(/km por estrada/);
});

test("'show on the map' marks the facility and moves the camera to it", async ({ page }) => {
  await page.goto(`/#f=${MONSANTO}`);
  await waitForParishes(page);
  const button = page.getByTestId("service-show-emergency");
  await expect(button).toHaveAccessibleName(/^Show Urgência do Hospital Amato Lusitano .* on the map$/);
  await button.click();
  const marker = page.getByTestId("service-marker");
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute("aria-label", /^Service: Urgência do Hospital Amato Lusitano/);
  await expect(marker).toHaveAttribute("data-cat", "emergency");
  // The camera brings it into the visible map, left of the side panel.
  const panelLeft = (await page.locator("#panel").boundingBox())!.x;
  await expect
    .poll(async () => {
      const box = await marker.boundingBox();
      return box !== null && box.x > 0 && box.x + box.width < panelLeft && box.y > 0 && box.y + box.height < page.viewportSize()!.height;
    }, { timeout: 10_000 })
    .toBe(true);
  // Closing the panel takes the marker away.
  await page.locator(".panel-close").click();
  await expect(marker).toHaveCount(0);
});

test("the land check shows the rows for the clicked point from the 1 km grid", async ({ page }) => {
  const errors = trackErrors(page);
  const grid: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/services/grid-")) grid.push(`${r.status()} ${r.headers()["content-type"] ?? ""}`);
  });
  await page.goto(`/#chk=${MONCHIQUE}`);
  await waitForParishes(page);
  const block = page.getByTestId("check-nearby");
  await expect(block.getByTestId("nearby-from")).toHaveText("From the road nearest this spot (1 km grid), by car");
  for (const cat of CATS) await expect(block.getByTestId(`service-${cat}`)).toHaveAttribute("data-mode", "road");
  await expect(block.getByTestId("service-health")).toContainText("Centro de Saúde de Monchique");
  await expect(block.getByTestId("service-emergency")).toContainText("Portimão");
  await expect(block.getByTestId("nearby-straight")).toHaveCount(0);
  expect(grid).toHaveLength(1); // one chunk file, a plain GET
  expect(grid[0]).toMatch(/^200 /);
  expect(errors).toEqual([]);
});

test("a failed grid load says so instead of showing numbers", async ({ page }) => {
  await page.route("**/services/grid-*/**", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html>" }));
  await page.goto(`/#chk=${MONCHIQUE}`);
  await waitForParishes(page);
  await expect(page.getByTestId("check-nearby").getByTestId("nearby-error")).toHaveText("Could not load the nearby services. Check your connection and try again.");
  await expect(page.getByTestId("check-nearby").getByTestId("service-tiles")).toHaveCount(0);
});

test("the services overlay is off by default, loads on demand and fades in past country zoom", async ({ page }) => {
  const loads: string[] = [];
  page.on("request", (r) => {
    if (/\/assets\/services-[\w-]+\.json$/.test(r.url())) loads.push(r.url());
  });
  await page.goto("/");
  await waitForParishes(page);
  expect(loads).toEqual([]); // not on the initial load
  const toggle = page.getByTestId("services-toggle");
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId("services-key")).toBeHidden();
  await toggle.check();
  await expect(page.locator("body")).toHaveAttribute("data-services", "on");
  await expect(page.getByTestId("services-key")).toBeVisible();
  await expect(page.getByTestId("services-zoom-hint")).toBeVisible(); // country view: faded out
  await expect(page).toHaveURL(/sv=1/);
  expect(loads).toHaveLength(1);
  await toggle.uncheck();
  await expect(page).not.toHaveURL(/sv=1/);
  await expect(page.locator("body")).toHaveAttribute("data-services", "");
});

test("the services explainer opens from the legend and closes with Escape", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  const help = page.getByTestId("services-help");
  await expect(help).toHaveAccessibleName("What do the nearby services show?");
  await help.click();
  const dialog = page.getByTestId("services-explainer");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("without traffic, traffic lights or turns");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
});

test("phone: 'show on the map' from a full sheet puts the marker in view, clear of the intro card", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`/#f=${MONSANTO}`);
  await waitForParishes(page);
  await page.getByTestId("sheet-handle").click();
  await expect(page.locator("#panel")).toHaveAttribute("data-sheet", "full");
  await page.getByTestId("service-show-emergency").click();
  await expect(page.locator("#panel")).toHaveAttribute("data-sheet", "half");
  const marker = page.getByTestId("service-marker");
  await expect
    .poll(async () => {
      const m = await marker.boundingBox();
      const sheet = (await page.locator("#panel").boundingBox())!;
      const intro = page.getByTestId("intro");
      const covered = (await intro.isVisible()) ? (await intro.boundingBox())!.y + (await intro.boundingBox())!.height : 0;
      return m !== null && m.y > covered && m.y + m.height < sheet.y;
    }, { timeout: 10_000 })
    .toBe(true);
  await context.close();
});

test("phone: the rows fit the bottom sheet", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`/#f=${MONSANTO}`);
  await waitForParishes(page);
  const tiles = page.getByTestId("service-tiles");
  await expect(tiles.locator("li")).toHaveCount(CATS.length);
  const box = (await tiles.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await context.close();
});

// The four SUB positions verified in November 2026 (docs/reports/sub-verification-2026-11.md): the overlay
// draws an emergency dot on the verified building, and none is left at the old point.
const VERIFIED_SUBS: { name: string; at: [number, number]; before?: [number, number] }[] = [
  { name: "SUB Loulé", at: [-8.012607, 37.145526], before: [-8.017458, 37.141949] },
  { name: "SUB do Hospital de Lagos", at: [-8.682069, 37.097885], before: [-8.6702, 37.0996] },
  { name: "SUB Albufeira", at: [-8.254972, 37.098197] },
  { name: "SUB Estremoz", at: [-7.585896, 38.848688] },
];

for (const sub of VERIFIED_SUBS) {
  test(`the overlay draws ${sub.name} at its verified position`, async ({ page }) => {
    await page.goto(`/#map=15/${sub.at[1]}/${sub.at[0]}&sv=1`);
    await waitForParishes(page);
    await expect(page.locator("body")).toHaveAttribute("data-services", "on");
    /** Metres from a point to the nearest rendered emergency dot (Infinity: none drawn). */
    const nearest = (p: [number, number]) =>
      page.evaluate(([lon, lat]) => {
        const map = window.pnctMap;
        const dots = map.queryRenderedFeatures({ layers: ["services-points"] }).filter((f: any) => f.properties.cat === "emergency");
        const m = (a: number[]) => Math.hypot((a[0] - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (a[1] - lat) * 110_574);
        return Math.min(Infinity, ...dots.map((f: any) => m(f.geometry.coordinates)));
      }, p);
    await expect.poll(() => nearest(sub.at), { timeout: 15_000 }).toBeLessThan(15); // the data has 4 decimals (~10 m)
    if (sub.before) {
      await page.evaluate(([lon, lat]) => window.pnctMap.jumpTo({ center: [lon, lat], zoom: 15 }), sub.before);
      await expect.poll(() => nearest(sub.before!), { timeout: 15_000 }).toBeGreaterThan(300);
    }
  });
}
