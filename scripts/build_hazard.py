"""Build the wildfire hazard data for the land check -> web/public/landcheck/.

From the ICNF structural hazard GeoTIFF (25 m, EPSG:3763, classes 1–5, 15 = no data), clipped to
mainland Portugal (cells outside the CAOP 2025 districts become 0, "no class", so "outside mainland"
means the same for the hazard and for the parish lookup), two files:

  hazard-<sha8>.pmtiles        the map overlay (display only). Web-mercator tiles, 512 px, z5–z11,
                               mode-resampled (nearest at z11), as palette PNGs whose palette index is
                               the class (0 transparent, 1–5 in ICNF's colours). All-empty tiles are
                               left out.
  hazard-cells-<sha8>.bin      the point lookup: the source grid itself, cell for cell, in EPSG:3763.
                               Layout: a little-endian uint32 index of (chunks + 1) byte offsets, then
                               one zlib stream per chunk of CHUNK × CHUNK cells (uint8 class per cell,
                               row-major, chunks row-major from the top-left). An empty chunk has
                               offset[i] == offset[i + 1]. The app (web/src/landcheck.ts) reads the
                               index and one chunk with two HTTP Range requests.

Each file name carries the first 8 hex digits of its SHA-256, so both are cached as immutable.
web/data/landcheck.meta.json (committed, bundled) names them and carries the grid parameters, the
source, licence and dates, and the class labels in EN and PT.

The pixel grid was chosen by measurement: an exact web-mercator lookup needs z12 (35.1 MiB, over the
25 MiB Pages limit), and a z11 lookup agreed with the source cell at only 93.3% of random points.
The native grid is exact and 13.5 MiB. The build fails if either file is over MAX_FILE_BYTES.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import sys
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np
import pyogrio
import rasterio
import shapely
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.features import geometry_mask
from rasterio.warp import Resampling, reproject

sys.path.insert(0, str(Path(__file__).resolve().parent))

import landcheck_config as cfg  # noqa: E402

ORIGIN = 20037508.342789244  # half the web-mercator world, metres
# Rough mainland bounds (lon/lat) for the tile ranges; tiles without a class pixel are dropped anyway.
LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = -9.6, 36.9, -6.1, 42.2


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = 2 * ORIGIN / 2**z
    return -ORIGIN + x * size, ORIGIN - (y + 1) * size, -ORIGIN + (x + 1) * size, ORIGIN - y * size


def mainland_geometry():
    districts = pyogrio.read_dataframe(cfg.CAOP_GPKG, layer="cont_distritos")
    if districts.crs.to_epsg() != 3763:
        districts = districts.to_crs(3763)
    return shapely.union_all(districts.geometry.values)


def load_classes(source: cfg.RasterSource) -> tuple[np.ndarray, rasterio.Affine, object]:
    """The source classes as uint8 with 0 for no data or outside mainland."""
    with rasterio.open(source.tif_path()) as r:
        if r.crs.to_epsg() != 3763:
            raise SystemExit(f"unexpected CRS {r.crs}")
        data = r.read(1)
        transform, crs, shape, bounds = r.transform, r.crs, r.shape, r.bounds
    if transform.b or transform.d or transform.e >= 0:
        raise SystemExit(f"expected a north-up grid, got {transform}")
    land = mainland_geometry()
    lb = land.bounds
    if not (bounds.left <= lb[0] and bounds.bottom <= lb[1] and bounds.right >= lb[2] and bounds.top >= lb[3]):
        raise SystemExit(f"the raster {tuple(bounds)} does not cover mainland {lb}")
    outside = geometry_mask([land], out_shape=shape, transform=transform)  # True outside mainland
    valid = {c.value for c in source.classes}
    unknown = set(np.unique(data).tolist()) - valid - {source.nodata}
    if unknown:
        raise SystemExit(f"unexpected raster values {sorted(unknown)}")
    classes = np.where(np.isin(data, list(valid)) & ~outside, data, 0).astype(np.uint8)
    return classes, transform, crs


# ---------------------------------------------------------------------------------------------
# Overlay tiles (PMTiles)
# ---------------------------------------------------------------------------------------------


def palette_png(tile: np.ndarray, source: cfg.RasterSource) -> bytes:
    img = Image.fromarray(tile, mode="P")
    palette = [0, 0, 0]
    for c in sorted(source.classes, key=lambda c: c.value):
        palette += [int(c.color[i : i + 2], 16) for i in (1, 3, 5)]
    img.putpalette(palette)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True, transparency=0, bits=4)  # index 0 transparent; 6 entries fit in 4 bits
    return buf.getvalue()


def render_tile(classes, transform, crs, z: int, x: int, y: int) -> np.ndarray:
    dst = np.zeros((cfg.TILE_SIZE, cfg.TILE_SIZE), dtype=np.uint8)
    left, bottom, right, top = tile_bounds(z, x, y)
    reproject(
        source=classes,
        destination=dst,
        src_transform=transform,
        src_crs=crs,
        src_nodata=0,
        dst_transform=rasterio.transform.from_bounds(left, bottom, right, top, cfg.TILE_SIZE, cfg.TILE_SIZE),
        dst_crs="EPSG:3857",
        dst_nodata=0,
        resampling=Resampling.nearest if z == cfg.MAX_ZOOM else Resampling.mode,
    )
    return dst


def write_pmtiles(classes, transform, crs, source: cfg.RasterSource, attribution: str, path: Path) -> int:
    entries: list[tuple[int, bytes]] = []
    started = time.time()
    for z in range(cfg.MIN_ZOOM, cfg.MAX_ZOOM + 1):
        before = len(entries)
        x0, y0 = lonlat_to_tile(LON_MIN, LAT_MAX, z)
        x1, y1 = lonlat_to_tile(LON_MAX, LAT_MIN, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                tile = render_tile(classes, transform, crs, z, x, y)
                if tile.any():
                    entries.append((zxy_to_tileid(z, x, y), palette_png(tile, source)))
        print(f"  z{z}: {len(entries) - before} tiles ({time.time() - started:.0f} s)")
    with path.open("wb") as f:
        writer = Writer(f)
        for tile_id, data in sorted(entries):  # PMTiles wants tile ids in order
            writer.write_tile(tile_id, data)
        writer.finalize(
            {
                "tile_type": TileType.PNG,
                "tile_compression": Compression.NONE,
                "min_zoom": cfg.MIN_ZOOM,
                "max_zoom": cfg.MAX_ZOOM,
                "min_lon_e7": int(LON_MIN * 1e7),
                "min_lat_e7": int(LAT_MIN * 1e7),
                "max_lon_e7": int(LON_MAX * 1e7),
                "max_lat_e7": int(LAT_MAX * 1e7),
                "center_zoom": 7,
                "center_lon_e7": int(-8.0 * 1e7),
                "center_lat_e7": int(39.6 * 1e7),
            },
            {"name": "hazard", "attribution": attribution},
        )
    return len(entries)


# ---------------------------------------------------------------------------------------------
# Lookup grid (native cells)
# ---------------------------------------------------------------------------------------------


def chunk_grid(shape: tuple[int, int]) -> tuple[int, int]:
    """(chunk rows, chunk cols) covering a grid of `shape` cells."""
    return math.ceil(shape[0] / cfg.CHUNK), math.ceil(shape[1] / cfg.CHUNK)


def write_cells(classes: np.ndarray, path: Path) -> int:
    rows, cols = chunk_grid(classes.shape)
    blobs: list[bytes] = []
    for r in range(rows):
        for c in range(cols):
            block = classes[r * cfg.CHUNK : (r + 1) * cfg.CHUNK, c * cfg.CHUNK : (c + 1) * cfg.CHUNK]
            if not block.any():
                blobs.append(b"")
                continue
            full = np.zeros((cfg.CHUNK, cfg.CHUNK), dtype=np.uint8)  # edge chunks padded with 0 (no class)
            full[: block.shape[0], : block.shape[1]] = block
            blobs.append(zlib.compress(full.tobytes(), 9))
    index_bytes = 4 * (len(blobs) + 1)
    offsets = np.cumsum([index_bytes] + [len(b) for b in blobs], dtype=np.uint64)
    if offsets[-1] >= 2**32:
        raise SystemExit("lookup grid over 4 GiB")
    with path.open("wb") as f:
        f.write(offsets.astype("<u4").tobytes())
        for b in blobs:
            f.write(b)
    return sum(1 for b in blobs if b)


def read_cell(path: Path, grid: dict, x: float, y: float) -> int:
    """The class at EPSG:3763 (x, y), read the way web/src/landcheck.ts reads it (used by the tests)."""
    col = math.floor((x - grid["origin"][0]) / grid["cell"])
    row = math.floor((grid["origin"][1] - y) / grid["cell"])
    if not (0 <= row < grid["height"] and 0 <= col < grid["width"]):
        return 0
    chunk = grid["chunk"]
    i = (row // chunk) * grid["chunk_cols"] + col // chunk
    with path.open("rb") as f:
        f.seek(4 * i)
        start, end = np.frombuffer(f.read(8), dtype="<u4")
        if start == end:
            return 0
        f.seek(int(start))
        cells = zlib.decompress(f.read(int(end - start)))
    return cells[(row % chunk) * chunk + col % chunk]


# ---------------------------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------------------------


def publish(tmp: Path, prefix: str, suffix: str) -> tuple[str, int, str]:
    """Moves a built file to PUBLIC_DIR under its content-hashed name; drops older versions."""
    data = tmp.read_bytes()
    size = len(data)
    if size > cfg.MAX_FILE_BYTES:
        tmp.unlink()
        raise SystemExit(f"{prefix} is {size / 2**20:.1f} MiB, over the {cfg.MAX_FILE_BYTES / 2**20:.0f} MiB limit (Cloudflare Pages: 25 MiB per file); see docs/land-check/HOSTING.md")
    digest = hashlib.sha256(data).hexdigest()
    name = f"{prefix}-{digest[:8]}{suffix}"
    for old in cfg.PUBLIC_DIR.glob(f"{prefix}-????????{suffix}"):
        if old.name != name:
            old.unlink()
    tmp.chmod(0o644)  # mkstemp creates it 0600
    tmp.replace(cfg.PUBLIC_DIR / name)
    print(f"wrote {cfg.PUBLIC_DIR / name}: {size / 2**20:.1f} MiB")
    return name, size, digest


def build(source: cfg.RasterSource = cfg.HAZARD) -> dict:
    fetch_record = json.loads((source.cache_dir() / "fetch.json").read_text())
    classes, transform, crs = load_classes(source)
    counts = np.bincount(classes.ravel(), minlength=6)
    print(f"mainland cells per class (0 = none): {dict(enumerate(counts.tolist()))}")
    cfg.PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    attribution = f"{source.provider}, {source.title_pt}, {source.download_url}, {fetch_record['fetched'][:10]}"

    def tmp_file() -> Path:
        with tempfile.NamedTemporaryFile(dir=cfg.PUBLIC_DIR, suffix=".part", delete=False) as t:
            return Path(t.name)

    tiles_tmp = tmp_file()
    tiles = write_pmtiles(classes, transform, crs, source, attribution, tiles_tmp)
    tiles_name, tiles_size, tiles_sha = publish(tiles_tmp, "hazard", ".pmtiles")

    cells_tmp = tmp_file()
    chunks = write_cells(classes, cells_tmp)
    cells_name, cells_size, cells_sha = publish(cells_tmp, "hazard-cells", ".bin")
    chunk_rows, chunk_cols = chunk_grid(classes.shape)
    print(f"  {chunks} of {chunk_rows * chunk_cols} chunks hold a class")

    meta = {
        "hazard": {
            "tiles": {"file": f"landcheck/{tiles_name}", "bytes": tiles_size, "sha256": tiles_sha, "tiles": tiles, "tile_size": cfg.TILE_SIZE, "min_zoom": cfg.MIN_ZOOM, "max_zoom": cfg.MAX_ZOOM},
            "cells": {
                "file": f"landcheck/{cells_name}",
                "bytes": cells_size,
                "sha256": cells_sha,
                "crs": "EPSG:3763",
                "origin": [transform.c, transform.f],  # top-left corner
                "cell": transform.a,
                "width": classes.shape[1],
                "height": classes.shape[0],
                "chunk": cfg.CHUNK,
                "chunk_cols": chunk_cols,
                "chunk_rows": chunk_rows,
            },
            "provider": source.provider,
            "title": {"en": source.title_en, "pt": source.title_pt},
            "url": source.url,
            "metadata_url": source.metadata_url,
            "download_url": source.download_url,
            "licence": {"en": source.licence_en, "pt": source.licence_pt},
            "licence_url": source.licence_url,
            "reference_date": source.reference_date,
            "fetched": fetch_record["fetched"][:10],
            "classes": [{"value": c.value, "color": c.color, "en": c.en, "pt": c.pt} for c in source.classes],
        },
        "blocked": sorted(cfg.BLOCKED),
    }
    if -transform.e != transform.a:
        raise SystemExit("expected square cells")
    cfg.META_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {cfg.META_JSON}")
    return meta


if __name__ == "__main__":
    build()
