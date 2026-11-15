"""The Pi source watcher (ops/pi/source_watcher.py): change detection on recorded HTTP responses.

No network: a FakeHttp answers from tests/fixtures/watcher/ (recorded 2026-11-15, plus a few synthetic
WFS answers), and each test changes one thing and runs the watcher again on the stored state.
"""

import dataclasses
import importlib.util
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests/fixtures/watcher"
spec = importlib.util.spec_from_file_location("source_watcher", ROOT / "ops/pi/source_watcher.py")
sw = importlib.util.module_from_spec(spec)
sys.modules["source_watcher"] = sw
spec.loader.exec_module(sw)
cfg = sw.cfg

T0 = datetime(2026, 11, 15, 3, 30, tzinfo=UTC)
WEEK = timedelta(days=7)


def text(name: str) -> bytes:
    return (FIX / name).read_bytes()


class World:
    """The sources as recorded; tests edit these fields to simulate a change."""

    def __init__(self) -> None:
        head = json.loads(text("hazard_head.json"))
        self.hazard_status = head["status"]
        self.hazard_headers = dict(head["headers"])
        self.served_sha = cfg.HAZARD.sha256
        self.catalogue = text("catalogo_tema5_excerpt.html")
        self.catalogue_status = 200
        self.dados = {p.stem.removeprefix("dados_"): json.loads(p.read_text()) for p in FIX.glob("dados_*.json")}
        self.dados_status = 200
        self.snig = text("snig_ren.xml")
        self.arcgis = json.loads(text("anacom_rede_fixa.json"))
        self.wfs_up: dict[str, str] = {}  # region -> "up" | "caps-only"; others answer DGT's HTTP 500 page
        self.wms_up = False


class FakeHttp:
    def __init__(self, world: World) -> None:
        self.w = world
        self.calls: list[tuple[str, str]] = []
        self.downloads = 0

    def request(self, url: str, method: str = "GET", attempts: int = 1):
        self.calls.append((method, url))
        w = self.w
        R = sw.Response
        if url == cfg.HAZARD.download_url:
            return R(w.hazard_status, dict(w.hazard_headers))
        if url == cfg.HAZARD.url:
            return R(w.catalogue_status, body=w.catalogue)
        if url == cfg.HAZARD.metadata_url:
            return R(200, body=b"<html>metadados</html>")
        if url.startswith(cfg.DADOS_GOV_API):
            slug = url.rstrip("/").rsplit("/", 1)[-1]
            return R(w.dados_status, body=json.dumps(w.dados[slug]).encode()) if w.dados_status == 200 else R(w.dados_status, body=b"<html>503</html>")
        if "snig.dgterritorio" in url:
            return R(200, body=w.snig)
        if url.startswith("https://geo.anacom.pt/"):
            return R(200, body=json.dumps(w.arcgis).encode())
        if "SDISNITWFSSRUP_REN_" in url:
            region = url.split("SDISNITWFSSRUP_REN_")[1].split("/")[0]
            state = w.wfs_up.get(region)
            if state and "GetCapabilities" in url:
                return R(200, body=text("wfs_capabilities_ok.xml"))
            if state and "GetFeature" in url:
                return R(200, body=text("wfs_getfeature_ok.xml" if state == "up" else "ows_exception.xml"))
            return R(500, body=text("wfs_algarve_500.html"))
        if "SDISNITWMSSRUP_REN_" in url:
            if w.wms_up:
                return R(200, body=b'<?xml version="1.0"?><WMS_Capabilities version="1.3.0"/>')
            return R(500, body=text("wms_pt1_500.html"))
        raise AssertionError(f"unexpected request {url}")

    def download_sha256(self, url: str):
        assert url == cfg.HAZARD.download_url
        self.downloads += 1
        if self.w.hazard_status != 200:
            return sw.Response(self.w.hazard_status)
        return sw.Response(200, sha256=self.w.served_sha, size=int(self.w.hazard_headers["content-length"]))


