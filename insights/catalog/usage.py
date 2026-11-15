"""Usage-based insights: need per-parish usage data, which no source provides yet, so they are listed
as blocked rather than guessed."""

from __future__ import annotations

from insights import config as cfg
from insights.catalog.base import Blocked, Data, Insight, insight

USAGE_FILE = cfg.RAW / "usage_parish_views.csv"  # expected: dicofre,views,period_start,period_end

# TODO(most_viewed_parishes): the data source. The web app can load Cloudflare Web Analytics (web/analytics.ts,
# README "Analytics"), but that can't feed this insight: it records page paths and referrers, not query
# strings (no utm_*) and not hash routes (the selected parish lives in #… in the URL). Per-parish
# counts need an event per selection sent to an endpoint we control, e.g. a Cloudflare Pages Function
# writing to Workers Analytics Engine or D1, exported to USAGE_FILE by a fetch step here. Until then
# the insight stays blocked: no figure is ever estimated.


@insight("most_viewed_parishes", evergreen=False)
def most_viewed_parishes(d: Data) -> Insight:
    raise Blocked(
        "No per-parish view data: the optional Cloudflare Web Analytics records neither the parish (#… in the URL) nor query strings; see the TODO in insights/catalog/usage.py.",
        [str(USAGE_FILE.relative_to(cfg.ROOT))],
    )
