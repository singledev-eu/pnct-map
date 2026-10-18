import { concelhoCard, concelhoDetails } from "./concelho";
import type { Concelho, Parish } from "./data";
import { LAND_FILTERS, type LandFilter, type Operation, type PropertyType, type SearchOptions } from "./idealista";
import { getConcelhoLinks, getLinks, type PropertyLink } from "./links";
import { credits, loadProtection, panelAreas, type Protection, type ProtectionData } from "./protected";
import { formatPct, t } from "./strings";

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export interface PanelCallbacks {
  onClose: () => void;
  onSelectParish: (dicofre: string) => void;
  onSelectConcelho: (code: string) => void;
  onOptionsChange: (opts: SearchOptions) => void;
}

const plural = (n: number) => `${n} ${n === 1 ? "parish" : "parishes"}`;

const OPERATIONS: [Operation, string][] = [
  ["comprar", "Comprar"],
  ["arrendar", "Arrendar"],
];
const TYPES: [PropertyType, string][] = [
  ["terrenos", "Terrenos"],
  ["casas", "Casas"],
  ["predios", "Prédios"],
];
const LAND_LABELS: Record<LandFilter, string> = {
  "terreno-urbano": "Urbano",
  "terreno-urbanizavel": "Urbanizável",
  "terreno-nao-urbanizavel": "Não urbanizável",
};

function coverage(c: Concelho): HTMLElement {
  let text: string;
  let kind: string;
  if (c.pnctCount === c.parishCount) {
    text = `All ${plural(c.parishCount)} are PNCT.`;
    kind = "whole";
  } else if (c.pnctCount === 0) {
    text = `No parish in ${c.name} is PNCT (0 of ${plural(c.parishCount)}).`;
    kind = "none";
  } else {
    text = `Only some parishes of ${c.name} are PNCT: ${c.pnctCount} of ${plural(c.parishCount)}.`;
    kind = "partial";
  }
  return h("p", { class: `coverage coverage-${kind}`, "data-testid": "pnct-count", "data-pnct": String(c.pnctCount) }, text);
}

function badge(pnct: boolean): HTMLElement {
  return h("span", { class: `badge ${pnct ? "badge-pnct" : "badge-other"}`, "data-testid": "pnct-status" }, pnct ? "PNCT territory" : "Not PNCT");
}

function facts(rows: [string, string][]): HTMLElement {
  const dl = h("dl", { class: "facts" });
  for (const [k, v] of rows) dl.append(h("dt", {}, k), h("dd", {}, v));
  return dl;
}

function renderLinks(list: HTMLElement, links: PropertyLink[]): void {
  list.replaceChildren(
    ...links.map((l) =>
      h(
        "li",
        {},
        h("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", class: "property-link", "data-testid": "property-link" }, l.label, h("span", { "aria-hidden": "true" }, " ↗")),
        l.description ? h("span", { class: "link-description" }, l.description) : null,
        l.note ? h("span", { class: "link-note", "data-testid": "link-note" }, l.note) : null,
      ),
    ),
  );
}

const creditLink = (href: string, text: string) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

/**
 * Credit line shown in the phone bottom sheet, which covers the map attribution while it is open.
 * Same credits and links as the map attribution and the About panel.
 */
function sheetCredit(): HTMLElement {
  return h(
    "p",
    { class: "sheet-credit", "data-testid": "sheet-credit" },
    "Boundaries ",
    creditLink("https://www.dgterritorio.gov.pt/cartografia/cartografia-tematica/caop", "CAOP 2025"),
    " ©\u00a0DGT, CC\u00a0BY\u00a04.0 · ", // non-breaking spaces keep each "©" with its name when the line wraps
    creditLink("https://openfreemap.org/", "OpenFreeMap"),
    " · ©\u00a0",
    creditLink("https://www.openmaptiles.org/", "OpenMapTiles"),
    " · ©\u00a0",
    creditLink("https://www.openstreetmap.org/copyright", "OpenStreetMap"),
    ` · ${t.creditLead} `,
    ...credits().flatMap((c, i) => [i ? " · " : "", creditLink(c.url, c.label.replace(/ /g, "\u00a0"))]),
  );
}