class Watcher:
    """Runs the watcher repeatedly on one World, a week apart, keeping the state like the Pi does."""

    def __init__(self) -> None:
        self.world = World()
        self.state: dict = {}
        self.now = T0
        self.http = FakeHttp(self.world)

    def run(self, advance: timedelta = WEEK) -> list[str]:
        if self.state:
            self.now += advance
        self.http.downloads = 0
        result = sw.run(self.http, self.state, self.now)
        self.state = result.state
        return result.messages


@pytest.fixture
def w() -> Watcher:
    watcher = Watcher()
    watcher.run()  # the baseline
    return watcher


# ---- baseline and quiet runs ------------------------------------------------------------------


def test_first_run_records_a_baseline_and_downloads_once():
    watcher = Watcher()
    messages = watcher.run()
    assert len(messages) == 1
    assert messages[0].startswith("🆕 pnct watcher: baseline recorded, 14 checks.")
    assert "hazard pin OK" in messages[0]
    assert messages[0].endswith("hazard pin OK; REN blocked (0/7 services up, no file on dados.gov.pt); fixed broadband (ANACOM) blocked (no file on dados.gov.pt).")
    assert watcher.http.downloads == 1
    assert watcher.state["checks"]["hazard"]["matches_pin"] is True


def test_nothing_changed_sends_nothing_and_downloads_nothing(w):
    assert w.run() == []
    assert w.http.downloads == 0
    assert ("HEAD", cfg.HAZARD.download_url) in w.http.calls


def test_state_stays_small(w):
    for _ in range(5):
        w.run()
    assert len(json.dumps(w.state)) < 20_000


# ---- the live hazard dataset --------------------------------------------------------------------


def test_new_metadata_with_the_same_file_is_quiet(w):
    w.world.hazard_headers["etag"] = '"new-etag"'
    w.world.hazard_headers["last-modified"] = "Tue, 01 Dec 2026 10:00:00 GMT"
    assert w.run() == []
    assert w.http.downloads == 1  # metadata changed: the SHA is checked
    assert w.run() == [] and w.http.downloads == 0


def test_a_new_hazard_version_is_reported_once(w, monkeypatch):
    w.world.hazard_headers["content-length"] = "20000000"
    w.world.served_sha = "ab" * 32
    messages = w.run()
    assert len(messages) == 1
    assert messages[0].startswith("⚠️ pnct: ICNF hazard changed (SHA mismatch: served abababababab…, pinned 4bb7f921ba0d…).")
    assert "`uv run make landcheck-fetch landcheck`" in messages[0]
    assert w.run() == [] and w.http.downloads == 0  # the same new version: no repeat, no download
    # Yet another version while still unpinned: reported again.
    w.world.hazard_headers["etag"] = '"v3"'
    w.world.served_sha = "cd" * 32
    assert "SHA mismatch: served cdcdcdcdcdcd" in w.run()[0]
    # The pin is updated in git (git pull on the Pi): resolved without a download.
    monkeypatch.setattr(cfg, "HAZARD", dataclasses.replace(cfg.HAZARD, sha256="cd" * 32))
    assert w.run() == ["✅ pnct: ICNF hazard matches the pin again"]
    assert w.http.downloads == 0


def test_hazard_url_failure_and_recovery(w):
    w.world.hazard_status = 404
    assert w.run() == [f"❌ pnct: ICNF hazard URL HTTP 404 {cfg.HAZARD.download_url}"]
    assert w.run() == []  # still down: no repeat
    w.world.hazard_status = 200
    assert w.run() == ["✅ pnct: ICNF hazard URL reachable again"]
    assert w.http.downloads == 0  # same metadata as before the outage: no download


def test_catalogue_stops_listing_the_zip(w):
    w.world.catalogue = b'<table><tr><td><a href="dados/outra_coisa.zip">x</a></td></tr></table>'
    assert w.run() == [f"❌ pnct: the ICNF catalogue no longer lists the hazard zip {cfg.HAZARD.url}"]
    assert w.run() == []
    w.world.catalogue = text("catalogo_tema5_excerpt.html")
    assert w.run() == ["✅ pnct: the ICNF catalogue lists the hazard zip again"]


