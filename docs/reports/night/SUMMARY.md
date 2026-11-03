# Night run summary (2026-11-02 → 03)

All 11 tasks were worked; 9 done, 1 done with one part blocked, 1 blocked (investigation only). Nothing was merged to main, tagged, released or deployed to production. Every branch is pushed and has its own Cloudflare Pages preview (branch alias).

**Start here:** **https://night-integration.pnct-map.pages.dev**. Branch `night/integration` is main plus every night branch merged in the order below, with the conflicts resolved (mostly neighbouring insertions), and the full suite green: pytest 131, Vitest 176, e2e 159, none flaky.

| Task | Status | Branch | Preview |
|---|---|---|---|
| 01 Dark-mode slab labels | done | `task/01-dark-slab-labels` | https://task-01-dark-slab-labels.pnct-map.pages.dev |
| 01b "Whole country" button | done | `task/01b-whole-country` | https://task-01b-whole-country.pnct-map.pages.dev |
| 01c Protected areas on slabs | done (flat fallback not built) | `task/01c-protected-on-slabs` (on top of 01) | https://task-01c-protected-on-slabs.pnct-map.pages.dev |
| 02 Dependency bumps | skipped (done in 0.7.1) | — | — |
| 03 Tooling fixes | done | `task/03-tooling-fixes` | https://task-03-tooling-fixes.pnct-map.pages.dev |
| 04 Main cities | done | `task/04-main-cities` | https://task-04-main-cities.pnct-map.pages.dev |
| 05 3D terrain prototype | done (opt-in) | `task/05-terrain` | https://task-05-terrain.pnct-map.pages.dev/?relief=1.5#f=031017 |
| 06 Slope from DGT LiDAR | **blocked: needs Mike** (investigation done) | `docs/06-lidar-slope` | — (no app change) |
| 07 Concelho card v2 | done; IMI **blocked: needs Mike** | `task/07-concelho-card-v2` | https://task-07-concelho-card-v2.pnct-map.pages.dev |
| 08 Shortlist + share URL | done | `task/08-shortlist` | https://task-08-shortlist.pnct-map.pages.dev |
| 09 Bearing swing | done (**off by default**) | `task/09-bearing-swing` | https://task-09-bearing-swing.pnct-map.pages.dev/?swing=1#c=1714 |
| 10 Ideas write-ups | done | `docs/10-ideas` | — (report only) |
| all of the above | integration | `night/integration` | https://night-integration.pnct-map.pages.dev |

Reports: `docs/reports/night/NN-*.md` on each branch (all of them on `night/integration`; copies in the untracked `.night/reports/`). Screenshots: `.artifacts/night*/`.

## What happened, in one line each

- **01:** the dark slab top was bright teal, so labels sat at 1.1:1. Deep teal/grey tops and a 0.75 dark veil bring them to **5.4:1**. Light-mode #333 names went 3.7 → 4.7:1. A Vitest lighting model, matched to read-back pixels, guards it. Also fixed: the rims of a partly-PNCT concelho were hidden under its PNCT tops.
- **01b:** "All" / "Tudo" under −. It clears the selection and eases to the country view (level); it's disabled at the country view. On phones the zoom group now sits above the half-height sheet.
- **01c:** no more glass. The pipeline cuts the overlay per parish (282 KB gzipped, lazy); the selection's protected parts are drawn on the slab top, luminance-matched (AA kept), with RNAP/Natura rims.
- **03:**
  - the screenshot wait covers MapLibre paint transitions;
  - the contact candidates move to the gitignored `data/manual/contacts/`; `make clean` refuses while `data/interim/contacts/` still holds files; `tests/test_clean.py` guards the recipe.