/** "Under protection: X% (RNAP Y%, Natura Z%)" and the areas covering at least 0.5% (protection.json). */
function protectionBody(data: ProtectionData, p: Protection | undefined): Child[] {
  const share = (key: `${string}_pct`) => p?.[key] ?? 0;
  const summary = h(
    "p",
    { class: "protection-summary", "data-testid": "protection-summary", "data-any": String(share("any_pct")) },
    t.summary(
      formatPct(share("any_pct")),
      data.categories.map((c) => `${t.short[c] ?? c} ${formatPct(share(`${c}_pct`))}`),
    ),
  );
  for (const c of data.categories) summary.dataset[c] = String(share(`${c}_pct`));
  const areas = panelAreas((p?.areas ?? []).map((i) => data.areas[i]));
  return [
    summary,
    areas.length
      ? h(
          "ul",
          { class: "protection-areas", "aria-label": t.areasLabel, "data-testid": "protection-areas" },
          ...areas.map((a) => h("li", {}, a.name, h("span", { class: "muted" }, ` · ${a.type}`))),
        )
      : null,
  ];
}

/** Nature-protection section; the shares load on first use and fill in when they arrive. */
function protectionSection(level: "freguesias" | "concelhos", code: string): HTMLElement {
  const body = h("div", {}, h("p", { class: "muted" }, t.loading));
  const section = h("section", { class: "protection", "data-testid": "protection" }, h("h3", {}, t.panelHeading), body, h("p", { class: "disclaimer" }, t.disclaimer));
  loadProtection()
    .then((data) => {
      if (section.isConnected) body.replaceChildren(...protectionBody(data, data[level][code]?.protection).filter((c): c is Node => !!c));
    })
    .catch((err: unknown) => {
      if (!section.isConnected) return; // the panel moved on
      console.error(err);
      body.replaceChildren(h("p", { class: "muted" }, t.loadError));
    });
  return section;
}

