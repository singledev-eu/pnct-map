/**
 * Shortlist: parishes (DICOFRE) and concelhos (DICO) the viewer stars, kept in localStorage and
 * shareable as a link (#list=DICOFRE,DICO,…). A star in the panel header adds or removes the
 * selection; a "★ n" button in the toolbar opens the list (select, remove, copy the link).
 *
 * A shared link opens the sender's list as a separate "shared" view: the receiver's own list is not
 * touched until they choose "Add to my shortlist" (which merges, keeping their own entries first).
 */
import { h } from "./panel";
import { ui } from "./strings";

export const SHORTLIST_KEY = "pnct-map:shortlist";
/** A cap for links and storage: enough for a real shortlist, short enough for any URL. */
export const MAX_ITEMS = 60;

const CODE = /^\d{4}(\d{2})?$/;

/** Valid, de-duplicated codes from a list parameter or stored JSON, in order, at most MAX_ITEMS. */
export function parseCodes(raw: unknown): string[] {
  const items = typeof raw === "string" ? raw.split(",") : Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of items) {
    const code = String(item).trim();
    if (CODE.test(code) && !out.includes(code)) out.push(code);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function loadShortlist(storage: () => Storage = () => window.localStorage): string[] {
  try {
    return parseCodes(JSON.parse(storage().getItem(SHORTLIST_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveShortlist(codes: string[], storage: () => Storage = () => window.localStorage): void {
  try {
    if (codes.length) storage().setItem(SHORTLIST_KEY, JSON.stringify(codes));
    else storage().removeItem(SHORTLIST_KEY);
  } catch {
    // Without storage the list lasts for this page only.
  }
}

/** The receiver's list with the shared one added after it (own entries first, no duplicates). */
export const mergeCodes = (own: string[], shared: string[]): string[] => parseCodes([...own, ...shared]);

/** A link that opens `codes` as a shared list (nothing else of the sender's state). */
export const shareUrl = (codes: string[], base = `${location.origin}${location.pathname}`): string => `${base}#list=${codes.join(",")}`;

export interface ShortlistDeps {
  button: HTMLButtonElement;
  pop: HTMLElement;
  /** Display name of a code: null for an unknown one (dropped from a shared list). */
  name: (code: string) => { title: string; sub: string } | null;
  onSelect: (code: string) => void;
  /** The shared list is dismissed or saved: remove `list=` from the URL. */
  onSharedDone: () => void;
  /** The own list changed (refresh the panel's star). */
  onChange: () => void;
}

export interface Shortlist {
  has(code: string): boolean;
  toggle(code: string): void;
  /** Opens a shared list (from #list=). */
  showShared(codes: string[]): void;
  relabel(): void;
}

export function mountShortlist(deps: ShortlistDeps): Shortlist {
  let own = loadShortlist();
  let shared: string[] | null = null;
  let status = "";
  const { button, pop } = deps;
  const isOpen = () => !pop.hidden;
  const setOpen = (open: boolean) => {
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (!open) status = "";
    render();
  };

  const row = (code: string, removable: boolean) => {
    const n = deps.name(code)!;
    const pick = h("button", { type: "button", class: "shortlist-pick", "data-code": code }, h("span", { class: "shortlist-name" }, n.title), h("span", { class: "shortlist-sub" }, n.sub));
    pick.addEventListener("click", () => {
      deps.onSelect(code);
      if (window.matchMedia("(max-width: 640px)").matches) setOpen(false);
    });
    const li = h("li", { "data-testid": "shortlist-item" }, pick);
    if (removable) {
      const remove = h("button", { type: "button", class: "shortlist-remove", "aria-label": ui.shortlist.removeItem(n.title), title: ui.shortlist.removeItem(n.title) }, "×");
      remove.addEventListener("click", () => toggle(code));
      li.append(remove);
    }
    return li;
  };

  function render(): void {
    const showingShared = shared !== null;
    const codes = (shared ?? own).filter((c) => deps.name(c));
    button.hidden = own.length === 0 && !showingShared;
    button.replaceChildren(h("span", { "aria-hidden": "true" }, "★ "), String(own.length));
    button.setAttribute("aria-label", ui.shortlist.button(own.length));
    button.title = ui.shortlist.button(own.length);
    if (!isOpen()) return;
    const close = h("button", { type: "button", class: "panel-close", "aria-label": ui.shortlist.close, "data-testid": "shortlist-close" }, "×");
    close.addEventListener("click", () => {
      if (showingShared) {
        shared = null;
        deps.onSharedDone();
      }
      setOpen(false);
    });
    const title = h("h2", { id: "shortlist-title" }, `${showingShared ? ui.shortlist.sharedTitle : ui.shortlist.title} (${codes.length})`);
    const children: (HTMLElement | string)[] = [h("header", { class: "shortlist-header" }, title, close)];
    if (showingShared) children.push(h("p", { class: "shortlist-note" }, ui.shortlist.sharedNote));
    if (codes.length) children.push(h("ol", { class: "shortlist-items", "data-testid": "shortlist-items" }, ...codes.map((c) => row(c, !showingShared))));
    else children.push(h("p", { class: "shortlist-note" }, ui.shortlist.empty));
    if (showingShared && codes.length) {
      const save = h("button", { type: "button", class: "shortlist-action", "data-testid": "shortlist-save" }, ui.shortlist.save);
      save.addEventListener("click", () => {
        own = mergeCodes(own, codes);
        saveShortlist(own);
        shared = null;
        status = ui.shortlist.saved;
        deps.onSharedDone();
        deps.onChange();
        render();
      });
      children.push(h("div", { class: "shortlist-actions" }, save));
    } else if (codes.length) {
      const url = shareUrl(codes);
      const field = h("input", { type: "text", readonly: "", class: "shortlist-link", value: url, "aria-label": ui.shortlist.linkLabel, "data-testid": "shortlist-link" });
      field.addEventListener("focus", () => field.select());
      const copy = h("button", { type: "button", class: "shortlist-action", "data-testid": "shortlist-copy" }, ui.shortlist.copy);
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(url);
          status = ui.shortlist.copied;
        } catch {
          field.focus(); // the link is selected for a manual copy
          status = ui.shortlist.copyManually;
        }
        render();
      });
      children.push(h("div", { class: "shortlist-actions" }, field, copy));
    }
    children.push(h("p", { class: "shortlist-status", role: "status", "data-testid": "shortlist-status" }, status));
    pop.replaceChildren(...children);
  }

  function toggle(code: string): void {
    own = own.includes(code) ? own.filter((c) => c !== code) : parseCodes([...own, code]);
    saveShortlist(own);
    status = "";
    deps.onChange();
    if (!own.length && shared === null) setOpen(false);
    else render();
  }

  button.addEventListener("click", () => setOpen(!isOpen()));
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      button.focus();
    }
  });
  render();
  return {
    has: (code) => own.includes(code),
    toggle,
    showShared(codes) {
      shared = codes;
      setOpen(true);
    },
    relabel: render,
  };
}
