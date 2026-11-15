#!/usr/bin/env python3
"""pnct-map source watcher: tells you on Telegram when a land check source needs attention.

Runs weekly on the Raspberry Pi (ops/pi/README.md). It never rebuilds or deploys anything. The
source list is scripts/landcheck_config.py (docs/land-check/DATA.md):

  hazard        the live ICNF wildfire hazard zip. A HEAD gives status, size, ETag and Last-Modified;
                only when one of them differs from last time (or on the first run), or when the last
                full check is FORCE_SHA_DAYS old, is the ~20 MB file downloaded, streamed through
                SHA-256 (never written to disk), and compared with the pin. The monthly forced check
                catches a silent replacement that keeps the size and the server's metadata.
  hazard-pages  the ICNF catalogue page still links that zip, and the metadata page answers.
  BLOCKED[...]  the endpoints whose change would unblock a fact: DGT SRUP WFS (GetCapabilities plus a
                one-feature GetFeature) and WMS for REN, the dados.gov.pt datasets (licence, and whether a
                downloadable file resource is listed), the SNIG use constraints, the ANACOM ArcGIS
                capabilities.

Each check stores its last observation in STATE_DIR/state.json (a few KB). A message is sent only when
an observation changes in a way that needs you; a check that fails to answer for ERROR_RUNS runs in a
row is reported once. With nothing to report for HEARTBEAT_DAYS, one "all quiet" message is sent. The
first run records a baseline and says so.

Usage:
  source_watcher.py [--dry-run] [--state-dir DIR] [--env-file FILE]
  source_watcher.py --test-message [--env-file FILE]

  --dry-run   prints the status of every check and the message it would send; sends nothing and
              writes no state (add --save-state to simulate a series of runs locally). Works anywhere
              Python 3.11+ runs (macOS included).
Environment (systemd reads /etc/pnct/pi.env): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, STATE_DIR
(default: systemd's $STATE_DIRECTORY, else /var/lib/pnct-watcher).

Standard library only, so the Pi needs nothing but python3 and ca-certificates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import landcheck_config as cfg  # noqa: E402

USER_AGENT = "pnct-map-source-watcher (+https://pnct.singledev.eu)"
TIMEOUT_S = 120  # per request: the DGT services take ~90 s to fail
MAX_BODY = 4 * 1024 * 1024  # pages and API answers; the hazard zip is hashed in a stream instead
CHUNK = 1024 * 1024
HEARTBEAT_DAYS = 28
FORCE_SHA_DAYS = 28  # the hazard file is hashed at least this often, whatever its HEAD says (every 4th weekly run)
ERROR_RUNS = 3  # a page or API that doesn't answer for this many runs in a row is reported (once)
STATE_VERSION = 1
TELEGRAM_LIMIT = 4000  # the API allows 4096 characters

# A dados.gov.pt resource with one of these formats (or file extensions) is a downloadable file,
# not a view service.
FILE_FORMATS = {"zip", "csv", "gpkg", "geopackage", "shp", "shapefile", "geojson", "json", "xlsx", "xls", "ods", "tif", "tiff", "geotiff", "gml", "kml", "kmz", "parquet", "txt", "xml"}
SERVICE_FORMATS = {"wms", "wmts", "wfs", "wcs", "esri rest", "arcgis", "api", "html"}

# ---------------------------------------------------------------------------------------------
# HTTP (the only code that touches the network; tests replace it)
# ---------------------------------------------------------------------------------------------


@dataclass
class Response:
    status: int | None  # None: no answer (timeout, DNS, TLS, connection)
    headers: dict[str, str] = field(default_factory=dict)  # lower-case names
    body: bytes = b""
    error: str = ""
    sha256: str | None = None  # set by Http.download_sha256
    size: int | None = None

    @property
    def ok(self) -> bool:
        return self.status is not None and 200 <= self.status < 300

    def describe(self) -> str:
        return f"HTTP {self.status}" if self.status is not None else (self.error or "no answer")


def ssl_context() -> ssl.SSLContext:
    """The system trust store (Debian's ca-certificates on the Pi), plus certifi's when it is installed.

    geocatalogo.icnf.pt chains to Sectigo's E46 root, which some Python builds' default store lacks (uv's
    on macOS). Verification is never turned off."""
    ctx = ssl.create_default_context()
    try:
        import certifi  # type: ignore[import-not-found]

        ctx.load_verify_locations(certifi.where())
    except ImportError:
        pass
    return ctx


class Http:
    def __init__(self, timeout: float = TIMEOUT_S) -> None:
        self.timeout = timeout
        self.ctx = ssl_context()

    def _open(self, url: str, method: str):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
        return urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx)

    def request(self, url: str, method: str = "GET", attempts: int = 1) -> Response:
        """One request (retried on no answer or HTTP 5xx when attempts > 1), body capped at MAX_BODY."""
        res = Response(None)
        for attempt in range(attempts):
            res = self._once(url, method)
            if res.status is not None and res.status < 500:
                return res
            if attempt + 1 < attempts:
                time.sleep(5 * (attempt + 1))
        return res

    def _once(self, url: str, method: str) -> Response:
        try:
            with self._open(url, method) as r:
                return Response(r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(MAX_BODY) if method != "HEAD" else b"")
        except urllib.error.HTTPError as e:
            return Response(e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read(MAX_BODY) if e.fp else b"")
        except (urllib.error.URLError, TimeoutError, ConnectionError, ssl.SSLError, OSError) as e:
            reason = getattr(e, "reason", e)
            return Response(None, error=f"{type(reason).__name__}: {reason}"[:200])

    def download_sha256(self, url: str) -> Response:
        """GETs `url` and hashes it as it streams in; nothing is kept in memory or on disk."""
        try:
            with self._open(url, "GET") as r:
                digest, size = hashlib.sha256(), 0
                while chunk := r.read(CHUNK):
                    digest.update(chunk)
                    size += len(chunk)
                return Response(r.status, {k.lower(): v for k, v in r.headers.items()}, sha256=digest.hexdigest(), size=size)
        except urllib.error.HTTPError as e:
            return Response(e.code)
        except (urllib.error.URLError, TimeoutError, ConnectionError, ssl.SSLError, OSError) as e:
            return Response(None, error=f"{type(e).__name__}: {getattr(e, 'reason', e)}"[:200])


# ---------------------------------------------------------------------------------------------
# Observations: what each check sees now (stored as JSON). `prev` is the stored observation or None.
# ---------------------------------------------------------------------------------------------

META_KEYS = ("size", "etag", "last_modified")


def observe_hazard(http: Http, prev: dict | None, now: datetime) -> dict:
    src = cfg.HAZARD
    head = http.request(src.download_url, method="HEAD", attempts=3)
    carried = {k: prev[k] for k in (*META_KEYS, "served_sha", "verified_at") if prev and k in prev}
    if not head.ok and head.status not in (405, 501):  # 405/501: no HEAD support, so download below
        return {**carried, "reachable": False, "status": head.status, "error": head.describe()}
    meta = {
        "size": int(head.headers["content-length"]) if head.headers.get("content-length", "").isdigit() else None,
        "etag": head.headers.get("etag"),
        "last_modified": head.headers.get("last-modified"),
    }
    obs: dict = {"reachable": True, "status": head.status, **meta}
    unchanged = prev is not None and prev.get("served_sha") and all(prev.get(k) == meta[k] for k in META_KEYS) and head.ok
    verified = datetime.fromisoformat(prev["verified_at"]) if prev and prev.get("verified_at") else None
    due = verified is None or now - verified >= timedelta(days=FORCE_SHA_DAYS)
    if unchanged and not due:
        obs.update(served_sha=prev["served_sha"], downloaded=False, verified_at=prev["verified_at"])
    else:
        got = http.download_sha256(src.download_url)
        if not got.ok or not got.sha256:
            return {**carried, "reachable": False, "status": got.status, "error": got.describe()}
        obs.update(served_sha=got.sha256, downloaded=True, verified_at=now.isoformat(timespec="seconds"))
        if unchanged:
            obs["forced"] = True  # the monthly check: the HEAD alone said nothing changed
        if obs["size"] is None:
            obs["size"] = got.size
    obs["matches_pin"] = obs["served_sha"] == src.sha256
    return obs


def observe_hazard_pages(http: Http, prev: dict | None) -> dict:
    src = cfg.HAZARD
    page = http.request(src.url, attempts=2)
    meta = http.request(src.metadata_url, attempts=2)
    obs: dict = {"catalogue": page.describe(), "metadata": meta.describe(), "failures": 0}
    if page.ok:
        hrefs = re.findall(rb'href="([^"]+)"', page.body)
        obs["lists_resource"] = any(urllib.parse.urljoin(src.url, h.decode("utf-8", "replace")) == src.download_url for h in hrefs)
    elif prev and "lists_resource" in prev:
        obs["lists_resource"] = prev["lists_resource"]  # unknown this run: keep the last answer
    if not (page.ok and meta.ok):
        obs["failures"] = (prev or {}).get("failures", 0) + 1
        obs["error"] = page.describe() if not page.ok else meta.describe()
    return obs


def _xml_root(body: bytes) -> ET.Element | None:
    try:
        return ET.fromstring(body)
    except ET.ParseError:
        return None


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _service_detail(res: Response, root: ET.Element | None) -> str:
    if not res.ok:
        return res.describe()
    if root is None:
        return "not XML"
    return _local(root.tag)


def observe_wfs(http: Http, watch: cfg.Watch, prev: dict | None) -> dict:
    caps = http.request(f"{watch.url}?service=WFS&version=2.0.0&request=GetCapabilities")
    root = _xml_root(caps.body) if caps.ok else None
    if root is None or _local(root.tag) != "WFS_Capabilities":
        return {"state": "down", "detail": _service_detail(caps, root)}
    names = [ch.text.strip() for ft in root.iter() if _local(ft.tag) == "FeatureType" for ch in ft if _local(ch.tag) == "Name" and ch.text]
    if not names:
        return {"state": "caps-only", "detail": "no FeatureType"}
    feat = http.request(f"{watch.url}?" + urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": names[0], "count": 1}))
    froot = _xml_root(feat.body) if feat.ok else None
    if froot is None or _local(froot.tag) != "FeatureCollection":
        return {"state": "caps-only", "detail": f"GetFeature: {_service_detail(feat, froot)}", "layers": len(names)}
    return {"state": "up", "detail": f"{len(names)} layers, GetFeature ok", "layers": len(names)}


def observe_wms(http: Http, watch: cfg.Watch, prev: dict | None) -> dict:
    caps = http.request(f"{watch.url}?service=WMS&request=GetCapabilities")
    root = _xml_root(caps.body) if caps.ok else None
    if root is None or _local(root.tag) not in ("WMS_Capabilities", "WMT_MS_Capabilities"):
        return {"state": "down", "detail": _service_detail(caps, root)}
    return {"state": "up", "detail": "GetCapabilities ok"}


def is_file_resource(res: dict) -> bool:
    fmt = (res.get("format") or "").strip().lower()
    if fmt in SERVICE_FORMATS or res.get("type") == "api":
        return False
    if res.get("filetype") == "file" or fmt in FILE_FORMATS:
        return True
    path = urllib.parse.urlparse(res.get("url") or "").path.lower()
    return "." in path.rsplit("/", 1)[-1] and path.rsplit(".", 1)[-1] in FILE_FORMATS


def _failed(prev: dict | None, res: Response, keep: tuple[str, ...]) -> dict:
    """An observation for a check that didn't answer: the last known values, one more failure."""
    return {**{k: prev[k] for k in keep if prev and k in prev}, "failures": (prev or {}).get("failures", 0) + 1, "error": res.describe()}


def observe_dados_gov(http: Http, watch: cfg.Watch, prev: dict | None) -> dict:
    res = http.request(watch.url, attempts=2)
    keep = ("license", "resources", "has_file", "file_formats")
    try:
        data = json.loads(res.body) if res.ok else None
    except ValueError:
        data = None
    if not isinstance(data, dict) or "resources" not in data:
        return _failed(prev, res, keep)
    resources = data.get("resources") or []
    files = [r for r in resources if is_file_resource(r)]
    return {
        "license": data.get("license"),
        "resources": sorted(f"{(r.get('format') or r.get('type') or '?').lower()} {r.get('url', '')}" for r in resources),
        "has_file": bool(files),
        "file_formats": sorted({(r.get("format") or "file").lower() for r in files}),
        "failures": 0,
    }


GMD = "{http://www.isotc211.org/2005/gmd}"


def observe_snig_licence(http: Http, watch: cfg.Watch, prev: dict | None) -> dict:
    res = http.request(watch.url, attempts=2)
    root = _xml_root(res.body) if res.ok else None
    if root is None:
        return _failed(prev, res, ("constraints", "constraints_sha"))
    texts = [" ".join("".join(el.itertext()).split()) for el in root.iter(f"{GMD}otherConstraints")]
    joined = " | ".join(t for t in texts if t)
    return {"constraints": joined[:240], "constraints_sha": hashlib.sha256(joined.encode()).hexdigest()[:16], "failures": 0}


def observe_arcgis(http: Http, watch: cfg.Watch, prev: dict | None) -> dict:
    res = http.request(f"{watch.url}?f=json", attempts=2)
    try:
        data = json.loads(res.body) if res.ok else None
    except ValueError:
        data = None
    if not isinstance(data, dict) or "capabilities" not in data:
        return _failed(prev, res, ("capabilities",))
    return {"capabilities": ",".join(sorted(c.strip() for c in str(data["capabilities"]).split(",") if c.strip())), "failures": 0}


OBSERVERS: dict[str, Callable[[Http, cfg.Watch, dict | None], dict]] = {
    "wfs": observe_wfs,
    "wms": observe_wms,
    "dados_gov": observe_dados_gov,
    "snig_licence": observe_snig_licence,
    "arcgis": observe_arcgis,
}

# ---------------------------------------------------------------------------------------------
# Diffs: messages from (previous, current) observations. Pure functions.
# ---------------------------------------------------------------------------------------------


def human_url(watch: cfg.Watch) -> str:
    if watch.kind == "dados_gov":
        return watch.url.replace("/api/1/datasets/", "/datasets/").rstrip("/")
    if watch.kind == "snig_licence":
        return watch.url.replace("/formatters/xml", "/formatters/snig-view")
    return watch.url


def diff_hazard(prev: dict | None, cur: dict) -> list[str]:
    src = cfg.HAZARD
    before = prev or {"reachable": True, "matches_pin": True}  # the first run assumes all was well
    out = []
    if before.get("reachable", True) and not cur["reachable"]:
        out.append(f"❌ pnct: ICNF hazard URL {cur.get('error')} {src.download_url}")
    elif not before.get("reachable", True) and cur["reachable"]:
        out.append("✅ pnct: ICNF hazard URL reachable again")
    if cur["reachable"] and "matches_pin" in cur:
        was = before.get("matches_pin", True)
        new_version = not cur["matches_pin"] and (was or cur.get("served_sha") != before.get("served_sha"))
        if new_version:
            out.append(
                f"⚠️ pnct: ICNF hazard changed (SHA mismatch: served {cur['served_sha'][:12]}…, pinned {src.sha256[:12]}…). "
                + ("Found by the monthly full check: size, ETag and Last-Modified were unchanged. " if cur.get("forced") else "")
                + "Update HAZARD.sha256 in scripts/landcheck_config.py, run `uv run make landcheck-fetch landcheck`, check, then deploy."
            )
        elif not was and cur["matches_pin"]:
            out.append("✅ pnct: ICNF hazard matches the pin again")
    return out


def diff_failures(label: str, url: str, prev: dict | None, cur: dict) -> list[str]:
    """A check that didn't answer: reported once, on the ERROR_RUNS-th failure in a row, and when it recovers."""
    before, now = (prev or {}).get("failures", 0), cur.get("failures", 0)
    if now == ERROR_RUNS:
        return [f"⚠️ pnct watcher: no answer from {label} for {ERROR_RUNS} runs ({cur.get('error')}) {url}"]
    if before >= ERROR_RUNS and now == 0:
        return [f"✅ pnct watcher: {label} answers again"]
    return []


def diff_hazard_pages(prev: dict | None, cur: dict) -> list[str]:
    src = cfg.HAZARD
    out = []
    was = (prev or {}).get("lists_resource", True)
    if was and cur.get("lists_resource") is False:
        out.append(f"❌ pnct: the ICNF catalogue no longer lists the hazard zip {src.url}")
    elif not was and cur.get("lists_resource"):
        out.append("✅ pnct: the ICNF catalogue lists the hazard zip again")
    return out + diff_failures("the ICNF catalogue/metadata pages", src.url, prev, cur)


def diff_services(fact: cfg.BlockedFact, prev: dict[str, dict], cur: dict[str, dict]) -> list[str]:
    """WFS/WMS of a blocked fact: one message when the WFS goes from all down to any up (or back), and for the WMS."""
    out = []
    for kind, noun in (("wfs", "WFS"), ("wms", "WMS")):
        watches = [w for w in fact.watch if w.kind == kind]
        if not watches:
            continue
        up_now = [w for w in watches if cur.get(w.id, {}).get("state") == "up"]
        up_before = [w for w in watches if (prev.get(w.id) or {"state": "down"}).get("state") == "up"]
        where = ", ".join(w.label.rsplit(" ", 1)[-1] for w in up_now)
        if up_now and not up_before:
            hint = " Licence still to clear: docs/land-check/DATA.md." if kind == "wfs" else ""
            out.append(f"🔓 pnct: DGT SRUP {noun} is answering again ({where}), so {fact.label} may be unblockable.{hint} {watches[0].url}")
        elif up_before and not up_now:
            out.append(f"🔒 pnct: DGT SRUP {noun} is down again; {fact.label} stays blocked")
    return out


def diff_watch(fact: cfg.BlockedFact, watch: cfg.Watch, prev: dict | None, cur: dict) -> list[str]:
    """Licence, file resources, use constraints and capabilities of a blocked fact's sources."""
    url = human_url(watch)
    out = diff_failures(watch.label, url, prev, cur)
    if prev is None:
        prev = {**cur, "has_file": False}  # first run: only a file resource is news
    if cur.get("failures"):
        return out  # no answer this run: nothing to compare
    if watch.kind == "dados_gov":
        if prev.get("license") is not None and cur.get("license") != prev.get("license"):
            out.append(f"🔓 pnct: {watch.label}: licence {prev.get('license')} → {cur.get('license')}, so {fact.label} may be unblockable {url}")
        if cur.get("has_file") and not prev.get("has_file"):
            out.append(f"🔓 pnct: {watch.label} now lists a file resource ({', '.join(cur['file_formats'])}), so {fact.label} may be unblockable {url}")
        elif prev.get("resources") is not None and cur.get("resources") != prev.get("resources"):
            added = len(set(cur["resources"]) - set(prev["resources"]))
            removed = len(set(prev["resources"]) - set(cur["resources"]))
            out.append(f"ℹ️ pnct: {watch.label}: resources changed (+{added} −{removed}) {url}")
    elif watch.kind == "snig_licence":
        if prev.get("constraints_sha") and cur.get("constraints_sha") != prev.get("constraints_sha"):
            out.append(f"🔓 pnct: {watch.label} changed: «{cur.get('constraints', '')[:120]}…». The {fact.label} licence conflict may be resolved {url}")
    elif watch.kind == "arcgis":
        if prev.get("capabilities") is not None and cur.get("capabilities") != prev.get("capabilities"):
            query = " (Query: data can be read)" if "Query" in cur.get("capabilities", "").split(",") else ""
            out.append(f"🔓 pnct: {watch.label}: capabilities {prev.get('capabilities')} → {cur.get('capabilities')}{query}, so {fact.label} may be unblockable {url}")
    return out


# ---------------------------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------------------------


def summary(checks: dict[str, dict]) -> str:
    """One line on where things stand (the baseline and heartbeat messages)."""
    hz = checks.get("hazard", {})
    if hz.get("reachable") and hz.get("matches_pin"):
        hazard = "hazard pin OK"
    elif hz.get("reachable"):
        hazard = "hazard SHA differs from the pin"
    else:
        hazard = f"hazard URL failing ({hz.get('error')})"
    parts = [hazard]
    for fact in cfg.BLOCKED.values():
        services = [w for w in fact.watch if w.kind in ("wfs", "wms")]
        datasets = [w for w in fact.watch if w.kind == "dados_gov"]
        details = []
        if services:
            details.append(f"{sum(checks.get(w.id, {}).get('state') == 'up' for w in services)}/{len(services)} services up")
        if datasets:
            listed = any(checks.get(w.id, {}).get("has_file") for w in datasets)
            details.append("a file is listed on dados.gov.pt" if listed else "no file on dados.gov.pt")
        parts.append(f"{fact.label} blocked ({', '.join(details)})")
    return "; ".join(parts) + "."


@dataclass
class RunResult:
    checks: dict[str, dict]
    messages: list[str]
    state: dict


def run(http: Http, state: dict, now: datetime) -> RunResult:
    prev_checks: dict[str, dict] = state.get("checks", {})
    first = not prev_checks
    jobs: dict[str, Callable[[], dict]] = {
        "hazard": lambda: observe_hazard(http, prev_checks.get("hazard"), now),
        "hazard-pages": lambda: observe_hazard_pages(http, prev_checks.get("hazard-pages")),
    }
    watches = {w.id: (fact, w) for fact in cfg.BLOCKED.values() for w in fact.watch}
    for wid, (_, w) in watches.items():
        jobs[wid] = lambda w=w: OBSERVERS[w.kind](http, w, prev_checks.get(w.id))

    def safe(job: Callable[[], dict]) -> dict:
        try:
            return job()
        except Exception as e:  # one broken check must not stop the others
            return {"failures": 1, "error": f"watcher error: {type(e).__name__}: {e}"[:200], "state": "down"}

    with ThreadPoolExecutor(max_workers=8) as pool:  # DGT's dead services each take 90–120 s to fail
        futures = {cid: pool.submit(safe, job) for cid, job in jobs.items()}
        checks = {cid: f.result() for cid, f in futures.items()}

    messages = diff_hazard(prev_checks.get("hazard"), checks["hazard"])
    messages += diff_hazard_pages(prev_checks.get("hazard-pages"), checks["hazard-pages"])
    for fact in cfg.BLOCKED.values():
        messages += diff_services(fact, prev_checks, checks)
        for w in fact.watch:
            if w.kind not in ("wfs", "wms"):
                messages += diff_watch(fact, w, prev_checks.get(w.id), checks[w.id])

    last_message = datetime.fromisoformat(state["last_message"]) if state.get("last_message") else None
    runs_quiet = state.get("runs_since_message", 0) + 1
    if first:
        messages.insert(0, f"🆕 pnct watcher: baseline recorded, {len(checks)} checks. {summary(checks)}")
    elif not messages and last_message and now - last_message >= timedelta(days=HEARTBEAT_DAYS):
        messages.append(f"💤 pnct: all quiet, {runs_quiet} runs since {last_message:%Y-%m-%d}. {summary(checks)}")

    new_state = {
        "version": STATE_VERSION,
        "first_run": state.get("first_run", now.isoformat(timespec="seconds")),
        "last_run": now.isoformat(timespec="seconds"),
        "runs": state.get("runs", 0) + 1,
        "last_message": now.isoformat(timespec="seconds") if messages else state.get("last_message"),
        "runs_since_message": 0 if messages else runs_quiet,
        "checks": checks,
    }
    return RunResult(checks, messages, new_state)


# ---------------------------------------------------------------------------------------------
# State, Telegram, CLI
# ---------------------------------------------------------------------------------------------


def load_state(state_dir: Path) -> dict:
    path = state_dir / "state.json"
    if not path.exists():
        return {}
    state = json.loads(path.read_text())
    return state if state.get("version") == STATE_VERSION else {}


def save_state(state_dir: Path, state: dict) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    tmp = state_dir / "state.json.part"
    tmp.write_text(json.dumps(state, indent=1, ensure_ascii=False) + "\n")
    tmp.replace(state_dir / "state.json")


def load_env_file(path: Path) -> None:
    """KEY=VALUE lines (systemd EnvironmentFile syntax, without its quoting subtleties) into os.environ."""
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def send_telegram(text: str, ctx: ssl.SSLContext | None = None) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat or token.startswith("123456:"):
        raise SystemExit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (see ops/pi/pi.env.example)")
    if len(text) > TELEGRAM_LIMIT:
        text = text[: TELEGRAM_LIMIT - 1] + "…"
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "disable_web_page_preview": "true"}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx or ssl_context()) as r:
            if not json.loads(r.read()).get("ok"):
                raise SystemExit("Telegram did not accept the message")
    except urllib.error.HTTPError as e:  # the token is in the URL: never print the URL
        raise SystemExit(f"Telegram sendMessage failed: HTTP {e.code} {e.read()[:200].decode('utf-8', 'replace')}") from None
    except urllib.error.URLError as e:
        raise SystemExit(f"Telegram sendMessage failed: {e.reason}") from None


