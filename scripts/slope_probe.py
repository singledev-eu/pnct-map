"""Investigation probe (night task 06), not part of the pipeline: slope classes for one concelho from
Mapterhorn z14 Terrarium tiles (over Portugal built from DGT LiDAR MDT, CC BY 4.0). Prints the area,
elevation range, class shares at native (~3.6 m) and ~10 m, a 10 m class-PNG size and timings; writes
a preview PNG. Usage: uv run python -I scripts/slope_probe.py "$PWD" <dico> <out-dir>"""
import io, json, math, sys, time, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
import pyogrio, shapely

root, dico, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
t0 = time.time()
mun = pyogrio.read_dataframe(root / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg", layer="cont_municipios", where=f"dtmn = '{dico}'").to_crs(4326)
geom = mun.geometry.iloc[0]
name = mun.municipio.iloc[0]
w, s, e, n = geom.bounds
Z, T = 14, 512
def tile(lon, lat):
    k = 2 ** Z
    return int((lon + 180) / 360 * k), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k)
x0, y0 = tile(w, n); x1, y1 = tile(e, s)
nbytes = 0
rows = []
for y in range(y0, y1 + 1):
    row = []
    for x in range(x0, x1 + 1):
        p = out / f"{Z}-{x}-{y}.webp"
        if not p.exists():
            p.write_bytes(urllib.request.urlopen(urllib.request.Request(f"https://tiles.mapterhorn.com/{Z}/{x}/{y}.webp", headers={"User-Agent": "pnct-map slope test"}), timeout=60).read())
        nbytes += p.stat().st_size
        a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
        row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
    rows.append(np.hstack(row))
dem = np.vstack(rows)
t_fetch = time.time() - t0
H, W = dem.shape
k = 2 ** Z * T
xs = (x0 * T + np.arange(W) + 0.5) / k * 360 - 180
ys_merc = (y0 * T + np.arange(H) + 0.5) / k
lats = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * ys_merc))))
lat_c = (s + n) / 2
px = 40075016.686 * math.cos(math.radians(lat_c)) / k  # metres per pixel (ground)

def slope_pct(d, step):
    gy, gx = np.gradient(d, step, step)
    return 100 * np.hypot(gx, gy)

LON, LAT = np.meshgrid(xs, lats)
inside = shapely.contains_xy(geom, LON, LAT)
CLASSES = [0, 5, 10, 15, 25, np.inf]
LABELS = ["0–5%", "5–10%", "10–15%", "15–25%", ">25%"]
def shares(sl, mask):
    v = sl[mask]
    return {LABELS[i]: round(100 * float(((v >= CLASSES[i]) & (v < CLASSES[i + 1])).mean()), 1) for i in range(5)}
t1 = time.time()
native = slope_pct(dem, px)
f = max(1, round(10 / px))  # ~10 m blocks
Hc, Wc = H // f * f, W // f * f
dem10 = dem[:Hc, :Wc].reshape(Hc // f, f, Wc // f, f).mean(axis=(1, 3))
s10 = slope_pct(dem10, px * f)
in10 = inside[:Hc, :Wc].reshape(Hc // f, f, Wc // f, f).mean(axis=(1, 3)) > 0.5
t_slope = time.time() - t1
# preview: class colours, outside dimmed
pal = np.array([[26, 152, 80], [145, 207, 96], [254, 224, 139], [252, 141, 89], [215, 48, 39]], dtype=np.uint8)
cls = np.digitize(s10, CLASSES[1:-1])
img = pal[cls]
img[~in10] = (img[~in10] * 0.25 + 190).astype(np.uint8)
Image.fromarray(img).save(out / f"slope-{dico}.png")
# a 10 m class raster as PNG (palette, 1 byte/px) for the size estimate
pimg = Image.fromarray(cls.astype(np.uint8), mode="L").convert("P")
buf = io.BytesIO(); pimg.save(buf, format="PNG", optimize=True)
area_km2 = float(inside.sum()) * px * px / 1e6
res = {
    "concelho": name, "dico": dico, "area_km2": round(area_km2, 1), "tiles_z14": (x1 - x0 + 1) * (y1 - y0 + 1), "dem_bytes": nbytes,
    "px_m": round(px, 2), "elev_min_max_m": [round(float(dem[inside].min())), round(float(dem[inside].max()))],
    "shares_native": shares(native, inside), "shares_10m": shares(s10, in10),
    "class_png_10m_bytes": buf.tell(), "class_px_10m": int(s10.size), "fetch_s": round(t_fetch, 1), "slope_s": round(t_slope, 2),
}
(out / f"result-{dico}.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
print(json.dumps(res, ensure_ascii=False))
