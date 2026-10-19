import type { BrowserContext, Page } from "@playwright/test";
import { labelField } from "../../src/basemap";
import { STYLE_URLS } from "../../src/theme";
import { expect, test, trackErrors, waitForFullIdle, waitForParishes, waitForParishView } from "./helpers";

// 0.6.0: the PT/EN language toggle (src/i18n.ts, strings.*.ts) and the Auto/Light/Dark theme
// choice (src/theme.ts, the boot script in index.html), both in the legend header (src/controls.ts).

const VILARINHO = "170810"; // PNCT parish (Peso da Régua)
const IDANHA = "0505"; // whole-PNCT concelho with curated contacts
const BODY_BG = { light: "rgb(246, 246, 244)", dark: "rgb(12, 12, 12)" };

const html = (page: Page) => page.locator("html");
const body = (page: Page) => page.locator("body");
const url = (page: Page) => new URL(page.url());

/** Records every basemap style request ("/styles/" URLs) in order. Call before page.goto. */
function trackStyleRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/styles/")) urls.push(req.url());
  });
  return urls;
}

/** Stores a theme choice before any page script runs, as the theme button would have. */
const storeTheme = (context: BrowserContext, theme: "light" | "dark") =>
  context.addInitScript((t) => {
    // Only on the first document of the test, so a later choice made in the page isn't overwritten on reload.
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("pnct-map:theme", t);
      sessionStorage.setItem("seeded", "1");
    }
  }, theme);

/** Records every value <html data-theme> takes, from the very first one (set by the boot script). */
const recordThemes = (context: BrowserContext) =>
  context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __themes: string[] }).__themes = seen;
    new MutationObserver(() => {
      const v = document.documentElement.getAttribute("data-theme");
      if (v && seen[seen.length - 1] !== v) seen.push(v);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
  });
const themesSeen = (page: Page) => page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);

