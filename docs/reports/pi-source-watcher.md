# Pi jobs: source watcher, report

2026-11-15 · branch `feat/pi-source-watcher` (7 commits) · not merged, not pushed, nothing deployed.

> **Base branch.** The task said land check v1 is merged. It isn't: `main` and `origin/main` are still at `ae10bfe` (0.9.0), and `feat/land-check` was never pushed. The watcher needs `scripts/landcheck_config.py`, so this branch starts from `feat/land-check` (`9fcdd5e`). Merging `feat/pi-source-watcher` into `main` brings both. The Pi can only clone the watcher once that is pushed (see "Steps on the Pi").

## Files created or changed

| File | What |
|---|---|
| `scripts/landcheck_config.py` | **Extended, no second URL list.** `BLOCKED` values are now `BlockedFact(label, reason, watch)`. `watch` lists the endpoints to probe: the DGT SRUP WFS (6 regions) and WMS, the dados.gov.pt datasets (REN, ANACOM ×2), the SNIG use constraints and the ANACOM ArcGIS service. The live hazard checks read the existing `HAZARD` fields. Still standard library only. |
| `ops/pi/source_watcher.py` | The watcher (Python 3.11+, standard library only): observe → diff → Telegram, with state JSON in `STATE_DIR`. Flags: `--dry-run`, `--save-state`, `--state-dir`, `--env-file`, `--test-message`. |
| `ops/pi/systemd/pnct-source-watcher.service` | A oneshot unit as `pnct-watcher`: `EnvironmentFile=/etc/pnct/pi.env`, `StateDirectory=pnct-watcher`, `Nice=10`, `CPUWeight=20`, `IOSchedulingClass=idle`, `MemoryMax=512M`, `TimeoutStartSec=45min`, `ProtectSystem=strict` and other sandboxing. |
| `ops/pi/systemd/pnct-source-watcher.timer` | `OnCalendar=Sun *-*-* 03:30:00`, `RandomizedDelaySec=45min`, `Persistent=true`. |
| `ops/pi/install.sh` | An idempotent installer. It installs python3/ca-certificates only if missing, creates the system user, creates `/etc/pnct/pi.env` from the example once (root, 600, never overwritten), creates the state dir, checks the service user can read the checkout, and installs the units. It writes a drop-in only for a non-default checkout or `STATE_DIR`, runs `systemd-analyze verify`, and enables the timer only once a real token is set. It never starts a run. |
| `ops/pi/pi.env.example` | The env template, placeholders only. `ops/pi/*.env` is gitignored. |
| `ops/pi/README.md` | Setup, checks and messages, updating, logs, running by hand, uninstalling. |
| `tests/test_source_watcher.py`, `tests/fixtures/watcher/` | 33 tests and 13 fixtures (36 KB). The fixtures are recorded 2026-11-15 and trimmed; 3 synthetic WFS answers are marked as such. |
| `docs/land-check/DATA.md`, `docs/ROADMAP.md` | A "Watching the sources" note, and a "Pi jobs" section: the source watcher done; later Pi rebuild/deploy, Valhalla travel times and ADS-B. |

## What each check detects

