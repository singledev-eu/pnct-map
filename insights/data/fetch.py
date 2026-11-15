"""Download the insight sources into insights/data/raw/ (gitignored). Cached files are kept unless
refresh=True. Writes raw/fetch.json: per file, the URL, period, the source's own update date and the
fetch time. CAOP 2024 is downloaded only if the main pipeline doesn't already have it.

    python -m insights fetch [--refresh]
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from insights import config as cfg


def _get(url: str, data: bytes | None = None, attempts: int = 6) -> bytes:
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=cfg.UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise
            why = f"HTTP {e.code}"
        except (TimeoutError, urllib.error.URLError, ConnectionError) as e:
            why = type(e).__name__
        print(f"  {why}, retry {attempt}/{attempts - 1}: {url}")
        time.sleep(min(30, 2**attempt))
    raise SystemExit(f"no answer after {attempts} attempts: {url}")


def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def fetch_ine(record: dict, refresh: bool) -> None:
    metas = {}
    for name, (code, period, dims) in cfg.INE_QUERIES.items():
        out = cfg.RAW / f"ine_{name}.json"
        if out.exists() and not refresh and name in record:
            print(f"cached: {out.name}")
            continue
        if code not in metas:
            metas[code] = json.loads(_get(cfg.INE_META_API + code))[0]
        meta = metas[code]
        if period == "latest":
            period = str(meta["UltimoPeriodo"])
        url = f"{cfg.INE_API}&varcd={code}&Dim1=S7A{period}{dims}"
        data = json.loads(_get(url))
        head = data[0] if isinstance(data, list) and data else {}
        if "Dados" not in head or list(head["Dados"]) != [period]:
            raise SystemExit(f"INE refused or answered another period for {url}: {str(head)[:300]}")
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        record[name] = {
            "file": out.name,
            "code": code,
            "indicator": meta["IndicadorNome"],
            "period": period,
            "url": url,
            "source_updated": meta["DataUltimaAtualizacao"],
            "fetched_at": _now(),
        }
        print(f"{name}: {code} {period}, {len(head['Dados'][period])} rows")


def fetch_airports(record: dict, refresh: bool) -> None:
    out = cfg.RAW / "osm_airports.json"
    if out.exists() and not refresh and "airports" in record:
        print(f"cached: {out.name}")
        return
    body = urllib.parse.urlencode({"data": cfg.AIRPORTS_QUERY}).encode()
    data = json.loads(_get(cfg.OVERPASS, data=body))
    found = {e["tags"].get("iata") for e in data["elements"]}
    if found != set(cfg.AIRPORTS):
        raise SystemExit(f"Overpass returned airports {sorted(found)}, expected {sorted(cfg.AIRPORTS)}")
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    record["airports"] = {
        "file": out.name,
        "url": cfg.OVERPASS,
        "query": cfg.AIRPORTS_QUERY,
        "source_updated": data["osm3s"]["timestamp_osm_base"],
        "fetched_at": _now(),
    }
    print(f"airports: {len(data['elements'])} from OSM")


def fetch_caop_2024() -> None:
    if cfg.CAOP_2024.exists():
        return
    if not cfg.CAOP_2024_ZIP.exists():
        cfg.CAOP_2024_ZIP.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {cfg.CAOP_2024_URL}")
        blob = _get(cfg.CAOP_2024_URL)
        digest = hashlib.sha256(blob).hexdigest()
        if digest != cfg.CAOP_2024_SHA256:
            raise SystemExit(f"CAOP 2024 SHA-256 mismatch: {digest}")
        cfg.CAOP_2024_ZIP.write_bytes(blob)
    with zipfile.ZipFile(cfg.CAOP_2024_ZIP) as z:
        z.extractall(cfg.CAOP_2024.parent)


def fetch(refresh: bool = False) -> None:
    cfg.RAW.mkdir(parents=True, exist_ok=True)
    rec_path = cfg.RAW / "fetch.json"
    record = json.loads(rec_path.read_text()) if rec_path.exists() and not refresh else {}
    fetch_ine(record, refresh)
    fetch_airports(record, refresh)
    rec_path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    fetch_caop_2024()
    if not cfg.CAOP_2025.exists():
        raise SystemExit(f"missing {cfg.CAOP_2025}: run `uv run make download` first")
