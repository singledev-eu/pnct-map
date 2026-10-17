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
 * source note with the disclaimer, rendered into `container` in the legend body. `onChange` gets the
 * category and its new state. Returns `sync`, which re-syncs the checkboxes (hash navigation), and
 * `setLoading`, which marks the rows of the given categories as loading (spinner and "Loading…",
 * aria-busy) while the overlay file is fetched on the first switch-on.
 */
export function mountOverlayToggles(
  container: HTMLElement,
  isOn: (cat: string) => boolean,
  onChange: (cat: string, on: boolean) => void,
): { sync: () => void; setLoading: (cats: ReadonlySet<string>) => void } {
  const inputs = CATEGORIES.map((c) => {
    const input = h("input", { type: "checkbox", "data-overlay": c.id, "data-testid": `overlay-${c.id}` });
    input.addEventListener("change", () => onChange(c.id, input.checked));
    const loading = h("span", { class: "overlay-loading", "data-testid": `overlay-loading-${c.id}`, role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), t.toggleLoading);
    loading.hidden = true;
    const row = h("label", { class: "legend-row legend-overlay" }, input, h("span", { class: `swatch swatch-${c.id}`, "aria-hidden": "true" }), categoryLabel(c), loading);
    return { id: c.id, input, row, loading };
  });
  container.replaceChildren(
    h("p", { class: "legend-heading" }, t.legendHeading),
    ...inputs.map((i) => i.row),
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
  return { sync, setLoading };
}
