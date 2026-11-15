import { expect, test, trackErrors, waitForParishView, waitForParishes } from "./helpers";

// Disputed parishes (src/status.ts, data/pnct_status.csv): the legal text (Portaria 208/2017) and the
// IEFP list disagree. São Bento (Porto de Mós, 101610) is in the Portaria but not on the IEFP list.
const SAO_BENTO = { code: "101610", lon: -8.77887, lat: 39.50851 };

test("a disputed parish has its own style, tooltip and panel note", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/?lang=en");
  await waitForParishes(page);
  await expect(page.getByTestId("legend-disputed")).toContainText("Sources disagree");
  await expect(page.getByTestId("legend-source")).toContainText(/Portaria 208\/2017 \(as amended\) · checked \d+ \w+ \d{4}/);

  await page.evaluate(({ lon, lat }) => window.pnctMap.jumpTo({ center: [lon, lat], zoom: 12 }), SAO_BENTO);
  await waitForParishView(page);

  // Drawn with the disputed hatch and dashed outline, and never as PNCT.
  const styled = await page.evaluate((code) => {
    const map = window.pnctMap;
    const has = (layer: string) => map.queryRenderedFeatures({ layers: [layer] }).some((f: any) => f.properties.dicofre === code);
    const fill = map.queryRenderedFeatures({ layers: ["parish-fill"] }).find((f: any) => f.properties.dicofre === code);
    return { hatch: has("parish-disputed-fill"), outline: has("parish-disputed-line"), pnct: fill?.properties.pnct, disputed: fill?.properties.disputed };
  }, SAO_BENTO.code);
  expect(styled).toEqual({ hatch: true, outline: true, pnct: false, disputed: true });

  // Hovering it: the tooltip says the sources disagree and which says what.
  const point = await page.evaluate((code) => {
    const map = window.pnctMap;
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    for (let y = 30; y < rect.height - 30; y += 15)
      for (let x = 30; x < rect.width - 30; x += 15) {
        const f = map.queryRenderedFeatures([x, y], { layers: ["parish-fill"] })[0];
        if (f?.properties.dicofre === code && document.elementFromPoint(rect.left + x, rect.top + y) === canvas) return { x: rect.left + x, y: rect.top + y };
      }
    return null;
  }, SAO_BENTO.code);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  const tooltip = page.getByTestId("tooltip-disputed");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("Sources disagree: Portaria 208/2017 says PNCT, the IEFP list says not PNCT. Check with Finanças/IEFP before relying on it.");
  await expect(page.getByTestId("tooltip-status")).toHaveText("PNCT: sources disagree");

  // The panel: a disputed badge and the note with links to the sources.
  await page.goto(`/?lang=en#f=${SAO_BENTO.code}`);
  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("pnct-status")).toHaveAttribute("data-status", "disputed");
  const note = panel.getByTestId("disputed-note");
  await expect(note).toContainText("Portaria 208/2017 says PNCT, the IEFP list says not PNCT");
  await expect(note.locator("a")).toHaveCount(3);
  await expect(note.locator("a").first()).toHaveAttribute("href", /diariodarepublica\.pt/);
  expect(errors).toEqual([]);
});

test("Castelo de Paiva counts only Real as PNCT and names the disputed parishes (PT)", async ({ page }) => {
  await page.goto("/?lang=pt#c=0106");
  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("pnct-count")).toHaveAttribute("data-pnct", "1");
  await expect(panel.getByTestId("concelho-disputed")).toHaveText("Fontes divergentes em: Paraíso, Pedorido, Raiva.");
});

test("an insight landing path loads the map and keeps its path", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/i/area_vs_population?utm_source=facebook&utm_medium=social&utm_campaign=insights");
  await waitForParishes(page);
  await expect(page.locator("#map canvas")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/i/area_vs_population");
  // An unknown id is the normal map too.
  await page.goto("/i/no_such_insight");
  await waitForParishes(page);
  expect(new URL(page.url()).pathname).toBe("/i/no_such_insight");
  expect(errors).toEqual([]);
});
