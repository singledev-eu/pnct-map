"""Fetch the nearby-services sources -> data/external/services/ (docs/nearby-services/DATA.md).

  osm/portugal-<yymmdd>.osm.pbf  the dated Geofabrik Portugal extract (curl, resumable), checked against
                                 the pinned SHA-256 and Geofabrik's MD5 in services_config
  sns/urgencias.json             the SNS emergency-service list (transparencia.sns.gov.pt export). It
                                 changes without notice, so it is not pinned: its SHA-256 and the fetch
                                 date go to fetch.json, and build_services only uses it to check that
                                 every row of data/services/sns_urgencias.csv is still in the list.

Files already present are only re-verified, unless --refresh is given.

Usage: uv run python scripts/fetch_services.py [--refresh]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import services_config as cfg  # noqa: E402
from fetch_protected import USER_AGENT, now_utc, sha256_file  # noqa: E402


def curl(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    subprocess.run(["curl", "-sSfL", "--retry", "3", "-C", "-", "-A", USER_AGENT, "-o", str(part), url], check=True)
    part.replace(dest)


def md5_file(path: Path) -> str:
    h = hashlib.md5()  # noqa: S324 (Geofabrik publishes MD5; SHA-256 is the pin)
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def pbf_path() -> Path:
    return cfg.CACHE / "osm" / Path(cfg.OSM_URL).name


def fetch_osm(refresh: bool) -> dict:
    dest = pbf_path()
    if refresh or not dest.exists():
        print(f"osm: downloading {cfg.OSM_URL}")
        curl(cfg.OSM_URL, dest)
    digest = sha256_file(dest)
    if digest != cfg.OSM_SHA256:
        raise SystemExit(f"osm: SHA-256 {digest} does not match the pinned {cfg.OSM_SHA256}; check the file and update services_config")
    if md5_file(dest) != cfg.OSM_MD5:
        raise SystemExit("osm: MD5 does not match Geofabrik's")
    print(f"osm: ok ({dest.stat().st_size / 1e6:.0f} MB, data up to {cfg.OSM_DATE})")
    return {"url": cfg.OSM_URL, "sha256": digest, "osm_date": cfg.OSM_DATE}


def fetch_sns(refresh: bool) -> dict:
    dest = cfg.CACHE / "sns" / "urgencias.json"
    record = cfg.CACHE / "sns" / "fetch.json"
    if refresh or not dest.exists():
        print(f"sns: downloading {cfg.SNS_URGENCIAS_URL}")
        curl(cfg.SNS_URGENCIAS_URL, dest)
        fetched = now_utc()
    else:
        fetched = json.loads(record.read_text())["fetched"] if record.exists() else now_utc()
    rows = json.loads(dest.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows or "nome_do_servico_de_urgencia" not in rows[0]:
        raise SystemExit("sns: unexpected export format")
    info = {"url": cfg.SNS_URGENCIAS_URL, "sha256": sha256_file(dest), "rows": len(rows), "fetched": fetched}
    record.write_text(json.dumps(info, indent=2) + "\n")
    print(f"sns: ok ({len(rows)} rows, fetched {fetched})")
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="download again even if the files are present")
    args = parser.parse_args()
    osm = fetch_osm(args.refresh)
    sns = fetch_sns(args.refresh)
    (cfg.CACHE / "fetch.json").write_text(json.dumps({"osm": osm, "sns": sns, "checked": now_utc()}, indent=2) + "\n")


if __name__ == "__main__":
    main()
