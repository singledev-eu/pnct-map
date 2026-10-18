"""Fetch the INE population indicators for the concelho card (offline, into data/external/ine/).

For each query in concelhos_config.QUERIES: the indicator metadata, then the data for its period
(every geography: the API returns country, regions and municipalities when Dim2 is left out).
Writes <name>.json (the raw response) and fetch.json (per query: URL, indicator name, period,
INE's last-update date and the fetch time), which build_concelhos.py copies into the field meta.

The estimate year is ESTIMATE_YEAR, or the indicator's latest period (UltimoPeriodo); it must be
the same for every estimate indicator and not before FIRST_ESTIMATE_YEAR. The API times out now
and then, so each request is retried with backoff. Cached files are reused unless --refresh.

Usage: uv run python scripts/fetch_ine.py [--refresh]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time
import urllib.error
import urllib.request

import concelhos_config as cfg

UA = {"User-Agent": "pnct-map data pipeline (+https://pnct.singledev.eu)"}


def get_json(url: str, attempts: int = 6) -> list:
    """GET url as JSON; retries timeouts, connection errors and 5xx, then gives up."""
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise
            why = f"HTTP {e.code}"
        except (TimeoutError, urllib.error.URLError, ConnectionError) as e:
            why = type(e).__name__
        print(f"  {why}, retry {attempt}/{attempts - 1}: {url}")
        time.sleep(min(30, 2**attempt))
    raise SystemExit(f"INE did not answer after {attempts} attempts: {url}")


def check_ok(data: list, url: str) -> dict:
    head = data[0] if isinstance(data, list) and data else {}
    if "Falso" in head.get("Sucesso", {}) or "Dados" not in head:
        raise SystemExit(f"INE refused {url}: {head.get('Sucesso', head)}")
    return head


def estimate_year(metas: dict[str, dict]) -> int:
    """ESTIMATE_YEAR, or the latest period every estimate indicator has."""
    codes = {q.code for q in cfg.QUERIES if q.period == "estimate"}
    for code in codes:
        if cfg.SERIES_NOTE not in json.dumps(metas[code], ensure_ascii=False):
            raise SystemExit(f"{code}: the series note on administrative estimates is gone from the metadata; check for a revision")
    latest = min(int(metas[c]["UltimoPeriodo"]) for c in codes)
    year = cfg.ESTIMATE_YEAR or latest
    if year < cfg.FIRST_ESTIMATE_YEAR:
        raise SystemExit(f"estimate year {year} is before the current series ({cfg.FIRST_ESTIMATE_YEAR}+)")
    if year > latest:
        raise SystemExit(f"estimate year {year} is not published yet (latest {latest})")
    return year


def fetch(refresh: bool) -> None:
    cfg.CACHE.mkdir(parents=True, exist_ok=True)
    meta_path = cfg.CACHE / "fetch.json"
    if meta_path.exists() and not refresh and all((cfg.CACHE / f"{q.name}.json").exists() for q in cfg.QUERIES):
        print(f"cached: {meta_path} (--refresh to download again)")
        return
    metas = {}
    for code in sorted({q.code for q in cfg.QUERIES}):
        metas[code] = get_json(cfg.META_API + code)[0]
        (cfg.CACHE / f"meta_{code}.json").write_text(json.dumps(metas[code], ensure_ascii=False, indent=1), encoding="utf-8")
    year = estimate_year(metas)
    record = {"estimate_year": year, "queries": {}}
    for q in cfg.QUERIES:
        period = str(year) if q.period == "estimate" else q.period
        url = f"{cfg.API}&varcd={q.code}&Dim1=S7A{period}{q.dims}"
        data = get_json(url)
        head = check_ok(data, url)
        if list(head["Dados"]) != [period]:
            raise SystemExit(f"{url}: asked for {period}, got {list(head['Dados'])}")
        (cfg.CACHE / f"{q.name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        record["queries"][q.name] = {
            "code": q.code,
            "indicator": metas[q.code]["IndicadorNome"],
            "period": period,
            "url": url,
            "ine_updated": metas[q.code]["DataUltimaAtualizacao"],
            "fetched_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        }
        print(f"{q.name}: {q.code} {period}, {sum(len(v) for v in head['Dados'].values())} rows")
    meta_path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="download again even if cached")
    fetch(ap.parse_args().refresh)
