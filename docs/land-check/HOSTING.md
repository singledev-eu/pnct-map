# Land check: where the data files live

`make landcheck` writes two files into `web/public/landcheck/`, which is gitignored. Vite copies them into `dist/landcheck/`, and Cloudflare Pages serves them with the rest of the site. Nothing else is involved: no R2 bucket, no Worker, no Pages Function.

| File | What | Size | Read by |
|---|---|---|---|
| `hazard-<sha8>.pmtiles` | Map overlay: web-mercator PNG tiles, 512 px, z5–z11 (678 tiles) | 15.7 MiB | MapLibre, through the `pmtiles` protocol (HTTP Range) |
| `hazard-cells-<sha8>.bin` | Point lookup: the ICNF 25 m grid in EPSG:3763, as 256 × 256-cell zlib chunks behind a uint32 offset index | 13.5 MiB | `web/src/landcheck.ts`: one Range request for the 16 KB index (once), one for the ~6 KB chunk |

`web/data/landcheck.meta.json` is committed and bundled. It names both files and carries the grid parameters, the source, the licence and the dates.

## Why Pages and not R2

- **Per-file limit.** Pages refuses files over 25 MiB. Both files are under it, and `build_hazard.py` fails at 24 MiB to keep a margin.
- **Range requests.** Pages answered `206 Partial Content` to a `Range` request for a static `.png` and `.svg` on pnct.singledev.eu (checked 2026-11-15). The preview deploy checks the same for `.pmtiles` and `.bin` (see the report). Both readers need it.
- **Caching.** The file names carry their content hash, so `/landcheck/*` is cached as immutable in `web/public/_headers`, like `/assets/*`.

## Fresh clone, CI and deploys

- A fresh clone has the meta but not the files. `npm run dev` and `npm run build` still work. The Land check shows the hazard as "could not be loaded", and the overlay toggle is disabled.
- `npm run deploy` and `npm run deploy:preview` run `scripts/check_landcheck.mjs` before uploading. It fails if a file named in the meta is missing or its SHA-256 differs, so a deploy never ships without them. Build them with `uv run make landcheck` (it downloads the 19.5 MB ICNF zip once).

## If a file outgrows 25 MiB (e.g. a z12 overlay, 35.1 MiB)

Move it to R2. This is not set up. The user runs the `wrangler` steps.

1. `npx wrangler@4.149.0 r2 bucket create pnct-map-data`
2. Connect a custom domain to the bucket (e.g. `data.pnct.singledev.eu`) in the dashboard. That gives caching and Range support. Avoid `r2.dev`, which is rate-limited.
3. CORS on the bucket: `GET`, `HEAD` from `https://pnct.singledev.eu` and `https://*.pnct-map.pages.dev`, with `Range` as an allowed header and `Content-Range, Content-Length, ETag` exposed.
4. Upload with `npx wrangler@4.149.0 r2 object put pnct-map-data/landcheck/<file> --file web/public/landcheck/<file> --remote`.
5. Add the domain to `connect-src` in the CSP (`web/public/_headers`), and make the app read the files from that origin. That would be a small change in `landcheck.ts`: a base URL in the meta.
