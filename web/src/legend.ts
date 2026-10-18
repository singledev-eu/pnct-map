/**
 * Collapsible legend. On narrow screens it starts as a "Legend" chip, so it doesn't cover the
 * Algarve at the country view; a tap expands it. The viewer's choice is kept in localStorage
 * (when available). Wide screens always show it expanded, without the toggle.
 */
import { h } from "./panel";
import { CATEGORIES, categoryLabel, sourceLabel } from "./protected";
import { t } from "./strings";

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
 * first switch-on, and `setZoomHint`, which shows "Zoom in to see protected areas" (main.ts: while an
 * overlay is on but faded out at country zoom).
 */
export function mountOverlayToggles(
  container: HTMLElement,
  isOn: (cat: string) => boolean,
  onChange: (cat: string, on: boolean) => void,
): { sync: () => void; setLoading: (cats: ReadonlySet<string>) => void; setZoomHint: (show: boolean) => void } {
  const inputs = CATEGORIES.map((c) => {
    const input = h("input", { type: "checkbox", "data-overlay": c.id, "data-testid": `overlay-${c.id}` });
    input.addEventListener("change", () => onChange(c.id, input.checked));
    const loading = h("span", { class: "overlay-loading", "data-testid": `overlay-loading-${c.id}`, role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), t.toggleLoading);
    loading.hidden = true;
    const row = h("label", { class: "legend-row legend-overlay" }, input, h("span", { class: `swatch swatch-${c.id}`, "aria-hidden": "true" }), categoryLabel(c), loading);
    return { id: c.id, input, row, loading };
  });
  const help = h("button", { type: "button", class: "help-button", "aria-label": t.explainer.button, "data-testid": "protection-help" }, "?");
  const hint = h("p", { class: "legend-hint", "data-testid": "overlay-zoom-hint" }, t.zoomHint);
  hint.hidden = true;
  container.replaceChildren(
    h("div", { class: "legend-heading-row" }, h("p", { class: "legend-heading" }, t.legendHeading), help),
    ...inputs.map((i) => i.row),
    hint,
    h("p", { class: "legend-note", "data-testid": "overlay-note" }, `${t.legendSources}: ${CATEGORIES.map(sourceLabel).join(" · ")}. ${t.disclaimer}`),
  );
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
  mountExplainer(help);
  return { sync, setLoading, setZoomHint: (show) => (hint.hidden = !show) };
}

/** `text` with *emphasis* as <em> (explainer strings). */
function rich(text: string): (string | HTMLElement)[] {
  return text.split(/(\*[^*]+\*)/).filter(Boolean).map((part) => (/^\*[^*]+\*$/.test(part) ? h("em", {}, part.slice(1, -1)) : part));
}

/**
 * The "?" explainer: what protection means for buying land (strings.ts). A popover beside the legend
 * on wide screens, a bottom sheet over a backdrop on phones (style.css). Esc, a click or tap outside,
 * or its close button closes it, and focus goes back to the "?" button; tabbing out of it closes it
 * and leaves focus where it went.
 */
export function mountExplainer(button: HTMLButtonElement): void {
  const titleId = "explainer-title";
  const close = h("button", { type: "button", class: "explainer-close", "aria-label": t.explainer.close }, "×");
  const pop = h(
    "div",
    { id: "protection-explainer", class: "explainer", role: "dialog", "aria-labelledby": titleId, tabindex: "-1", "data-testid": "protection-explainer" },
    h("div", { class: "explainer-header" }, h("h2", { id: titleId }, t.explainer.title), close),
    h("ul", {}, ...t.explainer.items.map((item) => h("li", {}, h("strong", {}, ...rich(item.lead)), " ", ...rich(item.body)))),
    h("p", { class: "explainer-footnote" }, h("em", {}, t.explainer.footnote)),
  );
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
}
