import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes } from "./helpers";

// The phone bottom sheet (src/sheet.ts): the drag handle is a real button; dragging it (or the
// header) up snaps the sheet to ~90vh, down to half, and down from half closes it. × still closes.
// The credits collapse behind the header's ©. Touch drags go through CDP touch events, which
// Chromium turns into pointer events like a real finger.

const H = 667;
const panel = (page: Page) => page.getByTestId("panel");
const handle = (page: Page) => page.getByTestId("sheet-handle");
const state = (page: Page) => panel(page).getAttribute("data-sheet");
const height = async (page: Page) => (await panel(page).boundingBox())!.height;

/** A finger drag from the centre of `selector` by `dy` px, in `steps` moves of ~16 ms. */
async function touchDrag(page: Page, selector: string, dy: number, steps = 8): Promise<void> {
  const box = (await page.locator(selector).first().boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + Math.min(box.height / 2, 12)];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let s = 1; s <= steps; s++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * s) / steps }] });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 16)));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Waits until the sheet's height transition has finished (or none runs). */
const settledHeight = (page: Page) =>
  page.evaluate(() => Promise.all(document.getElementById("panel")!.getAnimations().map((a) => a.finished)).then(() => document.getElementById("panel")!.getBoundingClientRect().height));

test.describe("phone portrait (375×667)", () => {
  test.use({ viewport: { width: 375, height: H }, isMobile: true, hasTouch: true });

  test("concelho sheet: drag up to ~90vh, down to half, down again to close", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#c=0505");
    await waitForParishes(page);
    await expect(page.getByTestId("concelho-card")).not.toHaveAttribute("aria-busy", "true");
    await expect(handle(page)).toHaveAttribute("aria-label", "Expand panel");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    expect(await state(page)).toBe("half");
    expect(await height(page)).toBeLessThanOrEqual(H * 0.5 + 1);

    await touchDrag(page, '[data-testid="sheet-handle"]', -250);
    await expect.poll(() => state(page)).toBe("full");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(handle(page)).toHaveAttribute("aria-label", "Collapse panel");
    expect(await settledHeight(page)).toBeGreaterThan(H * 0.85);

    await touchDrag(page, '[data-testid="sheet-handle"]', 150);
    await expect.poll(() => state(page)).toBe("half");
    expect(await settledHeight(page)).toBeLessThanOrEqual(H * 0.5 + 1);

    await touchDrag(page, '[data-testid="sheet-handle"]', 150);
    await expect(panel(page)).toBeHidden();
    await expect.poll(() => new URL(page.url()).hash).not.toMatch(/[#&]c=/); // the selection is cleared, as with ×
    expect(errors).toEqual([]);
  });

  test("parish sheet: the header drags too; a short drag snaps back; × still closes", async ({ page }) => {
    await page.goto("/#f=050505");
    await waitForParishes(page);
    await expect(panel(page)).toBeVisible();

    await touchDrag(page, '[data-testid="panel-title"]', -200);
    await expect.poll(() => state(page)).toBe("full");

    await touchDrag(page, '[data-testid="panel-title"]', 20, 4); // below the threshold, slow: stays
    expect(await state(page)).toBe("full");
    expect(await panel(page).evaluate((el) => el.style.transform + el.style.maxHeight)).toBe(""); // no leftover drag styles

    await panel(page).getByRole("button", { name: "Close panel" }).tap();
    await expect(panel(page)).toBeHidden();
  });

  test("the handle toggles from the keyboard and on a tap", async ({ page }) => {
    await page.goto("/#c=0505");
    await waitForParishes(page);
    await handle(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => state(page)).toBe("full");
    await page.keyboard.press("Space");
    await expect.poll(() => state(page)).toBe("half");
    await handle(page).tap();
    await expect.poll(() => state(page)).toBe("full");
    await expect(handle(page)).toBeFocused(); // the handle is a real <button>
  });

  test("with reduced motion the sheet snaps and closes without a transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#c=0505");
    await waitForParishes(page);
    expect(await panel(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
    await touchDrag(page, '[data-testid="sheet-handle"]', -250);
    expect(await state(page)).toBe("full");
    await touchDrag(page, '[data-testid="sheet-handle"]', 400); // long drag from full: closes
    await expect(panel(page)).toBeHidden();
  });

  test("the credits are behind the header's ©, and the content scrolls clear to the bottom", async ({ page }) => {
    await page.goto("/#c=0505");
    await waitForParishes(page);
    const credit = page.getByTestId("sheet-credit");
    const toggle = page.getByTestId("sheet-credit-toggle");
    await expect(credit).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Map credits");
    await expect(toggle).toHaveText("©"); // not an ⓘ, which the ageing figure uses

    // The panel body reaches the bottom of the sheet; its last line can be scrolled fully into view.
    const body = panel(page).locator(".panel-body");
    const [sheetBottom, bodyBottom] = [(await panel(page).boundingBox())!, (await body.boundingBox())!].map((b) => b.y + b.height);
    expect(bodyBottom).toBeGreaterThanOrEqual(sheetBottom - 1);
    await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
    const last = body.locator("> *").last();
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(sheetBottom + 1);

    await toggle.tap();
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("CAOP 2025");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.tap();
    await expect(credit).toBeHidden();
  });
});

test("desktop: no handle, no credits toggle; the side panel is unchanged", async ({ page }) => {
  await page.goto("/#c=0505");
  await waitForParishes(page);
  await expect(panel(page)).toBeVisible();
  await expect(handle(page)).toBeHidden();
  await expect(page.getByTestId("sheet-credit-toggle")).toBeHidden();
  await expect(page.getByTestId("sheet-credit")).toBeHidden();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible(); // the map attribution carries the credits
});
