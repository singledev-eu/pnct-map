/**
 * Collapsible legend. On narrow screens it starts as a "Legend" chip, so it doesn't cover the
 * Algarve at the country view; a tap expands it. The viewer's choice is kept in localStorage
 * (when available). Wide screens always show it expanded, without the toggle.
 */
import { rich } from "./i18n";
import { h } from "./panel";
import { CATEGORIES, categoryLabel, sourceLabel } from "./protected";
import { SERVICE_COLORS, type Theme } from "./theme";
import { CATEGORIES as SERVICE_CATEGORIES } from "./services";
import { t, tn } from "./strings";

const STORAGE_KEY = "pnct-map:legend";

function stored(): boolean | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "open" ? true : v === "closed" ? false : null;
  } catch {
    return null;
  }
}

export function mountLegend(legend: HTMLElement, narrow: MediaQueryList): void {
  const toggle = legend.querySelector<HTMLButtonElement>(".legend-toggle")!;
  const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;

  const render = (open: boolean) => {
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    legend.classList.toggle("legend-collapsed", !open);
  };
  const apply = () => render(!narrow.matches || (stored() ?? false));

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
    } catch {
      // Storage may be unavailable (private mode, blocked); the toggle still works for this page.
    }
    render(open);
  });
  narrow.addEventListener("change", apply);
  apply();
}

/**
 * The protected-areas toggles (one per category of protected.meta.json, all off by default) and the
 * source note with the disclaimer, rendered into `container` in the legend body, under a heading with
 * the "?" explainer (mountExplainer). `onChange` gets the category and its new state. Returns `sync`,
 * which re-syncs the checkboxes (hash navigation), `setLoading`, which marks the rows of the given
 * categories as loading (spinner and "Loading…", aria-busy) while the overlay file is fetched on the
 * first switch-on, `setZoomHint`, which shows "Zoom in to see protected areas" (main.ts: while an
 * overlay is on but faded out at country zoom), and `relabel`, which re-reads the strings after a
 * language switch (the state and focus stay).
 */
export function mountOverlayToggles(
  container: HTMLElement,
  isOn: (cat: string) => boolean,
  onChange: (cat: string, on: boolean) => void,
): { sync: () => void; setLoading: (cats: ReadonlySet<string>) => void; setZoomHint: (show: boolean) => void; relabel: () => void } {
  const inputs = CATEGORIES.map((c) => {
    const input = h("input", { type: "checkbox", "data-overlay": c.id, "data-testid": `overlay-${c.id}` });
    input.addEventListener("change", () => onChange(c.id, input.checked));
    const loadingText = h("span", {});
    const loading = h("span", { class: "overlay-loading", "data-testid": `overlay-loading-${c.id}`, role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), loadingText);
    loading.hidden = true;
    const label = h("span", {});
    const row = h("label", { class: "legend-row legend-overlay" }, input, h("span", { class: `swatch swatch-${c.id}`, "aria-hidden": "true" }), label, loading);
    return { id: c.id, c, input, row, label, loading, loadingText };
  });
  const help = h("button", { type: "button", class: "help-button", "data-testid": "protection-help" }, "?");
  const hint = h("p", { class: "legend-hint", "data-testid": "overlay-zoom-hint" });
  hint.hidden = true;
  const heading = h("p", { class: "legend-heading" });
  const note = h("p", { class: "legend-note", "data-testid": "overlay-note" });
  container.replaceChildren(h("div", { class: "legend-heading-row" }, heading, help), ...inputs.map((i) => i.row), hint, note);
  const explainer = mountExplainer(help);
  const relabel = () => {
    for (const i of inputs) {
      i.label.textContent = categoryLabel(i.c);
      i.loadingText.textContent = t.toggleLoading;
    }
    help.setAttribute("aria-label", t.explainer.button);
    hint.textContent = t.zoomHint;
    heading.textContent = t.legendHeading;
    note.textContent = `${t.legendSources}: ${CATEGORIES.map(sourceLabel).join(" · ")}. ${t.disclaimer}`;
    explainer.relabel();
  };
  relabel();
  const sync = () => {
    for (const { id, input } of inputs) input.checked = isOn(id);
  };
  const setLoading = (cats: ReadonlySet<string>) => {
    for (const { id, row, loading } of inputs) {
      loading.hidden = !cats.has(id);
      row.toggleAttribute("aria-busy", cats.has(id));
    }
  };
  sync();
  return { sync, setLoading, setZoomHint: (show) => (hint.hidden = !show), relabel };
}

/**
 * The "?" explainer: what protection means for buying land (strings.ts). A popover beside the legend
 * on wide screens, a bottom sheet over a backdrop on phones (style.css). Esc, a click or tap outside,
 * or its close button closes it, and focus goes back to the "?" button; tabbing out of it closes it
 * and leaves focus where it went. `relabel` re-renders its text in the active language.
 */
export interface ExplainerText {
  title: string;
  items: { lead: string; body: string }[];
  footnote: string;
  close: string;
}

