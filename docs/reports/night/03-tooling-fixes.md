# 03: Tooling fixes

**Status:** done · **Branch:** `task/03-tooling-fixes` (from main) · **Preview:** https://task-03-tooling-fixes.pnct-map.pages.dev (no user-facing change)

## 1. Screenshot wait and paint transitions

`web/scripts/settled.mjs` now also waits until MapLibre has no paint transition running: `map.style.hasTransitions()`, which is true while any layer, the light, the sky or the projection is mid-transition. That covers the 300 ms label/fill fade after a theme switch and the slab's 1.4 s rise. If a future MapLibre drops that method, it falls back to waiting out the longest transition the app sets (1.4 s) plus 300 ms.

**Proof, honestly reported:** I re-shot `interplay-theme-switch` three times with the old wait and three times with the new one (`.artifacts/night03/{before,after}-N/`). All six are pixel-identical. On this machine the theme switch's style diff and tile load take about 390 ms, longer than the 300 ms fade, so the old checks (camera still, `loaded()`) only passed once the fade was done; a probe confirmed `hasTransitions()` was already false at that moment in 5/5 runs. The race needs fast or cached tiles, a slow CPU, or a transition with no tile load (a hover pop-up, a slab change at rest), and the new check closes it in those cases. It adds no wait when nothing is transitioning.

## 2. The clean step and hand-maintained data

What the files are: `data/interim/contacts/batch-*.csv` is the output of `scripts/contacts_candidates.py`, câmara contact candidates scraped from câmara sites and annotated by reviewers. They contain many role-specific mailboxes (presidente.am@…, rh@…), so **they stay untracked**: not committed, per "nothing that looks private".

Changes:
- `contacts_candidates.py` now writes to **`data/manual/contacts/`**, gitignored and outside every clean target.
- `.gitignore`: `data/manual/` (the old `data/interim/contacts/` entry is kept for old checkouts).
- `Makefile` `clean`: **refuses** (exit 1, with a message) while `data/interim/contacts/` still holds files. The rm list is unchanged otherwise.
- `tests/test_clean.py` (4 tests) reads the recipe with `make -n clean`, without running it:
  - the clean has an rm;
  - no rm path is or contains `data/contacts`, `data/contacts/camaras.csv`, `data/manual` or `data/manual/contacts`;
  - the refusal guard is present;
  - the script writes outside `data/interim`.
- `CLAUDE.md`: `data/manual/` described.
- **Local files:** copied (`cp -p`) to `data/manual/contacts/`. The originals in `data/interim/contacts/` are left in place on purpose (nothing deleted). The backup `.night-backup/contacts-2026-11-02/` is untouched. As long as the originals are there, `make clean` refuses, which is the safe default.

## Tests

pytest 118 (4 new) · Vitest 146 · e2e 140 passed, none flaky.

## Decisions for Mike

1. Once this is merged, delete `data/interim/contacts/` yourself (the copies are in `data/manual/contacts/`); `make clean` works again after that.
2. `make clean` still removes `web/data/` (committed: git restores it, and `make all` rebuilds it). Leave it, or limit clean to the gitignored intermediates?
3. Commit the reviewed candidates? Only if they're reduced to generic mailboxes; today they aren't.