- **04:** OSM `admin_centre` seats (ODbL) matched to CAOP: 18 capitals from the country view, 278 seats from the concelho level, drawn above the basemap labels. **Edge pointers** ("↙ Coruche · 10 km") point to the selection's seat and nearest capital when they're off-screen.
- **05:** Relief toggle (Mapterhorn = DGT LiDAR over Portugal, Terrarium encoding): hillshade + terrain, with the selection draped instead of a slab. Same fps, but **34–42 DEM tiles per selection** (≈ 4–6 MB; 2–3× time to idle on 3G).
- **06:** DGT CDD has a public **STAC API**. MDT-2m is 91,193 tiles of 1 km² (≈ 91 GB), CC BY 4.0; **downloads need a CDD login**. A probe on Manteigas worked via Mapterhorn (511–1,993 m, slope classes). Plan: 10 m slope classes as PMTiles of ~300 MB on R2.
- **07:** INE median sale €/m², IRS gross income per taxpayer and average monthly earnings are in the card (278/278, CC BY 4.0, Portugal's value alongside). Rents (200–233/278), IMI (third-party copy of AT data) and Junta contacts are report-only.
- **08:** ☆ in the panel, a ★ n list (select, remove, copy link), `#list=` links that open as a separate shared list and merge only on "Add to my shortlist".
- **09:** one 6° / 9 s out-and-back turn after a 3D selection lands, cancelled by any user move, never under reduced motion; idle after. No fps or tile cost measured. Off by default.
- **10:** design notes (Emprego Interior MAIS formula, "Ask the câmara" templates, lots pilot, travel times via OSRM/OSM, further layers with licences).

## Decisions for Mike, in priority order

1. **Review `night/integration` on your phone**, then pick a release cut (below). It's the fastest way to see everything together.
2. **01, dark look:** keep the deep slab + 0.75 veil (shipped), or brighten the dark place labels to ~#d4d4d4 (a global label change), which allows a mid-teal slab that stands out more. See the 01 report.
3. **04, edge pointers + labels above basemap labels:** both go beyond the literal task. Keep or drop. Also: the ODbL-derived `web/data/cities.json` is committed.
4. **08, shortlist naming and merge:** "Favoritos" in PT; "Add to my shortlist" merges rather than replaces.
5. **06 / 05, terrain and slope hosting:**
   - **CDD account** (DGT LiDAR download) and an **R2 bucket** (~300 MB PMTiles, likely €0/month) for slope;
   - confirm **Mapterhorn's terms** before Relief ships;
   - lower the DEM maxzoom for phones.
6. **07, IMI:** use the third-party CC BY CSV of AT's rates, ask AT, or skip. 8 municipalities set the rate per parish. Rents: show where available (233/278) or keep out.
7. **09, swing default:** on (perf shows no cost) or off (battery, plus 9 s of camera motion after every selection; tests would need `?swing=0`).
8. **01c:** the hover pop-up hides the hovered parish's protected parts; the tint strength is tunable. The flat fallback wasn't compared.
9. **Licence questions to batch:**
   - ICNF: RNAP (already open) and the fire hazard map;
   - ANACOM: fibre;
   - APA: flood risk;
   - IEFP: monthly unemployment.
10. **03:** after merging, delete `data/interim/contacts/` (the copies are in `data/manual/contacts/`; the backup is in `.night-backup/`).

## Suggested merge / release order

`night/integration` merges them in this order. Each step was also merge-tested; conflicts were only neighbouring additions:

1. **0.7.2 (fixes):** 01 → 01c → 03. 01c is built on 01.
2. **0.8.0 (features):** 01b → 07 → 04 → 08. 04 needs 01 for label contrast on dark slabs.
3. **Behind flags, any time after:** 05 (Relief, opt-in; after Mapterhorn's terms) and 09 (swing, off).
4. **Docs:** 06, 10.

The simplest route: fast-forward `main` to `night/integration` after your review. It's built on today's main and contains everything, so cut 0.8.0 from it. Or merge the task branches in the order above (`main` only fast-forwards, so rebase each on the previous).

## Things to know

- **INE cache:** task 07 refetched the gitignored `data/external/ine/` with three extra indicators. On `main` (and on branches cut from it), `test_estimates_come_from_the_current_series` now fails locally, because it compares the cache's query list exactly. Merging 07 fixes it. For task 09's suite run I set `fetch.json` aside temporarily and restored it.
- `make clean` was never run. `.night-backup/contacts-2026-11-02/` is untouched; `data/interim/contacts/` is untouched; copies are in `data/manual/contacts/`.
- The throwaway worktree for the integration branch lives in the session scratchpad (not in the repo). `git worktree prune` cleans it up once that folder is gone.
- No paid services, no accounts created, no scraping. Network use: INE, Overpass (one query), the dados.gov.pt API, the DGT STAC metadata (search only), Mapterhorn tiles (preview + one 100-tile probe).
