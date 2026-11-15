"""Selection order, state, Telegram safety and rendering."""

import json
import urllib.request

import pytest
from PIL import Image

from insights import cli, state, telegram
from insights.catalog import compute
from insights.render import write_outputs


class Fake:
    def __init__(self, iid, evergreen):
        self.id, self.evergreen = iid, evergreen


def test_pick_evergreen_first_with_fresh_interleaved():
    ready = {i.id: i for i in [Fake("e1", True), Fake("e2", True), Fake("e3", True), Fake("f1", False), Fake("f2", False)]}
    posted, order = [], []
    for _ in range(5):
        nxt = cli.pick(ready, posted)
        order.append(nxt.id)
        posted.append({"id": nxt.id, "evergreen": nxt.evergreen})
    assert order == ["e1", "e2", "f1", "e3", "f2"]
    assert cli.pick(ready, posted) is None


def test_state_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(state.cfg, "STATE_DIR", tmp_path)
    assert state.load() == []
    state.record("a", True, message_ids=[1, 2])
    assert state.posted_ids() == {"a"} and json.loads((tmp_path / "posted.json").read_text())["posted"][0]["message_ids"] == [1, 2]


def test_missing_credentials_fail_clearly(monkeypatch):
    monkeypatch.delenv(telegram.TOKEN_VAR, raising=False)
    monkeypatch.setenv(telegram.CHAT_VAR, "1")
    with pytest.raises(telegram.TelegramError, match="INSIGHTS_TELEGRAM_BOT_TOKEN"):
        telegram.credentials()


def test_next_without_credentials_exits_before_work(monkeypatch, capsys):
    monkeypatch.delenv(telegram.TOKEN_VAR, raising=False)
    monkeypatch.delenv(telegram.CHAT_VAR, raising=False)
    monkeypatch.setenv("INSIGHTS_ENV_FILE", "/nonexistent/.env")
    assert cli.cmd_next(dry_run=False) == 2
    assert "missing INSIGHTS_TELEGRAM_BOT_TOKEN and INSIGHTS_TELEGRAM_CHAT_ID" in capsys.readouterr().err


def test_token_is_masked_and_only_two_methods(monkeypatch, tmp_path):
    token = "123456:SECRET-token"
    seen = []

    def fake_urlopen(req, timeout):
        seen.append(req.full_url)
        raise urllib.error.URLError(f"cannot reach {req.full_url}")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    png = tmp_path / "x.png"
    Image.new("RGB", (2, 2)).save(png)
    for call in (lambda: telegram.send_photo(token, "1", png, "hi"), lambda: telegram.send_message(token, "1", "olá")):
        with pytest.raises(telegram.TelegramError) as e:
            call()
        assert "SECRET" not in str(e.value) and "bot***" in str(e.value)
    assert [u.rsplit("/", 1)[1] for u in seen] == ["sendPhoto", "sendMessage"]
    with pytest.raises(telegram.TelegramError, match="refusing"):
        telegram._call(token, "getUpdates", b"", "application/json")


def test_send_success_records_state(monkeypatch, tmp_path, fixture_dir):
    from insights.catalog import Data

    monkeypatch.setattr(state.cfg, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(cli.cfg, "OUT", tmp_path / "out")
    monkeypatch.setenv(telegram.TOKEN_VAR, "1:x")
    monkeypatch.setenv(telegram.CHAT_VAR, "42")
    monkeypatch.setattr("insights.catalog.Data", lambda *a, **k: Data(fixture_dir))
    sent = []
    monkeypatch.setattr(telegram, "send_photo", lambda t, c, p, cap: sent.append(("photo", p.name, cap)) or 10)
    monkeypatch.setattr(telegram, "send_message", lambda t, c, text: sent.append(("text", text)) or 11)
    assert cli.cmd_next(dry_run=False) == 0
    assert sent[0][:2] == ("photo", "chart_en.png") and sent[0][2].startswith("The PNCT covers")
    assert sent[1][0] == "text" and sent[1][1].startswith("O PNCT abrange")
    assert state.load()[0]["id"] == "area_vs_population" and state.load()[0]["message_ids"] == [10, 11]


def test_dry_run_sends_and_records_nothing(monkeypatch, tmp_path, fixture_dir):
    from insights.catalog import Data

    monkeypatch.setattr(state.cfg, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(cli.cfg, "OUT", tmp_path / "out")
    monkeypatch.setattr("insights.catalog.Data", lambda *a, **k: Data(fixture_dir))
    monkeypatch.setattr(telegram, "_call", lambda *a: pytest.fail("dry run must not call Telegram"))
    assert cli.cmd_next(dry_run=True) == 0
    assert not (tmp_path / "state" / "posted.json").exists()


@pytest.mark.parametrize("iid", ["area_vs_population", "closest_to_porto", "coastal_pnct_parishes", "districts_area_share"])
def test_render_is_square_1080(iid, data, tmp_path):
    out = write_outputs(compute(iid, data), data, tmp_path)
    for lang in ("en", "pt"):
        assert Image.open(out / f"chart_{lang}.png").size == (1080, 1080)
    assert (out / "caption_pt.txt").read_text().startswith(compute(iid, data).caption_pt)