| Check | How | Message (only on change) |
|---|---|---|
| ICNF hazard zip | HEAD: status, size, ETag, Last-Modified. Only if one changed (or on the first run) does it download, streaming ~20 MB through SHA-256 with nothing on disk, and compare with `HAZARD.sha256`. | `⚠️ pnct: ICNF hazard changed (SHA mismatch: served …, pinned 4bb7f921ba0d…). Update HAZARD.sha256 in scripts/landcheck_config.py, run `uv run make landcheck-fetch landcheck`, check, then deploy.` (once per new version) · `❌ pnct: ICNF hazard URL HTTP 404 <url>` · `✅ … reachable again` · `✅ … matches the pin again` |
| ICNF catalogue and metadata pages | The catalogue still links exactly the download URL; the metadata page answers. | `❌ pnct: the ICNF catalogue no longer lists the hazard zip <url>` |
| REN: DGT SRUP WFS ×6 | GetCapabilities must parse as `WFS_Capabilities`, then a GetFeature (`count=1`) on its first FeatureType must return a `FeatureCollection`. Capabilities alone don't count as up. | `🔓 pnct: DGT SRUP WFS is answering again (ALGARVE), so REN may be unblockable. Licence still to clear: docs/land-check/DATA.md.` · `🔒 … down again` |
| REN: DGT SRUP WMS | GetCapabilities parses. | `🔓 pnct: DGT SRUP WMS is answering again …` |
| dados.gov.pt (REN, ANACOM, ANACOM 2023) | The licence field; a downloadable file resource (CSV, ZIP, GPKG, SHP, GeoJSON, XLSX, TIFF, …, by format, filetype or extension; WMS/WFS/API don't count); any other resource change. | `🔓 … licence notspecified → cc-by, so fixed broadband (ANACOM) may be unblockable` · `🔓 … now lists a file resource (csv) …` · `ℹ️ … resources changed (+1 −0)` |
| SNIG REN record | A hash of the `otherConstraints` text, i.e. the "consultation only" clause. | `🔓 pnct: SNIG REN record (use constraints) changed: «…». The REN licence conflict may be resolved` |
| ANACOM ArcGIS | The `capabilities` field, today `Map`. | `🔓 … capabilities Map → Data,Map,Query (Query: data can be read) …` |

**General rules:**
- Live hazard failures are reported at once. Other pages and APIs are reported after 3 runs in a row without an answer, keeping their last values, so an outage never looks like a change.
- A monthly `💤 pnct: all quiet, N runs since …` goes out after 28 days without a message.
- The first run sends one `🆕 baseline recorded` message.
- If a Telegram send fails, the state isn't saved, the run exits 1, and the next run retries.
- The bot token never appears in logs or errors.

## Dry-run output (real sources, 2026-11-15, macOS)

Two runs, run 2 on the state of run 1 (`--save-state`), simulating a quiet week:

```
$ uv run python ops/pi/source_watcher.py --dry-run --save-state --state-dir .artifacts/watcher-state
pnct source watcher, 2026-11-15 13:33 UTC, 346 s, state .artifacts/watcher-state/state.json (baseline)
  hazard             {"reachable": true, "status": 200, "size": 19542232, "etag": "\"f7df13bac42d81:0\"", "last_modified": "Mon, 28 Mar 2022 13:59:29 GMT", "served_sha": "4bb7f921ba0da7a8f47b8426ea8ec5001f78dd32ce3e9bab2a746d24780a8011", "downloaded": true, "matches_pin": true}
  hazard-pages       {"catalogue": "HTTP 200", "metadata": "HTTP 200", "failures": 0, "lists_resource": true}
  ren-wfs-norte      {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wfs-centro     {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wfs-lvt        {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wfs-alentejo   {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wfs-algarve    {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wfs-pt1        {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-wms            {"state": "down", "detail": "TimeoutError: The read operation timed out"}
  ren-dados          {"license": "cc-by", "has_file": false, "file_formats": [], "failures": 0, "resources": 7}
  ren-snig           {"constraints": "A informação disponibilizada no SNIT destina-se à consulta e visualização, sendo interdita a sua comercialização. …", "constraints_sha": "f647645a4ecb73d4", "failures": 0}
  anacom-dados       {"license": "notspecified", "has_file": false, "file_formats": [], "failures": 0, "resources": 1}
  anacom-dados-2023  {"license": "notspecified", "has_file": false, "file_formats": [], "failures": 0, "resources": 0}
  anacom-arcgis      {"capabilities": "Map", "failures": 0}

Would send:
🆕 pnct watcher: baseline recorded, 14 checks. hazard pin OK; REN blocked (0/7 services up, no file on dados.gov.pt); fixed broadband (ANACOM) blocked (no file on dados.gov.pt).

$ uv run python ops/pi/source_watcher.py --dry-run --save-state --state-dir .artifacts/watcher-state
pnct source watcher, 2026-11-15 13:39 UTC, 271 s, state .artifacts/watcher-state/state.json (run 2)
  hazard             {… "downloaded": false, "matches_pin": true}      ← one HEAD, no download
  … (same as above; DGT now answers HTTP 500 for CENTRO and ALGARVE, timeouts elsewhere: still "down")

Would send nothing (no change).
```

**Findings from these runs:**
- The live ICNF file still matches the pin (the full SHA-256 was recomputed from a fresh download).
- All 7 DGT REN services are still down: they answer HTTP 500 after ~90 s or time out at 120 s.
- dados.gov.pt and ANACOM are unchanged: no file resource, and ANACOM's capabilities are still `Map`.
- The state file is 3,045 bytes.
- A third run with a forged old ETag took the download path: 20 MB streamed, SHA matched, nothing sent. It peaked at **38 MB RSS** and used **0.7 s CPU**, with 281 s wall time (almost all of it waiting on DGT).

## Test and check results

| Check | Result |
|---|---|
| `uv run pytest -q` (whole repo) | **178 passed** (145 before + 33 new) |
| `tests/test_source_watcher.py` | 33 passed, in 0.14 s, without network. Covers: baseline; quiet weeks with no download; new metadata with the same file; a new SHA, reported once, re-reported for a further version, resolved when the pin updates (no download); 404 and recovery; catalogue link gone and back; catalogue outage reported only on run 3; WFS up (unblock) / caps-only (not) / down again; WMS; ANACOM file resource; licence change; resource change; SNIG change; ArcGIS gaining Query; API outage (no false change, last values kept, recovery); monthly heartbeat and its reset; `is_file_resource` cases; config/observer consistency; dry run sends nothing and writes nothing; `--save-state` series; a failed send keeps the state; a real run saves after sending; env-file precedence; the placeholder token refused before any request; unit directives. |
| Mutation check | 3 deliberate bugs in the diff rules (repeat SHA alerts, repeat outage alerts, repeat WFS alerts) each made a test fail. |
| `shellcheck -x ops/pi/install.sh` | **Clean** (ShellCheck 0.11.0, via `uvx --from shellcheck-py`; nothing installed system-wide) |
| `systemd-analyze verify` | **Not run here.** macOS has no systemd, and the local Docker daemon isn't running. `install.sh` runs it on the Pi on every install and aborts on errors. A pytest pins the required directives. |
| Python compatibility | Tested on 3.12 (uv) and compiled with macOS's 3.14. The Pi's trixie ships 3.13, and `install.sh` refuses anything older than 3.11. |

## Steps on the Pi

1. **On the laptop, make the code reachable:** merge `feat/pi-source-watcher` into `main` (it carries land check v1 too) and push. Or push the branch and check it out on the Pi.
2. On the Pi:
   ```sh
   sudo git clone https://github.com/singledev-eu/pnct-map.git /opt/pnct-map
   sudo /opt/pnct-map/ops/pi/install.sh                 # creates /etc/pnct/pi.env and stops: token missing
   sudo nano /etc/pnct/pi.env                           # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
   sudo /opt/pnct-map/ops/pi/install.sh                 # verifies the units, enables the timer, shows the next run
   sudo /usr/bin/python3 /opt/pnct-map/ops/pi/source_watcher.py --test-message --env-file /etc/pnct/pi.env
   sudo systemctl start pnct-source-watcher.service     # baseline run (~5 min): one 🆕 message
   journalctl -u pnct-source-watcher.service -n 40 --no-pager
   systemctl list-timers pnct-source-watcher.timer
   ```
   For the chat id: message the bot, then open `https://api.telegram.org/bot<token>/getUpdates` and copy `message.chat.id`. A new @BotFather bot keeps the watcher apart from Prazo. Prazo's own token also works, because `sendMessage` doesn't interfere with Prazo's polling or webhook.
3. **Updating later:** `cd /opt/pnct-map && sudo git pull && sudo ops/pi/install.sh`.
4. **Optional:** `systemctl status prazo postgresql` before and after the first run, to see that they're unaffected.

## Open issues

- **Not merged or pushed.** Neither land check v1 nor the watcher is on `main`/`origin`. The Pi can't clone the watcher until one of them is pushed.
- **Telegram was never called for real** (no token here). The send path is unit-tested; `--test-message` on the Pi is the real check.
- **The WFS success path is tested only on synthetic fixtures**, because DGT has been down all day. The real answer may differ, e.g. a FeatureType name that needs a namespace prefix. If DGT comes back and GetFeature trips on that, the check reports `caps-only`: it stays quiet rather than sending a false unblock.
- **The SHA download depends on the HEAD metadata.** It re-downloads only when size, ETag or Last-Modified change. If ICNF replaced the file with one of the same size without changing ETag or Last-Modified (IIS normally changes both), it would go unseen until one of them changes.
  - *Resolved in the 0.10.0 wrap-up:* a forced SHA-256 check runs every 28 days (`FORCE_SHA_DAYS`) whatever the HEAD says, so such a replacement is reported within a month.
- **File-resource detection is a heuristic** (format, filetype or extension). Anything it misses still raises the `ℹ️ resources changed` message.
- **Load on DGT:** 7 requests a week, in parallel. That's negligible, but they are the slow part of every run (90–120 s each).
- **systemd-analyze** runs only on the Pi, inside `install.sh`.
- Local artefacts (`.artifacts/watcher-*`) are gitignored throwaways.
