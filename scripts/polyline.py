"""Google Encoded Polyline (precision 1e5) and Idealista shape/URL helpers.

Kept in sync with web/src/idealista.ts; both are tested against the same
fixtures (tests/test_idealista.py, web/src/idealista.test.ts).
"""

from __future__ import annotations

import math
from urllib.parse import quote, unquote

Point = tuple[float, float]  # (lat, lng)

IDEALISTA = "https://www.idealista.pt"


def _encode_value(v: int) -> str:
    v = ~(v << 1) if v < 0 else v << 1
    out = []
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1F)) + 63))
        v >>= 5
    out.append(chr(v + 63))
    return "".join(out)


def encode(points: list[Point]) -> str:
    """Encode (lat, lng) points; coordinates are rounded to 5 decimals."""
    out = []
    prev_lat = prev_lng = 0
    for lat, lng in points:
        # floor(x + 0.5) matches JavaScript's Math.round (Python's round() is banker's).
        ilat, ilng = math.floor(lat * 1e5 + 0.5), math.floor(lng * 1e5 + 0.5)
        out.append(_encode_value(ilat - prev_lat))
        out.append(_encode_value(ilng - prev_lng))
        prev_lat, prev_lng = ilat, ilng
    return "".join(out)


def decode(encoded: str) -> list[Point]:
    points: list[Point] = []
    index = lat = lng = 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        points.append((lat / 1e5, lng / 1e5))
    return points


def escape(s: str) -> str:
    """encodeURIComponent, plus the sub-delims Idealista's own URLs escape: ( ) ~ ! * '."""
    return quote(s, safe="").replace("~", "%7E")


def shape_param(encoded: str) -> str:
    return escape(f"(({encoded}))")


def parse_shape_param(param: str) -> list[Point]:
    s = unquote(param)
    if not (s.startswith("((") and s.endswith("))")):
        raise ValueError("shape must be wrapped in (( ))")
    return decode(s[2:-2])


def polygon_url(op: str, kind: str, encoded: str, filters: list[str] | None = None) -> str:
    segment = f"/com-{','.join(filters)}" if filters else ""
    return f"{IDEALISTA}/areas/{op}-{kind}{segment}/mapa-google?shape={shape_param(encoded)}"
