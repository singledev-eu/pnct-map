# 04: Main cities on the map

**Status:** done · **Branch:** `task/04-main-cities` (from main) · **Preview:** https://task-04-main-cities.pnct-map.pages.dev

## Data

| | |
|---|---|
| Source | OpenStreetMap: the `admin_centre` node of each municipality relation (`boundary=administrative`, `admin_level=7`) |
| How | One Overpass API query (`scripts/fetch_cities.py`; not scraping, OSM's public API), cached in the gitignored `data/external/osm/` with `fetch.json` (endpoint, query, licence, OSM base timestamp, fetch time) |
| Licence | **ODbL 1.0**, © OpenStreetMap contributors. Already credited in the map attribution, sheet credit and About ("Data from OpenStreetMap"). `web/data/cities.json` is a derived database under ODbL; row added to `data/ATTRIBUTION.md` |
| Matching | `scripts/build_cities.py`: each seat matched to the CAOP 2025 concelho it lies in (point in polygon, EPSG:3763); islands drop out. The build **fails** unless all 278 mainland concelhos have exactly one seat (they do). District capital = the seat of the concelho named like its district (18). |
| Names | OSM's names, never translated; the 2 that differ from CAOP only in accents ("Vila Nova de Foz Coa", "Castanheira de Pera") take CAOP's spelling |
| Size | 40 KB raw, fetched lazily (`?url`, content-hashed) right after start |

`make cities` / `make cities-fetch` (REFRESH=1); `make all` includes it.

## On the map

- **Layers** (`web/src/cities.ts`): `city-capitals` (bold 14 px, larger dot, from the country view) and `city-seats` (12 px, from level zoom − 1.5, i.e. about the concelho level, kept in step on resize). They are symbol layers with a dot icon (generated per theme, like the hatches) and variable-anchor labels with collision. Dark text on a white halo (light), light text on a black halo (dark).
- **Above everything:** the two layers carry `metadata: {"pnct:top": true}` and go above the basemap's own labels (`withAppLayers`/`addLayers`). Ours are placed first in collisions, so the basemap's duplicate "Coruche" label is the one that gives way. They draw over slabs (labels only, allowed by the 3D invariant; `drill.test.ts` updated).
- **Edge pointers** (the part that answers "zoomed into Erra, Coruche and Santarém aren't visible"). In the fitted Erra view, Coruche town is just off-screen and Santarém is 32 km away, so no map label can show them. While something is selected, its concelho seat and the nearest district capital get a small pill at the edge of the visible area when they're off it: an arrow towards the town, plus "Coruche · 10 km" (distance from the selection's centre). The visible area excludes the toolbar, the panel or sheet, and the legend. Pills are `role="img"` with an aria-label ("Coruche, 10 km away, off the map" / "a 10 km, fora do mapa").
- **Legend:** "Towns (concelho seats)" / "Sedes de concelho", with a dot swatch and a checkbox (default on, remembered in localStorage, try/catch).

## Contrast (labels on slab tops; text #111827 light / #f3f4f6 dark)

| Palette | PNCT slab | neutral | pop |
|---|---|---|---|
| main, light | 5.15 | 8.46 | 9.29 |
| main, dark | **2.08** | 4.08 | **1.18** |
| task 01, light | 6.59 | — | — |
| task 01, dark | 12.3 | 12.3 | 10.8 |

On main's current dark palette the labels fail on slabs, the same bug task 01 fixes. **Merge 01 before 04**; with it, everything is ≥ 6.5:1.

## Screenshots

`.artifacts/night04/<device>-<scheme>-<view>.png` (views: country, erra, coruche, erra-pt) and `.artifacts/night04/review*.png`. Script: `web/scripts/cities_shots.mjs`.

## Tests

- pytest **119**: `tests/test_cities.py` checks 278 unique seats = the concelhos, the 18 capitals by name, points on mainland, Coruche = 1409, the accents rule, source and licence.
- Vitest **151**: `cities.test.ts` (counts, Erra → Coruche + Santarém, distance, edge geometry, zoom ranges); the layer-order and pattern-image tests updated; the UI-text guard now skips `"text-font"` lines (font names).
- e2e **144**: capitals rendered at the country view and top of the style; Erra → Coruche and Santarém on the map or pointed at; the toggle hides layers and pointers and persists; PT label. None flaky.

## Decisions for Mike

1. **Edge pointers** are beyond the literal ask (a layer). Without them, Coruche isn't visible when Erra is selected. The alternative is to widen the fit to include the seat, which changes the agreed framing.
2. **Labels above the basemap's labels**: ours win collisions. The alternative (below the basemap labels) keeps the basemap's priorities, but seats then often disappear behind village names.
3. **ODbL derived database committed** (`web/data/cities.json`): fine for a public repo with attribution. Say if you'd rather fetch it at build time only.
4. Seat zoom (level − 1.5) and sizes are guesses; tune in `cities.ts`.
