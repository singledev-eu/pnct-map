/**
 * Every user-visible UI string, per language: strings.en.ts and strings.pt.ts each export one
 * `Strings` object, so a key missing from either is a compile error. Place names (parishes,
 * concelhos, districts) come from the data and are never translated. Data-derived labels (the
 * protected-area sources) carry both languages in their data meta (protected.ts).
 *
 * `t`, `tc`, `tk`, `sheet` and `ui` are live bindings: setLang swaps them, and the importing modules
 * read them at render time, so main.ts re-renders after a switch (applyLanguage).
 * Index.html has no text of its own: its elements name a `ui` key in data-i18n (i18n.ts applyStatic).
 */
import type { LandFilter, Operation, PropertyType } from "./idealista";
import type { ThemePref } from "./theme";
import type { LegalStatus } from "./status";
import { en } from "./strings.en";
import { pt } from "./strings.pt";

export type Lang = "pt" | "en";
export const LANGS: readonly Lang[] = ["pt", "en"];

export interface ProtectedStrings {
  legendHeading: string;
  /** Legend toggle label per category id (protected.meta.json); unknown ids fall back to the source title. */
  toggle: Record<string, string>;
  /** Short category name inside the panel summary. */
  short: Record<string, string>;
  legendSources: string;
  disclaimer: string;
  panelHeading: string;
  /** "Under protection: 12.3% (RNAP 4.1%, Natura 10%)". */
  summary: (any: string, parts: string[]) => string;
  areasLabel: string;
  /** Designation of a Natura 2000 name listed as both a ZPE and a ZEC/SIC (merged into one line). */
  naturaBoth: string;
  /** Legend hint while the overlays are faded out (below camera.ts protectedFade). */
  zoomHint: string;
  /** The "?" explainer next to the legend heading. Lead and body may contain *emphasis*. */
  explainer: {
    button: string;
    title: string;
    items: { lead: string; body: string }[];
    footnote: string;
    close: string;
  };
  /** Toggle row while the overlay file loads (first switch-on). */
  toggleLoading: string;
  loading: string;
  loadError: string;
  overlayError: string;
  /** Map attribution and the phone sheet credit: lead-in before the linked providers. */
  creditLead: string;
  aboutHeading: string;
  aboutBody: string;
  licenceUnconfirmed: string;
}

/** The concelho card (concelho.ts). Numbers and dates are formatted with `ui.locale`. */
export interface ConcelhoStrings {
  /** Summary of the collapsed section in the parish panel. */
  parishSummary: (name: string) => string;
  loading: string;
  loadError: string;
  populationHeading: string;
  /**
   * Stat tile labels (concelho.ts tile): what the large number counts. The number, its year and the
   * difference from Portugal are separate lines of the tile.
   */
  peopleLabel: string;
  /** The Census-to-Census change ("−14.0%"), with censusPeriod as its year line. */
  censusChangeLabel: string;
  censusPeriod: string;
  densityLabel: string;
  /** The ageing index as a ratio (index / 100): "4.2" older people (65+) per child. */
  ageingLabel: string;
  /** A tile's difference from the national figure: "−80% vs. Portugal (€2,076/m²)". Starts with the percentage. */
  vsPortugal: (pct: string, national: string) => string;
  /** The ⓘ text: the index itself, its definition and the source. */
  ageingHelp: (index: string, national: string) => string;
  ageingHelpLabel: string;
  /** Under the population block of a partly-PNCT concelho. */
  wholeConcelho: string;
  /** A missing value: "—" and why. */
  missing: string;
  missingNote: string;
  populationSource: (year: number) => string;
  /** Housing and income (concelho.ts moneyBlock): tile labels for the values in euros. */
  moneyHeading: string;
  salePriceLabel: string;
  incomeLabel: string;
  earningsLabel: string;
  moneySource: (sales: string, income: string, earnings: string) => string;
  contactsHeading: string;
  website: string;
  urbanism: string;
  noUrbanism: string;
  pdm: string;
  /** The PDM link when the version in force isn't stated (pdm_status "unclear"), with pdmUnclear under it. */
  pdmDocuments: string;
  pdmUnclear: string;
  noPdm: string;
  contactsSource: (checked: string) => string;
  notYet: string;
  /** Link label; the issue it opens is in English in both languages (ISSUE, below: it's for the maintainers). */
  report: string;
  snit: string;
  newTab: string;
}

/**
 * The land check (landcheck.ts, panel.ts showCheck). Hazard class names come from
 * landcheck.meta.json (ICNF's own names in PT), not from here.
 */