export function mountExplainer(button: HTMLButtonElement, text: () => ExplainerText = () => t.explainer, id = "protection-explainer"): { relabel: () => void } {
  const titleId = `${id}-title`;
  const close = h("button", { type: "button", class: "explainer-close" }, "×");
  const title = h("h2", { id: titleId });
  const list = h("ul", {});
  const footnote = h("em", {});
  const pop = h(
    "div",
    { id, class: "explainer", role: "dialog", "aria-labelledby": titleId, tabindex: "-1", "data-testid": id },
    h("div", { class: "explainer-header" }, title, close),
    list,
    h("p", { class: "explainer-footnote" }, footnote),
  );
  const relabel = () => {
    const x = text();
    close.setAttribute("aria-label", x.close);
    title.textContent = x.title;
    list.replaceChildren(...x.items.map((item) => h("li", {}, h("strong", {}, ...rich(item.lead)), " ", ...rich(item.body))));
    footnote.textContent = x.footnote;
  };
  const backdrop = h("div", { class: "explainer-backdrop", "aria-hidden": "true" });
  pop.hidden = backdrop.hidden = true;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", pop.id);
  button.setAttribute("aria-expanded", "false");
  document.body.append(backdrop, pop);

  // Wide screens: beside the legend, bottom-aligned with it (style.css reads these on > 640 px only).
  const place = () => {
    const legend = button.closest(".legend")!.getBoundingClientRect();
    pop.style.setProperty("--explainer-left", `${Math.round(legend.right + 8)}px`);
    pop.style.setProperty("--explainer-bottom", `${Math.round(window.innerHeight - legend.bottom)}px`);
  };
  const isOpen = () => !pop.hidden;
  const open = () => {
    place();
    pop.hidden = backdrop.hidden = false;
    button.setAttribute("aria-expanded", "true");
    pop.focus();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", place);
  };
  const hide = (refocus: boolean) => {
    if (!isOpen()) return;
    pop.hidden = backdrop.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", place);
    if (refocus) button.focus();
  };
  // A press on the "?" button itself is left to its click handler, which toggles. The browser moves
  // focus on the mousedown that follows (for a tap, after the pointerup), so focus goes back once
  // the press has ended.
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node;
    if (pop.contains(target) || button.contains(target)) return;
    hide(false);
    document.addEventListener("pointerup", () => setTimeout(() => button.focus()), { once: true, capture: true });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    hide(true);
  };
  pop.addEventListener("focusout", (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !pop.contains(next) && next !== button) hide(false);
  });
  button.addEventListener("click", () => (isOpen() ? hide(true) : open()));
  close.addEventListener("click", () => hide(true));
  return { relabel };
}

/**
 * The nearby-services overlay toggle (off by default) with its "?" explainer, the colour key (shown
 * while it is on) and the "Zoom in" hint (main.ts: on but faded out at country zoom). `onChange` gets
 * the new state; `sync` re-reads it (hash), `setLoading` marks the row while services.json loads,
 * `setTheme` repaints the key, `relabel` re-reads the strings.
 */
export function mountServicesToggle(
  container: HTMLElement,
  isOn: () => boolean,
  onChange: (on: boolean) => void,
  theme: Theme,
): { sync: () => void; setLoading: (on: boolean) => void; setZoomHint: (show: boolean) => void; setTheme: (theme: Theme) => void; relabel: () => void } {
  const input = h("input", { type: "checkbox", "data-testid": "services-toggle" });
  input.addEventListener("change", () => onChange(input.checked));
  const label = h("span", {});
  const loadingText = h("span", {});
  const loading = h("span", { class: "overlay-loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), loadingText);
  loading.hidden = true;
  const swatch = h("span", { class: "swatch swatch-services", "aria-hidden": "true" });
  const row = h("label", { class: "legend-row legend-overlay" }, input, swatch, label, loading);
  const help = h("button", { type: "button", class: "help-button", "data-testid": "services-help" }, "?");
  const keyItems = SERVICE_CATEGORIES.map((cat) => {
    const dot = h("span", { class: "service-dot", "aria-hidden": "true" });
    const text = h("span", {});
    return { cat, dot, text, li: h("li", { "data-cat": cat }, dot, text) };
  });
  const key = h("ul", { class: "services-key", "data-testid": "services-key" }, ...keyItems.map((k) => k.li));
  const hint = h("p", { class: "legend-hint", "data-testid": "services-zoom-hint" });
  hint.hidden = true;
  container.replaceChildren(h("div", { class: "legend-heading-row legend-services-row" }, row, help), key, hint);
  const explainer = mountExplainer(help, () => tn.explainer, "services-explainer");
  const setTheme = (next: Theme) => {
    const colors = SERVICE_COLORS[next];
    for (const k of keyItems) k.dot.style.background = colors[k.cat];
    swatch.style.background = `conic-gradient(${SERVICE_CATEGORIES.map((c, i) => `${colors[c]} ${(i * 100) / SERVICE_CATEGORIES.length}% ${((i + 1) * 100) / SERVICE_CATEGORIES.length}%`).join(", ")})`;
  };
  const relabel = () => {
    label.textContent = tn.legendToggle;
    loadingText.textContent = tn.loading;
    help.setAttribute("aria-label", tn.explainer.button);
    hint.textContent = tn.zoomHint;
    key.setAttribute("aria-label", tn.heading);
    for (const k of keyItems) k.text.textContent = tn.category[k.cat];
    explainer.relabel();
  };
  const sync = () => {
    input.checked = isOn();
    key.hidden = !isOn();
  };
  setTheme(theme);
  relabel();
  sync();
  return {
    sync,
    setLoading: (on) => {
      loading.hidden = !on;
      row.toggleAttribute("aria-busy", on);
    },
    setZoomHint: (show) => (hint.hidden = !show),
    setTheme,
    relabel,
  };
}
