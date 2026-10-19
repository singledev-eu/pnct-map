/**
 * The UI language: which one on load, where it's kept, and how the static page follows it.
 *
 * On load: `?lang=pt|en` in the URL, then the saved choice (localStorage), then the browser's
 * languages (any pt* → PT), then English. A switch (the PT | EN toggle) saves the choice and writes
 * `?lang=` with replaceState, keeping the #map/#c/#f hash, so a copied link opens in the same
 * language. A `?lang=` on load isn't saved: it applies to that link only.
 */
import { LANGS, ui, type Lang, type UiStrings } from "./strings";

export const LANG_STORAGE_KEY = "pnct-map:lang";
export const LANG_PARAM = "lang";

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

export function detectLang(input: { param: string | null; stored: string | null; languages: readonly string[] }): Lang {
  if (isLang(input.param)) return input.param;
  if (isLang(input.stored)) return input.stored;
  return input.languages.some((l) => l.toLowerCase().startsWith("pt")) ? "pt" : "en";
}

function storedLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null; // storage unavailable (private mode, blocked): fall through to the browser languages
  }
}

export function initialLang(): Lang {
  return detectLang({
    param: new URLSearchParams(window.location.search).get(LANG_PARAM),
    stored: storedLang(),
    languages: navigator.languages?.length ? navigator.languages : [navigator.language ?? ""],
  });
}

/** After a switch: saved, and in the URL (`?lang=`), with the hash kept. */
export function rememberLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Storage may be unavailable; the URL still carries the choice.
  }
  const url = new URL(window.location.href);
  url.searchParams.set(LANG_PARAM, lang);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** The `ui` keys whose value is plain text: the ones index.html can name in data-i18n. */
export type StaticKey = { [K in keyof UiStrings]: UiStrings[K] extends string ? K : never }[keyof UiStrings];

const text = (key: string): string => {
  const value = (ui as unknown as Record<string, unknown>)[key];
  if (typeof value !== "string") throw new Error(`data-i18n: no ui string "${key}"`);
  return value;
};

/**
 * Fills the static page in the active language: <html lang>, the title and meta description, the
 * text of every [data-i18n="key"] element, and the attributes named in
 * data-i18n-attr="aria-label:key,placeholder:key".
 */
export function applyStatic(doc: Document = document): void {
  doc.documentElement.lang = ui.locale;
  doc.title = ui.title;
  doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", ui.description);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = text(el.dataset.i18n!);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr!.split(",")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      el.setAttribute(attr, text(key));
    }
  }
}

/** `template` with each {name} replaced by parts[name] (a link, usually): "{list} dated …" → [<a>, " dated …"]. */
export function fill(template: string, parts: Record<string, Node | string>): (Node | string)[] {
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      if (name === undefined) return piece;
      const part = parts[name];
      if (part === undefined) throw new Error(`fill: no part "${name}"`);
      return typeof part === "string" ? part : part.cloneNode(true);
    });
}

/** `text` with **strong** and *emphasis* as elements (About, the protection explainer). */
export function rich(text: string): (string | HTMLElement)[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
    .filter(Boolean)
    .map((part) => {
      const strong = /^\*\*([^*]+)\*\*$/.exec(part);
      if (strong) return Object.assign(document.createElement("strong"), { textContent: strong[1] });
      const em = /^\*([^*]+)\*$/.exec(part);
      return em ? Object.assign(document.createElement("em"), { textContent: em[1] }) : part;
    });
}