def test_catalogue_outage_is_reported_after_three_runs_only(w):
    w.world.catalogue_status = 503
    assert w.run() == [] and w.run() == []
    third = w.run()
    assert third == [f"⚠️ pnct watcher: no answer from the ICNF catalogue/metadata pages for 3 runs (HTTP 503) {cfg.HAZARD.url}"]
    assert w.run() == []
    w.world.catalogue_status = 200
    assert w.run() == ["✅ pnct watcher: the ICNF catalogue/metadata pages answers again"]


# ---- blocked facts --------------------------------------------------------------------------------


def test_ren_wfs_coming_back_is_the_unblock_alert(w):
    w.world.wfs_up = {"ALGARVE": "up"}
    messages = w.run()
    assert len(messages) == 1
    assert messages[0].startswith("🔓 pnct: DGT SRUP WFS is answering again (ALGARVE), so REN may be unblockable. Licence still to clear")
    assert w.state["checks"]["ren-wfs-algarve"] == {"state": "up", "detail": "1 layers, GetFeature ok", "layers": 1}
    w.world.wfs_up["NORTE"] = "up"
    assert w.run() == []  # more regions: still the same news
    w.world.wfs_up = {}
    assert w.run() == ["🔒 pnct: DGT SRUP WFS is down again; REN stays blocked"]


def test_capabilities_without_a_working_getfeature_is_not_an_unblock(w):
    w.world.wfs_up = {"PT1": "caps-only"}
    assert w.run() == []
    assert w.state["checks"]["ren-wfs-pt1"]["state"] == "caps-only"


def test_ren_wms_coming_back(w):
    w.world.wms_up = True
    assert w.run()[0].startswith("🔓 pnct: DGT SRUP WMS is answering again (PT1), so REN may be unblockable.")


def test_anacom_lists_a_file_resource(w):
    w.world.dados["cobertura-da-rede-fixa-de-comunicacoes-eletronicas"]["resources"].append(
        {"title": "Cobertura por endereço", "format": "csv", "filetype": "file", "type": "main", "url": "https://dados.gov.pt/s/resources/x/cobertura.csv"}
    )
    assert w.run() == [
        "🔓 pnct: dados.gov.pt ANACOM fixed coverage now lists a file resource (csv), so fixed broadband (ANACOM) may be unblockable "
        "https://dados.gov.pt/datasets/cobertura-da-rede-fixa-de-comunicacoes-eletronicas"
    ]
    assert w.run() == []


def test_licence_change_on_dados_gov(w):
    w.world.dados["cobertura-da-rede-fixa-de-comunicacoes-eletronicas"]["license"] = "cc-by"
    assert w.run() == [
        "🔓 pnct: dados.gov.pt ANACOM fixed coverage: licence notspecified → cc-by, so fixed broadband (ANACOM) may be unblockable "
        "https://dados.gov.pt/datasets/cobertura-da-rede-fixa-de-comunicacoes-eletronicas"
    ]


def test_other_resource_changes_are_reported_as_info(w):
    w.world.dados["srup-reserva-ecologica-nacional"]["resources"].pop()
    assert w.run() == ["ℹ️ pnct: dados.gov.pt REN dataset: resources changed (+0 −1) https://dados.gov.pt/datasets/srup-reserva-ecologica-nacional"]


def test_snig_use_constraints_change(w):
    w.world.snig = w.world.snig.replace("destina-se à consulta e visualização".encode(), "é disponibilizada sob CC BY 4.0".encode())
    messages = w.run()
    assert len(messages) == 1 and messages[0].startswith("🔓 pnct: SNIG REN record (use constraints) changed: «")
    assert messages[0].endswith("The REN licence conflict may be resolved https://snig.dgterritorio.gov.pt/rndg/srv/api/records/ad95b02a-fbd2-4b8e-89b6-f699a9ff3c0d/formatters/snig-view")


