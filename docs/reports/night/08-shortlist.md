# 08: Shortlist with a shareable URL

**Status:** done · **Branch:** `task/08-shortlist` (from main) · **Preview:** https://task-08-shortlist.pnct-map.pages.dev

## What it does

- **Star** (☆/★, `aria-pressed`) in the panel header for the open parish or concelho: "Add to shortlist" / "Adicionar aos favoritos".
- **"★ n" button** in the toolbar (after "Only PNCT"). It's hidden while the list is empty and opens a small list:
  - name and context ("Erra · Coruche", "Odemira · Concelho · Beja");
  - click to select (flies there; on phones the list closes);
  - × to remove;
  - a read-only field with the share link plus **Copy link** (Clipboard API; if that's refused, the link is selected for a manual copy).
- **Storage:** `localStorage["pnct-map:shortlist"]`, a JSON array of DICOFRE/DICO codes, every access in try/catch. It falls back to a page-only list.
- **Share link:** `…/#list=140911,0211` (only the list, none of the sender's other state). Codes are validated (4 or 6 digits, known to the data, de-duplicated, max 60).
- **Opening a shared link** shows **"Shared shortlist (n)"** with "Someone shared this list with you. Your own shortlist is unchanged."
  - The list is read-only: no remove buttons.
  - **"Add to my shortlist"** merges it after the receiver's own entries. Then `list=` is removed from the URL.
  - × dismisses it without saving.
  - Unknown codes are dropped.
  - Pasting a list link into an open tab works too (hashchange).
- PT/EN strings ("Favoritos"; glossary rows added), both themes via the existing tokens. On phones the list is a full-width card under the toolbar. Escape closes it.

## Files

`web/src/shortlist.ts` (new) · `panel.ts` (star, `refreshStar`) · `main.ts` (wiring, hashchange) · `hash.ts` (`list`) · `index.html` (button and popover) · `style.css` · `strings*.ts` · `docs/i18n-glossary.md` · `web/scripts/shortlist_shots.mjs`.

## Tests

- Vitest **150**: `shortlist.test.ts` covers parsing, cap, storage incl. broken/blocked storage, merge, share URL.
- e2e **144**: `shortlist.spec.ts` covers:
  - star parish and concelho → list → select → remove → persists across reload;
  - a PT shared link with the receiver's own list: shown apart, storage untouched, unknown codes dropped, read-only; "add" merges and clears `list=`;
  - dismiss keeps the own list;
  - phone: the list fits 390 px and picking closes it.
- pytest 114. None flaky.

Screenshots: `.artifacts/night08/{desktop,phone}-{light,dark}-{own,shared-pt}.png` and `review.png`.

## Decisions for Mike

1. **"Add to my shortlist" merges** (conservative: nothing of the receiver's is lost). The alternative is "Replace my list with this one".
2. PT name: **"Favoritos"** (clear and common) vs. a literal "Lista curta" / "Seleção".
3. A shortlist only lives in the browser (and links); no accounts or sync, by design.
4. Possible follow-up: a "compare" view (population, protection and price side by side) once task 07's fields are in.
