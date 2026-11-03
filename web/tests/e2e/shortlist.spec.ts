import { expect, test, waitForParishes, waitForParishView } from "./helpers";

// The shortlist (src/shortlist.ts): star in the panel, a "★ n" list in the toolbar, kept in
// localStorage, shared as #list=…; a shared list never overwrites the receiver's own.
const KEY = "pnct-map:shortlist";
const stored = (page: import("@playwright/test").Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]"), KEY);

test("star a parish and a concelho, list them, select from the list, remove, persist", async ({ page }) => {
  await page.goto("/#f=140911");
  await waitForParishView(page);
  const button = page.getByTestId("shortlist-button");
  await expect(button).toBeHidden(); // nothing starred yet
  const star = page.getByTestId("panel-star");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(star).toHaveAttribute("aria-label", "Add to shortlist");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", "Shortlist: 1 place");

  await page.goto("/#c=0211");
  await page.reload();
  await waitForParishView(page);
  await page.getByTestId("panel-star").click();
  expect(await stored(page)).toEqual(["140911", "0211"]);

  await button.click();
  const items = page.getByTestId("shortlist-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Erra");
  await expect(items.first()).toContainText("Coruche");
  await expect(page.getByTestId("shortlist-link")).toHaveValue(/#list=140911,0211$/);
  await items.first().locator(".shortlist-pick").click();
  await expect(page).toHaveURL(/[#&]f=140911/);
  await expect(page.getByTestId("panel-title")).toHaveText("Erra");

  await items.last().getByRole("button", { name: "Remove Odemira" }).click();
  await expect(items).toHaveCount(1);
  await page.reload();
  await waitForParishes(page);
  await expect(page.getByTestId("shortlist-button")).toHaveAttribute("aria-label", "Shortlist: 1 place");
});

test("a shared link shows the sender's list without touching the receiver's until they add it", async ({ page }) => {
  await page.addInitScript((k) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(k, JSON.stringify(["1823"]));
      sessionStorage.setItem("seeded", "1");
    }
  }, KEY);
  await page.goto("/?lang=pt#list=140911,0211,999999,bad");
  await waitForParishes(page);
  const pop = page.getByTestId("shortlist");
  await expect(pop).toBeVisible();
  await expect(pop.locator("h2")).toHaveText("Favoritos partilhados (2)"); // unknown codes dropped
  await expect(pop).toContainText("Os seus favoritos não foram alterados");
  expect(await stored(page)).toEqual(["1823"]);
  await expect(page.getByTestId("shortlist-item").locator(".shortlist-remove")).toHaveCount(0); // read-only

  await page.getByTestId("shortlist-save").click();
  expect(await stored(page)).toEqual(["1823", "140911", "0211"]);
  await expect(page).not.toHaveURL(/list=/);
  await expect(page.getByTestId("shortlist-status")).toHaveText("Adicionados aos seus favoritos.");
});

test("dismissing a shared list leaves the own list as it was", async ({ page }) => {
  await page.goto("/#list=140911");
  await waitForParishes(page);
  await page.getByTestId("shortlist-close").click();
  await expect(page.getByTestId("shortlist")).toBeHidden();
  await expect(page).not.toHaveURL(/list=/);
  expect(await stored(page)).toEqual([]);
  await expect(page.getByTestId("shortlist-button")).toBeHidden();
});

test.describe("phone (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the list fits the screen and picking an item closes it", async ({ page }) => {
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify(["140911", "0211"])), KEY);
    await page.goto("/");
    await waitForParishes(page);
    await page.getByTestId("shortlist-button").tap();
    const box = (await page.getByTestId("shortlist").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.getByTestId("shortlist-item").first().locator(".shortlist-pick").tap();
    await expect(page.getByTestId("shortlist")).toBeHidden();
    await expect(page.getByTestId("panel-title")).toHaveText("Erra");
  });
});
