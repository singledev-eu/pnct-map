"""Build the web map's single TopoJSON file from the simplified parish layer.

Input:  data/processed/parishes_all.geojson (already simplified by build_geo.py)
Outputs: web/data/pnct-status.json (the disputed parishes and the legal sources, bundled; from
data/pnct_status.csv) and web/data/pnct.topo.json with two objects:
  parishes   dicofre, freguesia, concelho, distrito, pnct
  concelhos  name, distrito, pnct_count, parish_count
             (dissolved here on dicofre[:4]; the web app's concelho level derives
             whole / partly / not PNCT from the two counts, see web/src/layers.ts)
"""

from __future__ import annotations

import gzip
import json
import os
import subprocess
from pathlib import Path

from pnct_status import checked_date, load_overrides

ROOT = Path(__file__).resolve().parents[1]
IN_PARISHES = ROOT / "data/processed/parishes_all.geojson"
OUT_TOPO = ROOT / "web/data/pnct.topo.json"
OUT_STATUS = ROOT / "web/data/pnct-status.json"

# The documents the disputed rows cite, with labels for the UI (document names; EN and PT).
DOCUMENTS = {
    "https://files.diariodarepublica.pt/1s/2017/07/13400/0373103734.pdf": {"en": "Portaria 208/2017 (Diário da República)", "pt": "Portaria 208/2017 (Diário da República)"},
    "https://www.compete2020.gov.pt/admin/images/Deliberacoes_cic_territ%C3%B3rios_baixa_densidade.pdf": {"en": "CIC Deliberação 20/2018", "pt": "Deliberação CIC 20/2018"},
    "https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf": {"en": "IEFP list of 2026-02-04", "pt": "Lista IEFP de 04-02-2026"},
}
LEGAL_URL = "https://files.diariodarepublica.pt/1s/2017/07/13400/0373103734.pdf"


def write_status() -> None:
    rows = [r for r in load_overrides() if r["status"] == "disputed"]
    unknown = {s for r in rows for s in r["sources"]} - set(DOCUMENTS)
    if unknown:
        raise SystemExit(f"pnct_status.csv cites documents without a label in build_topo.DOCUMENTS: {sorted(unknown)}")
    status = {
        "checked": checked_date(),
        "legal": {"url": LEGAL_URL, **DOCUMENTS[LEGAL_URL]},
        "disputed": {r["dicofre"]: {"legal": r["legal_status"], "iefp": r["iefp_status"],
                                     "sources": [{"url": s, **DOCUMENTS[s]} for s in r["sources"]]} for r in rows},
    }
    OUT_STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT_STATUS.relative_to(ROOT)}: {len(rows)} disputed parishes")

MAPSHAPER = "mapshaper@0.7.68"
# 1.2e5 steps over mainland Portugal (~5.2° of latitude in the data) is ~4.8 m
# per step, inside the 5 m budget tests/test_pipeline.py enforces and far below
# a pixel at zoom 12 (~15 m/px at 40°N, 512px tiles). It is ~9% smaller gzipped
# than the previous 2e5 (~3 m) with no visible difference; the 6% simplification
# in build_geo.py removes far more detail than either.
QUANTIZATION = "120000"


def main() -> None:
    OUT_TOPO.parent.mkdir(parents=True, exist_ok=True)
    write_status()
    env = {**os.environ, "npm_config_cache": str(ROOT / ".npm-cache"), "npm_config_update_notifier": "false"}
    cmd = [
        "npx", "-y", MAPSHAPER,
        "-i", str(IN_PARISHES), "name=parishes",
        "-each", "dtmn=dicofre.slice(0,4)",
        "-dissolve", "dtmn", "copy-fields=concelho,distrito",
        "calc=pnct_count=sum(pnct ? 1 : 0), parish_count=count()",
        "+", "name=concelhos",
        "-target", "concelhos",
        "-rename-fields", "name=concelho",
        "-filter-fields", "name,distrito,pnct_count,parish_count",
        "-target", "parishes",
        "-filter-fields", "dicofre,freguesia,concelho,distrito,pnct",
        "-o", str(OUT_TOPO), "format=topojson", "target=parishes,concelhos",
        f"quantization={QUANTIZATION}",
    ]
    subprocess.run(cmd, check=True, env=env)
    raw = OUT_TOPO.read_bytes()
    print(
        f"{OUT_TOPO.relative_to(ROOT)}: {len(raw) / 1024:.0f} KB raw, "
        f"{len(gzip.compress(raw, 9)) / 1024:.0f} KB gzipped"
    )


if __name__ == "__main__":
    main()
