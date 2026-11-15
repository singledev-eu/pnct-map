"""The insight catalog. Each module registers its insights with @insight; order = catalog order."""

from insights.catalog import territory, distance, extremes, change, housing, usage  # noqa: F401  (registration)
from insights.catalog.base import REGISTRY, Blocked, Data, Insight

__all__ = ["REGISTRY", "Blocked", "Data", "Insight", "check_no_disputed", "compute", "compute_all"]


def compute(insight_id: str, data: Data | None = None) -> Insight:
    if insight_id not in REGISTRY:
        raise KeyError(f"unknown insight {insight_id!r}; see `python -m insights list`")
    return REGISTRY[insight_id].fn(data or Data())


def check_no_disputed(ready: dict[str, Insight], data: Data) -> None:
    """No insight output may name a disputed parish (data/pnct_status.csv): not by code, not as
    "Name (Concelho)" / "Name, Concelho", not as a bare value. Raises ValueError listing every hit."""
    bad = []
    for r in data.disputed.itertuples():
        bad += [r.dicofre, f"{r.name} ({r.concelho})", f"{r.name}, {r.concelho}"]
    names = set(data.disputed.name)
    hits = []

    def walk(iid: str, where: str, value) -> None:
        if isinstance(value, dict):
            for k, v in value.items():
                walk(iid, f"{where}.{k}", v)
        elif isinstance(value, (list, tuple)):
            for i, v in enumerate(value):
                walk(iid, f"{where}[{i}]", v)
        elif isinstance(value, str):
            found = [value] if value in names else [b for b in bad if b in value]
            if found:
                hits.append(f"{iid} {where}: {found[0]!r} in {value[:60]!r}")

    for iid, ins in ready.items():
        walk(iid, "", ins.to_dict())
    if hits:
        raise ValueError("insight output names a disputed parish:\n  " + "\n  ".join(hits))


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