for (const lang of ["pt", "en"] as const) {
  const T = {
    pt: { htmlLang: "pt-PT", legend: "Legenda", title: /^Mapa PNCT/, people: /habitantes \(2025\)/, contacts: "Câmara Municipal", pdm: "PDM em vigor", badge: "Território PNCT", search: "Pesquisa de imóveis", protection: "Proteção da natureza", placeholder: "Pesquisar freguesia ou concelho…", decimal: /\d,\d/ },
    en: { htmlLang: "en-GB", legend: "Legend", title: /^PNCT map/, people: /people \(2025\)/, contacts: "Câmara Municipal", pdm: "PDM in force", badge: "PNCT territory", search: "Property search", protection: "Nature protection", placeholder: "Search parish or concelho…", decimal: /\d\.\d/ },
  }[lang];

  test.describe(`language ${lang.toUpperCase()}`, () => {
    test("renders the page, legend, concelho card and parish panel", async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(`/?lang=${lang}#c=${IDANHA}`);
      await waitForParishes(page);

      await expect(html(page)).toHaveAttribute("lang", T.htmlLang);
      await expect(page).toHaveTitle(T.title);
      await expect(page.locator(".legend-title")).toHaveText(T.legend);
      await expect(page.locator("#search-input")).toHaveAttribute("placeholder", T.placeholder);
      await expect(page.getByTestId(`lang-${lang}`)).toHaveAttribute("aria-pressed", "true");

      const card = page.getByTestId("concelho-card");
      await expect(card).not.toHaveAttribute("aria-busy", "true");
      await expect(page.getByTestId("concelho-people")).toHaveText(T.people);
      await expect(page.getByTestId("concelho-density")).toHaveText(T.decimal);
      await expect(card.locator("h3").nth(1)).toHaveText(T.contacts);
      await expect(page.getByTestId("concelho-pdm")).toContainText(T.pdm);

      await page.goto(`/?lang=${lang}#f=${VILARINHO}`);
      await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires"); // place names never change
      await expect(page.getByTestId("pnct-status")).toHaveText(T.badge);
      await expect(page.getByTestId("property-search").locator("h3")).toHaveText(T.search);
      await expect(page.getByTestId("protection").locator("h3")).toHaveText(T.protection);
      await expect(page.getByTestId("protection-summary")).toBeVisible();
      await expect(page.getByTestId("property-link").first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test("the browser language picks PT, and the toggle switches in place, keeping the selection and hash", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-PT", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto(`/#f=${VILARINHO}&pa=natura`);
  await waitForParishView(page);
  await expect(html(page)).toHaveAttribute("lang", "pt-PT");
  await expect(page.getByTestId("pnct-status")).toHaveText("Território PNCT");
  await expect(page.getByTestId("overlay-note")).toContainText("EEA, fim de 2024");
  await expect(page.getByTestId("protection-areas")).toContainText("(Diretiva Habitats)");
  const camera = await page.evaluate(() => window.pnctMap.getCenter().toArray());

  await page.getByTestId("lang-en").click();
  await expect(html(page)).toHaveAttribute("lang", "en-GB");
  await expect(page.getByTestId("pnct-status")).toHaveText("PNCT territory");
  await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires");
  await expect(page.getByTestId("overlay-note")).toContainText("EEA, end 2024");
  await expect(page.getByTestId("protection-areas")).toContainText("(Habitats Directive)");
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Boundaries: CAOP 2025");
  expect(url(page).searchParams.get("lang")).toBe("en");
  expect(url(page).hash).toContain(`f=${VILARINHO}`);
  expect(url(page).hash).toContain("pa=natura");
  expect(await page.evaluate(() => window.pnctMap.getCenter().toArray())).toEqual(camera);
  expect(await page.evaluate(() => window.pnctMap.getStyle().layers.length)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
  await context.close();
});

/** The city label layer: positron's label_city, Dark Matter's place_city. */
const CITY = { light: "label_city", dark: "place_city" };
const placeLabel = (page: Page, theme: "light" | "dark" = "light") => page.evaluate((id) => window.pnctMap.getLayoutProperty(id, "text-field"), CITY[theme]);

test("basemap labels follow the language, in both themes and across a theme switch", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/?lang=pt");
  await waitForParishes(page);
  expect(await placeLabel(page)).toEqual(labelField("pt"));

  await page.getByTestId("lang-en").click();
  await expect.poll(() => placeLabel(page)).toEqual(labelField("en"));

  await page.getByTestId("lang-pt").click();
  await page.getByTestId("theme-button").click();
  await page.getByTestId("theme-button").click(); // → Dark: a new basemap style, labels still in PT
  await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
  expect(await placeLabel(page, "dark")).toEqual(labelField("pt"));
  // Sevilla is in the tiles as name:pt "Sevilha": the PT label at the country view shows it.
  await page.evaluate(() => window.pnctMap.jumpTo({ center: [-6.2, 37.6], zoom: 7 }));
  await waitForFullIdle(page);
  const names = await page.evaluate(() => window.pnctMap.queryRenderedFeatures({ layers: ["place_city", "place_city_large"] }).map((f: { properties: Record<string, string> }) => f.properties["name:pt"]));
  expect(names).toContain("Sevilha");
  expect(errors).toEqual([]);
});

test("the choice persists across reloads, and ?lang= overrides it", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  await expect(html(page)).toHaveAttribute("lang", "en-GB");
  await page.getByTestId("lang-pt").click();
  await expect(page.locator(".legend-title")).toHaveText("Legenda");
  expect(url(page).searchParams.get("lang")).toBe("pt");

  await page.goto("/"); // no ?lang=: the saved choice
  await waitForParishes(page);
  await expect(html(page)).toHaveAttribute("lang", "pt-PT");
  await expect(page.locator("#about-open")).toHaveText("Sobre");

  await page.goto("/?lang=en#c=0505");
  await waitForParishes(page);
  await expect(html(page)).toHaveAttribute("lang", "en-GB");
  await expect(page.locator("#about-open")).toHaveText("About");
  // The override is for that link only; the saved choice stays.
  expect(await page.evaluate(() => localStorage.getItem("pnct-map:lang"))).toBe("pt");
});

test("About lists every credit in PT", async ({ page }) => {
  await page.goto("/?lang=pt");
  await waitForParishes(page);
  await page.locator("#about-open").click();
  const about = page.locator("#about");
  await expect(about.locator("h2")).toHaveText("Sobre este mapa");
  for (const name of ["lista oficial", "CAOP 2025", "CC BY 4.0", "OpenFreeMap", "OpenMapTiles", "OpenStreetMap"]) await expect(about.getByRole("link", { name, exact: true }).first()).toBeVisible();
  await expect(about).toContainText("contribuidores do OpenStreetMap");
  await expect(page.getByTestId("about-protected")).toContainText("condições de reutilização não confirmadas");
  await expect(page.getByTestId("about-protected").getByRole("link")).toHaveCount(3); // RNAP, Natura, Natura's licence
});

test.describe("theme", () => {
  test("forced dark on a light system: dark from the first frame, dark basemap only", async ({ page, context }) => {
    const errors = trackErrors(page);
    await storeTheme(context, "dark");
    await recordThemes(context);
    const styles = trackStyleRequests(page);
    await page.goto("/");
    await waitForParishes(page);

    expect(await themesSeen(page)).toEqual(["dark"]); // never light, not even before the CSS
    expect(styles[0]).toBe(STYLE_URLS.dark);
    expect(styles).not.toContain(STYLE_URLS.light);
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    await expect(body(page)).toHaveCSS("background-color", BODY_BG.dark);
    await expect(page.getByTestId("theme-button")).toHaveAttribute("aria-label", "Theme: Dark");
    expect(errors).toEqual([]);
  });

  test.describe("on a dark system", () => {
    test.use({ colorScheme: "dark" });

    test("forced light: light from the first frame, light basemap only", async ({ page, context }) => {
      await storeTheme(context, "light");
      await recordThemes(context);
      const styles = trackStyleRequests(page);
      await page.goto("/?lang=pt");
      await waitForParishes(page);

      expect(await themesSeen(page)).toEqual(["light"]);
      expect(styles[0]).toBe(STYLE_URLS.light);
      expect(styles).not.toContain(STYLE_URLS.dark);
      await expect(body(page)).toHaveAttribute("data-map-theme", "light");
      await expect(body(page)).toHaveCSS("background-color", BODY_BG.light);
      await expect(page.getByTestId("theme-button")).toHaveAttribute("aria-label", "Tema: claro");
    });
  });

  test("Auto follows a system change live; Light and Dark ignore it", async ({ page }) => {
    await page.goto("/");
    await waitForParishes(page);
    const button = page.getByTestId("theme-button");
    await expect(button).toHaveAttribute("aria-label", "Theme: Auto (system)");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await button.click(); // → Light, overriding the dark system
    await expect(button).toHaveAttribute("aria-label", "Theme: Light");
    await expect(body(page)).toHaveAttribute("data-map-theme", "light");
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(body(page)).toHaveAttribute("data-map-theme", "light");

    await button.click(); // → Dark
    await expect(button).toHaveAttribute("aria-label", "Theme: Dark");
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await button.click(); // → Auto: back to the (now light) system
    await expect(button).toHaveAttribute("aria-label", "Theme: Auto (system)");
    await expect(body(page)).toHaveAttribute("data-map-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("pnct-map:theme"))).toBeNull();
  });

  test("the choice persists across reloads and keeps the selection", async ({ page }) => {
    await page.goto(`/#f=${VILARINHO}`);
    await waitForParishView(page);
    await page.getByTestId("theme-button").click();
    await page.getByTestId("theme-button").click();
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    expect(await page.evaluate((id) => window.pnctMap.getFeatureState({ source: "parishes", id }), Number(VILARINHO))).toEqual({ selected: true });

    await page.reload();
    await waitForParishes(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    await expect(page.getByTestId("theme-button")).toHaveAttribute("aria-label", "Theme: Dark");
  });

  test("without storage, the page loads in Auto and the controls still work", async ({ page, context }) => {
    const errors = trackErrors(page);
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });
    await page.goto("/");
    await waitForParishes(page);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(html(page)).toHaveAttribute("data-theme-pref", "auto");
    await page.getByTestId("theme-button").click();
    await page.getByTestId("theme-button").click();
    await expect(body(page)).toHaveAttribute("data-map-theme", "dark");
    await page.getByTestId("lang-pt").click();
    await expect(page.locator(".legend-title")).toHaveText("Legenda");
    expect(errors).toEqual([]);
  });
});

test("the controls work from the keyboard, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  const button = page.getByTestId("theme-button");
  await page.getByTestId("lang-en").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("lang-pt")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(html(page)).toHaveAttribute("lang", "pt-PT");
  await expect(page.getByTestId("lang-pt")).toBeFocused(); // re-rendered in place, focus kept
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Space");
  await expect(button).toHaveAttribute("aria-label", "Tema: claro");
});

test.describe("phone 375 px in PT", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: "pt-PT" });

  /** Elements under `root` whose content overflows them, or that stick out of the viewport. */
  const overflowing = (page: Page, root: string) =>
    page.evaluate((sel) => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(`${sel}, ${sel} *`)) {
        if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue; // hidden
        if (el.closest(".visually-hidden")) continue; // clipped on purpose (screen-reader text)
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const clipped = el.scrollWidth > el.clientWidth + 1 && style.overflowX !== "visible" && el.clientWidth > 0;
        if (clipped || r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push(`${el.tagName}.${el.className}: ${el.textContent?.slice(0, 40)}`);
      }
      return out;
    }, root);

  test("legend chip, expanded legend, sheet header and card fit without clipping", async ({ page }) => {
    await page.goto("/#pa=rnap,natura");
    await waitForParishes(page);
    await expect(page.locator(".legend")).toHaveClass(/legend-collapsed/);
    // The controls are in the chip itself: no panel to open.
    await expect(page.getByTestId("lang-pt")).toBeVisible();
    await expect(page.getByTestId("theme-button")).toBeVisible();
    expect(await overflowing(page, ".legend")).toEqual([]);
    expect(await overflowing(page, ".toolbar")).toEqual([]);

    await page.locator("#legend-toggle").click();
    await expect(page.getByTestId("overlay-note")).toBeVisible();
    expect(await overflowing(page, ".legend")).toEqual([]);
    await waitForFullIdle(page);
    await page.screenshot({ path: "test-results/phone-pt-legend.png" });

    await page.goto(`/#c=${IDANHA}`);
    await expect(page.getByTestId("concelho-card")).not.toHaveAttribute("aria-busy", "true");
    await page.getByTestId("sheet-handle").click();
    await expect(page.getByTestId("panel")).toHaveAttribute("data-sheet", "full");
    expect(await overflowing(page, ".panel-header")).toEqual([]);
    expect(await overflowing(page, '[data-testid="concelho-card"]')).toEqual([]);
    await page.screenshot({ path: "test-results/phone-pt-card.png" });
  });
});
