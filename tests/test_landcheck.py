"""Land check: the hazard files in web/public/landcheck/ against the ICNF source raster.

Needs the fetched source and the built files (uv run make landcheck); skipped otherwise, like the
other data tests on a fresh clone.
"""

import hashlib
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from pmtiles.reader import MmapSource, Reader
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_hazard as bh  # noqa: E402
import landcheck_config as cfg  # noqa: E402

META = json.loads(cfg.META_JSON.read_text(encoding="utf-8"))["hazard"] if cfg.META_JSON.exists() else None
TILES = ROOT / "web/public" / META["tiles"]["file"] if META else None
CELLS = ROOT / "web/public" / META["cells"]["file"] if META else None
pytestmark = pytest.mark.skipif(
    not (META and TILES.exists() and CELLS.exists() and cfg.HAZARD.tif_path().exists()),
    reason="land check data not built (uv run make landcheck)",
)

TO_3763 = Transformer.from_crs(4326, 3763, always_xy=True)
TO_4326 = Transformer.from_crs(3763, 4326, always_xy=True)

# (lat, lon) -> class in the source raster (0 = no class). The report's verification points; the same
# points and values are in web/src/landcheck.test.ts.
POINTS = {
    "Pedrógão Grande, rural (very high)": ((39.92681, -8.15187), 5),
    "Pedrógão Grande, Vila Facaia (medium)": ((39.90300, -8.22100), 3),
    "Porto, Avenida dos Aliados (built-up, no class)": ((41.14960, -8.61100), 0),
    "Bragança, França (very high)": ((41.89600, -6.73300), 5),
    "Bragança, Rio de Onor (high)": ((41.94000, -6.61300), 4),
    "Atlantic (outside)": ((39.50000, -10.00000), 0),
    "Spain, Cáceres (outside)": ((40.00000, -6.00000), 0),
}


@pytest.fixture(scope="module")
def source():
    classes, transform, _ = bh.load_classes(cfg.HAZARD)
    return classes, transform


@pytest.fixture(scope="module")
def tiles():
    f = TILES.open("rb")
    yield Reader(MmapSource(f))
    f.close()


def source_class(source, x: float, y: float) -> int:
    classes, transform = source
    col, row = ~transform @ (x, y)
    row, col = math.floor(row), math.floor(col)
    if not (0 <= row < classes.shape[0] and 0 <= col < classes.shape[1]):
        return 0
    return int(classes[row, col])


def lookup(lat: float, lon: float) -> int:
    return bh.read_cell(CELLS, META["cells"], *TO_3763.transform(lon, lat))


def tile_class(reader: Reader, lat: float, lon: float, z: int) -> int:
    n = 2**z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    data = reader.get(z, int(fx), int(fy))
    if data is None:
        return 0
    img = Image.open(io.BytesIO(data))
    assert img.mode == "P"
    size = cfg.TILE_SIZE
    return int(np.asarray(img)[min(size - 1, int((fy % 1) * size)), min(size - 1, int((fx % 1) * size))])


def test_meta_matches_files():
    for part, path in (("tiles", TILES), ("cells", CELLS)):
        m = META[part]
        data = path.read_bytes()
        assert len(data) == m["bytes"] < 25 * 1024 * 1024  # Cloudflare Pages per-file limit
        assert hashlib.sha256(data).hexdigest() == m["sha256"]
        assert m["sha256"][:8] in path.name
    assert [c["value"] for c in META["classes"]] == [1, 2, 3, 4, 5]
    assert all(c["en"] and c["pt"] and c["color"].startswith("#") for c in META["classes"])
    assert META["reference_date"] and META["fetched"] and META["download_url"].startswith("https://geocatalogo.icnf.pt/")
    assert META["cells"]["crs"] == "EPSG:3763" and META["cells"]["cell"] == 25


def test_blocked_facts_are_listed():
    assert set(json.loads(cfg.META_JSON.read_text())["blocked"]) == set(cfg.BLOCKED) == {"ren", "broadband"}


def test_only_current_files_are_published():
    assert sorted(p.name for p in cfg.PUBLIC_DIR.iterdir() if not p.name.startswith(".")) == sorted([TILES.name, CELLS.name])


def test_cell_index_is_consistent():
    m = META["cells"]
    n = m["chunk_rows"] * m["chunk_cols"]
    offsets = np.frombuffer(CELLS.read_bytes()[: 4 * (n + 1)], dtype="<u4")
    assert offsets[0] == 4 * (n + 1) and offsets[-1] == m["bytes"]
    assert (np.diff(offsets.astype(np.int64)) >= 0).all()


@pytest.mark.parametrize("name", POINTS)
def test_verification_points(source, name):
    (lat, lon), expected = POINTS[name]
    assert source_class(source, *TO_3763.transform(lon, lat)) == expected
    assert lookup(lat, lon) == expected


def test_lookup_is_the_source_cell(source):
    """Random points anywhere in the grid (classified or not): the lookup returns the source cell's class."""
    classes, transform = source
    rng = np.random.default_rng(20261115)
    h, w = classes.shape
    for _ in range(3000):
        x, y = transform @ (rng.random() * w, rng.random() * h)
        assert bh.read_cell(CELLS, META["cells"], x, y) == source_class(source, x, y)


def test_overlay_tiles(tiles):
    header = tiles.header()
    assert (header["min_zoom"], header["max_zoom"]) == (cfg.MIN_ZOOM, cfg.MAX_ZOOM)
    for z in (cfg.MIN_ZOOM, cfg.MAX_ZOOM):
        assert tile_class(tiles, 39.5, -10.0, z) == 0  # sea: transparent
    # Inside the 10 km window around Pedrógão Grande, the overlay is mostly classes 4–5, like the source.
    seen = [tile_class(tiles, 39.92 + dy, -8.15 + dx, cfg.MAX_ZOOM) for dy in np.linspace(-0.04, 0.04, 9) for dx in np.linspace(-0.05, 0.05, 9)]
    assert np.mean([v in (4, 5) for v in seen]) > 0.5