export interface CheckStrings {
  /** The toast shown when "Check a spot" turns on (mouse; touch). */
  toast: string;
  toastTouch: string;
  /** The toast the first time the map gets keyboard focus in the mode. */
  toastKeyboard: string;
  /** The phone sheet's one-row peek (panel.ts showCheck): the hazard badge (the ICNF class name), and the hidden hint that a tap expands it. */
  peekHazard: (label: string) => string;
  peekExpand: string;
  /** Accessible name of the marker on the checked point. */
  marker: string;
  kicker: string;
  /** "39.92681° N, 8.15187° W": numbers already formatted. */
  coords: (lat: string, lon: string) => string;
  checking: string;
  outsideTitle: string;
  outsideBody: string;
  pnctHeading: string;
  pnctYes: string;
  pnctNo: string;
  pnctDisputed: string;
  factParish: string;
  openParish: string;
  hazardHeading: string;
  /** "High (4 of 5)". */
  hazardClass: (label: string, value: number) => string;
  hazardNone: string;
  hazardNoneNote: string;
  hazardError: string;
  hazardNote: string;
  /** The blocked facts (landcheck.meta.json `blocked`), by id, and the line that lists them. */
  blocked: Record<string, string>;
  notCovered: (facts: string) => string;
  sourcesHeading: string;
  /** Title (in the UI language), dataset date and download date, formatted. */
  sourceHazard: (title: string, dataset: string, fetched: string) => string;
  sourceParish: string;
  disclaimer: string;
  copyLink: string;
  copied: string;
  copyManually: string;
  linkLabel: string;
  /** The legend toggle for the hazard overlay, its colour key, and its error. */
  legendHeading: string;
  overlayError: string;
  /** Map attribution and credits: the lead before the ICNF link. */
  creditLead: string;
}

/** The phone bottom sheet (sheet.ts, panel.ts). */
export interface SheetStrings {
  expand: string;
  collapse: string;
  /** The © button in the sheet header: what it does (accessible name and tooltip); aria-expanded carries the state. */
  credits: string;
}

/**
 * Everything else: the static page (index.html, by data-i18n key), the toolbar, legend, tooltip,
 * search, panel, property links, credits, About, the language/theme controls and error states.
 * Strings with {name} placeholders are filled with links by i18n.ts fill().
 */
export interface UiStrings {
  /** BCP 47 tag for Intl and <html lang>. */
  locale: string;
  /** Document title and meta description. */
  title: string;
  description: string;
  /** The title chip on the map: the site's name, the same in both languages. */
  siteName: string;
  /** The first-visit intro (intro.ts): its text is about.intro; this names its dismiss button. */
  introDismiss: string;
  // index.html (data-i18n keys)
  mapLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  districtLabel: string;
  allDistricts: string;
  onlyPnct: string;
  onlyPnctTitle: string;
  onlyPnctLabel: string;
  legend: string;
  legendWhole: string;
  legendPartial: string;
  legendNotPnct: string;
  legendPnctParish: string;
  legendOtherParish: string;
  /** Legend row for the disputed parishes (status.ts). */
  legendDisputed: string;
  /** Under the legend: the legal source of the PNCT definition and the date it was checked (already formatted). */
  legalSource: (date: string) => string;
  legendBoundary: string;
  /** Legend toggle for the concelho seats and district capitals (cities.ts). */
  legendCities: string;
  /** An edge pointer to an off-screen town (cities.ts): accessible name; the visible text is the name and the distance. */
  cityPointer: (name: string, km: string) => string;
  overlaysLabel: string;
  aboutButton: string;
  /** The "Check a spot" toggle in the toolbar (landcheck mode): visible label and tooltip. */
  checkButton: string;
  checkTitle: string;
  /** Legend toggle for the wildfire hazard overlay. */
  legendHazard: string;
  /** The button under the zoom buttons that returns to the whole country: visible label, and accessible name/tooltip. */
  countryButton: string;
  countryLabel: string;
  /** The shortlist (shortlist.ts): the star in the panel header and the list in the toolbar. */
  shortlist: {
    star: string;
    unstar: string;
    button: (n: number) => string;
    title: string;
    sharedTitle: string;
    sharedNote: string;
    empty: string;
    copy: string;
    copied: string;
    copyManually: string;
    linkLabel: string;
    save: string;
    saved: string;
    close: string;
    removeItem: (name: string) => string;
  };
  loadingMap: string;
  // error states (status line)
  basemapError: string;
  dataError: string;
  // language and theme controls (controls.ts)
  settingsLabel: string;
  langLabel: string;
  /** Accessible name per language button; contains the visible "PT"/"EN" (WCAG 2.5.3). */
  langNames: Record<Lang, string>;
  /** Theme button: accessible name and tooltip stating the current state. */
  theme: Record<ThemePref, string>;
  /** 3D button ("3D", drill.ts): accessible name and tooltip stating the current state; contains "3D". */
  view3d: { on: string; off: string; reduced: string };
  // tooltip and search
  concelhoSub: (distrito: string) => string;
  pnctYes: string;
  pnctNo: string;
  /** Tooltip line of a disputed parish. */
  pnctDisputed: string;
  pnctAll: string;
  pnctSome: (pnct: number, total: number) => string;
  kind: { concelho: string; parish: string };
  noMatches: string;
  /** Screen-reader suffix of a PNCT search result. */
  pnctMark: string;
  // panel
  parishes: (n: number) => string;
  coverageWhole: (n: number) => string;
  coverageNone: (name: string, n: number) => string;
  coveragePartial: (name: string, pnct: number, n: number) => string;
  badgePnct: string;
  badgeOther: string;
  badgeDisputed: string;
  /** "Sources disagree: Portaria 208/2017 says PNCT, the IEFP list says not PNCT. Check …". */
  disputedNote: (legal: string, iefp: string) => string;
  /** How a source classifies the parish, inside disputedNote. */
  statusWord: Record<LegalStatus, string>;
  disputedSources: string;
  /** Concelho panel: its parishes the sources disagree on (names joined). */
  concelhoDisputed: (names: string) => string;
  factConcelho: string;
  factDistrito: string;
  factDicofre: string;
  factParishes: string;
  closePanel: string;
  kickerParish: string;
  kickerConcelho: string;
  concelhoCoverage: string;
  pnctCoverage: string;
  showConcelho: (name: string) => string;
  showAll: string;
  pnctParishes: string;
  propertySearch: string;
  searchOptions: string;
  operation: string;
  propertyType: string;
  landType: string;
  operations: Record<Operation, string>;
  types: Record<PropertyType, string>;
  land: Record<LandFilter, string>;
  linksLoading: string;
  linksNone: string;
  linksError: string;
  linksDisclaimer: string;
  notPnctParish: string;
  // property links (links.ts)
  linkParish: string;
  linkParishDescription: string;
  linkApprox: string;
  linkMunicipality: (name: string) => string;
  linkMunicipalityDescription: string;
  // credits: map attribution and the phone sheet
  attributionBoundaries: string;
  sheetBoundaries: string;
  // About dialog. **bold**; {placeholders} are links.
  about: {
    title: string;
    intro: string;
    unofficial: string;
    sourcesHeading: string;
    pnctLabel: string;
    /** {portaria}: the Portaria link; {list}: the IEFP list link (listLink); {date}: when the sources were checked. */
    pnct: string;
    listLink: string;
    boundariesLabel: string;
    /** {caop}, {licence}. */
    boundaries: string;
    basemapLabel: string;
    /** {openfreemap}, {openmaptiles}, {osm}. */
    basemap: string;
    notAffiliated: string;
    close: string;
  };
}

