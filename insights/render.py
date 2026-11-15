"""1080×1080 PNG cards: kicker, headline number, subtitle, one chart, footnote, footer (source and
pnct.singledev.eu). Three chart types: bars, contrast (two numbers), map (PNCT parishes)."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.collections import PolyCollection  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

from insights import config as cfg  # noqa: E402
from insights.catalog.base import Data, Insight  # noqa: E402

SIZE_PX = 1080
DPI = 100
PT = 72 / DPI  # points per pixel

# The map's palette (web/src/theme.ts, light theme).
TEAL = "#0f8a7e"
TEAL_DARK = "#0b3d39"
TEAL_LIGHT = "#9fd8d0"
NEUTRAL = "#a3adb7"
DISPUTED = "#d9a441"  # the map's disputed amber (theme.ts), lightened for a fill
NEUTRAL_LIGHT = "#d9dee3"
TRACK = "#eef1f3"
INK = "#111827"
INK_2 = "#475569"
MUTED = "#64748b"
BG = "#ffffff"

KICKER = {"en": "PNCT IN NUMBERS", "pt": "PNCT EM NÚMEROS"}
LEFT, RIGHT = 0.074, 0.926
plt.rcParams.update({"font.family": "DejaVu Sans", "svg.fonttype": "none"})


def px(n: float) -> float:
    """Font size in points for a height of n pixels."""
    return n * PT


def wrap(text: str, font_px: float, width_frac: float) -> str:
    chars = max(10, int(width_frac * SIZE_PX / (0.56 * font_px)))
    return "\n".join(textwrap.wrap(text, chars, break_long_words=False))


def text_box(fig, t) -> tuple[float, float, float, float]:
    """(x0, y0, x1, y1) of a text artist in figure fractions."""
    bb = t.get_window_extent(renderer=fig.canvas.get_renderer())
    return bb.x0 / SIZE_PX, bb.y0 / SIZE_PX, bb.x1 / SIZE_PX, bb.y1 / SIZE_PX


def fit_text(fig, x, y, s, max_w, size_px, **kw):
    """Draw s, shrinking the font until it is at most max_w wide (figure fraction)."""
    t = fig.text(x, y, s, fontsize=px(size_px), **kw)
    while size_px > 20:
        x0, _, x1, _ = text_box(fig, t)
        if x1 - x0 <= max_w:
            break
        size_px *= 0.92
        t.set_fontsize(px(size_px))
    return t


def label(value, lang: str) -> str:
    return value if isinstance(value, str) else value[lang]


# --- Chart types ---------------------------------------------------------------------------------


def draw_bars(fig, spec: dict, lang: str, box: tuple[float, float, float, float]) -> None:
    rows = spec["rows"]
    x0, y0, x1, y1 = box
    ax = fig.add_axes((x0, y0, x1 - x0, y1 - y0))
    ax.set_axis_off()
    vmax = spec.get("max") or max([r["value"] for r in rows] + [spec.get("reference", {}).get("value", 0)])
    n = len(rows)
    ref = spec.get("reference")
    if n > 8:  # compact: names on the left, thin bars
        name_w = 0.30
        ax.set_xlim(-vmax * name_w / (1 - name_w - 0.14), vmax * 1.14)
        ax.set_ylim(n - 0.4, -0.6)
        fs = px(max(17, min(24, 520 / n)))
        for i, r in enumerate(rows):
            color = TEAL if r["highlight"] else NEUTRAL
            ax.add_patch(Rectangle((0, i - 0.32), r["value"], 0.64, color=color, lw=0))
            ax.text(-vmax * 0.02, i, label(r["label"], lang), ha="right", va="center", fontsize=fs, color=INK)
            ax.text(r["value"] + vmax * 0.015, i, r["value_label"][lang], ha="left", va="center", fontsize=fs, color=INK, fontweight="bold")
    else:  # roomy: the name above each bar
        ax.set_xlim(0, vmax * 1.32)
        ax.set_ylim(n, 0)
        name_px = 26 if n <= 5 else 23
        for i, r in enumerate(rows):
            color = TEAL if r["highlight"] else NEUTRAL
            name = wrap(label(r["label"], lang), name_px, (x1 - x0) * 0.95)
            two = "\n" in name
            ax.text(0, i + 0.04, name, ha="left", va="top", fontsize=px(name_px), color=INK,
                    fontweight="bold" if r["highlight"] else "normal", linespacing=1.1)
            bar_y = i + (0.62 if two else 0.46)
            bar_h = 0.30 if two else 0.34
            ax.add_patch(Rectangle((0, bar_y), max(r["value"], vmax * 0.004), bar_h, color=color, lw=0))
            ax.text(r["value"] + vmax * 0.02, bar_y + bar_h / 2, r["value_label"][lang], ha="left", va="center",
                    fontsize=px(30), color=INK, fontweight="bold", bbox={"facecolor": BG, "edgecolor": "none", "pad": 1})
    if ref:
        ax.axvline(ref["value"], color=INK_2, lw=1.6, ls=(0, (4, 3)), zorder=0)
        ax.text(ref["value"], -0.02 if n <= 8 else -0.62, ref["label"][lang], ha="center", va="bottom", fontsize=px(20), color=INK_2,
                bbox={"facecolor": BG, "edgecolor": "none", "pad": 2})


def draw_contrast(fig, spec: dict, lang: str, box) -> None:
    x0, y0, x1, y1 = box
    items = spec["items"]
    gap = 0.06
    w = (x1 - x0 - gap) / len(items)
    top = min(y1 - 0.02, (y0 + y1) / 2 + 0.17)
    for i, it in enumerate(items):
        left = x0 + i * (w + gap)
        color = TEAL if it["highlight"] else INK_2
        t = fit_text(fig, left, top, it["value"][lang], w, 150, color=color, fontweight="bold", va="top")
        _, vy0, _, _ = text_box(fig, t)
        lab = fig.text(left, vy0 - 0.02, wrap(label(it["label"], lang), 30, w), fontsize=px(30), color=INK, va="top", linespacing=1.2)
        if "share" in it:
            _, ly0, _, _ = text_box(fig, lab)
            by = ly0 - 0.05
            fig.patches.append(FancyBboxPatch((left, by), w, 0.022, boxstyle="round,pad=0,rounding_size=0.006",
                                              transform=fig.transFigure, color=TRACK, lw=0))
            if it["share"] > 0:
                fig.patches.append(FancyBboxPatch((left, by), max(w * it["share"], 0.012), 0.022, boxstyle="round,pad=0,rounding_size=0.006",
                                                  transform=fig.transFigure, color=TEAL if it["highlight"] else NEUTRAL, lw=0))


def draw_map(fig, spec: dict, lang: str, box, data: Data) -> None:
    x0, y0, x1, y1 = box
    shapes = data.map
    pnct = set(data.pnct.dicofre)
    disputed = set(data.disputed.dicofre)  # drawn apart: neither PNCT nor not (data/pnct_status.csv)
    hi = set(spec.get("highlight") or [])
    polys, colors = [], []
    for code, rings in shapes.items():
        c = (TEAL_DARK if code in hi else TEAL_LIGHT) if hi else TEAL
        if code not in pnct:
            c = NEUTRAL_LIGHT
        if code in disputed:
            c = DISPUTED
        for ring in rings:
            polys.append(ring)
            colors.append(c)
    h = y1 - y0
    w = h * 0.52  # mainland Portugal is about twice as tall as wide
    ax = fig.add_axes((x0, y0, w, h))
    ax.add_collection(PolyCollection(polys, facecolors=colors, edgecolors=BG, linewidths=0.15))
    ax.autoscale_view()
    ax.set_aspect("equal")
    ax.set_axis_off()
    # Legend, to the right of the map.
    swatches = ([TEAL_DARK, TEAL_LIGHT, NEUTRAL_LIGHT] if hi else [TEAL, NEUTRAL_LIGHT])
    legend = list(spec["legend"])
    if disputed:
        swatches.append(DISPUTED)
        legend.append({"en": "Sources disagree", "pt": "Fontes divergentes"})
    lx = x0 + w + 0.06
    ly = y0 + h * 0.62
    for sw, text in zip(swatches, legend):
        fig.patches.append(Rectangle((lx, ly), 0.034, 0.034, transform=fig.transFigure, color=sw, lw=0))
        fig.text(lx + 0.05, ly + 0.017, text[lang], fontsize=px(28), color=INK, va="center")
        ly -= 0.065


# --- Card ----------------------------------------------------------------------------------------


def render(ins: Insight, lang: str, path: Path, data: Data) -> Path:
    spec = ins.chart_spec
    fig = plt.figure(figsize=(SIZE_PX / DPI, SIZE_PX / DPI), dpi=DPI, facecolor=BG)
    fig.text(LEFT, 0.945, KICKER[lang], fontsize=px(22), color=TEAL, fontweight="bold", va="top")
    if spec.get("title"):  # contrast cards: the two numbers are the hero, so a title instead of a headline
        sub = fig.text(LEFT, 0.895, wrap(spec["title"][lang], 50, RIGHT - LEFT), fontsize=px(50), color=INK, fontweight="bold",
                       va="top", linespacing=1.15)
    else:
        head = fit_text(fig, LEFT - 0.004, 0.905, spec["headline"][lang], RIGHT - LEFT, 132, color=INK, fontweight="bold", va="top")
        _, hy0, _, _ = text_box(fig, head)
        sub = fig.text(LEFT, hy0 - 0.018, wrap(spec["subtitle"][lang], 34, RIGHT - LEFT), fontsize=px(34), color=INK_2, va="top", linespacing=1.2)
    _, sy0, _, _ = text_box(fig, sub)

    # Footer: rule, source (left, may wrap), site (right).
    fig.add_artist(plt.Line2D([LEFT, RIGHT], [0.088, 0.088], color=NEUTRAL_LIGHT, lw=1.5, transform=fig.transFigure))
    src = ins.source if lang == "pt" else ins.source_en
    fig.text(LEFT, 0.066, wrap(src, 19, 0.62), fontsize=px(19), color=MUTED, va="top", linespacing=1.25)
    fig.text(RIGHT, 0.066, cfg.SITE_LABEL, fontsize=px(26), color=TEAL, fontweight="bold", va="top", ha="right")
    bottom = 0.11
    if ins.footnote:
        fn = fig.text(LEFT, bottom, wrap("* " + ins.footnote[lang], 21, RIGHT - LEFT), fontsize=px(21), color=MUTED, va="bottom",
                      linespacing=1.25, style="italic")
        _, _, _, fy1 = text_box(fig, fn)
        bottom = fy1 + 0.02
    box = (LEFT, bottom + 0.01, RIGHT, sy0 - 0.045)
    kind = spec["type"]
    if kind == "bars":
        draw_bars(fig, spec, lang, box)
    elif kind == "contrast":
        draw_contrast(fig, spec, lang, box)
    elif kind == "map":
        draw_map(fig, spec, lang, box, data)
    else:
        raise ValueError(f"{ins.id}: unknown chart type {kind}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=DPI, facecolor=BG)
    plt.close(fig)
    return path


def write_outputs(ins: Insight, data: Data, out_dir: Path | None = None) -> Path:
    """insights/out/<id>/: chart_en.png, chart_pt.png, caption_en.txt, caption_pt.txt, insight.json."""
    d = (out_dir or cfg.OUT) / ins.id
    d.mkdir(parents=True, exist_ok=True)
    for lang in ("en", "pt"):
        render(ins, lang, d / f"chart_{lang}.png", data)
    (d / "caption_en.txt").write_text(ins.caption_en + "\n", encoding="utf-8")
    (d / "caption_pt.txt").write_text(ins.caption_pt + "\n", encoding="utf-8")
    (d / "insight.json").write_text(json.dumps(ins.to_dict(), ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    return d
