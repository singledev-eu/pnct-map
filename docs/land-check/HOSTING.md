# Land check: where the data files live

`make landcheck` writes two directories of plain static files into `web/public/landcheck/`, which is gitignored. Vite copies them into `dist/landcheck/`, and Cloudflare Pages serves them with the rest of the site. Nothing else is involved: no R2 bucket, no Worker, no Pages Function, no HTTP Range.

| Directory | What | Files | Size | Read by |
|---|---|---|---|---|
| `hazard-<sha8>/{z}/{x}/{y}.png` | Map overlay: web-mercator palette PNGs, 512 px, z5–z11. All 1,154 tiles inside the overlay bounds exist: 678 hold a class, and the rest share one transparent PNG, so the map never requests a missing path. | 1,154 | 15.8 MiB | MapLibre, as a plain raster source (`tiles`, `bounds`) |
| `hazard-cells-<sha8>/<i>.bin` | Point lookup: the ICNF 25 m grid in EPSG:3763, one zlib file per 256 × 256-cell chunk. Only the 2,363 chunks (of 4,004) that hold a class are files; the meta's `present` bitmap says which. | 2,363 | 13.5 MiB | `web/src/landcheck.ts`: one GET of ~6 KB per lookup, cached in memory |

`web/data/landcheck.meta.json` is committed and bundled. It names both directories, with their file counts, sizes and tree SHA-256s, the grid parameters, the presence bitmap, the source, the licence and the dates.

## Why plain files, and not PMTiles or one indexed file

The first version used a PMTiles archive for the overlay and one indexed `.bin` read with HTTP Range for the lookup. The preview deploy disproved that design:

- `curl -H "Range: bytes=0-16015"` against `preview.pnct-map.pages.dev` returned **200 with the whole file** for both files (14.2 MB and 16.5 MB), and also for `.png` and `.svg`. Cloudflare documents this: *"Pages currently returns `200` responses for HTTP range requests"* (Pages, "Serving Pages"). Workers static assets do the same.
- The `206` seen earlier on `pnct.singledev.eu` came from the custom domain's zone cache (`cf-cache-status: REVALIDATED`) on a file it already held. Nothing should depend on that.
- With 200s, the lookup still gave the right answer (the reader sliced the full body), but its first request downloaded 13.5 MiB. The `pmtiles` library refused the 200, so the overlay failed.

Plain files avoid Range altogether. They are also faster: a lookup is one ~6 KB request instead of an index request plus a chunk request.

**Limits.** Pages allows 20,000 files per deploy on the free plan and 25 MiB per file. The land check adds 3,517 files, all under 15 KB. `tests/test_landcheck.py` checks both limits.

**Caching.** Each directory name carries the first 8 hex digits of a SHA-256 over its files, so `/landcheck/*` is cached as immutable in `web/public/_headers`, like `/assets/*`. A rebuild with different data gets new names.

## Fresh clone, CI and deploys

- A fresh clone has the meta but not the files. `npm run dev` and `npm run build` still work. A land check then reports the hazard as "Could not load the hazard data", because a missing chunk gets the HTML fallback page, which the reader rejects. The overlay toggle shows its error.
- `npm run deploy` and `npm run deploy:preview` run `scripts/check_landcheck.mjs` first. It recomputes each directory's file count, size and tree SHA-256 and fails on any difference, so a deploy never ships without the files. Build them with `uv run make landcheck` (it downloads the 19.5 MB ICNF zip once).

## If a single archive is wanted later (PMTiles, a z12 overlay)

A single archive needs a host that serves Range: R2. This is not set up, and the user runs the `wrangler` steps.

1. `npx wrangler@4.149.0 r2 bucket create pnct-map-data`
2. Connect a custom domain to the bucket (e.g. `data.pnct.singledev.eu`) in the dashboard. R2 serves `206` for Range. Avoid `r2.dev`, which is rate-limited.
3. CORS on the bucket: `GET` and `HEAD` from `https://pnct.singledev.eu` and `https://*.pnct-map.pages.dev`, `Range` as an allowed header, and `Content-Range, Content-Length, ETag` exposed.
4. Upload with `npx wrangler@4.149.0 r2 object put pnct-map-data/landcheck/<file> --file <file> --remote`.
5. Add the domain to `connect-src` (and `img-src` for tiles) in the CSP in `web/public/_headers`, and read the files from that origin. For PMTiles, that also means the `pmtiles` protocol in the browser.
