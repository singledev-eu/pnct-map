import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// Collapsible legend (src/legend.ts): a chip on phones (≤ 640 px) that keeps the Algarve clear at the
// country view, expanded without a toggle on wider screens; the viewer's choice is kept in localStorage.

const toggle = (page: Page) => page.locator("#legend-toggle");
const body = (page: Page) => page.locator("#legend-body");

/** Screen box of the Algarve (Sagres to the Guadiana mouth) in page coordinates. */
function algarveBox(page: Page) {
  return page.evaluate(() => {
    const map = window.pnctMap;
    const r = map.getCanvas().getBoundingClientRect();
    const sw = map.project([-9.0, 36.95]);
    const ne = map.project([-7.4, 37.5]);
    return { x: r.left + sw.x, y: r.top + ne.y, width: ne.x - sw.x, height: sw.y - ne.y };
  });
}

async function expectApart(page: Page, a: string, b: string): Promise<void> {
  const [ra, rb] = [(await page.locator(a).boundingBox())!, (await page.locator(b).boundingBox())!];
  const overlap = ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height;
  expect(overlap, `${a} ${JSON.stringify(ra)} overlaps ${b} ${JSON.stringify(rb)}`).toBe(false);
}

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("starts collapsed clear of the Algarve, expands on tap, and remembers the choice", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishView(page);
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(body(page)).toBeHidden();

    const chip = (await page.locator(".legend").boundingBox())!;
    const algarve = await algarveBox(page);
    expect(chip.y, "chip below the Algarve coast").toBeGreaterThanOrEqual(algarve.y + algarve.height);
    expect(chip.height).toBeGreaterThanOrEqual(44); // tap target

    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".legend-concelho").first()).toBeVisible(); // country zoom: concelho rows
    await expect(page.locator(".legend-parish").first()).toBeHidden();
    // Expanded, it still stays clear of the map controls and the expanded attribution.
    await page.locator(".maplibregl-ctrl-attrib-button").tap();
    await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveClass(/maplibregl-compact-show/);
    for (const other of [".maplibregl-ctrl-attrib", ".maplibregl-ctrl-group"]) await expectApart(page, ".legend", other);

    await page.reload();
    await waitForParishes(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(body(page)).toBeVisible();

    await toggle(page).tap();
    await page.reload();
    await waitForParishes(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });

  test("works from the keyboard and follows the zoom level", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=11/41.27/-8.07"); // parish level
    await waitForParishes(page);
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".legend-parish").first()).toBeVisible();
    await expect(page.locator(".legend-concelho").first()).toBeHidden();
    await page.keyboard.press("Space");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(body(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("works without storage", async ({ page }) => {
    await page.addInitScript(() => {
      const fail = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      Object.defineProperty(window, "localStorage", { get: fail });
    });
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishes(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(body(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("desktop: expanded, without a toggle, even after a phone-sized choice", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => window.localStorage.setItem("pnct-map:legend", "closed"));
  await page.goto("/");
  await waitForParishes(page);
  await expect(toggle(page)).toBeHidden();
  await expect(body(page)).toBeVisible();
  await expect(page.locator(".legend-concelho").first()).toBeVisible();

  // Narrowing the window applies the stored choice; widening it expands again.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(body(page)).toBeVisible();
  expect(errors).toEqual([]);
});
