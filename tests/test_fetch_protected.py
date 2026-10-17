"""Offline tests for scripts/fetch_protected.py: the HTTP functions are replaced by fakes."""

import dataclasses
import hashlib
import json
import sys
import urllib.error
import urllib.parse
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_protected as fp  # noqa: E402
import protected_config  # noqa: E402

SERVICE = "https://example.test/arcgis/rest/services/X/MapServer"


class FakeArcGis:
    """A one-layer ArcGIS MapServer holding `n` features; records the page requests."""

    def __init__(self, n, max_record_count=20, count=None, flag_last_full_page=False, duplicate=False, error=None):
        self.n, self.max_record_count = n, max_record_count
        self.count = n if count is None else count
        self.flag_last_full_page = flag_last_full_page
        self.duplicate = duplicate
        self.error = error
        self.offsets, self.counts, self.order_by = [], [], []

    def feature(self, i):
        oid = 1 if self.duplicate and i == 1 else i + 1
        return {"type": "Feature", "id": oid, "properties": {"OBJECTID": oid, "nome": f"n{i}"}, "geometry": None}

    def __call__(self, url, headers=None):
        assert not headers or "User-Agent" not in headers  # added by the real layer, not by callers
        parts = urllib.parse.urlsplit(url)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parts.query).items()}
        if self.error:
            return json.dumps({"error": {"code": 400, "message": self.error}}).encode()
        if parts.path.endswith("/query"):
            if q.get("returnCountOnly"):
                return json.dumps({"count": self.count}).encode()
            assert q["f"] == "geojson" and q["outSR"] == "4326" and q["where"] == "1=1"
            offset, size = int(q["resultOffset"]), int(q["resultRecordCount"])
            self.offsets.append(offset)
            self.counts.append(size)
            self.order_by.append(q["orderByFields"])
            feats = [self.feature(i) for i in range(offset, min(offset + size, self.n))]
            page = {"type": "FeatureCollection", "features": feats}
            if offset + size < self.n:
                page["exceededTransferLimit"] = True
            elif self.flag_last_full_page and len(feats) == size:
                page["properties"] = {"exceededTransferLimit": False}
            return json.dumps(page).encode()
        return json.dumps({"maxRecordCount": self.max_record_count, "objectIdField": "OBJECTID"}).encode()


def arcgis_source(**kw):
    base = protected_config.SOURCES["rnap-icnf"]
    return dataclasses.replace(base, service=SERVICE, layers={0: None}, page_size=25, **kw)


def test_pagination_uses_min_of_page_size_and_max_record_count(monkeypatch, tmp_path):
    server = FakeArcGis(53, max_record_count=20)
    monkeypatch.setattr(fp, "http_get", server)
    meta = fp.fetch_source("rnap", arcgis_source(), tmp_path)

    assert server.offsets == [0, 20, 40]
    assert set(server.counts) == {20}
    assert set(server.order_by) == {"OBJECTID"}
    fc = json.loads((tmp_path / "layer0.geojson").read_text())
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 53
    assert all(f["properties"]["layer"] == 0 for f in fc["features"])
    assert not list(tmp_path.glob("*.part"))

    on_disk = json.loads((tmp_path / "fetch.json").read_text())
    assert on_disk == meta
    assert on_disk["source"] == "rnap-icnf" and on_disk["category"] == "rnap"
    assert on_disk["url"] == SERVICE and on_disk["licence_confirmed"] is False
    assert on_disk["fetched_at"].endswith("Z") and len(on_disk["fetched_at"]) == 20
    (entry,) = on_disk["files"]
    assert entry["name"] == "layer0.geojson" and entry["features"] == 53
    assert entry["sha256"] == hashlib.sha256((tmp_path / "layer0.geojson").read_bytes()).hexdigest()


def test_page_size_wins_when_smaller_than_max_record_count(monkeypatch, tmp_path):
    server = FakeArcGis(53, max_record_count=1000)
    monkeypatch.setattr(fp, "http_get", server)
    fp.fetch_source("rnap", arcgis_source(), tmp_path)
    assert server.offsets == [0, 25, 50]


