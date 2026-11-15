# Pi source watcher: installed on prazo-pi (2026-11-15)

## Host
`ssh prazo-pi` worked directly (no `~/.ssh/config` lookup needed). Passwordless sudo works (`sudo -n true`).

## Before / after

| | Before | After |
|---|---|---|
| System | aarch64, Debian 13 (trixie), Python 3.13.5 | same |
| git | **not installed** | git 1:2.47.3-0+deb13u1 (installed with your OK, `--no-install-recommends`, nothing else upgraded) |
| `/` | 5.0G used, 23G free (18%) | 5.1G used, 23G free (19%); the checkout is 60 MB |
| RAM available | 6,961 MB of 7,819 | 6,957 MB |
| `prazo.service` | active | active |
| `postgresql@17-main.service`, `postgresql.service` | active, active | active, active |
| `prazo-db-backup.timer` | active | active |

## Steps
1. **Preflight:** OK, except that git was missing. I stopped and asked, and you chose to install it.
2. **Clone:** `/opt/pnct-map` at `b49b110` ("0.10.0 release report"), one commit after `v0.10.0`. The checkout is owned by root, so git commands there need `sudo`, as in the README.
3. **First `install.sh`:**
   - created the system user `pnct-watcher` and `/etc/pnct/pi.env` (placeholders, root:root 600);
   - `systemd-analyze verify: ok`;
   - did not enable the timer, as expected.
4. **Env file:**
   - **Chat ID:** the first `getUpdates` returned no updates, so I stopped and asked you to message the bot. The retry found 2 updates; the newest message's private chat ID ends in **…7020**.
   - **Writing it:** the token was read from `~/.config/pnct/telegram_token` inside a Python process (never in a command line or output). The file was written to a temp file with umask 077, copied to the Pi with scp, and installed with `sudo install -m 600 -o root -g root` to `/etc/pnct/pi.env`.
   - **Cleanup:** both temp files were deleted.
   - **Result:** the variables are exactly `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, as in `pi.env.example`.
5. **Second `install.sh`:** `systemd-analyze verify: ok`, timer enabled (symlink in `timers.target.wants`).
6. **Test message:** "test message sent", exit 0; you confirmed it arrived.
7. **Baseline run:** `systemctl start pnct-source-watcher.service` ran from 17:50:08 to 17:52:10 UTC.
   - Result `success`, exit 0, 121 s, 1.29 s CPU; the state file is `/var/lib/pnct-watcher/state.json`, 3,159 bytes.
   - Journal summary:
     - **hazard:** HTTP 200, 19,542,232 bytes, downloaded, SHA `4bb7f921…780a8011` matches the pin, `verified_at` 2026-11-15T17:50:08Z;
     - **hazard-pages:** catalogue and metadata HTTP 200, the catalogue still lists the zip;
     - **REN:** all 7 DGT services (6 WFS regions plus the WMS) down, read timeouts. dados.gov.pt has licence cc-by, 7 resources, no file. The SNIG "consultation only" clause is unchanged;
     - **ANACOM:** both dados.gov.pt datasets have licence notspecified and no file; ArcGIS capabilities are `Map`.
   - **Sent:** "🆕 pnct watcher: baseline recorded, 14 checks. hazard pin OK; REN blocked (0/7 services up, no file on dados.gov.pt); fixed broadband (ANACOM) blocked (no file on dados.gov.pt)."
8. **After:** all four Prazo and Postgres units are active. Disk and RAM are unchanged apart from the 60 MB checkout and git.

## Timer
`systemctl list-timers pnct-*`: next run **Sun 2026-11-22 03:40:22 WET** (the random delay of up to 45 min is redrawn on each daemon reload: it showed 03:48 right after enabling).

## By hand
- Nothing needed now. The baseline message should be in your Telegram chat.
- To update later (e.g. after a new hazard pin): `cd /opt/pnct-map && sudo git pull && sudo ops/pi/install.sh`.
- Logs: `journalctl -u pnct-source-watcher.service -n 60`.

## Secrets
- The token was never printed or put on a command line, and it isn't in this report.
- A scan of 10,942 files in the repo, `/tmp` and the session scratchpad found it in none, and git status is clean.
- On the Pi, the only copy is `/etc/pnct/pi.env` (600 root:root); no temp file is left in the home directory, `/tmp` or `/var/tmp`.
- The journal shows only the chat's messages, not the token.
