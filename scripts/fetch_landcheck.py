"""Fetch the land check sources -> data/external/landcheck/<source id>/.

The ICNF hazard GeoTIFF zip is downloaded with curl (resuming a .part file), verified against the pinned
SHA-256 in landcheck_config and unpacked into src/. A file already present is only re-verified,
unless --refresh is given. fetch.json records the URL, the SHA-256 and the UTC download date, which
the ICNF citation needs ("ICNF, layer, URL, download date").

Usage: uv run python scripts/fetch_landcheck.py [--refresh]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import landcheck_config as cfg  # noqa: E402
from fetch_protected import USER_AGENT, now_utc, sha256_file  # noqa: E402


def download(url: str, dest: Path) -> None:
    """curl, as `make download` uses for CAOP: geocatalogo.icnf.pt chains to Sectigo's E46 root, which
    the system trust store has and Python's bundled OpenSSL store may not. Verification stays on."""
    part = dest.with_suffix(dest.suffix + ".part")
    subprocess.run(["curl", "-sSfL", "--retry", "3", "-C", "-", "-A", USER_AGENT, "-o", str(part), url], check=True)
    part.replace(dest)


def fetch(source: cfg.RasterSource, refresh: bool) -> dict:
    out = source.cache_dir()
    out.mkdir(parents=True, exist_ok=True)
    zip_path = source.zip_path()
    record = out / "fetch.json"
    if refresh or not zip_path.exists():
        print(f"{source.id}: downloading {source.download_url}")
        download(source.download_url, zip_path)
        fetched = now_utc()
    else:
        fetched = json.loads(record.read_text())["fetched"] if record.exists() else now_utc()
    digest = sha256_file(zip_path)
    if digest != source.sha256:
        zip_path.unlink()
        raise SystemExit(f"{source.id}: SHA-256 {digest} does not match the pinned {source.sha256}; the source changed, check it and update landcheck_config")
    with zipfile.ZipFile(zip_path) as z:
        if source.zip_member not in z.namelist():
            raise SystemExit(f"{source.id}: {source.zip_member} not in the zip ({z.namelist()})")
        z.extractall(out / "src")
    info = {"id": source.id, "url": source.download_url, "sha256": digest, "fetched": fetched}
    record.write_text(json.dumps(info, indent=2) + "\n")
    print(f"{source.id}: ok ({zip_path.stat().st_size / 1e6:.1f} MB, fetched {fetched})")
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="download again even if the file is present")
    args = parser.parse_args()
    fetch(cfg.HAZARD, args.refresh)


if __name__ == "__main__":
    main()
