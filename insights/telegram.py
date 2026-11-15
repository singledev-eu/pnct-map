"""Telegram delivery: only sendPhoto and sendMessage. Never getUpdates or setWebhook: another app may
be polling this bot, and either call would steal its updates or cause 409 conflicts.

The token comes only from the environment and never appears in output, logs or errors."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

TOKEN_VAR = "INSIGHTS_TELEGRAM_BOT_TOKEN"
CHAT_VAR = "INSIGHTS_TELEGRAM_CHAT_ID"
API = "https://api.telegram.org/bot{token}/{method}"
ALLOWED = {"sendPhoto", "sendMessage"}
CAPTION_MAX = 1024  # Telegram's photo caption limit


class TelegramError(RuntimeError):
    pass


def mask(text: str, token: str | None) -> str:
    """The token, wherever it appears, as bot***."""
    return text.replace(f"bot{token}", "bot***").replace(token, "bot***") if token else text


def credentials() -> tuple[str, str]:
    token, chat = os.environ.get(TOKEN_VAR, "").strip(), os.environ.get(CHAT_VAR, "").strip()
    missing = [v for v, val in ((TOKEN_VAR, token), (CHAT_VAR, chat)) if not val]
    if missing:
        raise TelegramError(
            f"missing {' and '.join(missing)}: set it in the environment or in .env (see .env.example). "
            "`python -m insights render` works without it."
        )
    return token, chat


def _multipart(fields: dict[str, str], file_field: str, file_path: Path) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    out += (f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'
            "Content-Type: image/png\r\n\r\n").encode()
    out += file_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def _call(token: str, method: str, body: bytes, content_type: str) -> dict:
    if method not in ALLOWED:
        raise TelegramError(f"refusing to call {method}: only {sorted(ALLOWED)} are allowed")
    req = urllib.request.Request(API.format(token=token, method=method), data=body, headers={"Content-Type": content_type})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            desc = json.loads(e.read()).get("description", "")
        except Exception:
            desc = ""
        raise TelegramError(mask(f"{method} failed: HTTP {e.code} {desc}".strip(), token)) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise TelegramError(mask(f"{method} failed: {type(e).__name__} {getattr(e, 'reason', '')}".strip(), token)) from None
    if not data.get("ok"):
        raise TelegramError(mask(f"{method} failed: {data.get('description', 'not ok')}", token))
    return data["result"]


def send_photo(token: str, chat: str, photo: Path, caption: str) -> int:
    if len(caption) > CAPTION_MAX:
        raise TelegramError(f"caption is {len(caption)} characters, Telegram allows {CAPTION_MAX}")
    body, ctype = _multipart({"chat_id": chat, "caption": caption}, "photo", photo)
    return _call(token, "sendPhoto", body, ctype)["message_id"]


def send_message(token: str, chat: str, text: str) -> int:
    body = json.dumps({"chat_id": chat, "text": text, "disable_web_page_preview": True}).encode()
    return _call(token, "sendMessage", body, "application/json")["message_id"]
