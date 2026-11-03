# 06: Slope from DGT LiDAR, investigation only

**Status:** blocked: needs Mike (hosting decision and a CDD login) · **Branch:** `docs/06-lidar-slope` (report + probe script, no app change, so no preview deploy)

## The data (checked live, 2026-11-02)

- **Portal:** Centro de Dados (CDD) of the DGT, https://cdd.dgterritorio.gov.pt. It has a **STAC API**, `POST https://cdd.dgterritorio.gov.pt/dgt-be/v1/search` (bbox, collections, limit), and `GET …/v1/collections`. Search and metadata are public.
- **Collections:** `MDT-2m` and `MDT-50cm` (terrain), `MDS-2m` and `MDS-50cm` (surface), `LAZ` (point cloud).
- **Licence (STAC collection metadata):** `"CC-BY-4.0"`, provider Direção-Geral do Território, roles producer and licensor. This is the same licence as CAOP, which we already credit. Attribution text: "Informação geográfica cedida pela Direção-Geral do Território".
- **Tiling:** 1 km × 1 km GeoTIFF tiles in EPSG:3763 (PT-TM06), Float32, nodata −999, ids like `MDT-2m-170226-06-2024`.
  - MDT-2m: 500×500 px, ≈ 1.0 MB per tile; **91,193 tiles ≈ 91 GB** for the mainland.
  - MDT-50cm: ≈ 19 MB per tile; 91,202 tiles ≈ **1.7 TB**.
- **Coverage:** the metadata says "Zona Noroeste ainda indisponível", but sample searches over Gerês (1,033 tiles for 1,102 km²) and the Minho coast found tiles. It looks complete; the note may be outdated.
- **Download:** `GET …/v1/download/<hash>` answers **302 to a Keycloak login** (`auth.cdd.dgterritorio.gov.pt`). A **free CDD account is needed**. Bulk download is done with the community QGIS plugin "DGT CDD Downloader" (github.com/qgispt/dgtcd_downer: cookie session, splits large bboxes). There's no anonymous bulk API. I did **not** create an account (that's Mike's identity), so no DGT file was downloaded.
- **Shortcut that needs no login:** Mapterhorn's terrain tiles are built from this same DGT LiDAR over Portugal (their source "pt", 0.5 m, CC BY 4.0; see task 05). They are public Terrarium tiles up to z17.

## Test on one concelho (via Mapterhorn z14, i.e. DGT LiDAR resampled to ~3.6 m)

`scripts/slope_probe.py` on **Manteigas (0908)**, 122 km²:
- 100 tiles at z14, 13.9 MB of DEM, fetched in 26 s; slope computed in 0.25 s;
- **elevation range 511–1,993 m** (1,993 m is Torre, the summit of Serra da Estrela, which is right).

| Slope class | native ~3.6 m | ~10 m |
|---|---|---|
| 0–5% | 3.1% | 3.2% |
| 5–10% | 5.8% | 6.1% |
| 10–15% | 8.2% | 7.9% |
| 15–25% | 15.5% | 16.0% |
| > 25% | 67.4% | 66.9% |

- Resampling 3.6 m → 10 m changes the class shares by < 1 point, so **10 m is enough** for a slope layer.
- A 10 m class raster (5 classes, 1 byte/px, palette PNG) is 362 KB for 2.9 M px, i.e. **0.12 bytes/px**.
- Preview: `.artifacts/night06/slope-0908.png` (the Zêzere glacial valley is the flat green ribbon).

The class bounds (0/5/10/15/25%) are a common planning split; to be checked against what PDMs use.

## Pipeline plan

1. **Download.** Either:
   - (a) CDD MDT-2m for the mainland via the STAC API with a session cookie (91 GB, ~1.5 h at 20 MB/s; needs a CDD login), or
   - (b) Mapterhorn: z14 tiles (≈ 25,500 tiles ≈ 3.5 GB; don't hammer their free endpoint; ask or use their bulk downloads at download.mapterhorn.com).

   (a) is the primary source with the clear licence.
2. **Downsample:** `gdalbuildvrt` → `gdalwarp -tr 10 10 -r average` (EPSG:3763), about 1 h CPU.
3. **Slope:** `gdaldem slope -p` (percent), then classes with `gdal_calc` (uint8 0–4).
4. **Tiles:** reproject to Web Mercator, palette PNG/WebP tiles z8–14 → a single **PMTiles** file (`rio-pmtiles` or `gdal2tiles` + `pmtiles convert`).
5. **Layer:** a `raster` source (PMTiles via the `pmtiles` protocol) with a toggle in the legend, like the protected-areas overlays. Plus shares per parish and concelho in the pipeline (as for protection), for the panel/card ("Slope: 67% steeper than 25%").
6. **Elevation and slope at the clicked point:** no hosting needed. Decode the Terrarium pixel from the DEM tile client-side (or use `map.queryTerrainElevation` when Relief is on), with slope from the 3×3 neighbourhood.

## Estimates

- **Storage:** 89,000 km² at 10 m ≈ 890 M px × 0.12 B ≈ 110 MB for one level. Web Mercator z14 (≈ 7.3 m/px at 40° N) plus pyramids ≈ **250–350 MB** PMTiles.
- **Build time:** download 1.5 h (a) or ~2 h (b); warp + slope + classes ~1–2 h; tiling ~1–2 h. Total **half a day**, mostly unattended. Rebuild only when DGT republishes.
- **Hosting:** a 300 MB file can't go in Pages (25 MiB per-file limit), so it needs **Cloudflare R2** (or similar). R2 free tier: 10 GB storage, 10 M Class B reads/month, **no egress fees**. Likely **€0/month** at this traffic; beyond it, $0.015/GB-month storage and $0.36 per M reads. Creating the bucket and a public domain is a Cloudflare settings change: Mike's call.
- **Option without our own hosting:** compute slope classes client-side from Mapterhorn's Terrarium tiles, with a MapLibre `addProtocol` handler that fetches the DEM tile, runs the slope in a worker and returns a class PNG. No pipeline and no storage, but it depends on Mapterhorn's endpoint and terms, costs CPU per tile on phones, and per-parish shares can't come from it.

## Decisions for Mike (blocked)

1. **Hosting:** R2 bucket for a ~300 MB PMTiles (recommended), or the client-side Mapterhorn option.
2. **CDD account** for the DGT download, or accept Mapterhorn as the source.
3. Slope classes and wording ("steep" for > 25%?), and whether the panel shows shares per parish.
