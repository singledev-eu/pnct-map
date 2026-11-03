# Night run progress (2026-11-02 → 03)

Untracked on purpose (lives across branch switches). Each task's report is committed on its own branch and copied to `.night/reports/`.

| Task | Status | Branch | Preview | Summary |
|---|---|---|---|---|
| 01 dark slab labels | done | task/01-dark-slab-labels | https://task-01-dark-slab-labels.pnct-map.pages.dev | Deep dark slab tops + 0.75 dark veil: place labels 5.4:1 (was 1.1); light #333 4.7 (was 3.7); partial-concelho rims fixed; contrast.test.ts |
| 01b whole-country button | done | task/01b-whole-country | https://task-01b-whole-country.pnct-map.pages.dev | All/Tudo under −: clears selection, eases to country view; phone zoom group above half sheet |
| 01c protected areas on slabs | done | task/01c-protected-on-slabs (based on task/01) | https://task-01c-protected-on-slabs.pnct-map.pages.dev | Opaque slabs; per-parish overlay cut (282 KB gz, lazy) drawn on slab top, luminance-matched tints + rims; flat fallback not built |
| 03 tooling fixes | done | task/03-tooling-fixes | https://task-03-tooling-fixes.pnct-map.pages.dev | settled.mjs waits for paint transitions; contacts candidates → data/manual/contacts (untracked), clean refuses on legacy dir, test_clean.py |
| 04 main cities | done | task/04-main-cities | https://task-04-main-cities.pnct-map.pages.dev | OSM admin_centre seats (ODbL) matched to CAOP: 18 capitals + 278 seats above basemap labels, edge pointers for off-screen seat/capital, legend toggle |
| 05 3D terrain prototype | done | task/05-terrain | https://task-05-terrain.pnct-map.pages.dev | Opt-in Relief (Mapterhorn = DGT LiDAR in PT, terrarium): hillshade+terrain, draped selection; same fps, but 34–42 DEM tiles/selection (2–3× idle on 3G) |
| 06 LiDAR slope investigation | blocked: needs Mike | docs/06-lidar-slope | n/a (no app change) | CDD STAC: 91k 1-km MDT-2m tiles (91 GB), CC BY 4.0, login for downloads; Manteigas probe via Mapterhorn; plan: 10 m slope PMTiles ~300 MB on R2 |
| 07 concelho card v2 data | done (IMI blocked: needs Mike) | task/07-concelho-card-v2 | https://task-07-concelho-card-v2.pnct-map.pages.dev | INE sale €/m², IRS income/taxpayer, avg earnings in the card (278/278, CC BY); rents 200–233/278, IMI third-party, Junta contacts: report only |
| 08 shortlist | done | task/08-shortlist | https://task-08-shortlist.pnct-map.pages.dev | Star in panel, ★ n list, #list= shared view that merges only on request; PT/EN, phone, e2e |
| 09 3D bearing swing | done (off by default) | task/09-bearing-swing | https://task-09-bearing-swing.pnct-map.pages.dev/?swing=1 | 6°/9 s out-and-back once, cancelled by user moves; no fps/tile cost; off pending Mike |
| 10 ideas write-ups | done | docs/10-ideas | n/a (report only) | Notes: EIM calculator (formula + citation), Ask-the-câmara templates, lots pilot, travel times (OSRM/OSM), layers table; licence asks batched |
