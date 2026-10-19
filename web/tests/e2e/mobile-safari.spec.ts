import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes } from "./helpers";

// iPhone Safari layout (0.6.0 phone check). Two things Chromium can't reproduce directly:
//  - Safari zooms into a focused text field with a font under 16 px, and stays zoomed. The test
//    checks the cause instead: every text-taking control is at least 16 px on a phone.
//  - Safari's floating bottom toolbar. The safe-area insets that come with viewport-fit=cover are
//    emulated through CDP (Emulation.setSafeAreaInsetsOverride, iPhone-like: 59 px top for the
//    Dynamic Island, 34 px bottom for the home indicator), and the bottom-pinned UI must clear them.

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

/** Visible inputs, selects and textareas that take text, with their computed font-size. */
const textControls = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input, select, textarea")]
      .filter((el) => !(el instanceof HTMLInputElement && ["checkbox", "radio", "hidden"].includes(el.type)))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ id: el.id || el.getAttribute("name") || el.tagName, size: parseFloat(getComputedStyle(el).fontSize) })),
  );

const rect = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
const viewportHeight = (page: Page) => page.evaluate(() => window.innerHeight);

test.describe("phone 375 px with iPhone safe-area insets", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
  });

  test("every text input and select is at least 16 px, so Safari doesn't zoom on focus", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/?lang=pt#c=0505");
    await waitForParishes(page);
    const controls = await textControls(page);
    expect(controls.map((c) => c.id)).toEqual(expect.arrayContaining(["search-input", "district-select"]));
    for (const c of controls) expect(c.size, c.id).toBeGreaterThanOrEqual(16);

    // Focusing and leaving the search field leaves the layout as it was.
    const before = await rect(page, ".toolbar");
    await page.locator("#search-input").tap();
    await page.keyboard.type("Idanha");
    await page.locator("#search-input").evaluate((el) => el.blur());
    expect(await rect(page, ".toolbar")).toEqual(before);
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
    expect(errors).toEqual([]);
  });

  test("the toolbar, legend chip and map controls clear the safe-area insets", async ({ page }) => {
    await page.goto("/?lang=pt");
    await waitForParishes(page);
    const h = await viewportHeight(page);

    expect((await rect(page, ".toolbar")).top).toBeGreaterThanOrEqual(INSETS.top);
    const legend = await rect(page, ".legend");
    expect(legend.bottom, "legend chip above the bottom inset").toBeLessThanOrEqual(h - INSETS.bottom);
    await expect(page.getByTestId("lang-pt")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("theme-button")).toBeInViewport({ ratio: 1 });
    expect((await rect(page, ".maplibregl-ctrl-bottom-right")).bottom).toBeLessThanOrEqual(h - INSETS.bottom);

    // The expanded legend still fits between the insets.
    await page.locator("#legend-toggle").click();
    const open = await rect(page, ".legend");
    expect(open.top).toBeGreaterThanOrEqual(INSETS.top);
    expect(open.bottom).toBeLessThanOrEqual(h - INSETS.bottom);
  });

  test("the bottom sheet pads its content above the home indicator and keeps its snap heights", async ({ page }) => {
    await page.goto("/?lang=pt#c=0505");
    await waitForParishes(page);
    await expect(page.getByTestId("concelho-card")).not.toHaveAttribute("aria-busy", "true");
    const panel = page.getByTestId("panel");
    const h = await viewportHeight(page);
    expect(await panel.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe(`${INSETS.bottom}px`);

    const half = await rect(page, "#panel");
    expect(half.bottom).toBeCloseTo(h, 0);
    expect(half.height).toBeLessThanOrEqual(h * 0.5 + 1);
    expect(half.height).toBeGreaterThan(h * 0.4); // the card fills the half sheet

    await page.getByTestId("sheet-handle").click();
    await expect(panel).toHaveAttribute("data-sheet", "full");
    await expect.poll(async () => (await rect(page, "#panel")).height).toBeGreaterThan(h * 0.85);
    expect((await rect(page, "#panel")).height).toBeLessThanOrEqual(h * 0.9 + 1);
    await page.getByTestId("sheet-handle").click();
    await expect(panel).toHaveAttribute("data-sheet", "half");
    await expect.poll(async () => (await rect(page, "#panel")).height).toBeLessThanOrEqual(h * 0.5 + 1);
  });
});