export class Panel {
  private options: SearchOptions;
  /** Re-renders the current links list after a selector change. */
  private refreshLinks: (() => void) | null = null;
  private renderToken = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly cb: PanelCallbacks,
    options: SearchOptions,
  ) {
    this.options = options;
  }

  private open(title: string, kicker: string, ...body: Child[]): void {
    const close = h("button", { class: "panel-close", type: "button", "aria-label": "Close panel" }, "×");
    close.addEventListener("click", () => this.cb.onClose());
    this.root.replaceChildren(
      h("header", { class: "panel-header" }, h("div", {}, h("p", { class: "kicker" }, kicker), h("h2", { "data-testid": "panel-title" }, title)), close),
      h("div", { class: "panel-body" }, ...body),
      sheetCredit(),
    );
    this.root.hidden = false;
    document.body.classList.add("panel-open");
  }

  close(): void {
    this.refreshLinks = null;
    this.renderToken++;
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("panel-open");
  }

  private selector(): HTMLElement {
    const form = h("form", { class: "search-options", "aria-label": "Property search options", "data-testid": "search-options" });
    form.addEventListener("submit", (e) => e.preventDefault());

    const radios = <T extends string>(name: string, legend: string, choices: [T, string][], current: T) =>
      h(
        "fieldset",
        { class: "segmented" },
        h("legend", { class: "visually-hidden" }, legend),
        ...choices.map(([value, label]) => {
          const input = h("input", { type: "radio", name, value });
          input.checked = value === current;
          return h("label", {}, input, h("span", {}, label));
        }),
      );

    const land = h(
      "fieldset",
      { class: "land-filters" },
      h("legend", {}, "Land type"),
      ...LAND_FILTERS.map((f) => {
        const input = h("input", { type: "checkbox", name: "land", value: f });
        input.checked = this.options.land.includes(f);
        return h("label", {}, input, h("span", {}, LAND_LABELS[f]));
      }),
    );
    land.hidden = this.options.type !== "terrenos";

    form.append(radios("op", "Operation", OPERATIONS, this.options.op), radios("type", "Property type", TYPES, this.options.type), land);

    form.addEventListener("change", () => {
      const data = new FormData(form);
      this.options = {
        op: data.get("op") as Operation,
        type: data.get("type") as PropertyType,
        land: LAND_FILTERS.filter((f) => data.getAll("land").includes(f)),
      };
      land.hidden = this.options.type !== "terrenos";
      this.cb.onOptionsChange(this.options);
      this.refreshLinks?.();
    });
    return form;
  }

  private propertySection(load: (opts: SearchOptions) => Promise<PropertyLink[]> | PropertyLink[]): HTMLElement {
    const list = h("ul", { class: "links", "data-testid": "property-links" });
    const status = h("p", { class: "muted links-status" });
    const token = ++this.renderToken;
    this.refreshLinks = () => {
      const opts = this.options;
      status.textContent = "Loading links…";
      Promise.resolve(load(opts))
        .then((links) => {
          if (token !== this.renderToken) return; // the panel moved on
          renderLinks(list, links);
          status.textContent = links.length ? "" : "No search links available.";
        })
        .catch((err: unknown) => {
          if (token !== this.renderToken) return;
          console.error(err);
          list.replaceChildren();
          status.textContent = "Could not load the search area. Please try again.";
        });
    };
    this.refreshLinks();
    return h(
      "section",
      { "data-testid": "property-search" },
      h("h3", {}, "Property search"),
      this.selector(),
      list,
      status,
      h("p", { class: "disclaimer" }, "Links open idealista.pt in a new tab. This site isn't affiliated with Idealista."),
    );
  }

  showParish(p: Parish, c: Concelho): void {
    this.renderToken++;
    this.refreshLinks = null;
    const showConcelho = h("button", { type: "button", class: "link-button" }, `Show all of ${c.name}`);
    showConcelho.addEventListener("click", () => this.cb.onSelectConcelho(c.code));

    const property = p.pnct
      ? this.propertySection((opts) => getLinks(p, c, opts))
      : h(
          "section",
          { "data-testid": "property-search" },
          h("h3", {}, "Property search"),
          h("p", { class: "muted" }, "This parish isn't in the PNCT list, so there are no property-search links for it."),
        );

    this.open(
      p.freguesia,
      "Freguesia",
      badge(p.pnct),
      facts([
        ["Concelho", p.concelho],
        ["Distrito", p.distrito],
        ["DICOFRE", p.dicofre],
      ]),
      h("section", {}, h("h3", {}, "Concelho coverage"), coverage(c), showConcelho),
      concelhoDetails(c),
      protectionSection("freguesias", p.dicofre),
      property,
    );
  }

  showConcelho(c: Concelho): void {
    this.renderToken++;
    this.refreshLinks = null;
    const pnct = c.parishes.filter((p) => p.pnct);
    const parishButton = (p: Parish) => {
      const b = h("button", { type: "button", class: "link-button" }, p.freguesia);
      b.addEventListener("click", () => this.cb.onSelectParish(p.dicofre));
      return h("li", {}, b);
    };
    const list = h("ul", { class: "parish-list", "data-testid": "pnct-parish-list" }, ...pnct.map(parishButton));
    const whole = pnct.length === c.parishCount;

    let parishes: HTMLElement | null = null;
    if (whole) {
      parishes = h("details", { class: "all-parishes" }, h("summary", {}, "Show all"), list);
    } else if (pnct.length) {
      parishes = h("section", {}, h("h3", {}, "PNCT parishes"), list);
    }

    this.open(
      c.name,
      "Concelho",
      badge(c.pnctCount > 0),
      facts([
        ["Distrito", c.distrito],
        ["Parishes", String(c.parishCount)],
      ]),
      h("section", {}, h("h3", {}, "PNCT coverage"), coverage(c), whole ? parishes : null),
      concelhoCard(c),
      protectionSection("concelhos", c.code),
      whole ? null : parishes,
      whole ? this.propertySection((opts) => getConcelhoLinks(c, opts)) : null,
    );
  }
}
