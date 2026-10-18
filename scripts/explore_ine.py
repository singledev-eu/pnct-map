"""Exploratory (concelho card, phase 1): fetch the INE population indicators and check them against CAOP.

Fetches (INE JSON API, cached in the gitignored data/external/ine/):
  0012917  resident population at 31 Dec, NUTS 2024, by sex and life-cycle age group (annual
           estimates, current series 2021+). Total, 0-14 and 65+ for the latest year, total for 2021.
  0012909  ageing index, NUTS 2024 (same estimates), latest year.
  0011609  resident population at the 2011 and 2021 Censuses (NUTS 2013), totals.
Then prints: code coverage against the 278 CAOP 2025 mainland municipalities, name mismatches, the
national ageing index, a recomputation of the index from 0012917, value ranges, and the 2021 series
break (administrative estimate vs Census, per municipality).

0012905 (population by single year of age) looks like the obvious series but only goes down to
NUTS 2; municipalities are in 0012917. The API times out now and then: every request is retried.

Usage: uv run python scripts/explore_ine.py [--year 2025] [--refresh]
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request
from pathlib import Path

import pyogrio

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/external/ine"
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
API = "https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT"
META = "https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp?lang=PT&varcd="


def get_json(url: str, path: Path, refresh: bool) -> list:
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    for attempt in range(1, 6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pnct-map (+https://pnct.singledev.eu)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read())
            if isinstance(data, list) and data and "Falso" in json.dumps(data[0].get("Sucesso", {})):
                raise RuntimeError(f"INE refused {url}: {data[0]['Sucesso']}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except (TimeoutError, OSError) as e:
            print(f"  retry {attempt} after {type(e).__name__} ({url})")
            time.sleep(2 * attempt)
    raise SystemExit(f"INE did not answer: {url}")


def values(data: list) -> dict[str, float]:
    """{geocod: value} over every period in the response (one period requested)."""
    return {r["geocod"]: float(r["valor"]) for rows in data[0]["Dados"].values() for r in rows if r.get("valor") not in (None, "")}


def municipal(vals: dict[str, float]) -> dict[str, float]:
    """Mainland municipalities by DICO: NUTS 2024 codes are NUTS3 (3 chars) + DICO; the Census table uses the bare DICO."""
    out = {}
    for code, v in vals.items():
        if len(code) == 7 and code.startswith("1"):
            out[code[3:]] = v
        elif len(code) == 4 and code[:2] <= "18":
            out[code] = v
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default="2025")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    y = a.year
    q = lambda name, params: get_json(f"{API}&{params}", CACHE / f"{name}.json", a.refresh)  # noqa: E731

    meta = {c: get_json(META + c, CACHE / f"meta_{c}.json", a.refresh)[0] for c in ["0012917", "0012909", "0011609"]}
    for c, m in meta.items():
        print(f"{c}: {m['IndicadorNome'][:110]}… periods {m['PrimeiroPeriodo']}–{m['UltimoPeriodo']}, updated {m['DataUltimaAtualizacao']}")

    pop = values(q(f"0012917_{y}_T", f"varcd=0012917&Dim1=S7A{y}&Dim3=T&Dim4=T"))
    young = values(q(f"0012917_{y}_0-14", f"varcd=0012917&Dim1=S7A{y}&Dim3=T&Dim4=1"))
    old = values(q(f"0012917_{y}_65+", f"varcd=0012917&Dim1=S7A{y}&Dim3=T&Dim4=4"))
    pop21 = values(q("0012917_2021_T", "varcd=0012917&Dim1=S7A2021&Dim3=T&Dim4=T"))
    ageing = values(q(f"0012909_{y}", f"varcd=0012909&Dim1=S7A{y}"))
    c11 = values(q("0011609_2011_T", "varcd=0011609&Dim1=S7A2011&Dim3=T&Dim4=T"))
    c21 = values(q("0011609_2021_T", "varcd=0011609&Dim1=S7A2021&Dim3=T&Dim4=T"))

    caop = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_municipios", read_geometry=False).set_index("dtmn")
    dicos = set(caop.index)
    for name, vals in [("pop", pop), ("ageing", ageing), ("census 2011", c11), ("census 2021", c21)]:
        m = municipal(vals)
        print(f"{name}: {len(m)} mainland municipalities; CAOP missing: {sorted(dicos - set(m))}; extra: {sorted(set(m) - dicos)}")

    print(f"ageing index {y}: Portugal {ageing['PT']}, Continente {ageing['1']} (recomputed {100 * old['PT'] / young['PT']:.1f}, {100 * old['1'] / young['1']:.1f})")
    p, ag, b11, b21 = municipal(pop), municipal(ageing), municipal(c11), municipal(c21)
    o, yg, e21 = municipal(old), municipal(young), municipal(pop21)
    print(f"max |recomputed - published| ageing: {max(abs(100 * o[d] / yg[d] - ag[d]) for d in dicos):.2f}")
    dens = {d: p[d] / (caop.at[d, "area_ha"] / 100) for d in dicos}
    for label, series in [("population", p), ("density /km²", dens), ("ageing", ag)]:
        lo, hi = min(series, key=series.get), max(series, key=series.get)
        print(f"{label}: min {caop.at[lo, 'municipio']} {series[lo]:.1f}, median {statistics.median(series.values()):.1f}, max {caop.at[hi, 'municipio']} {series[hi]:.1f}")
    gap = {d: 100 * (e21[d] - b21[d]) / b21[d] for d in dicos}
    print(f"2021 estimate vs Census 2021 per municipality: min {min(gap.values()):.1f}%, median {statistics.median(gap.values()):.1f}%, max {max(gap.values()):.1f}%")
    flip = [d for d in dicos if b21[d] < b11[d] and p[d] > b11[d]]
    print(f"lost people 2011→2021 (Census) but {y} estimate > Census 2011: {len(flip)} municipalities")


if __name__ == "__main__":
    main()
