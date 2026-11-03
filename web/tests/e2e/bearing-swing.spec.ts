import type { Page } from "@playwright/test";
import { expect, searchAndPick, test, waitForParishes } from "./helpers";

// Bearing swing (src/drill.ts, off by default; ?swing=1 for review): after a 3D selection lands,
// one slow turn out and back, then the map is idle again; any user move cancels it.

/** Records the bearing at every moveend and the largest turn away from the first one. */
const record = (page: Page) =>
  page.evaluate(() => {
    const m = window.pnctMap;
    const r = ((window as unknown as { __swing: { ends: number[]; maxTurn: number } }).__swing = { ends: [], maxTurn: 0 });
    m.on("moveend", () => r.ends.push(m.getBearing()));
    m.on("move", () => {
      if (r.ends.length) r.maxTurn = Math.max(r.maxTurn, Math.abs(m.getBearing() - r.ends[0]));
    });
  });
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __swing: { ends: number[]; maxTurn: number } }).__swing);
/** Resolves on the map's next idle: no camera animation, tiles and transitions done. */
const nextIdle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((r) => {
        const m = window.pnctMap;
        m.once("idle", () => r(!m.isMoving()));
        m.triggerRepaint(); // an already idle map renders once more and fires idle again
      }),
  );

test("off by default: the camera rests once the fit ends", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  await record(page);
  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  await expect.poll(async () => (await recorded(page)).ends.length, { timeout: 10_000 }).toBe(1);
  expect(await nextIdle(page)).toBe(true);
  expect((await recorded(page)).ends).toHaveLength(1); // no swing followed the fit
});

test("?swing=1: one swing out and back to the landed bearing, then idle", async ({ page }) => {
  await page.goto("/?swing=1");
  await waitForParishes(page);
  await record(page);
  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  // The fit's moveend, then the swing's (9 s later).
  await expect.poll(async () => (await recorded(page)).ends.length, { timeout: 20_000 }).toBe(2);
  const { ends, maxTurn } = await recorded(page);
  expect(Math.abs(ends[0])).toBeGreaterThanOrEqual(8); // the fit's own turn (view3dFor)
  expect(maxTurn).toBeGreaterThan(3);
  expect(maxTurn).toBeLessThanOrEqual(6.5);
  expect(ends[1]).toBeCloseTo(ends[0], 1);
  expect(await nextIdle(page)).toBe(true);
  expect((await recorded(page)).ends).toHaveLength(2); // and nothing after it
});

test("?swing=1: a user drag cancels the swing", async ({ page }) => {
  await page.goto("/?swing=1");
  await waitForParishes(page);
  await record(page);
  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  await expect.poll(async () => (await recorded(page)).ends.length, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await recorded(page)).maxTurn, { timeout: 5_000 }).toBeGreaterThan(0.2); // the swing is under way
  const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 420, { steps: 5 });
  await page.mouse.up();
  expect(await nextIdle(page)).toBe(true);
  const after = await recorded(page);
  expect(Math.abs(after.ends.at(-1)! - after.ends[0])).toBeGreaterThan(0.1); // stopped mid-swing, not resumed
});

test("?swing=1 under reduced motion: no tilt, no swing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?swing=1");
  await waitForParishes(page);
  await searchAndPick(page, "Vila Real", /Concelho · Vila Real/);
  expect(await nextIdle(page)).toBe(true);
  expect(await page.evaluate(() => window.pnctMap.getBearing())).toBe(0);
});
