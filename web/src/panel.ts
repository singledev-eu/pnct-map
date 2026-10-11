import type { Concelho, Parish } from "./data";
import { LAND_FILTERS, type LandFilter, type Operation, type PropertyType, type SearchOptions } from "./idealista";
import { getConcelhoLinks, getLinks, type PropertyLink } from "./links";

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
      h("p", { class: "sheet-credit" }, "Boundaries CAOP 2025 © DGT, CC BY 4.0 · OpenFreeMap / © OpenStreetMap"),
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
      whole ? null : parishes,
      whole ? this.propertySection((opts) => getConcelhoLinks(c, opts)) : null,
    );
  }
}
