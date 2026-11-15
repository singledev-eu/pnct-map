# Pi jobs: source watcher

A weekly job on the Raspberry Pi (`prazo-pi`: Pi 4, Debian trixie, arm64) that watches the land check's data sources and sends a Telegram message when one needs attention. It **never rebuilds or deploys**: the data is still built with `uv run make landcheck` and deployed with `npm run deploy` from the laptop.

Everything it runs is in this directory and in `scripts/landcheck_config.py`, which is its source list (docs/land-check/DATA.md).

| File | What |
|---|---|
| `source_watcher.py` | The watcher. Standard-library Python 3.11+, nothing to install. |
| `systemd/pnct-source-watcher.service` | A oneshot unit as user `pnct-watcher`: `Nice=10`, `CPUWeight=20`, `IOSchedulingClass=idle`, `MemoryMax=512M`, `TimeoutStartSec=45min`, sandboxed (`ProtectSystem=strict`, its state directory only). |
| `systemd/pnct-source-watcher.timer` | Sundays 03:30 plus up to 45 min random delay, `Persistent=true` (a run missed while the Pi was off happens after the next boot). |
| `pi.env.example` | The template for `/etc/pnct/pi.env` (Telegram token and chat id). The real file is never in git. |
| `install.sh` | An idempotent installer and updater. |

## What it checks, and what you get told

| Check | Detects | Message |
|---|---|---|
| **ICNF hazard zip** (`HAZARD.download_url`) | A HEAD each week (status, size, ETag, Last-Modified). Only if one of these changed, or on the first run, it downloads the ~20 MB file, hashed as it streams (nothing written to disk), and compares it with `HAZARD.sha256`. | `⚠️ pnct: ICNF hazard changed (SHA mismatch …). Update HAZARD.sha256 in scripts/landcheck_config.py, run `uv run make landcheck-fetch landcheck`, check, then deploy.` (once per new version) · `❌ pnct: ICNF hazard URL HTTP 404 <url>` · `✅ … reachable again` · `✅ … matches the pin again` (after you update the pin and `git pull` on the Pi) |
| **ICNF catalogue** (`HAZARD.url`, `HAZARD.metadata_url`) | The catalogue page still links exactly that zip, and the metadata page answers. | `❌ pnct: the ICNF catalogue no longer lists the hazard zip <url>` |
| **REN: DGT SRUP WFS** (6 regions) and **WMS** | WFS: GetCapabilities parses, then a one-feature GetFeature returns a FeatureCollection. WMS: GetCapabilities parses. | `🔓 pnct: DGT SRUP WFS is answering again (ALGARVE), so REN may be unblockable. …` · `🔒 … down again` |
| **dados.gov.pt** datasets (REN, ANACOM ×2) | A licence change; a downloadable file resource appearing (CSV, ZIP, GPKG, …, not only WMS); any other resource change. | `🔓 pnct: dados.gov.pt ANACOM fixed coverage now lists a file resource (csv), so fixed broadband (ANACOM) may be unblockable <url>` · `🔓 … licence notspecified → cc-by …` · `ℹ️ … resources changed (+1 −0)` |
| **SNIG REN record** | The use-constraints text, i.e. the "consultation only" clause behind the REN licence conflict. | `🔓 pnct: SNIG REN record (use constraints) changed: «…»` |
| **ANACOM ArcGIS service** | Its capabilities, today `Map`. Gaining `Query` would make the data readable. | `🔓 pnct: ANACOM Rede_Fixa ArcGIS service: capabilities Map → Map,Query …` |

**Rules:**
- A message is sent only when something **changes**. Nothing is repeated week after week.
- Live hazard failures are reported at once.
- A page or API that doesn't answer is reported after **3 runs in a row**, so one flaky week stays quiet. Its last known values are kept, so an outage never looks like a change.
- After **28 days** without a message, one `💤 pnct: all quiet, N runs since …` heartbeat is sent.
- The **first run** sends one `🆕 baseline recorded` message, which also proves Telegram works.
- If the Telegram send fails, the state isn't saved, so the next run tries again. The run then exits non-zero and shows as failed in systemd.

