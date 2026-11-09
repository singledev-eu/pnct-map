/**
 * The first-visit intro (index.html #intro): one line under the toolbar saying what the shaded
 * parishes are, in the About dialog's own words (ui.about.intro), with a link to About and a
 * dismiss button. Dismissing it is kept in localStorage; without storage it comes back on the next
 * visit. `relabel` re-renders it in the active language.
 */
import { rich } from "./i18n";
import { h } from "./panel";
import { ui } from "./strings";

export const INTRO_STORAGE_KEY = "pnct-map:intro";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function mountIntro(root: HTMLElement, onAbout: () => void): { relabel: () => void } {
  if (dismissed()) return { relabel: () => {} };
  const text = h("p", { class: "intro-text" });
  const about = h("button", { type: "button", class: "link-button", "data-testid": "intro-about" });
  about.addEventListener("click", onAbout);
  const close = h("button", { type: "button", class: "intro-dismiss", "data-testid": "intro-dismiss" }, "×");
  close.addEventListener("click", () => {
    root.hidden = true;
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "dismissed");
    } catch {
      // Storage may be unavailable (private mode, blocked); it is dismissed for this page only.
    }
  });
  const relabel = () => {
    text.replaceChildren(...rich(ui.about.intro), " ", about);
    about.textContent = ui.aboutButton;
    close.setAttribute("aria-label", ui.introDismiss);
    close.title = ui.introDismiss;
  };
  relabel();
  root.replaceChildren(text, close);
  root.hidden = false;
  return { relabel };
}
