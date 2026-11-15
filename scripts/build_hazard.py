"""Build the wildfire hazard data for the land check -> web/public/landcheck/.

From the ICNF structural hazard GeoTIFF (25 m, EPSG:3763, classes 1–5, 15 = no data), clipped to
mainland Portugal (cells outside the CAOP 2025 districts become 0, "no class", so "outside mainland"
means the same for the hazard and for the parish lookup), two directories of plain static files:

  hazard-<sha8>/{z}/{x}/{y}.png  the map overlay (display only). Web-mercator tiles, 512 px, z5–z11,
                                 mode-resampled (nearest at z11), as palette PNGs whose palette index is
                                 the class (0 transparent, 1–5 in ICNF's colours). Every tile inside the
                                 overlay bounds exists (empty ones share one transparent PNG), so the map
                                 never asks Pages for a missing file (which would answer with index.html).
  hazard-cells-<sha8>/<i>.bin    the point lookup: the source grid itself, cell for cell, in EPSG:3763,
                                 one zlib file per chunk of CHUNK × CHUNK cells (uint8 class per cell,
                                 row-major; chunks numbered row-major from the top-left). Only chunks with
                                 a class exist; the meta's `present` bitmap says which. The app
                                 (web/src/landcheck.ts) fetches one ~6 KB file per lookup.

Plain files, not one archive read with HTTP Range: Cloudflare Pages answers Range requests with 200
and the whole file (checked on the preview deploy, and stated in its docs), so PMTiles or an indexed
single file would download 15 MiB per lookup there. Each directory name carries the first 8 hex digits
of a SHA-256 over its files (tree_sha256, below), so both are cached as immutable.
web/data/landcheck.meta.json (committed, bundled) names them and carries the grid parameters, the
source, licence and dates, and the class labels in EN and PT.

The lookup reads the native grid because a web-mercator lookup is either inexact (z11 agreed with the
source cell at 93.3% of random points) or large (z12: 35.1 MiB).
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import sys
import shutil
import tempfile
import time
import zlib
from pathlib import Path

import numpy as np
import pyogrio
import rasterio
import shapely
from PIL import Image
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
# Overlay tiles
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


def empty_png() -> bytes:
    return palette_png(np.zeros((cfg.TILE_SIZE, cfg.TILE_SIZE), dtype=np.uint8), cfg.HAZARD)


def write_tiles(classes, transform, crs, source: cfg.RasterSource, out: Path) -> int:
    """Writes out/{z}/{x}/{y}.png for every tile in the bounds; returns how many hold a class."""
    blank = empty_png()
    filled = 0
    started = time.time()
    for z in range(cfg.MIN_ZOOM, cfg.MAX_ZOOM + 1):
        before = filled
        x0, y0 = lonlat_to_tile(LON_MIN, LAT_MAX, z)
        x1, y1 = lonlat_to_tile(LON_MAX, LAT_MIN, z)
        for x in range(x0, x1 + 1):
            (out / str(z) / str(x)).mkdir(parents=True, exist_ok=True)
            for y in range(y0, y1 + 1):
                tile = render_tile(classes, transform, crs, z, x, y)
                data = palette_png(tile, source) if tile.any() else blank
                filled += data is not blank
                (out / str(z) / str(x) / f"{y}.png").write_bytes(data)
        print(f"  z{z}: {filled - before} tiles with a class, {(x1 - x0 + 1) * (y1 - y0 + 1)} in the bounds ({time.time() - started:.0f} s)")
    return filled


# ---------------------------------------------------------------------------------------------
# Lookup grid (native cells)
# ---------------------------------------------------------------------------------------------


def chunk_grid(shape: tuple[int, int]) -> tuple[int, int]:
    """(chunk rows, chunk cols) covering a grid of `shape` cells."""
    return math.ceil(shape[0] / cfg.CHUNK), math.ceil(shape[1] / cfg.CHUNK)


def write_cells(classes: np.ndarray, out: Path) -> str:
    """Writes out/<i>.bin for every chunk with a class; returns the presence bitmap as hex (bit i of byte i // 8)."""
    rows, cols = chunk_grid(classes.shape)
    present = bytearray((rows * cols + 7) // 8)
    out.mkdir(parents=True, exist_ok=True)
    for r in range(rows):
        for c in range(cols):
            block = classes[r * cfg.CHUNK : (r + 1) * cfg.CHUNK, c * cfg.CHUNK : (c + 1) * cfg.CHUNK]
            if not block.any():
                continue
            i = r * cols + c
            full = np.zeros((cfg.CHUNK, cfg.CHUNK), dtype=np.uint8)  # edge chunks padded with 0 (no class)
            full[: block.shape[0], : block.shape[1]] = block
            (out / f"{i}.bin").write_bytes(zlib.compress(full.tobytes(), 9))
            present[i >> 3] |= 1 << (i & 7)
    return present.hex()


def read_cell(directory: Path, grid: dict, x: float, y: float) -> int:
    """The class at EPSG:3763 (x, y), read the way web/src/landcheck.ts reads it (used by the tests)."""
    col = math.floor((x - grid["origin"][0]) / grid["cell"])
    row = math.floor((grid["origin"][1] - y) / grid["cell"])
    if not (0 <= row < grid["height"] and 0 <= col < grid["width"]):
        return 0
    chunk = grid["chunk"]
    i = (row // chunk) * grid["chunk_cols"] + col // chunk
    if not (bytes.fromhex(grid["present"])[i >> 3] >> (i & 7)) & 1:
        return 0
    cells = zlib.decompress((directory / f"{i}.bin").read_bytes())
    return cells[(row % chunk) * chunk + col % chunk]


# ---------------------------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------------------------


def tree_sha256(directory: Path) -> tuple[str, int, int]:
    """SHA-256 over "<relative path>\\0<file sha256>\\n" for every file, sorted by path (web/scripts/check_landcheck.mjs
    computes the same), with the file count and total bytes."""
    digest = hashlib.sha256()
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    total = 0
    for p in files:
        data = p.read_bytes()
        total += len(data)
        if len(data) > cfg.MAX_FILE_BYTES:
            raise SystemExit(f"{p} is over the Pages per-file limit")
        digest.update(f"{p.relative_to(directory).as_posix()}\0{hashlib.sha256(data).hexdigest()}\n".encode())
    return digest.hexdigest(), len(files), total


def publish(tmp: Path, prefix: str) -> tuple[str, str, int, int]:
    """Moves a built directory to PUBLIC_DIR/<prefix>-<sha8>; drops older versions."""
    sha, files, total = tree_sha256(tmp)
    name = f"{prefix}-{sha[:8]}"
    for old in cfg.PUBLIC_DIR.glob(f"{prefix}-????????"):
        if old.name != name:
            shutil.rmtree(old) if old.is_dir() else old.unlink()
    target = cfg.PUBLIC_DIR / name
    if target.exists():
        shutil.rmtree(target)
    tmp.chmod(0o755)  # mkdtemp creates it 0700
    tmp.replace(target)
    print(f"wrote {target}: {files} files, {total / 2**20:.1f} MiB")
    return name, sha, files, total


def build(source: cfg.RasterSource = cfg.HAZARD) -> dict:
    fetch_record = json.loads((source.cache_dir() / "fetch.json").read_text())
    classes, transform, crs = load_classes(source)
    counts = np.bincount(classes.ravel(), minlength=6)
    print(f"mainland cells per class (0 = none): {dict(enumerate(counts.tolist()))}")
    cfg.PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    tiles_tmp = Path(tempfile.mkdtemp(dir=cfg.PUBLIC_DIR, prefix=".tiles-"))
    filled = write_tiles(classes, transform, crs, source, tiles_tmp)
    tiles_name, tiles_sha, tiles_files, tiles_bytes = publish(tiles_tmp, "hazard")

    cells_tmp = Path(tempfile.mkdtemp(dir=cfg.PUBLIC_DIR, prefix=".cells-"))
    present = write_cells(classes, cells_tmp)
    cells_name, cells_sha, cells_files, cells_bytes = publish(cells_tmp, "hazard-cells")
    chunk_rows, chunk_cols = chunk_grid(classes.shape)
    print(f"  {cells_files} of {chunk_rows * chunk_cols} chunks hold a class")
    if -transform.e != transform.a:
        raise SystemExit("expected square cells")

    meta = {
        "hazard": {
            "tiles": {
                "dir": f"landcheck/{tiles_name}",
                "files": tiles_files,
                "with_class": filled,
                "bytes": tiles_bytes,
                "tree_sha256": tiles_sha,
                "tile_size": cfg.TILE_SIZE,
                "min_zoom": cfg.MIN_ZOOM,
                "max_zoom": cfg.MAX_ZOOM,
                "bounds": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
            },
            "cells": {
                "dir": f"landcheck/{cells_name}",
                "files": cells_files,
                "bytes": cells_bytes,
                "tree_sha256": cells_sha,
                "crs": "EPSG:3763",
                "origin": [transform.c, transform.f],  # top-left corner
                "cell": transform.a,
                "width": classes.shape[1],
                "height": classes.shape[0],
                "chunk": cfg.CHUNK,
                "chunk_cols": chunk_cols,
                "chunk_rows": chunk_rows,
                "present": present,
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
    cfg.META_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {cfg.META_JSON}")
    return meta


if __name__ == "__main__":
    build()