export interface Strings {
  ui: UiStrings;
  protected: ProtectedStrings;
  concelho: ConcelhoStrings;
  sheet: SheetStrings;
  check: CheckStrings;
}

export const STRINGS: Record<Lang, Strings> = { en, pt };

/** The active language and its tables (live bindings, see the header). English until setLang. */
export let lang: Lang = "en";
export let ui: UiStrings = en.ui;
export let t: ProtectedStrings = en.protected;
export let tc: ConcelhoStrings = en.concelho;
export let sheet: SheetStrings = en.sheet;
export let tk: CheckStrings = en.check;

export function setLang(next: Lang): void {
  lang = next;
  ({ ui, protected: t, concelho: tc, sheet, check: tk } = STRINGS[next]);
}

/**
 * The "Report outdated info" GitHub issue, in English in both languages: it's read by the
 * maintainers, not shown in the UI.
 */
export const ISSUE = {
  title: (name: string, dico: string) => `Outdated info: ${name} (${dico})`,
  body: (name: string, dico: string, current: string[], asOf: string) =>
    [`Concelho: ${name} (DICO ${dico})`, "", `Current data (checked ${asOf}):`, ...current.map((l) => `- ${l}`), "", "What changed?", "", ""].join("\n"),
  fields: {
    website: "Website",
    email: "Email",
    phone: "Phone",
    urbanism: "Urbanism page",
    pdm: "PDM page",
    pdmStatus: "PDM status",
    population: (year: number) => `Population ${year}`,
  },
};

/** Shares below this (but above 0) are mostly boundary mismatches; they show as "<0.5%". The data keeps the exact value. */
export const SMALL_SHARE = 0.5;

/**
 * `value` in the active locale: "8,360" / "8 360" (grouped from four digits in both, unlike
 * pt-PT's default, which starts at five), "4.2" / "4,2".
 */
export function formatNumber(value: number, digits = 0, extra: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(ui.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: "always", ...extra }).format(value);
}

/** An ISO date (YYYY-MM-DD) in the active locale: "28 March 2022" / "28 de março de 2022". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(ui.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** "0%", "<0.5%", "12.3%", "100%" ("12,3%" in PT): one decimal, none for whole numbers. */
export function formatPct(value: number): string {
  if (value > 0 && value < SMALL_SHARE) return `<${formatNumber(SMALL_SHARE, 1)}%`;
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}%`;
}
