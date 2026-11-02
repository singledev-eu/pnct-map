# 05: 3D terrain, investigation and prototype (preview only)

**Status:** done (prototype) · **Branch:** `task/05-terrain` (from main) · **Preview:** https://task-05-terrain.pnct-map.pages.dev (Relief is off by default: press the ⛰ button next to "3D", or open `?relief=1.5#f=031017`)

## Source

- **Mapterhorn** (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`): free, no key. TileJSON: Terrarium encoding, 512 px WebP. Over Portugal tiles exist up to **z17** (probed z8–17 over Serra da Estrela), because **its Portugal source is DGT's LiDAR DEM at 0.5 m (CC BY 4.0)**; Copernicus GLO-30 elsewhere (Spain border areas etc.). Source list: https://download.mapterhorn.com/attribution.json. Relevant to task 06 too.
- **Fallback:** AWS Terrain Tiles (`s3.amazonaws.com/elevation-tiles-prod/terrarium`, 256 px PNG, z15), via `?dem=aws`.
- `encoding: "terrarium"` is set explicitly on both (the e2e test checks it).
- **Attribution:** map control ("© Mapterhorn (DGT LiDAR CC BY 4.0 · GLO-30 © Copernicus)", only while relief is on), the phone sheet credit ("Relief © Mapterhorn") and the About panel ("Relief (when switched on)"). Row added to `data/ATTRIBUTION.md`. Mapterhorn doesn't state a licence for its tiles themselves, only for its sources: confirm before shipping.
- CSP (`public/_headers`): `connect-src` gains `https://tiles.mapterhorn.com https://s3.amazonaws.com`.

## Prototype (conservative version)

- `web/src/terrain.ts`: a "Relief" setting, off by default and kept in localStorage, with a two-peaks button next to "3D" (`aria-pressed`, "Relief: on/off" / "Relevo: ligado/desligado"). When on:
  - **hillshade** under the app's fills (theme-tuned; also works with 3D off / flat);
  - **terrain** (`setTerrain`, exaggeration **1.5** by default; `?relief=1|1.5|2` for review);
  - **a separate mode from the slabs:** no slab, rims or veil (`slabTarget` returns null); the selection is drawn **draped** (its ground fill and outline follow the relief). The selected fill is lightened (parish 0.85 → 0.3, concelho 0.7 → 0.25) so the shading shows through it. The camera tilt still follows the 3D setting.
  - Survives theme switches (re-applied on `style.load`).
- Two DEM sources over the same tiles (terrain and hillshade), as MapLibre recommends. DEM maxzoom 14.

## Screenshots

`.artifacts/night05/`:
- `desktop-light-{estrela,geres,alentejo}-{off,x1,x1.5,x2}.png`;
- `desktop-dark-*-x1.5.png`, `phone-light-*-x1.5.png`, `desktop-light-country-x1.5.png`;
- `review.png` (Estrela/Gouveia ×1.5, Gerês/Vilar da Veiga ×2, Alvalade ×1.5, phone Gerês).

Gerês and Serra da Estrela read well at 1.5–2; the flat Alentejo parish barely changes (expected).

Script: `web/scripts/terrain_shots.mjs`.

## Performance (phone profile: Pixel 7, Fast 3G, 4× CPU; 2 runs, medians; `web/scripts/perf_relief.mjs`, data in `docs/perf/night05-relief.json`)

| Step | Relief | fps | worst frame | idle (ms) | basemap tiles | DEM tiles |
|---|---|---|---|---|---|---|
| select concelho (Vila Real) | off | 55 | 100 | 18 476 | 13 | 0 |
| | on | 55 | 83 | 33 104 | 14 | 34 |
| select parish (Mateus) | off | 60 | 33 | 11 405 | 19 | 0 |
| | on | 60 | 33 | 31 530 | 24 | 42 |
| close | off | 61 | 17 | 1 042 | 0 | 0 |
| | on | 61 | 17 | 21 790 | 4 | 9 |

The animation frame rate is unchanged. The cost is **network**: 34–42 DEM tiles per selection at ~100–150 KB each (≈ 4–6 MB), so on Fast 3G the map takes 2–3× longer to finish loading.

## Recommendation

Ship Relief **only as an opt-in toggle** (as here), never default-on. Before shipping:
1. lower the DEM maxzoom to 12–13 for the terrain source (hillshade can stay higher), to cut the tile count about 4×;
2. consider hillshade-only (no `setTerrain`) on phones;
3. confirm Mapterhorn's terms, or self-host a Portugal-only PMTiles extract (see task 06).

## Tests

pytest 114 · Vitest 146 · e2e **142**:
- `relief.spec.ts`: off by default; the button turns on terrain with the terrarium source and hillshade; the slab is emptied; remembered across a reload; off removes everything; `?relief=2&dem=aws` uses the exaggeration and the fallback and survives a theme switch;
- `mobile-attribution` updated for the new sheet credit.

None flaky.

## Decisions for Mike

1. Keep Relief as a separate opt-in mode (implemented), or merge it into "3D"?
2. Default exaggeration 1.5 (1.0 looks flat at parish zoom; 2.0 is dramatic in Gerês).
3. Mapterhorn terms / self-hosting (above). **Not suitable for default-on on mobile data** as is.
