/**
 * Collapsible legend. On narrow screens it starts as a "Legend" chip, so it doesn't cover the
 * Algarve at the country view; a tap expands it. The viewer's choice is kept in localStorage
 * (when available). Wide screens always show it expanded, without the toggle.
 */
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
