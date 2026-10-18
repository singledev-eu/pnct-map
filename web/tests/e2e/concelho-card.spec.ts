import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes } from "./helpers";

// The concelho card (src/concelho.ts): population block (INE) and câmara contacts, from
// web/data/concelhos.json, fetched only when a card first renders. Shown directly in the concelho
// panel and in a collapsed "Concelho: <name>" section of the parish panel.

const DATA = JSON.parse(readFileSync(new URL("../../data/concelhos.json", import.meta.url), "utf-8"));
const IDANHA = "0505"; // curated in the first batch; whole-PNCT
const LADOEIRO = "050505"; // a parish of Idanha-a-Nova
const AGUEDA = "0101"; // partly PNCT
// A concelho without curated contacts (one outside PNCT territory, once curation is done).
const NOT_YET = Object.entries(DATA.concelhos).find(([, c]) => !(c as { contacts: unknown }).contacts)![0];

const card = (page: Page) => page.getByTestId("concelho-card");
const details = (page: Page) => page.getByTestId("concelho-details");

/** Requests for the concelho data file, in order. Call before page.goto. */
function trackDataRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (/\/assets\/concelhos-[\w-]+\.json$/.test(req.url())) urls.push(req.url());
  });
  return urls;
}

test("the concelho panel shows the population block and the curated contacts", async ({ page }) => {
  const errors = trackErrors(page);
  const requests = trackDataRequests(page);
  await page.goto("/");
  await waitForParishes(page);
  expect(requests, "not fetched on the initial load").toEqual([]);

  await page.goto(`/#c=${IDANHA}`);
  await expect(card(page)).not.toHaveAttribute("aria-busy", "true");
  expect(requests).toHaveLength(1);
  const c = DATA.concelhos[IDANHA];
  const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(n);
  await expect(page.getByTestId("concelho-people")).toHaveText(`${fmt(c.population)} people (${DATA.estimate_year})`);
  await expect(page.getByTestId("concelho-change")).toHaveText("−14.0% from 2011 to 2021 (Censuses)");
  await expect(page.getByTestId("concelho-density")).toHaveText(`${c.density} people/km²`);
  const ratio = (index: number) => (index / 100).toFixed(1);
  await expect(page.getByTestId("concelho-ageing")).toContainText(`${ratio(c.ageing_index)} older people (65+) per child (Portugal: ${ratio(DATA.national.ageing_index)})`);
  await expect(page.getByTestId("concelho-whole")).toHaveCount(0); // whole-PNCT: no note
  await expect(card(page)).toContainText(`Source: INE, population estimates ${DATA.estimate_year}, Censuses 2011/2021 · CC BY 4.0`);

  const contacts = page.getByTestId("concelho-contacts");
  await expect(contacts).toHaveAttribute("data-state", "curated");
  await expect(contacts.getByRole("link", { name: c.contacts.email })).toHaveAttribute("href", `mailto:${c.contacts.email}`);
  await expect(contacts.getByRole("link", { name: c.contacts.phone })).toHaveAttribute("href", `tel:${c.contacts.phone.replace(/\s/g, "")}`);
  const website = page.getByTestId("concelho-website");
  await expect(website).toHaveAttribute("href", c.contacts.website);
  await expect(website).toHaveText(/^Website: cm-idanhanova\.pt ↗/); // the domain shown; "Website:" for screen readers only
  await expect(website.locator(".visually-hidden").first()).toHaveText("Website: ");
  await expect(page.getByTestId("concelho-pdm")).toHaveAttribute("href", c.contacts.pdm_url);
  await expect(page.getByTestId("concelho-pdm")).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("concelho-snit")).toHaveAttribute("href", "https://snit-mais.dgterritorio.gov.pt/portalsnit/");
  await expect(page.getByTestId("concelho-snit")).toContainText("Official PDM maps: SNIT (DGT)");

  // The ageing-index ⓘ is a keyboard-operable disclosure.
  const help = page.getByTestId("concelho-ageing").locator("summary");
  await expect(help).toHaveAttribute("aria-label", "About this figure (ageing index)");
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("concelho-ageing")).toContainText(
    `Ageing index ${Math.round(c.ageing_index)} (Portugal: ${Math.round(DATA.national.ageing_index)}): people aged 65 and over per 100 children under 15. Source: INE.`,
  );
  expect(errors).toEqual([]);
});

test("the report link pre-fills a GitHub issue with the data label", async ({ page }) => {
  await page.goto(`/#c=${IDANHA}`);
  await waitForParishes(page);
  const href = await page.getByTestId("concelho-report").getAttribute("href");
  const url = new URL(href!);
  expect(`${url.origin}${url.pathname}`).toBe("https://github.com/singledev-eu/pnct-map/issues/new");
  expect(url.searchParams.get("labels")).toBe("data");
  expect(url.searchParams.get("title")).toBe(`Outdated info: Idanha-a-Nova (${IDANHA})`);
  const body = url.searchParams.get("body")!;
  for (const part of [`DICO ${IDANHA}`, DATA.concelhos[IDANHA].contacts.email, `checked ${DATA.concelhos[IDANHA].contacts.as_of}`, "What changed?"]) expect(body).toContain(part);
});

