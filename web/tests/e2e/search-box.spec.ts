import type { Page } from "@playwright/test";
import { expect, searchAndPick, test, waitForParishes, waitForParishView } from "./helpers";

// The search box shows the current selection's name however it was made (search, a map click, a
// panel link, the URL hash), and is empty without a selection. Before 0.7.0 it kept the last query:
// "Pinhel" stayed in the box with Erra (Coruche) selected.
const box = (page: Page) => page.locator("#search-input");

/** A screen point inside parish `dicofre`, on the uncovered map, where the app hit-tests it (flat map: the ground point). */
async function pointIn(page: Page, dicofre: string) {
  return page.evaluate(async (code) => {
    const m = window.pnctMap;
    const data = await m.getSource("parishes").getData();
    const f = data.features.find((x: { properties: { dicofre: string } }) => x.properties.dicofre === code);
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const pts = polys.flatMap((p: number[][][]) => p[0]).map((c: number[]) => m.project(c));
    const xs = pts.map((p: { x: number }) => p.x);
    const ys = pts.map((p: { y: number }) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let s = 2; s <= 16; s *= 2)
      for (let i = 1; i < s; i++)
        for (let j = 1; j < s; j++) {
          const p = [x0 + ((x1 - x0) * i) / s, y0 + ((y1 - y0) * j) / s];
          // Only the uncovered map: not under the toolbar, the side panel or the legend.
          if (p[0] < 300 || p[0] > innerWidth - 420 || p[1] < 100 || p[1] > innerHeight - 60) continue;
          if (m.queryRenderedFeatures(p, { layers: ["parish-fill"] })[0]?.properties.dicofre === code) return { x: p[0], y: p[1] };
        }
    return null;
  }, dicofre);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pnct-map:3d", "off")); // flat: plain map clicks
});

test("the box follows selections made outside search, and empties when the selection is cleared", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  await searchAndPick(page, "Pinhel", /Concelho/);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Pinhel");
  await expect(box(page)).toHaveValue("Pinhel");
  await waitForParishView(page);

  // A panel link: one of Pinhel's parishes.
  const summary = page.getByTestId("panel").locator("details.all-parishes summary");
  if (await summary.isVisible()) await summary.click();
  const entry = page.getByTestId("pnct-parish-list").locator("button").first();
  const name = (await entry.textContent())!.trim();
  await entry.click();
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText(name);
  await expect(box(page)).toHaveValue(name);
  await waitForParishView(page);

  // A map click on a neighbouring parish.
  const dicofre = new URLSearchParams(new URL(page.url()).hash.slice(1)).get("f")!;
  const others: { dicofre: string; freguesia: string }[] = await page.evaluate((own) => {
    const m = window.pnctMap;
    const seen = m.queryRenderedFeatures({ layers: ["parish-fill"] }).map((f: { properties: { dicofre: string; freguesia: string } }) => f.properties);
    return seen.filter((p: { dicofre: string }) => p.dicofre !== own && p.dicofre.startsWith(own.slice(0, 4)));
  }, dicofre);
  let target: { x: number; y: number } | null = null;
  let other: { dicofre: string; freguesia: string } | undefined;
  for (const candidate of others) {
    target = await pointIn(page, candidate.dicofre);
    if (target) {
      other = candidate;
      break;
    }
  }
  expect(other).toBeDefined();
  const p = target!;
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText(other!.freguesia);
  await expect(box(page)).toHaveValue(other!.freguesia);

  // Closing the panel clears the selection, and the box.
  await page.getByTestId("panel").getByRole("button", { name: /close/i }).click();
  await expect(page).not.toHaveURL(/[#&](c|f)=/);
  await expect(box(page)).toHaveValue("");
});

test("a selection from the URL (load or hash change) shows in the box", async ({ page }) => {
  await page.goto("/#c=0910"); // Pinhel
  await waitForParishes(page);
  const title = await page.getByTestId("panel").getByTestId("panel-title").textContent();
  await expect(box(page)).toHaveValue(title!);
  // Erra (Coruche), as in the report.
  await page.evaluate(() => (location.hash = "#f=140911"));
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Erra");
  await expect(box(page)).toHaveValue("Erra");
});

test("a language switch doesn't overwrite what the viewer is typing", async ({ page }) => {
  await page.goto("/#f=140911");
  await waitForParishes(page);
  await expect(box(page)).toHaveValue("Erra");
  await box(page).fill("Pinh");
  await page.getByTestId("lang-pt").click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^pt/);
  await expect(box(page)).toHaveValue("Pinh");
});