def test_full_last_page_without_flag_needs_one_more_page(monkeypatch, tmp_path):
    server = FakeArcGis(40, max_record_count=20, flag_last_full_page=True)
    monkeypatch.setattr(fp, "http_get", server)
    fp.fetch_source("rnap", arcgis_source(), tmp_path)
    assert server.offsets == [0, 20, 40]  # the third page is empty and ends the loop
    assert len(json.loads((tmp_path / "layer0.geojson").read_text())["features"]) == 40


def test_count_mismatch_exits(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "http_get", FakeArcGis(30, count=31))
    with pytest.raises(SystemExit, match="30 features, the server counts 31"):
        fp.fetch_source("rnap", arcgis_source(), tmp_path)
    assert not (tmp_path / "layer0.geojson").exists()
    assert not (tmp_path / "fetch.json").exists()


def test_duplicate_object_ids_exit(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "http_get", FakeArcGis(5, duplicate=True))
    with pytest.raises(SystemExit, match="duplicate OBJECTID"):
        fp.fetch_source("rnap", arcgis_source(), tmp_path)


def test_server_error_message_is_raised(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "http_get", FakeArcGis(5, error="Invalid query"))
    with pytest.raises(SystemExit, match="Invalid query"):
        fp.fetch_source("rnap", arcgis_source(), tmp_path)


def test_endless_paging_is_stopped(monkeypatch, tmp_path):
    def endless(url, headers=None):
        if "returnCountOnly" in url:
            return b'{"count": 1}'
        if "/query" not in url:
            return b'{"maxRecordCount": 1}'
        return json.dumps({"features": [{"id": 1, "properties": {}}], "exceededTransferLimit": True}).encode()

    monkeypatch.setattr(fp, "http_get", endless)
    monkeypatch.setattr(fp, "MAX_PAGES", 5)
    with pytest.raises(SystemExit, match="still paging"):
        fp.fetch_source("rnap", arcgis_source(), tmp_path)


# ---- FileSource -------------------------------------------------------------------------------

PAYLOAD = b"geopackage-bytes" * 1000
PAYLOAD_SHA = hashlib.sha256(PAYLOAD).hexdigest()


def file_source(**kw):
    base = protected_config.SOURCES["natura-eea"]
    return dataclasses.replace(base, download_url="https://example.test/file.gpkg", filename="file.gpkg", **kw)


class FakeDownload:
    def __init__(self, data=PAYLOAD, honour_range=True):
        self.data, self.honour_range = data, honour_range
        self.calls = []

    def __call__(self, url, headers=None):
        self.calls.append((url, dict(headers or {})))
        start = 0
        if headers and "Range" in headers and self.honour_range:
            start = int(headers["Range"].removeprefix("bytes=").removesuffix("-"))
        body = self.data[start:]
        return (206 if start else 200), iter([body[i : i + 4000] for i in range(0, len(body), 4000)])


def test_download_verifies_and_writes_metadata(monkeypatch, tmp_path):
    dl = FakeDownload()
    monkeypatch.setattr(fp, "http_stream", dl)
    meta = fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)

    assert (tmp_path / "file.gpkg").read_bytes() == PAYLOAD
    assert not (tmp_path / "file.gpkg.part").exists()
    assert len(dl.calls) == 1
    # "user:" -> Basic auth with an empty password
    assert dl.calls[0][1]["Authorization"] == "Basic bXd6czllTnNKOVNuNFE0Og=="
    assert meta["files"] == [{"name": "file.gpkg", "bytes": len(PAYLOAD), "sha256": PAYLOAD_SHA}]
    assert json.loads((tmp_path / "fetch.json").read_text()) == meta


