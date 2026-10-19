import "./search.css";
import { ui } from "./strings";

export type SearchKind = "parish" | "concelho";

export interface SearchItem {
  kind: SearchKind;
  id: string; // parish: 6-digit dicofre; concelho: 4-digit code (dicofre prefix)
  label: string; // parish: freguesia name; concelho: concelho name
  sublabel: string; // "Concelho · Distrito" (in the active language: main.ts rebuilds the items on a switch)
  pnct: boolean; // parish: is PNCT; concelho: has >= 1 PNCT parish
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

const COMBINING_MARKS = /\p{M}/gu;
const PUNCTUATION = /['’,.()-]/g;

/** Lowercase, strip accents, turn apostrophes/punctuation into spaces, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Length-preserving normalization used for highlighting: every UTF-16 unit of the
 * (NFC) input maps to exactly one unit of output, so indices line up with the label.
 */
function alignNormalize(nfcText: string): string {
  let out = "";
  for (const ch of nfcText) {
    const n = ch
      .normalize("NFD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .replace(PUNCTUATION, " ");
    const c = n.length > 0 && !/\s/u.test(n[0]) ? n[0] : " ";
    out += c.repeat(ch.length);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

export interface SearchIndex {
  query(q: string, limit?: number): SearchItem[];
}

interface Entry {
  item: SearchItem;
  norm: string; // normalized label
  core: string; // norm without a leading "uniao das freguesias de"
  words: string[];
}

interface Hit {
  entry: Entry;
  tier: number;
}

const UNION_PREFIX = /^uniao (?:d[aeo]s? )?freguesias? (?:d[aeo]s? )?/;
const collator = new Intl.Collator("pt");

export function createSearchIndex(items: SearchItem[]): SearchIndex {
  const entries: Entry[] = items.map((item) => {
    const norm = normalizeText(item.label);
    const core = norm.replace(UNION_PREFIX, "");
    return { item, norm, core, words: norm.split(" ") };
  });

  // 0 exact, 1 starts-with, 2 all tokens word-prefixed, 3 substring, -1 no match
  function tierOf(e: Entry, q: string, tokens: string[]): number {
    if (e.norm === q || e.core === q) return 0;
    if (e.norm.startsWith(q) || e.core.startsWith(q)) return 1;
    if (tokens.every((t) => e.words.some((w) => w.startsWith(t)))) return 2;
    if (e.norm.includes(q)) return 3;
    return -1;
  }

  function compare(a: Hit, b: Hit): number {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ka = a.entry.item.kind === "concelho" ? 0 : 1;
    const kb = b.entry.item.kind === "concelho" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const la = a.entry.item.label.length;
    const lb = b.entry.item.label.length;
    if (la !== lb) return la - lb;
    return (
      collator.compare(a.entry.item.label, b.entry.item.label) ||
      collator.compare(a.entry.item.id, b.entry.item.id)
    );
  }

  return {
    query(q: string, limit = 8): SearchItem[] {
      const nq = normalizeText(q);
      if (nq.length < 2) return [];
      const tokens = nq.split(" ");
      const hits: Hit[] = [];
      for (const entry of entries) {
        const tier = tierOf(entry, nq, tokens);
        if (tier >= 0) hits.push({ entry, tier });
      }
      hits.sort(compare);
      return hits.slice(0, Math.max(0, limit)).map((h) => h.entry.item);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Highlighting                                                        */
/* ------------------------------------------------------------------ */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD_START = "(?<![\\p{L}\\p{N}])";

/** Ranges [start, end) of `aligned` to highlight for the normalized query `nq`. */
function findRanges(aligned: string, nq: string): Array<[number, number]> {
  const tokens = nq.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  const run = (source: string): RegExpExecArray | null => new RegExp(source, "u").exec(aligned);
  const gap = "\\s+";

  // Whole query as a contiguous run starting at a word boundary.
  const whole = run(WORD_START + tokens.map(escapeRegExp).join(gap));
  if (whole) return [[whole.index, whole.index + whole[0].length]];

  // Each token as a word prefix.
  const ranges: Array<[number, number]> = [];
  for (const t of tokens) {
    const m = run(WORD_START + escapeRegExp(t));
    if (!m) {
      ranges.length = 0;
      break;
    }
    ranges.push([m.index, m.index + m[0].length]);
  }
  if (ranges.length === tokens.length) return ranges;

  // Whole query as a plain substring.
  const sub = run(tokens.map(escapeRegExp).join(gap));
  return sub ? [[sub.index, sub.index + sub[0].length]] : [];
}

function highlight(label: string, nq: string): DocumentFragment {
  const text = label.normalize("NFC");
  const ranges = findRanges(alignNormalize(text), nq).sort((a, b) => a[0] - b[0]);

  // Merge overlapping / touching ranges.
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) frag.append(document.createTextNode(text.slice(pos, start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    frag.append(mark);
    pos = end;
  }
  if (pos < text.length) frag.append(document.createTextNode(text.slice(pos)));
  return frag;
}

/* ------------------------------------------------------------------ */
/* Widget                                                              */
/* ------------------------------------------------------------------ */

export interface SearchWidget {
  clear(): void;
  /** Closes the result list, keeping the typed text. */
  close(): void;
  setValue(text: string): void;
  focus(): void;
}

let uid = 0;

export function mountSearch(opts: {
  input: HTMLInputElement;
  list: HTMLUListElement;
  index: SearchIndex;
  onSelect: (item: SearchItem) => void;
  limit?: number;
}): SearchWidget {
  const { input, list, index, onSelect } = opts;
  const limit = opts.limit ?? 8;

  if (!list.id) list.id = `search-list-${++uid}`;
  list.classList.add("search-list");
  list.setAttribute("role", "listbox");
  list.hidden = true;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("autocomplete", "off");

  let results: SearchItem[] = [];
  let options: HTMLLIElement[] = [];
  let active = -1;
  let open = false;

  function setOpen(value: boolean): void {
    open = value;
    list.hidden = !value;
    input.setAttribute("aria-expanded", String(value));
    if (!value) setActive(-1);
  }

  function setActive(i: number, scroll = false): void {
    active = i;
    options.forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    const current = options[i];
    if (current) {
      input.setAttribute("aria-activedescendant", current.id);
      if (scroll) current.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function buildOption(item: SearchItem, i: number, nq: string): HTMLLIElement {
    const li = document.createElement("li");
    li.id = `${list.id}-opt-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.dataset.index = String(i);

    const tag = document.createElement("span");
    tag.className = `search-tag search-tag-${item.kind}`;
    tag.textContent = ui.kind[item.kind];

    const body = document.createElement("span");
    body.className = "search-body";

    const label = document.createElement("span");
    label.className = "search-label";
    label.append(highlight(item.label, nq));
    if (item.pnct) {
      const dot = document.createElement("span");
      dot.className = "pnct";
      dot.title = "PNCT";
      label.append(dot);
      const sr = document.createElement("span");
      sr.className = "search-sr";
      sr.textContent = ui.pnctMark;
      label.append(sr);
    }

    const sub = document.createElement("span");
    sub.className = "search-sub";
    sub.textContent = item.sublabel;

    body.append(label, sub);
    li.append(tag, body);
    return li;
  }

  function update(): void {
    const nq = normalizeText(input.value);
    results = index.query(input.value, limit);
    list.replaceChildren();
    options = [];
    active = -1;
    input.removeAttribute("aria-activedescendant");

    if (results.length > 0) {
      options = results.map((item, i) => buildOption(item, i, nq));
      list.append(...options);
      setOpen(true);
    } else if (nq.length >= 2) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.setAttribute("role", "option");
      li.setAttribute("aria-disabled", "true");
      li.textContent = ui.noMatches;
      list.append(li);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function select(i: number): void {
    const item = results[i];
    if (!item) return;
    input.value = item.label;
    setOpen(false);
    onSelect(item);
  }

  function indexFromEvent(e: Event): number {
    const li = (e.target as Element | null)?.closest<HTMLLIElement>("li[data-index]");
    return li ? Number(li.dataset.index) : -1;
  }

  input.addEventListener("input", update);

  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) update();
        const n = options.length;
        if (n === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = active === -1 ? (step === 1 ? 0 : n - 1) : (active + step + n) % n;
        setActive(next, true);
        break;
      }
      case "Enter":
        if (open && options.length > 0) {
          e.preventDefault();
          select(active >= 0 ? active : 0);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        } else if (input.value) {
          e.preventDefault();
          input.value = "";
        }
        break;
    }
  });

  input.addEventListener("blur", () => setOpen(false));

  // preventDefault on pointerdown keeps focus on the input so blur does not close
  // the list; selecting on click (not pointerdown) lets touch users scroll it.
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const i = indexFromEvent(e);
    if (i >= 0) select(i);
  });

  list.addEventListener("pointermove", (e) => {
    const i = indexFromEvent(e);
    if (i >= 0 && i !== active) setActive(i);
  });

  return {
    clear() {
      input.value = "";
      results = [];
      options = [];
      list.replaceChildren();
      setOpen(false);
    },
    close() {
      setOpen(false);
    },
    setValue(text: string) {
      input.value = text;
      setOpen(false);
    },
    focus() {
      input.focus();
    },
  };
}