def test_arcgis_gains_query(w):
    w.world.arcgis["capabilities"] = "Map,Query,Data"
    assert w.run() == [
        "🔓 pnct: ANACOM Rede_Fixa ArcGIS service: capabilities Map → Data,Map,Query (Query: data can be read), so fixed broadband (ANACOM) may be unblockable "
        "https://geo.anacom.pt/server/rest/services/publico/Rede_Fixa/MapServer"
    ]


def test_api_outage_is_not_a_change(w):
    w.world.dados_status = 503
    assert w.run() == [] and w.run() == []
    third = w.run()
    assert len(third) == 3 and all(m.startswith("⚠️ pnct watcher: no answer from dados.gov.pt") for m in third)
    assert w.state["checks"]["ren-dados"]["license"] == "cc-by"  # the last known values are kept
    w.world.dados_status = 200
    assert sorted(w.run()) == sorted(f"✅ pnct watcher: {label} answers again" for label in ("dados.gov.pt REN dataset", "dados.gov.pt ANACOM fixed coverage", "dados.gov.pt ANACOM fixed coverage (2023)"))


# ---- heartbeat ----------------------------------------------------------------------------------


def test_monthly_heartbeat(w):
    for _ in range(3):
        assert w.run() == []  # 21 days after the baseline message
    beat = w.run()  # day 28
    assert len(beat) == 1
    assert beat[0].startswith("💤 pnct: all quiet, 4 runs since 2026-11-15. hazard pin OK; REN blocked (0/7 services up, no file on dados.gov.pt)")
    assert w.run() == []  # the heartbeat counts as a message: the next one is 4 weeks later


def test_an_alert_resets_the_heartbeat_clock(w):
    w.run()
    w.run()
    w.world.hazard_status = 500
    assert w.run()  # day 21: an alert
    w.world.hazard_status = 200
    assert w.run() == ["✅ pnct: ICNF hazard URL reachable again"]  # day 28
    assert w.run() == []  # day 35: only 7 days since the last message


# ---- pieces -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("resource", "expected"),
    [
        ({"format": "wms", "filetype": "remote", "type": "main", "url": "https://x/WMService.aspx"}, False),
        ({"format": None, "filetype": "remote", "type": "api", "url": "https://x/MapServer/WMSServer"}, False),
        ({"format": "csv", "filetype": "file", "type": "main", "url": "https://x/a.csv"}, True),
        ({"format": None, "filetype": "remote", "type": "main", "url": "https://x/cobertura_2026T2.zip"}, True),
        ({"format": "GeoPackage", "filetype": "remote", "type": "main", "url": "https://x/download"}, True),
    ],
)
def test_is_file_resource(resource, expected):
    assert sw.is_file_resource(resource) is expected


def test_every_watch_kind_has_an_observer_and_ids_are_unique():
    watches = [w for fact in cfg.BLOCKED.values() for w in fact.watch]
    assert {w.kind for w in watches} <= set(sw.OBSERVERS)
    assert len({w.id for w in watches}) == len(watches)
    assert all(w.url.startswith("https://") for w in watches)


def test_dry_run_sends_nothing_and_writes_no_state(tmp_path, monkeypatch, capsys):
    world = World()
    monkeypatch.setattr(sw, "Http", lambda: FakeHttp(world))
    monkeypatch.setattr(sw, "send_telegram", lambda *a, **k: pytest.fail("dry run must not send"))
    assert sw.main(["--dry-run", "--state-dir", str(tmp_path / "state")]) == 0
    out = capsys.readouterr().out
    assert "Would send:\n🆕 pnct watcher: baseline recorded" in out
    assert not (tmp_path / "state").exists()


def test_dry_run_can_save_state_for_local_series(tmp_path, monkeypatch, capsys):
    world = World()
    monkeypatch.setattr(sw, "Http", lambda: FakeHttp(world))
    monkeypatch.setattr(sw, "send_telegram", lambda *a, **k: pytest.fail("dry run must not send"))
    assert sw.main(["--dry-run", "--save-state", "--state-dir", str(tmp_path)]) == 0
    assert sw.main(["--dry-run", "--save-state", "--state-dir", str(tmp_path)]) == 0
    assert capsys.readouterr().out.endswith("Would send nothing (no change).\n")