def default_state_dir() -> Path:
    return Path(os.environ.get("STATE_DIR") or os.environ.get("STATE_DIRECTORY") or "/var/lib/pnct-watcher")


def print_status(checks: dict[str, dict]) -> None:
    width = max(map(len, checks))
    for cid, obs in checks.items():
        shown = {k: v for k, v in obs.items() if k not in ("resources",)}
        if "resources" in obs:
            shown["resources"] = len(obs["resources"])
        print(f"  {cid:<{width}}  {json.dumps(shown, ensure_ascii=False)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the status and the message it would send; send nothing, write no state")
    parser.add_argument("--state-dir", type=Path, help="default: $STATE_DIR, $STATE_DIRECTORY, /var/lib/pnct-watcher")
    parser.add_argument("--env-file", type=Path, help="read TELEGRAM_* and STATE_DIR from this file (systemd passes them itself)")
    parser.add_argument("--save-state", action="store_true", help="with --dry-run: still write the state, to simulate a series of runs locally")
    parser.add_argument("--test-message", action="store_true", help="send one test message and exit")
    args = parser.parse_args(argv)
    if args.env_file:
        load_env_file(args.env_file)
    if args.test_message:
        send_telegram(f"🧪 pnct watcher: test message from {socket.gethostname()}")
        print("test message sent")
        return 0

    state_dir = args.state_dir or default_state_dir()
    state = load_state(state_dir)
    now = datetime.now(UTC)
    started = time.monotonic()
    try:
        result = run(Http(), state, now)
    except Exception as e:
        print(f"watcher crashed: {type(e).__name__}: {e}", file=sys.stderr)
        if not args.dry_run:
            try:
                send_telegram(f"❗ pnct watcher crashed: {type(e).__name__}: {e}"[:500])
            except SystemExit as send_err:
                print(send_err, file=sys.stderr)
        return 1

    which = "baseline" if not state else f"run {state.get('runs', 0) + 1}"
    print(f"pnct source watcher, {now:%Y-%m-%d %H:%M} UTC, {time.monotonic() - started:.0f} s, state {state_dir / 'state.json'} ({which})")
    print_status(result.checks)
    text = "\n".join(result.messages)
    if args.dry_run:
        print("\nWould send:\n" + text if text else "\nWould send nothing (no change).")
        if args.save_state:
            save_state(state_dir, result.state)
        return 0
    if text:
        send_telegram(text)  # raises (exit 1) before the state is saved, so the next run tries again
        print(f"\nsent:\n{text}")
    else:
        print("\nnothing to send")
    save_state(state_dir, result.state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
