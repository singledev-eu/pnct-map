# PNCT Insights on the Raspberry Pi

A systemd timer runs `python -m insights next` on **Tuesdays and Fridays at 09:00 Europe/Lisbon**. Each run picks the next unposted insight, renders it, and sends it to Telegram: the EN card with the EN caption, then a text message with the PT caption. It records the insight in `posted.json`. Nothing is posted to Facebook: sending to Telegram counts as "drafted", and you decide what to post.

Prepared, not deployed. These are copy-paste steps for Raspberry Pi OS / Debian (aarch64), next to the existing source watcher (`ops/pi/`). The checkout is at `/opt/pnct-map`.

| File | What |
|---|---|
| `pnct-insights.service` | A oneshot unit, run as the system user `pnct-insights`. It reads `/etc/pnct-insights/insights.env` and writes only `/var/lib/pnct-insights` (state, drafts) and `/var/cache/pnct-insights` (matplotlib cache). Sandboxed, `Nice=10`, `MemoryMax=512M`. |
| `pnct-insights.timer` | `OnCalendar=Tue,Fri *-*-* 09:00:00 Europe/Lisbon`, `Persistent=true` (a run missed while the Pi was off happens after the next boot). |
| `requirements.txt` | The runtime dependencies only: pandas, matplotlib, python-dotenv. The Pi reads the committed `insights/data/prepared/`, so it never needs geopandas. |
| `insights.env.example` | The template for `/etc/pnct-insights/insights.env`. |

## Install (once)

```sh
# 1. The checkout (already there for the source watcher: just pull). It must be readable by the service user.
sudo git -C /opt/pnct-map pull            # or: sudo git clone https://github.com/singledev-eu/pnct-map.git /opt/pnct-map

# 2. Python venv with the runtime dependencies (aarch64 wheels exist for all three).
sudo apt-get install -y python3-venv
sudo python3 -m venv /opt/pnct-insights/venv
sudo /opt/pnct-insights/venv/bin/pip install --upgrade pip
sudo /opt/pnct-insights/venv/bin/pip install -r /opt/pnct-map/insights/deploy/requirements.txt

# 3. The service user: no login, no home.
sudo useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin pnct-insights

# 4. The env file: the existing dev bot's token and your chat ID. chmod 600, owned by the service user.
sudo install -d -m 0750 -o root -g pnct-insights /etc/pnct-insights
sudo install -m 0600 -o pnct-insights -g pnct-insights /opt/pnct-map/insights/deploy/insights.env.example /etc/pnct-insights/insights.env
sudo nano /etc/pnct-insights/insights.env      # set INSIGHTS_TELEGRAM_BOT_TOKEN and INSIGHTS_TELEGRAM_CHAT_ID
sudo ls -l /etc/pnct-insights/insights.env     # expect: -rw------- pnct-insights pnct-insights

# 5. The units.
sudo install -m 0644 /opt/pnct-map/insights/deploy/pnct-insights.service /opt/pnct-map/insights/deploy/pnct-insights.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/pnct-insights.service /etc/systemd/system/pnct-insights.timer
systemd-analyze calendar "Tue,Fri *-*-* 09:00:00 Europe/Lisbon"   # shows the next run in local time
sudo systemctl daemon-reload
```

## Prove it, then enable the timer

```sh
# A dry run as the service user: picks and renders the next insight and prints both captions.
# It sends nothing and writes no state.
cd /opt/pnct-map && sudo -u pnct-insights env INSIGHTS_STATE_DIR=/var/lib/pnct-insights \
  INSIGHTS_OUT_DIR=/tmp/pnct-insights-dry MPLCONFIGDIR=/tmp/pnct-insights-mpl \
  /opt/pnct-insights/venv/bin/python -m insights next --dry-run

# One real run now: the first draft arrives in Telegram and is recorded.
sudo systemctl start pnct-insights.service
journalctl -u pnct-insights.service -n 30 --no-pager

# Then the schedule.
sudo systemctl enable --now pnct-insights.timer
systemctl list-timers pnct-insights.timer
```

## Logs and state

```sh
systemctl list-timers pnct-insights.timer                 # next and last run
journalctl -u pnct-insights.service -n 50 --no-pager      # the last runs: which insight, sent or the error
systemctl status pnct-insights.service                    # failed = Telegram refused or was unreachable
sudo cat /var/lib/pnct-insights/posted.json               # what has been sent, with timestamps and message ids
ls /var/lib/pnct-insights/out/                            # the rendered drafts (EN and PT PNGs, captions)
```

- A failed send is **not** recorded, so the next run tries the same insight again. The unit then shows as failed.
- If either env var is missing, the run stops before rendering with `error: missing INSIGHTS_TELEGRAM_…` in the journal.
- The token never appears in the journal. Errors show it as `bot***`.
- To send an insight again, delete its entry from `posted.json`. To skip one, add `{"id": "<id>", "evergreen": true}` by hand. Run `python -m insights list` to see the ids.
- When every ready insight has been sent, a run logs "nothing left to send" and exits 0.

## Updating

```sh
sudo git -C /opt/pnct-map pull
sudo /opt/pnct-insights/venv/bin/pip install -r /opt/pnct-map/insights/deploy/requirements.txt   # only if it changed
sudo install -m 0644 /opt/pnct-map/insights/deploy/pnct-insights.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload
```

New data (a new INE year, a new PNCT list) is prepared on the laptop (`python -m insights fetch --refresh && python -m insights prepare`), checked, committed, and reaches the Pi with the pull.

## Uninstall

```sh
sudo systemctl disable --now pnct-insights.timer
sudo rm /etc/systemd/system/pnct-insights.{service,timer} && sudo systemctl daemon-reload
sudo rm -r /opt/pnct-insights /etc/pnct-insights /var/lib/pnct-insights /var/cache/pnct-insights
sudo userdel pnct-insights
```
