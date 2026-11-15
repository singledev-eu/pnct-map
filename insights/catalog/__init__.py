"""The insight catalog. Each module registers its insights with @insight; order = catalog order."""

from insights.catalog import territory, distance, extremes, change, housing, usage  # noqa: F401  (registration)
from insights.catalog.base import REGISTRY, Blocked, Data, Insight

__all__ = ["REGISTRY", "Blocked", "Data", "Insight", "compute", "compute_all"]


def compute(insight_id: str, data: Data | None = None) -> Insight:
    if insight_id not in REGISTRY:
        raise KeyError(f"unknown insight {insight_id!r}; see `python -m insights list`")
    return REGISTRY[insight_id].fn(data or Data())


def compute_all(data: Data | None = None) -> tuple[dict[str, Insight], dict[str, Blocked]]:
    data = data or Data()
    ready, blocked = {}, {}
    for iid, entry in REGISTRY.items():
        try:
            result = entry.fn(data)
        except Blocked as b:
            blocked[iid] = b
            continue
        assert result.id == iid and result.evergreen == entry.evergreen, iid
        ready[iid] = result
    return ready, blocked
