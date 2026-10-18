/**
 * The concelho card: population block (INE) and câmara contacts, from web/data/concelhos.json
 * (scripts/build_concelhos.py). One component in two places: the concelho panel shows it directly,
 * the parish panel in a collapsed <details> that renders it on first open. The data file is fetched
 * on the first card that renders, never on the initial load.
 */
import type { Concelho } from "./data";
import { h } from "./panel";
import { cachedJson } from "./protected";
import { tc } from "./strings";
// Content-hashed by Vite, fetched on first use.
import DATA_URL from "../data/concelhos.json?url";

export interface Contacts {
  website: string;
  email: string;
  phone: string;
  urbanism_url: string | null;
  pdm_url: string;
  as_of: string;
}

export interface ConcelhoFacts {
  population: number | null;
  population_2011: number | null;
  population_2021: number | null;
  census_change: number | null;
  density: number | null;
  ageing_index: number | null;
  contacts: Contacts | null;
}

export interface ConcelhoData {
  estimate_year: number;
  national: { ageing_index: number; population: number };
  snit_url: string;
  issues_url: string;
  concelhos: Record<string, ConcelhoFacts>;
}

export const loadConcelhos = cachedJson<ConcelhoData>(DATA_URL);

const number = (value: number, digits = 0) => new Intl.NumberFormat(tc.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
/** "−14.0%", "+3.1%", "0.0%": one decimal, a real minus sign. */
export const signedPct = (value: number) => `${new Intl.NumberFormat(tc.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value).replace("-", "−")}%`;
/** The ageing-index line: the index as a ratio, one decimal ("4.2 older people (65+) per child (Portugal: 1.9)"). */
export const ageingText = (index: number, national: number) => tc.ageing(number(index / 100, 1), number(national / 100, 1));
/** The ⓘ text with the index itself, rounded ("Ageing index 418 (Portugal: 189): …"). */
export const ageingHelpText = (index: number, national: number) => tc.ageingHelp(number(index), number(national));
/** One decimal below 100 people/km², none above. */
const densityText = (value: number) => number(value, value < 100 ? 1 : 0);
/** "October 2026" from "2026-10-18". */
const monthYear = (iso: string) => new Intl.DateTimeFormat(tc.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** A new-tab link; `hidden` is read before the text by screen readers only ("Website: cm-x.pt"). */
const external = (href: string, text: string, attrs: Record<string, string> = {}, hidden = "") =>
  h("a", { href, target: "_blank", rel: "noopener noreferrer", ...attrs }, hidden ? h("span", { class: "visually-hidden" }, hidden) : null, text, h("span", { "aria-hidden": "true" }, " ↗"), h("span", { class: "visually-hidden" }, ` (${tc.newTab})`));
/** "cm-idanhanova.pt" from "https://www.cm-idanhanova.pt/". */
export const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** A value, or "—" with a muted note: never a made-up number. */
function value(v: number | null, render: (v: number) => string): Node[] {
  return v === null ? [document.createTextNode(tc.missing), h("span", { class: "muted" }, ` (${tc.missingNote})`)] : [document.createTextNode(render(v))];
}

/** The pre-filled "Report outdated info" issue: title, body (DICO, current values, as_of) and the data label. */
export function issueUrl(base: string, c: Pick<Concelho, "code" | "name">, f: ConcelhoFacts | undefined, year: number): string {
  const k = f?.contacts;
  const current = [
    `Website: ${k?.website ?? tc.missing}`,
    `Email: ${k?.email ?? tc.missing}`,
    `Phone: ${k?.phone ?? tc.missing}`,
    `Urbanism page: ${k?.urbanism_url ?? tc.missing}`,
    `PDM page: ${k?.pdm_url ?? tc.missing}`,
    `Population ${year}: ${f?.population ?? tc.missing}`,
  ];
  const params = new URLSearchParams({ title: tc.issueTitle(c.name, c.code), body: tc.issueBody(c.name, c.code, current, k?.as_of ?? tc.missing), labels: "data" });
  return `${base}?${params}`;
}

function populationBlock(data: ConcelhoData, f: ConcelhoFacts | undefined, partly: boolean): HTMLElement {
  const n = (key: keyof ConcelhoFacts) => (f?.[key] ?? null) as number | null;
  const ageing = n("ageing_index");
  const nationalAgeing = data.national.ageing_index;
  const help = (index: number) => h("details", { class: "concelho-help" }, h("summary", { "aria-label": tc.ageingHelpLabel }, "ⓘ"), h("p", {}, ageingHelpText(index, nationalAgeing)));
  return h(
    "section",
    { class: "concelho-population", "data-testid": "concelho-population" },
    h("h3", {}, tc.populationHeading),
    h(
      "ul",
      { class: "concelho-facts" },
      h("li", { "data-testid": "concelho-people" }, ...value(n("population"), (v) => tc.population(number(v), data.estimate_year))),
      h("li", { "data-testid": "concelho-change" }, ...value(n("census_change"), (v) => tc.censusChange(signedPct(v)))),
      h("li", { "data-testid": "concelho-density" }, ...value(n("density"), (v) => tc.density(densityText(v)))),
      h("li", { "data-testid": "concelho-ageing" }, ...(ageing === null ? value(null, String) : [ageingText(ageing, nationalAgeing), " ", help(ageing)])),
    ),
    partly ? h("p", { class: "muted concelho-note", "data-testid": "concelho-whole" }, tc.wholeConcelho) : null,
    h("p", { class: "disclaimer" }, tc.populationSource(data.estimate_year)),
  );
}

function contactsBlock(data: ConcelhoData, c: Concelho, f: ConcelhoFacts | undefined): HTMLElement {
  const k = f?.contacts ?? null;
  const report = external(issueUrl(data.issues_url, c, f, data.estimate_year), tc.report, { "data-testid": "concelho-report" });
  const snit = h("p", { class: "concelho-snit" }, external(data.snit_url, tc.snit, { "data-testid": "concelho-snit" }));
  if (!k) {
    return h(
      "section",
      { class: "concelho-contacts", "data-testid": "concelho-contacts", "data-state": "missing" },
      h("h3", {}, tc.contactsHeading),
      h("p", { class: "muted", "data-testid": "concelho-not-yet" }, tc.notYet),
      snit,
      h("p", { class: "disclaimer" }, report),
    );
  }
  return h(
    "section",
    { class: "concelho-contacts", "data-testid": "concelho-contacts", "data-state": "curated" },
    h("h3", {}, tc.contactsHeading),
    h(
      "ul",
      { class: "concelho-links" },
      h("li", {}, external(k.website, domainOf(k.website), { "data-testid": "concelho-website" }, `${tc.website}: `)),
      h("li", {}, h("a", { href: `mailto:${k.email}` }, k.email)),
      h("li", {}, h("a", { href: `tel:${k.phone.replace(/\s/g, "")}` }, k.phone)),
      h("li", {}, k.urbanism_url ? external(k.urbanism_url, tc.urbanism) : h("span", { class: "muted" }, `${tc.missing} ${tc.noUrbanism}`)),
      h("li", {}, external(k.pdm_url, tc.pdm, { "data-testid": "concelho-pdm" })),
    ),
    snit,
    h("p", { class: "disclaimer" }, `${tc.contactsSource(monthYear(k.as_of))} · `, report),
  );
}

/** The card for `c`: "Loading…" until the data arrives, then the population and contacts blocks. */
export function concelhoCard(c: Concelho): HTMLElement {
  const card = h("div", { class: "concelho-card", "data-testid": "concelho-card", "aria-busy": "true" }, h("p", { class: "muted" }, tc.loading));
  loadConcelhos()
    .then((data) => {
      if (!card.isConnected) return; // the panel moved on
      const f = data.concelhos[c.code];
      card.replaceChildren(populationBlock(data, f, c.pnctCount > 0 && c.pnctCount < c.parishCount), contactsBlock(data, c, f));
      card.removeAttribute("aria-busy");
    })
    .catch((err: unknown) => {
      if (!card.isConnected) return;
      console.error(err);
      card.replaceChildren(h("p", { class: "muted" }, tc.loadError));
      card.removeAttribute("aria-busy");
    });
  return card;
}

/** The parish panel's collapsed "Concelho: <name>" section; the card (and the data) load on first open. */
export function concelhoDetails(c: Concelho): HTMLElement {
  const details = h("details", { class: "concelho-details", "data-testid": "concelho-details" }, h("summary", {}, tc.parishSummary(c.name)));
  details.addEventListener("toggle", () => {
    if (details.open && !details.querySelector(".concelho-card")) details.append(concelhoCard(c));
  });
  return h("section", {}, details);
}
