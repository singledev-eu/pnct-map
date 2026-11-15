#!/usr/bin/env bash
# Installs (or updates) the pnct-map source watcher on the Raspberry Pi. Idempotent: run it again
# after every `git pull`. See ops/pi/README.md.
#
#   sudo ops/pi/install.sh
#
# It installs python3 and ca-certificates if missing, creates the system user pnct-watcher, the
# env file /etc/pnct/pi.env (from pi.env.example, once, chmod 600), the state directory, and the
# systemd service + timer. It enables the timer only once the env file has a real token. It never
# starts a run itself (the first run sends the baseline message).
set -euo pipefail

SERVICE=pnct-source-watcher
SERVICE_USER=pnct-watcher
ENV_DIR=/etc/pnct
ENV_FILE="$ENV_DIR/pi.env"
UNIT_DIR=/etc/systemd/system
DROPIN_DIR="$UNIT_DIR/$SERVICE.service.d"
DEFAULT_REPO=/opt/pnct-map
DEFAULT_STATE=/var/lib/pnct-watcher

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/../.." && pwd)"

say() { printf '==> %s\n' "$*"; }
die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run it as root: sudo $0"
command -v systemctl >/dev/null || die "systemd is required"

# 1. Packages: python3 (3.11+) and the CA store. Nothing else; the watcher is standard-library Python.
missing=()
for pkg in python3 ca-certificates; do
  dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed" || missing+=("$pkg")
done
if ((${#missing[@]})); then
  say "installing ${missing[*]}"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${missing[@]}"
fi
/usr/bin/python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' || die "python3 3.11 or newer is required ($(/usr/bin/python3 -V))"

# 2. The service user: no login, no home.
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  say "creating system user $SERVICE_USER"
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# 3. The env file: created once from the example, never overwritten; always root-only.
install -d -m 0755 -o root -g root "$ENV_DIR"
if [[ ! -f $ENV_FILE ]]; then
  say "creating $ENV_FILE from pi.env.example: fill in the Telegram token and chat id"
  install -m 0600 -o root -g root "$HERE/pi.env.example" "$ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

env_value() { # the last KEY=value in the env file, quotes stripped
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 | tr -d "\"'"
}
STATE_DIR="$(env_value STATE_DIR)"
STATE_DIR="${STATE_DIR:-$DEFAULT_STATE}"
TOKEN="$(env_value TELEGRAM_BOT_TOKEN)"
CHAT="$(env_value TELEGRAM_CHAT_ID)"

# 4. The state directory (systemd also creates the default one through StateDirectory=).
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$STATE_DIR"

# 5. The service user must be able to read the checkout (the watcher and scripts/landcheck_config.py).
for f in ops/pi/source_watcher.py scripts/landcheck_config.py; do
  runuser -u "$SERVICE_USER" -- test -r "$REPO_DIR/$f" || die "$SERVICE_USER can't read $REPO_DIR/$f; make the checkout world-readable (chmod -R o+rX, and o+x on its parent directories)"
done

# 6. Units, plus a drop-in for a checkout or state directory outside the defaults.
install -m 0644 -o root -g root "$HERE/systemd/$SERVICE.service" "$HERE/systemd/$SERVICE.timer" "$UNIT_DIR/"
dropin=""
if [[ $REPO_DIR != "$DEFAULT_REPO" ]]; then
  dropin+=$'ExecStart=\n'"ExecStart=/usr/bin/python3 $REPO_DIR/ops/pi/source_watcher.py"$'\n'
fi
if [[ $STATE_DIR != "$DEFAULT_STATE" ]]; then
  dropin+="ReadWritePaths=$STATE_DIR"$'\n'
fi
if [[ $REPO_DIR == /home/* || $REPO_DIR == /root/* ]]; then
  dropin+=$'ProtectHome=read-only\n'
fi
if [[ -n $dropin ]]; then
  install -d -m 0755 "$DROPIN_DIR"
  printf '# Written by ops/pi/install.sh for this checkout (%s); rewritten on every run.\n[Service]\n%s' "$REPO_DIR" "$dropin" >"$DROPIN_DIR/10-local.conf"
  chmod 0644 "$DROPIN_DIR/10-local.conf"
  say "drop-in $DROPIN_DIR/10-local.conf for $REPO_DIR"
else
  rm -f "$DROPIN_DIR/10-local.conf"
  rmdir "$DROPIN_DIR" 2>/dev/null || true
fi
# systemd-analyze is part of systemd on Debian: the units are checked here, on the Pi itself.
if command -v systemd-analyze >/dev/null; then
  systemd-analyze verify "$UNIT_DIR/$SERVICE.service" "$UNIT_DIR/$SERVICE.timer" || die "systemd-analyze verify found problems in the units (above)"
  say "systemd-analyze verify: ok"
fi
systemctl daemon-reload

# 7. The timer, once the env file is filled in.
if [[ -z $TOKEN || $TOKEN == 123456:* || -z $CHAT || $CHAT == replace-me ]]; then
  say "not enabling the timer yet: edit $ENV_FILE (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID), then run this script again"
  exit 0
fi
systemctl enable --now "$SERVICE.timer" >/dev/null
say "timer enabled; next run:"
systemctl list-timers --no-pager "$SERVICE.timer" | sed -n '1,2p'
cat <<EOF

Next steps (once):
  sudo /usr/bin/python3 $REPO_DIR/ops/pi/source_watcher.py --test-message --env-file $ENV_FILE
  sudo systemctl start $SERVICE.service      # first run: records the baseline and sends one message
  journalctl -u $SERVICE.service -n 40 --no-pager
EOF
