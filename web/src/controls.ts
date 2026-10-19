/**
 * The language and theme controls in the legend header (index.html #settings): a PT | EN segmented
 * toggle (two buttons, aria-pressed) and a theme button that cycles Auto → Light → Dark, its icon
 * and accessible name stating the current state ("Theme: Auto (system)"). The header stays visible
 * when the phone legend is collapsed, so both are one tap away without opening anything.
 */
import { h } from "./panel";
import { LANGS, ui, type Lang } from "./strings";
import type { ThemePref } from "./theme";

const SVG = "http://www.w3.org/2000/svg";

/** 20×20 line icons in currentColor: Auto a half-filled circle, Light a sun, Dark a moon. */
const ICONS: Record<ThemePref, [string, Record<string, string>][]> = {
  auto: [
    ["circle", { cx: "10", cy: "10", r: "6.5", fill: "none" }],
    ["path", { d: "M10 3.5a6.5 6.5 0 0 0 0 13z", fill: "currentColor", stroke: "none" }],
  ],
  light: [
    ["circle", { cx: "10", cy: "10", r: "3.5", fill: "none" }],
    ["path", { d: "M10 1.75v2M10 16.25v2M1.75 10h2M16.25 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4", fill: "none" }],
  ],
  dark: [["path", { d: "M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2z", fill: "none" }]],
};

function icon(pref: ThemePref): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 20 20", width: "18", height: "18", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[pref]) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

export interface SettingsControls {
  /** Re-reads the language and theme state and the strings (after either changes). */
  render: () => void;
}

export function mountSettings(
  root: HTMLElement,
  state: { lang: () => Lang; theme: () => ThemePref },
  on: { lang: (next: Lang) => void; cycleTheme: () => void },
): SettingsControls {
  const langButtons = LANGS.map((l) => {
    const b = h("button", { type: "button", class: "lang-option", lang: l, "data-lang": l, "data-testid": `lang-${l}` }, l.toUpperCase());
    b.addEventListener("click", () => {
      if (state.lang() !== l) on.lang(l);
    });
    return b;
  });
  const langGroup = h("div", { class: "lang-toggle", role: "group", "data-testid": "lang-toggle" }, ...langButtons);
  const themeButton = h("button", { type: "button", class: "theme-button", "data-testid": "theme-button" });
  themeButton.addEventListener("click", () => on.cycleTheme());
  root.replaceChildren(langGroup, themeButton);

  const render = () => {
    langGroup.setAttribute("aria-label", ui.langLabel);
    for (const b of langButtons) {
      const l = b.dataset.lang as Lang;
      b.setAttribute("aria-pressed", String(l === state.lang()));
      b.setAttribute("aria-label", ui.langNames[l]);
      b.title = ui.langNames[l];
    }
    const pref = state.theme();
    themeButton.dataset.pref = pref;
    themeButton.setAttribute("aria-label", ui.theme[pref]);
    themeButton.title = ui.theme[pref];
    themeButton.replaceChildren(icon(pref));
  };
  render();
  return { render };
}
