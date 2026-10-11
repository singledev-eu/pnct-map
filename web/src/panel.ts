import type { Concelho, Parish } from "./data";
import { getLinks } from "./links";

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
}

const plural = (n: number) => `${n} ${n === 1 ? "parish" : "parishes"}`;

function coverage(c: Concelho): HTMLElement {
  const count = `${c.pnctCount} of ${plural(c.parishCount)}`;
  let text: string;
  let kind: string;
  if (c.pnctCount === c.parishCount) {
    text = `The whole concelho is PNCT (${count}).`;
    kind = "whole";
  } else if (c.pnctCount === 0) {
    text = `No parish in ${c.name} is PNCT (${count}).`;
    kind = "none";
  } else {
    text = `Only some parishes of ${c.name} are PNCT: ${count}.`;
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

export class Panel {
  constructor(
    private readonly root: HTMLElement,
    private readonly cb: PanelCallbacks,
  ) {}

  private open(title: string, kicker: string, ...body: Child[]): void {
    const close = h("button", { class: "panel-close", type: "button", "aria-label": "Close panel" }, "×");
    close.addEventListener("click", () => this.cb.onClose());
    this.root.replaceChildren(
      h("header", { class: "panel-header" }, h("div", {}, h("p", { class: "kicker" }, kicker), h("h2", { "data-testid": "panel-title" }, title)), close),
      h("div", { class: "panel-body" }, ...body),
    );
    this.root.hidden = false;
    document.body.classList.add("panel-open");
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    document.body.classList.remove("panel-open");
  }

  showParish(p: Parish, c: Concelho): void {
    const showConcelho = h("button", { type: "button", class: "link-button" }, `Show all of ${c.name}`);
    showConcelho.addEventListener("click", () => this.cb.onSelectConcelho(c.code));

    const links = getLinks(p);
    const linkList = links.length
      ? h(
          "ul",
          { class: "links" },
          ...links.map((l) =>
            h("li", {}, h("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label), l.description ? h("span", { class: "muted" }, ` ${l.description}`) : null),
          ),
        )
      : h("p", { class: "muted" }, "Property search links will appear here.");

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
      h("section", { "data-testid": "property-search" }, h("h3", {}, "Property search"), linkList),
    );
  }

  showConcelho(c: Concelho): void {
    const pnct = c.parishes.filter((p) => p.pnct);
    const list = h(
      "ul",
      { class: "parish-list", "data-testid": "pnct-parish-list" },
      ...pnct.map((p) => {
        const b = h("button", { type: "button", class: "link-button" }, p.freguesia);
        b.addEventListener("click", () => this.cb.onSelectParish(p.dicofre));
        return h("li", {}, b);
      }),
    );
    this.open(
      c.name,
      "Concelho",
      badge(c.pnctCount > 0),
      facts([
        ["Distrito", c.distrito],
        ["Parishes", String(c.parishCount)],
      ]),
      h("section", {}, h("h3", {}, "PNCT coverage"), coverage(c)),
      pnct.length && pnct.length < c.parishCount ? h("section", {}, h("h3", {}, "PNCT parishes"), list) : null,
    );
  }
}
