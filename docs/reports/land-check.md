# Land check v1: report

2026-11-15 · branch `feat/land-check` (8 commits, not merged, not pushed) · preview: https://preview.pnct-map.pages.dev (deploy `5a9aaf40`) · production untouched.

## What was built

Click any point of mainland Portugal and get a short report for land buyers.

- **"Check a spot"** toolbar toggle (a target icon on phones). In this mode a click, or **Enter** at the centre crosshair, reports on that point; **Esc** leaves the mode. Turning the mode on clears any selection and levels the camera, so every click lands on flat ground.
- **Report panel** (side panel on desktop, bottom sheet on phones):
  - the coordinates and a shareable link with a **Copy link** button;
  - **PNCT:** yes/no badge, plus the parish, concelho and district, with "Open the parish panel";
  - **Wildfire hazard:** the ICNF class as a badge in ICNF's own colours ("Very high (5 of 5)"), with black or white text chosen for contrast. Built-up land and water show **"Not classified"**, never "low", with the reason from ICNF's methodology. The note says it is a hazard classification, not a building rule;
  - **Not checked yet:** REN and fixed broadband, with the reason;
  - the existing **Idealista links** for PNCT parishes;
  - **Sources:** ICNF title, dataset date, download date, licence, and CAOP/IEFP, followed by the disclaimer "Indicative only. Confirm with the câmara (PDM, licensing) before buying."
  - At sea or in Spain: **"Outside mainland Portugal"**, with no other facts.