State is one JSON file of about 7 KB in `STATE_DIR` (default `/var/lib/pnct-watcher`). Nothing else is written.

**Load on the Pi:** the run is mostly waiting on DGT's dead services (90–120 s each, run in parallel). It takes 5–9 minutes and needs about 30 MB of RAM. It downloads 20 MB only when ICNF's file metadata changes.

## Setup (once)

```sh
# 1. A checkout readable by the service user (the default path needs no drop-in).
sudo git clone https://github.com/singledev-eu/pnct-map.git /opt/pnct-map

# 2. Install: user, packages if missing, /etc/pnct/pi.env, state dir, units.
sudo /opt/pnct-map/ops/pi/install.sh

# 3. Fill in the token and chat id (a separate @BotFather bot, or Prazo's token), then run install again.
sudo nano /etc/pnct/pi.env
sudo /opt/pnct-map/ops/pi/install.sh        # checks the units, enables the timer, shows the next run

# 4. Prove it.
sudo /usr/bin/python3 /opt/pnct-map/ops/pi/source_watcher.py --test-message --env-file /etc/pnct/pi.env
sudo systemctl start pnct-source-watcher.service   # the baseline run, one message
```

Telegram chat id: send your bot any message, then open `https://api.telegram.org/bot<token>/getUpdates` and copy `message.chat.id`. The watcher only calls `sendMessage`, so sharing Prazo's token doesn't interfere with Prazo's updates. A separate bot keeps the two apart.

Checked out elsewhere (e.g. `~/pnct-map`)? `install.sh` writes a drop-in, `/etc/systemd/system/pnct-source-watcher.service.d/10-local.conf`, with the right `ExecStart` (and `ProtectHome=read-only` under `/home`). Same for a custom `STATE_DIR`.

## Updating

```sh
cd /opt/pnct-map && sudo git pull && sudo ops/pi/install.sh
```

`install.sh` is safe to run any number of times. It never overwrites `/etc/pnct/pi.env` and never starts a run. A new pin in `landcheck_config.py` reaches the watcher with the pull; the next run says `✅ … matches the pin again`, without downloading.

## Logs and running by hand

```sh
systemctl list-timers pnct-source-watcher.timer          # next and last run
journalctl -u pnct-source-watcher.service -n 60          # the last run's status table and messages
sudo systemctl start pnct-source-watcher.service         # a real run now (sends only what changed)

# A dry run: prints every check and the message it would send; sends nothing, writes no state.
sudo -u pnct-watcher env STATE_DIR=/var/lib/pnct-watcher /usr/bin/python3 /opt/pnct-map/ops/pi/source_watcher.py --dry-run
```

The same dry run works on a laptop (macOS included) from the repo root: `uv run python ops/pi/source_watcher.py --dry-run --state-dir .artifacts/watcher-state`. Add `--save-state` to simulate a series of weekly runs.

## Uninstalling

```sh
sudo systemctl disable --now pnct-source-watcher.timer
sudo rm -r /etc/systemd/system/pnct-source-watcher.* /var/lib/pnct-watcher /etc/pnct/pi.env
sudo systemctl daemon-reload && sudo userdel pnct-watcher
```

## Tests

`tests/test_source_watcher.py` (in the normal `uv run pytest`) feeds recorded responses (`tests/fixtures/watcher/`) through a fake HTTP client: baseline, quiet weeks, a new SHA, 404 and recovery, the catalogue dropping the link, the WFS coming back, file resources, licence and capability changes, API outages, the heartbeat, dry runs and failed sends. There is no network in tests. `install.sh` passes shellcheck. `systemd-analyze verify` runs inside `install.sh`, on the Pi.
