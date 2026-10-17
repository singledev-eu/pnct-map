"""Fetch the protected-area sources -> data/external/protected/<source id>/.

For every enabled category of protected_config (optionally just one with --only):
  ArcGisSource  every layer is paged out as GeoJSON (EPSG:4326) into layer<id>.geojson. The feature count
                is checked against the server's returnCountOnly and object ids must be unique, so a
                half-finished or duplicated download fails instead of silently producing a short file.
  FileSource    one file is downloaded (resuming a .part file) and verified against the pinned sha256.
                A file that is already present is only re-verified, unless --refresh is given.
Each source directory also gets a fetch.json (provenance: url, licence, UTC fetch time, sha256 per file).

Usage: uv run python scripts/fetch_protected.py [--refresh] [--only CATEGORY]

All network access goes through http_get / http_stream, which tests replace.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import protected_config  # noqa: E402
from protected_config import ArcGisSource, FileSource  # noqa: E402

ROOT = protected_config.ROOT

USER_AGENT = "pnct-map-pipeline (+https://pnct.singledev.eu)"
TIMEOUT_S = 120
BACKOFF_S = (1, 2, 4)  # waits between the 4 attempts of one request
MAX_PAGES = 1000
CHUNK = 1024 * 1024
PROGRESS_EVERY = 100 * CHUNK


# ---------------------------------------------------------------------------------------------
# HTTP layer (the only code that touches the network)
# ---------------------------------------------------------------------------------------------


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code >= 500
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError))


def _with_retries(fn):
    for attempt in range(len(BACKOFF_S) + 1):
        try:
            return fn()
        except Exception as exc:
            if attempt == len(BACKOFF_S) or not _retryable(exc):
                raise
            print(f"  request failed ({exc}); retry {attempt + 1}/{len(BACKOFF_S)} in {BACKOFF_S[attempt]} s")
            time.sleep(BACKOFF_S[attempt])


def _request(url: str, headers: dict[str, str] | None) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})


def http_get(url: str, headers: dict[str, str] | None = None) -> bytes:
    """GET a URL and return the whole body. Retried on timeouts, connection errors and HTTP 5xx."""

    def once() -> bytes:
        with urllib.request.urlopen(_request(url, headers), timeout=TIMEOUT_S) as resp:
            return resp.read()

    return _with_retries(once)


def http_stream(url: str, headers: dict[str, str] | None = None) -> tuple[int, Iterator[bytes]]:
    """GET a URL and return (status, iterator of 1 MB chunks). Only opening the connection is retried."""
    resp = _with_retries(lambda: urllib.request.urlopen(_request(url, headers), timeout=TIMEOUT_S))

    def chunks() -> Iterator[bytes]:
        with resp:
            while chunk := resp.read(CHUNK):
                yield chunk

    return resp.status, chunks()


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------


def now_utc() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def write_atomic(path: Path, data: bytes) -> None:
    part = path.with_suffix(path.suffix + ".part")
    part.write_bytes(data)
    part.replace(path)


def get_json(url: str) -> dict:
    data = json.loads(http_get(url))
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        msg = err.get("message", err) if isinstance(err, dict) else err
        details = err.get("details") if isinstance(err, dict) else None
        raise SystemExit(f"ArcGIS error from {url}: {msg}" + (f" ({'; '.join(map(str, details))})" if details else ""))
    return data


# ---------------------------------------------------------------------------------------------
# ArcGIS
# ---------------------------------------------------------------------------------------------


def _exceeded(page: dict) -> bool:
    props = page.get("properties") or {}
    return bool(page.get("exceededTransferLimit") or props.get("exceededTransferLimit"))


def fetch_layer(source: ArcGisSource, layer: int, out_dir: Path) -> dict:
    base = f"{source.service}/{layer}"
    expected = get_json(f"{base}/query?" + urllib.parse.urlencode({"where": "1=1", "returnCountOnly": "true", "f": "json"}))["count"]
    info = get_json(f"{base}?f=json")
    page_size = max(1, min(source.page_size, info.get("maxRecordCount") or source.page_size))
    oid_field = info.get("objectIdField") or next(
        (f["name"] for f in info.get("fields") or [] if f.get("type") == "esriFieldTypeOID"), "OBJECTID"
    )  # MapServer layers often state only the field type

    features: list[dict] = []
    for n in range(MAX_PAGES):
        params = {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
            "f": "geojson",
            "orderByFields": oid_field,
            "resultOffset": len(features),
            "resultRecordCount": page_size,
        }
        page = get_json(f"{base}/query?" + urllib.parse.urlencode(params))
        got = page.get("features", [])
        features.extend(got)
        if not got or (len(got) < page_size and not _exceeded(page)):
            break
    else:
        raise SystemExit(f"{source.id} layer {layer}: still paging after {MAX_PAGES} pages")

    if len(features) != expected:
        raise SystemExit(f"{source.id} layer {layer}: got {len(features)} features, the server counts {expected}")
    ids = [(f.get("properties") or {}).get(oid_field, f.get("id")) for f in features]
    ids = [i for i in ids if i is not None]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"{source.id} layer {layer}: duplicate {oid_field} values ({len(ids) - len(set(ids))} repeats)")

    for f in features:
        f["properties"] = {**(f.get("properties") or {}), "layer": layer}
    name = f"layer{layer}.geojson"
    write_atomic(out_dir / name, json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")).encode())
    return {"name": name, "features": len(features), "sha256": sha256_file(out_dir / name)}


def fetch_arcgis(source: ArcGisSource, out_dir: Path) -> tuple[list[dict], str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    files = [fetch_layer(source, layer, out_dir) for layer in source.layers]
    return files, now_utc()


# ---------------------------------------------------------------------------------------------
# File download
# ---------------------------------------------------------------------------------------------


def _auth_headers(source: FileSource) -> dict[str, str]:
    if source.download_auth is None:
        return {}
    return {"Authorization": "Basic " + base64.b64encode(source.download_auth.encode()).decode()}


def download_file(source: FileSource, part: Path) -> None:
    """Download into `part`, resuming it if it exists (restarting from zero if the server ignores Range)."""
    for _ in range(2):
        offset = part.stat().st_size if part.exists() else 0
        headers = _auth_headers(source)
        if offset:
            headers["Range"] = f"bytes={offset}-"
        try:
            status, chunks = http_stream(source.download_url, headers)
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and offset:
                if (exc.headers.get("Content-Range") or "").endswith(f"/{offset}"):
                    return  # the .part is already the whole file
                part.unlink()  # the .part is not a prefix of the file any more
                continue
            raise
        if status == 206:
            print(f"  resuming {part.name} at {offset / CHUNK:.0f} MB")
        else:
            offset = 0
        written, next_report = offset, (offset // PROGRESS_EVERY + 1) * PROGRESS_EVERY
        with part.open("ab" if offset else "wb") as f:
            for chunk in chunks:
                f.write(chunk)
                written += len(chunk)
                if written >= next_report:
                    print(f"  {written / CHUNK:.0f} MB")
                    next_report += PROGRESS_EVERY
        return
    raise SystemExit(f"{source.id}: could not download {source.download_url}")


def _previous_fetched_at(out_dir: Path) -> str | None:
    try:
        return json.loads((out_dir / "fetch.json").read_text())["fetched_at"]
    except (OSError, ValueError, KeyError):
        return None


def _check_sha(source: FileSource, path: Path, digest: str) -> None:
    if source.sha256 is None:
        print(f"  sha256 {digest}\n  not pinned: set sha256=\"{digest}\" for {source.id} in scripts/protected_config.py")
    elif digest != source.sha256:
        raise SystemExit(f"{source.id}: sha256 mismatch for {path.name}: expected {source.sha256}, got {digest}")


def fetch_file(source: FileSource, out_dir: Path, refresh: bool = False) -> tuple[list[dict], str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / source.filename
    if path.exists() and not refresh:
        digest = sha256_file(path)
        if source.sha256 is not None and digest != source.sha256:
            raise SystemExit(f"{source.id}: existing {path.name} has sha256 {digest}, expected {source.sha256} (use --refresh to download again)")
        _check_sha(source, path, digest)
        fetched_at = _previous_fetched_at(out_dir) or datetime.fromtimestamp(path.stat().st_mtime, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"  {path.name} already present, not downloaded")
    else:
        part = path.with_suffix(path.suffix + ".part")
        if refresh and part.exists():
            part.unlink()
        download_file(source, part)
        digest = sha256_file(part)
        _check_sha(source, part, digest)  # on a mismatch the .part stays
        part.replace(path)
        fetched_at = now_utc()
    return [{"name": path.name, "bytes": path.stat().st_size, "sha256": digest}], fetched_at


# ---------------------------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------------------------


def fetch_source(category: str, source: ArcGisSource | FileSource, out_dir: Path | None = None, refresh: bool = False) -> dict:
    """Fetch one source into out_dir (default: the source's cache dir) and write its fetch.json."""
    out_dir = out_dir or source.cache_dir()
    if isinstance(source, ArcGisSource):
        files, fetched_at = fetch_arcgis(source, out_dir)
    else:
        files, fetched_at = fetch_file(source, out_dir, refresh)
    meta = {
        "source": source.id,
        "category": category,
        "provider": source.provider,
        "title": source.title,
        "url": source.url,
        "fetched_at": fetched_at,
        "licence": source.licence,
        "licence_url": source.licence_url,
        "licence_confirmed": source.licence_confirmed,
        "files": files,
    }
    write_atomic(out_dir / "fetch.json", (json.dumps(meta, indent=2, ensure_ascii=False) + "\n").encode())
    return meta


def summary(meta: dict) -> str:
    parts = [f"{f['name']} ({f['features']} features)" if "features" in f else f"{f['name']} ({f['bytes'] / CHUNK:.1f} MB)" for f in meta["files"]]
    return f"{meta['category']}: {meta['source']} -> {', '.join(parts)}"


def main() -> None:
    sources = protected_config.enabled()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refresh", action="store_true", help="download file sources again even if present")
    ap.add_argument("--only", choices=list(sources), help="fetch just this category")
    args = ap.parse_args()

    for category, source in sources.items():
        if args.only and category != args.only:
            continue
        print(f"{category}: {source.id}")
        print(summary(fetch_source(category, source, refresh=args.refresh)))


if __name__ == "__main__":
    main()