test("a concelho without curated contacts says so, and still links SNIT and the report", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#c=${NOT_YET}`);
  await waitForParishes(page);
  const contacts = page.getByTestId("concelho-contacts");
  await expect(contacts).toHaveAttribute("data-state", "missing");
  await expect(page.getByTestId("concelho-not-yet")).toHaveText("Câmara contacts: not yet available");
  await expect(page.getByTestId("concelho-snit")).toBeVisible();
  const report = new URL((await page.getByTestId("concelho-report").getAttribute("href"))!);
  expect(report.searchParams.get("title")).toContain(`(${NOT_YET})`);
  expect(report.searchParams.get("labels")).toBe("data");
  expect(errors).toEqual([]);
});

test("a partly-PNCT concelho notes that the figures are for the whole concelho", async ({ page }) => {
  await page.goto(`/#c=${AGUEDA}`);
  await waitForParishes(page);
  await expect(page.getByTestId("concelho-whole")).toHaveText("Figures for the whole concelho");
});

test("a missing value shows a dash and a note, never a number", async ({ page }) => {
  await page.route(/\/assets\/concelhos-[\w-]+\.json$/, async (route) => {
    const json = await (await route.fetch()).json();
    Object.assign(json.concelhos[IDANHA], { population: null, density: null, ageing_index: null, census_change: null });
    json.concelhos[IDANHA].contacts.urbanism_url = null;
    json.concelhos[IDANHA].contacts.pdm_url = null;
    await route.fulfill({ json });
  });
  await page.goto(`/#c=${IDANHA}`);
  await waitForParishes(page);
  for (const id of ["concelho-people", "concelho-change", "concelho-density", "concelho-ageing"]) await expect(page.getByTestId(id)).toHaveText("— (not available)");
  await expect(page.getByTestId("concelho-contacts")).toContainText("— No urbanism page found on the câmara's site");
  await expect(page.getByTestId("concelho-no-pdm")).toHaveText("— No PDM page found on the câmara's site");
  await expect(page.getByTestId("concelho-snit")).toBeVisible(); // the fallback for the PDM maps
});

test("the parish panel's concelho section is collapsed and fetches only when opened", async ({ page }) => {
  const errors = trackErrors(page);
  const requests = trackDataRequests(page);
  await page.goto(`/#f=${LADOEIRO}`);
  await waitForParishes(page);
  await expect(details(page)).toBeVisible();
  await expect(details(page).locator(":scope > summary")).toHaveText("Concelho: Idanha-a-Nova");
  await expect(details(page)).not.toHaveAttribute("open");
  await expect(card(page)).toHaveCount(0);
  expect(requests, "not fetched while collapsed").toEqual([]);

  // Keyboard: the summary opens it.
  await details(page).locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(details(page)).toHaveAttribute("open");
  await expect(card(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("concelho-people")).toContainText("people");
  expect(requests).toHaveLength(1);

  // Same component: the contacts are there too. Closing and reopening doesn't fetch or render again.
  await expect(page.getByTestId("concelho-contacts")).toHaveAttribute("data-state", "curated");
  await details(page).locator(":scope > summary").click();
  await details(page).locator(":scope > summary").click();
  await expect(card(page)).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: the card uses the theme tokens`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/#c=${IDANHA}`);
    await waitForParishes(page);
    await expect(page.getByTestId("concelho-contacts")).toBeVisible();
    const [link, accent, note, muted] = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "color: var(--accent); background-color: var(--muted)";
      document.body.append(probe);
      const tokens = getComputedStyle(probe);
      const out = [
        getComputedStyle(document.querySelector('[data-testid="concelho-pdm"]')!).color,
        tokens.color,
        getComputedStyle(document.querySelector('[data-testid="concelho-population"] .disclaimer')!).color,
        tokens.backgroundColor,
      ];
      probe.remove();
      return out;
    });
    expect(link).toBe(accent);
    expect(note).toBe(muted);
  });
}

test.describe("phone portrait (375×667)", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test("the card fits the bottom sheet, with comfortable tap targets", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/#c=${IDANHA}`);
    await waitForParishes(page);
    const contacts = page.getByTestId("concelho-contacts");
    await contacts.scrollIntoViewIfNeeded();
    await expect(contacts).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await page.getByTestId("panel").evaluate((el) => el.querySelector(".panel-body")!.scrollWidth <= el.querySelector(".panel-body")!.clientWidth)).toBe(true);
    for (const link of await contacts.locator(".concelho-links a").all()) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    expect(errors).toEqual([]);
  });

  test("the parish section opens on tap", async ({ page }) => {
    await page.goto(`/#f=${LADOEIRO}`);
    await waitForParishes(page);
    const summary = details(page).locator(":scope > summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.tap();
    await expect(page.getByTestId("concelho-people")).toBeVisible();
  });
});
