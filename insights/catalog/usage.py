"""Usage-based insights: need an analytics source. The repo has none (the site is static, with no
analytics), so these are listed as blocked rather than guessed."""

from __future__ import annotations

from insights import config as cfg
from insights.catalog.base import Blocked, Data, Insight, insight

USAGE_FILE = cfg.RAW / "usage_parish_views.csv"  # expected: dicofre,views,period_start,period_end


@insight("most_viewed_parishes", evergreen=False)
def most_viewed_parishes(d: Data) -> Insight:
    raise Blocked(
        "No analytics source in the repo: the web app has no page-view tracking, so there is no per-parish view count.",
        [str(USAGE_FILE.relative_to(cfg.ROOT))],
    )