def test_a_failed_send_keeps_the_old_state(tmp_path, monkeypatch):
    world = World()
    monkeypatch.setattr(sw, "Http", lambda: FakeHttp(world))

    def broken(*_a, **_k):
        raise SystemExit("Telegram sendMessage failed: HTTP 502")

    monkeypatch.setattr(sw, "send_telegram", broken)
    with pytest.raises(SystemExit):
        sw.main(["--state-dir", str(tmp_path)])
    assert not (tmp_path / "state.json").exists()  # the baseline message will be tried again next run


def test_a_real_run_saves_state_after_sending(tmp_path, monkeypatch):
    world = World()
    sent: list[str] = []
    monkeypatch.setattr(sw, "Http", lambda: FakeHttp(world))
    monkeypatch.setattr(sw, "send_telegram", lambda t, *a, **k: sent.append(t))
    assert sw.main(["--state-dir", str(tmp_path)]) == 0
    assert len(sent) == 1 and json.loads((tmp_path / "state.json").read_text())["runs"] == 1
    assert sw.main(["--state-dir", str(tmp_path)]) == 0
    assert len(sent) == 1  # nothing changed


def test_env_file_does_not_override_the_environment(tmp_path, monkeypatch):
    env = tmp_path / "pi.env"
    env.write_text("# comment\nTELEGRAM_CHAT_ID=42\nSTATE_DIR='/tmp/x'\n")
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    monkeypatch.setenv("STATE_DIR", "/kept")
    sw.load_env_file(env)
    import os

    assert os.environ["TELEGRAM_CHAT_ID"] == "42" and os.environ["STATE_DIR"] == "/kept"


# ---- the Pi units (systemd-analyze isn't available on macOS; install.sh runs it on the Pi) ----------


def _unit(name: str) -> dict[str, dict[str, str]]:
    sections: dict[str, dict[str, str]] = {}
    current = None
    for line in (ROOT / "ops/pi/systemd" / name).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            current = sections.setdefault(line.strip("[]"), {})
        else:
            key, value = line.split("=", 1)
            current[key] = value
    return sections


def test_service_unit_keeps_the_pi_healthy():
    svc = _unit("pnct-source-watcher.service")["Service"]
    assert svc["Type"] == "oneshot" and svc["User"] == "pnct-watcher"
    assert svc["EnvironmentFile"] == "/etc/pnct/pi.env"
    assert (svc["Nice"], svc["IOSchedulingClass"], svc["MemoryMax"]) == ("10", "idle", "512M")
    assert svc["TimeoutStartSec"] == "45min" and svc["StateDirectory"] == "pnct-watcher"
    assert svc["ExecStart"] == "/usr/bin/python3 /opt/pnct-map/ops/pi/source_watcher.py"
    assert svc["ProtectSystem"] == "strict" and svc["NoNewPrivileges"] == "yes"


def test_timer_is_weekly_at_night_and_persistent():
    timer = _unit("pnct-source-watcher.timer")
    assert timer["Timer"]["OnCalendar"] == "Sun *-*-* 03:30:00" and timer["Timer"]["Persistent"] == "true"
    assert timer["Install"]["WantedBy"] == "timers.target"


def test_env_example_has_placeholders_only_and_they_are_refused(monkeypatch):
    example = (ROOT / "ops/pi/pi.env.example").read_text()
    assert "TELEGRAM_BOT_TOKEN=123456:replace-me" in example and "TELEGRAM_CHAT_ID=replace-me" in example
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:replace-me")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")
    monkeypatch.setattr(sw.urllib.request, "urlopen", lambda *a, **k: pytest.fail("no request with the placeholder token"))
    with pytest.raises(SystemExit, match="must be set"):
        sw.send_telegram("x")
