import type { Locator } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes } from "./helpers";

// The MapLibre attribution must never cover the legend on phones: compact (ⓘ) and collapsed by
// default at ≤ 640 px, the full text one tap away, and the expanded text kept beside the legend.

const ATTRIBUTION_TEXT = "Boundaries: CAOP 2025 © DGT (CC BY 4.0) | OpenFreeMap © OpenMapTiles Data from OpenStreetMap";
const ATTRIBUTION_LINKS = ["https://openfreemap.org/", "https://www.openmaptiles.org/", "https://www.openstreetmap.org/copyright"];
// The bottom sheet covers the map attribution while it is open, so it carries the same credits.
const SHEET_CREDIT_TEXT = "Boundaries CAOP 2025 © DGT, CC BY 4.0 · OpenFreeMap · © OpenMapTiles · © OpenStreetMap";
const SHEET_CREDIT_LINKS: [string, string][] = [
  ["CAOP 2025", "https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop"],
  ["OpenFreeMap", "https://openfreemap.org/"],
  ["OpenMapTiles", "https://www.openmaptiles.org/"],
  ["OpenStreetMap", "https://www.openstreetmap.org/copyright"],
];

async function expectApart(a: Locator, b: Locator): Promise<void> {
  const [ra, rb] = [await a.boundingBox(), await b.boundingBox()];
  expect(ra, "first element visible").not.toBeNull();
  expect(rb, "second element visible").not.toBeNull();
  const overlap =
    ra!.x < rb!.x + rb!.width && rb!.x < ra!.x + ra!.width && ra!.y < rb!.y + rb!.height && rb!.y < ra!.y + ra!.height;
  expect(overlap, `boxes overlap: ${JSON.stringify(ra)} vs ${JSON.stringify(rb)}`).toBe(false);
}

async function expectAttributionContent(attribution: Locator): Promise<void> {
  const inner = attribution.locator(".maplibregl-ctrl-attrib-inner");
  await expect(inner).toBeVisible();
  // The OpenFreeMap/OpenMapTiles/OSM part comes from the basemap's TileJSON, so allow it the same
  // time as the other map waits; basemap tiles and glyphs are not needed.
  await expect(inner).toHaveText(ATTRIBUTION_TEXT, { timeout: 30_000 });
  const hrefs = await inner.locator("a").evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  expect(hrefs).toEqual(ATTRIBUTION_LINKS);
}

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("attribution is compact and collapsed, expands on tap, and never covers the legend", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishes(page);

    const attribution = page.locator(".maplibregl-ctrl-attrib");
    const legend = page.locator(".legend");
    const button = page.locator(".maplibregl-ctrl-attrib-button");

    // Collapsed by default: just the ⓘ button.
    await expect(attribution).toHaveClass(/maplibregl-compact/);
    await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
    await expect(attribution.locator(".maplibregl-ctrl-attrib-inner")).toBeHidden();
    await expect(button).toBeVisible();
    await expectApart(attribution, legend);

    // One tap shows the full text with its links, beside the legend.
    await button.tap();
    await expect(attribution).toHaveClass(/maplibregl-compact-show/);
    await expectAttributionContent(attribution);
    await expectApart(attribution, legend);
    await expectApart(attribution, page.locator(".maplibregl-ctrl-group")); // zoom buttons

    // A second tap collapses it again.
    await button.tap();
    await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
    await expect(attribution.locator(".maplibregl-ctrl-attrib-inner")).toBeHidden();

    // With a parish open, the bottom sheet hides the map controls; its credit line has all four credits.
    await page.goto("/#f=170810");
    await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires");
    await expect(attribution).toBeHidden();
    const credit = page.getByTestId("sheet-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toHaveText(SHEET_CREDIT_TEXT);
    const links = await credit
      .locator("a")
      .evaluateAll((as) => as.map((a) => [a.textContent, (a as HTMLAnchorElement).href, (a as HTMLAnchorElement).target, (a as HTMLAnchorElement).rel]));
    expect(links).toEqual(SHEET_CREDIT_LINKS.map(([text, href]) => [text, href, "_blank", "noopener noreferrer"]));

    expect(errors).toEqual([]);
  });
});

test.describe("phone landscape (844×390)", () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("the full attribution line stays clear of the legend, also with the panel open", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#f=170810");
    await waitForParishes(page);
    await expect(page.getByTestId("panel")).toBeVisible();

    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await expect(attribution).not.toHaveClass(/maplibregl-compact/);
    await expectAttributionContent(attribution);
    await expectApart(attribution, page.locator(".legend"));
    await expectApart(attribution, page.getByTestId("panel"));
    await expectApart(page.locator(".toolbar"), page.getByTestId("panel"));

    expect(errors).toEqual([]);
  });
});