def test_unpinned_sha_is_printed(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(fp, "http_stream", FakeDownload())
    fp.fetch_source("natura", file_source(sha256=None), tmp_path)
    out = capsys.readouterr().out
    assert PAYLOAD_SHA in out and "protected_config.py" in out
    assert (tmp_path / "file.gpkg").exists()


def test_sha_mismatch_after_download_keeps_part(monkeypatch, tmp_path):
    monkeypatch.setattr(fp, "http_stream", FakeDownload())
    with pytest.raises(SystemExit, match="sha256 mismatch"):
        fp.fetch_source("natura", file_source(sha256="0" * 64), tmp_path)
    assert (tmp_path / "file.gpkg.part").exists()
    assert not (tmp_path / "file.gpkg").exists()
    assert not (tmp_path / "fetch.json").exists()


def test_existing_matching_file_is_not_downloaded(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg").write_bytes(PAYLOAD)
    (tmp_path / "fetch.json").write_text(json.dumps({"fetched_at": "2026-01-02T03:04:05Z"}))

    def boom(*a, **k):
        raise AssertionError("must not download")

    monkeypatch.setattr(fp, "http_stream", boom)
    meta = fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)
    assert meta["fetched_at"] == "2026-01-02T03:04:05Z"  # when it was downloaded, not now
    assert meta["files"][0]["sha256"] == PAYLOAD_SHA


def test_existing_file_without_fetch_json_uses_mtime(monkeypatch, tmp_path):
    f = tmp_path / "file.gpkg"
    f.write_bytes(PAYLOAD)
    import os

    os.utime(f, (1_700_000_000, 1_700_000_000))
    monkeypatch.setattr(fp, "http_stream", lambda *a, **k: pytest.fail("must not download"))
    meta = fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)
    assert meta["fetched_at"] == "2023-11-14T22:13:20Z"


def test_existing_file_with_wrong_sha_exits(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg").write_bytes(b"something else")
    monkeypatch.setattr(fp, "http_stream", lambda *a, **k: pytest.fail("must not download"))
    with pytest.raises(SystemExit, match="sha256"):
        fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)


def test_refresh_downloads_again(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg").write_bytes(b"old")
    dl = FakeDownload()
    monkeypatch.setattr(fp, "http_stream", dl)
    fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path, refresh=True)
    assert len(dl.calls) == 1
    assert (tmp_path / "file.gpkg").read_bytes() == PAYLOAD


def test_resumes_part_file_with_range(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg.part").write_bytes(PAYLOAD[:5000])
    dl = FakeDownload()
    monkeypatch.setattr(fp, "http_stream", dl)
    fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)
    assert dl.calls[0][1]["Range"] == "bytes=5000-"
    assert (tmp_path / "file.gpkg").read_bytes() == PAYLOAD


def test_server_ignoring_range_restarts_from_zero(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg.part").write_bytes(b"garbage-prefix")
    monkeypatch.setattr(fp, "http_stream", FakeDownload(honour_range=False))
    fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)
    assert (tmp_path / "file.gpkg").read_bytes() == PAYLOAD


def test_range_not_satisfiable_restarts(monkeypatch, tmp_path):
    (tmp_path / "file.gpkg.part").write_bytes(b"x" * 10)
    real = FakeDownload()

    def server(url, headers=None):
        if headers and "Range" in headers:
            raise urllib.error.HTTPError(url, 416, "Range Not Satisfiable", {}, None)
        return real(url, headers)

    monkeypatch.setattr(fp, "http_stream", server)
    fp.fetch_source("natura", file_source(sha256=PAYLOAD_SHA), tmp_path)
    assert (tmp_path / "file.gpkg").read_bytes() == PAYLOAD


# ---- HTTP layer -------------------------------------------------------------------------------


def test_http_get_retries_5xx_then_succeeds(monkeypatch):
    sleeps, attempts = [], []

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"ok"

    def fake_urlopen(req, timeout):
        attempts.append(req.get_header("User-agent"))
        assert timeout == 120
        if len(attempts) < 4:
            raise urllib.error.HTTPError(req.full_url, 503, "busy", {}, None)
        return Resp()

    monkeypatch.setattr(fp.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(fp.time, "sleep", sleeps.append)
    assert fp.http_get("https://example.test/") == b"ok"
    assert sleeps == [1, 2, 4]
    assert attempts[0] == fp.USER_AGENT


def test_http_get_does_not_retry_4xx(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout):
        calls.append(1)
        raise urllib.error.HTTPError(req.full_url, 404, "nope", {}, None)

    monkeypatch.setattr(fp.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(fp.time, "sleep", lambda s: pytest.fail("no sleep expected"))
    with pytest.raises(urllib.error.HTTPError):
        fp.http_get("https://example.test/")
    assert len(calls) == 1


def test_http_get_gives_up_after_four_attempts(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout):
        calls.append(1)
        raise TimeoutError("slow")

    monkeypatch.setattr(fp.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(fp.time, "sleep", lambda s: None)
    with pytest.raises(TimeoutError):
        fp.http_get("https://example.test/")
    assert len(calls) == 4