- **Shareable** as `#chk=lat,lon` (the app's hash router). `/check?lat=..&lon=..` links are rewritten to it, and `?lang=` is kept.
- **Hazard overlay:** a legend toggle with ICNF's five-colour swatch, off by default (`hz=1`). It survives theme switches.
- PT/EN (new glossary terms added), light and dark, keyboard access, and phones (16 px inputs, 44 px targets).
- ICNF is credited in the map attribution, the phone sheet credit and About, in ICNF's required citation form (layer, URL, download date).

## Dataset status

| Fact | Status | Why |
|---|---|---|
| PNCT parish | **OK** | Already in the repo (IEFP list 2026-02-04, CAOP 2025) |
| Wildfire hazard 2020–2030 (ICNF, structural) | **OK** | ICNF geoCATÁLOGO GeoTIFF, 25 m, EPSG:3763, open data with attribution, SRUP record 2022-03-28, 19.5 MB zip, SHA-256 pinned |
| REN | **BLOCKED** | DGT SRUP WFS down (HTTP 500 "Unable to connect to the database", 2026-11-15; WMS timed out). Licence conflict: dados.gov.pt says CC BY, SNIT metadata says "consultation and viewing only". Coverage per municipality unknown. |
| ANACOM fixed coverage | **BLOCKED** | Only a WMS view service (ArcGIS `capabilities: Map`, no query); no file resource, no licence. The spatial unit is the **address**, not BGRI. |

Details, URLs and what a full REN download would take: [docs/land-check/DATA.md](../land-check/DATA.md).

Rejected on the way:
- The dados.gov.pt "Risco de Incêndios Rurais" resource is a WFS on a bare IP (`23.95.164.237`), not an ICNF host.
- The DGT zip URL in the SRUP record returns 404.

## Architecture and why

**No server code.** Everything is static on Cloudflare Pages and the lookup runs in the browser.

1. **Parish and PNCT:** a point-in-polygon test (even-odd over all rings, so enclaves work) on the CAOP display geometry the map has already loaded. No extra download.
2. **Hazard value:** the point is projected to PT-TM06 in the browser (Krüger series; within 1 mm of pyproj at 8 fixtures). The app then reads **the ICNF 25 m source cell itself** from one ~6–9 KB zlib chunk file. A bitmap in the bundled meta says which chunks exist, so empty areas cost no request.
3. **Overlay:** static web-mercator PNG tiles, z5–z11, as a plain MapLibre raster source. Display only: a value shown in the panel never comes from a tile.

**Why not PMTiles or a Worker:**
- The first build used one PMTiles archive plus an indexed lookup file read over HTTP Range. The first preview deploy disproved it. Pages answers Range with **200 and the whole file**: measured on `*.pages.dev`, and documented ("Pages currently returns 200 responses for HTTP range requests").
- Under that build, lookups still gave the right answer (the reader falls back to slicing), but downloaded 13.5 MiB each, and the pmtiles library refused the 200, so the overlay failed.
- The `206` I first saw on pnct.singledev.eu came from the custom domain's zone cache, which is not a basis to build on. The fix is in its own commit (`5ef5fd7`).
- A Pages Function slicing the asset would read megabytes per request. R2 would work, but needs your bucket, domain, CORS and CSP setup ([HOSTING.md](../land-check/HOSTING.md) has the steps). Static files are the simplest option that works today.

**Why the native grid and not the web tiles:** both were measured.
- A lookup on z11 web tiles agreed with the source cell at only **93.3%** of 3,000 random points (the 25 m map is speckled).
- z12 would be exact-ish but came to **35.1 MiB** as one archive.
- The native grid is **exact**: 3,000 of 3,000 random cells match (pytest).

## File sizes and hosting

| Files | Count | Size | Per request |
|---|---|---|---|
| `landcheck/hazard-5fc08baa/{z}/{x}/{y}.png` (overlay, z5–z11; 678 tiles with a class, empty ones share one transparent PNG) | 1,154 | 15.8 MiB | tiles up to ~37 KB |
| `landcheck/hazard-cells-d2022670/<i>.bin` (lookup, 2,363 of 4,004 chunks) | 2,363 | 13.5 MiB | one ~6–9 KB file per check |
| `web/data/landcheck.meta.json` (bundled, committed) | 1 | ~3 KB | — |

- Hosting: Cloudflare Pages, from the gitignored `web/public/landcheck/` (out of git). Directory names are content-hashed, and `/landcheck/*` is `immutable`.
- Limits: 3,517 files against Pages' 20,000 (free plan), every file far under 25 MiB. pytest asserts both.
- `npm run deploy` and `deploy:preview` run `check_landcheck.mjs` first, so a deploy can't ship without the files. Build them with `uv run make landcheck`.
- The JS bundle gained only the panel code; the pmtiles dependency was removed again.

## Verification

Every row is the app on the preview deploy (`landcheck_shots.mjs`, desktop/phone × light/dark), checked against the ICNF source raster (pytest and Vitest use the same points). Each check fetched exactly one chunk file (HTTP 200, `application/octet-stream`).

| Point | Lat, lon | Parish (concelho) | PNCT | Hazard (app = source) | Expected | Confirm by hand |
|---|---|---|---|---|---|---|
| Pedrógão Grande, rural | 39.92681, −8.15187 | Pedrógão Grande (Pedrógão Grande) | Yes | **Very high (5)** | high/very high ✔ | Hazard: ICNF geoCATÁLOGO viewer https://geocatalogo.icnf.pt/ (theme 5, "Carta de perigosidade de incêndio rural 2020-2030") or SNIT overlays https://snit-mais.dgterritorio.gov.pt/PortalSobreposicoes · REN: https://snit-sgt.dgterritorio.gov.pt/ren · fibre: https://geo.anacom.pt |
| ↳ 10 km window around it (source) | — | — | — | 75% of the cells are class 4–5 | — | same |
| Pedrógão Grande, Vila Facaia (source/tests) | 39.90300, −8.22100 | — | — | Medium (3) | — | same |
| Porto, Avenida dos Aliados | 41.14960, −8.61100 | União das freguesias de Cedofeita, Santo Ildefonso, Sé, Miragaia, São Nicolau e Vitória (Porto) | **No** ✔ | **Not classified** (source: no data) | "low" ✘, see note 1 | ICNF/SNIT as above · fibre: GEO.ANACOM "Coberturas disponíveis" https://geo.anacom.pt (not in v1, BLOCKED) |
| Bragança, França (rural) | 41.89600, −6.73300 | França (Bragança) | Yes | **Very high (5)** | — | ICNF/SNIT/GEO.ANACOM as above |
| Bragança, Rio de Onor | 41.94000, −6.61300 | União das freguesias de Aveleda e Rio de Onor (Bragança) | Yes | **High (4)** | — | same |
| Atlantic | 39.50000, −10.00000 | — | — | **Outside mainland Portugal** ✔ | graceful ✔ | — |
| Spain (Cáceres) | 40.00000, −6.00000 | — | — | **Outside mainland Portugal** ✔ | graceful ✔ | — |

Notes:
1. **Porto is not "low".** The ICNF map classifies only farm, forest and scrub land (methodology, 2020-04-03, Table 1), so central Porto and Lisbon have no class. The app says "Not classified" with that reason. Showing "low" would be an invented value.
2. Fibre has no row because ANACOM coverage is blocked. GEO.ANACOM is listed so you can check by hand.

**Tests:**
- pytest 145: 14 new land check tests (meta vs files, presence bitmap, every tile in the bounds exists, the 7 points, 3,000 random cells exact).
- Vitest 251: 35 new (projection, cell index, chunk fetch rejects error statuses and HTML fallbacks, bitmap, point-in-polygon with holes, URL parsing, the points on the real files).
- e2e 171: 7 new in `landcheck.spec.ts`: link report, not-classified, outside, `/check?` rewrite with `?lang`, mode by mouse and keyboard, Esc, selection ends the mode, panel close, PT re-render, overlay toggle and `hz=1` across a theme switch.
- Two existing specs pin the credit text and were updated for the new ICNF credit.
- The full suite passed twice inside `deploy:preview`, with no flaky tests.

## Commits

1. `b73de3e` Phase 0 data findings (DATA.md)
2. `9407306` Pipeline: ICNF hazard → overlay + exact grid
3. `78993c0` Lookup (landcheck.ts, deploy guard, cache header)
4. `6c3d0d9` UI (mode, panel, overlay, `#chk=`)
5. `a968317` Roadmap: Land check section
6. `f63b23a` Docs: README, changelog (unreleased), CLAUDE.md
7. `5ef5fd7` Hosting fix: plain static files, because Pages ignores Range
8. this report

## Open issues

- **REN and broadband stay blocked.** REN needs DGT's written terms and a working WFS. ANACOM needs a bulk file under Lei 26/2016. Both are listed in `landcheck_config.BLOCKED` and shown as "not checked yet".
- **Hazard legal status:** shown strictly as a classification. If ICNF publishes a newer structural map, bump the SHA-256 in `landcheck_config.py`; the fetch fails loudly on any change.
- **Parish boundaries:** the parish comes from the simplified display geometry (~5 m quantization). Within a few metres of a parish boundary the answer can differ from full-resolution CAOP.
- **Datum:** ETRS89 is treated as WGS84 (under 1 m, far below the 25 m cell).
- **Sea and Spain points:** the camera limits keep the view over Portugal, so the marker for a point far out at sea can sit just off screen. The panel still says "Outside mainland Portugal".
- **Fresh clones** show "Could not load the hazard data" until `make landcheck` runs. Deploys refuse to run without the files.
- **Side finding:** ICNF's geoCATÁLOGO states open-data terms (free reuse with citation). If RNAP is fetched from geoCATÁLOGO rather than `sigservices`, that may settle the roadmap's open "confirm ICNF's reuse terms for RNAP" item. Not changed here.
- **Not done (per the rules):** no production deploy, no merge to `main`, no push. The branch fast-forwards cleanly. Next: check the preview on your phone, then merge and release.
