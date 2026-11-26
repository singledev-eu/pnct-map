"""The car road graph and the nearest-facility routing for nearby services (docs/nearby-services/DATA.md).

  read_roads(pbf)        drivable OSM ways -> directed edges (u, v, metres, seconds) over compact node ids
  Graph.build(...)       CSR matrices of the reversed graph (time and length), duplicate edges reduced to
                         the fastest, and the largest strongly connected component (the snap targets)
  Graph.nearest(...)     one multi-source Dijkstra per category on the reversed graph: for every node,
                         the drive time to the nearest facility, which facility, and the road distance
                         along that same (fastest) path

Everything after read_roads is numpy/scipy and covered by tests/test_services.py on small graphs.
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import services_config as cfg  # noqa: E402

EARTH_R = 6371008.8


def haversine(lon1, lat1, lon2, lat2):
    """Great-circle metres, vectorised."""
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(a))


@dataclass
class Roads:
    lon: np.ndarray  # per node
    lat: np.ndarray
    u: np.ndarray  # per directed edge
    v: np.ndarray
    metres: np.ndarray
    seconds: np.ndarray
    ways: int


def read_roads(pbf: Path, bbox=(cfg.LON_MIN, cfg.LAT_MIN, cfg.LON_MAX, cfg.LAT_MAX)) -> Roads:
    """Every drivable way (services_config.way_speed) with a node inside bbox, as directed edges."""
    import osmium  # only the pipeline needs it

    started = time.time()
    ids: list[np.ndarray] = []
    lons: list[np.ndarray] = []
    lats: list[np.ndarray] = []
    speeds: list[float] = []
    dirs: list[int] = []
    lon0, lat0, lon1, lat1 = bbox
    fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(osmium.filter.KeyFilter("highway"))
    for w in fp:
        if not w.is_way():
            continue
        tags = dict(w.tags)
        speed = cfg.way_speed(tags)
        if speed is None:
            continue
        nodes = w.nodes
        if len(nodes) < 2:
            continue
        try:
            xy = np.array([(n.location.lon, n.location.lat) for n in nodes])
        except osmium.InvalidLocationError:
            continue
        if not ((xy[:, 0] >= lon0) & (xy[:, 0] <= lon1) & (xy[:, 1] >= lat0) & (xy[:, 1] <= lat1)).any():
            continue
        ids.append(np.fromiter((n.ref for n in nodes), dtype=np.int64, count=len(nodes)))
        lons.append(xy[:, 0])
        lats.append(xy[:, 1])
        speeds.append(speed)
        dirs.append(cfg.way_direction(tags))
    print(f"  roads: {len(ids):,} drivable ways read ({time.time() - started:.0f} s)")

    lengths = np.fromiter((len(a) for a in ids), dtype=np.int64, count=len(ids))
    all_ids = np.concatenate(ids)
    all_lon = np.concatenate(lons)
    all_lat = np.concatenate(lats)
    uniq, first, inverse = np.unique(all_ids, return_index=True, return_inverse=True)
    node_lon, node_lat = all_lon[first], all_lat[first]
    # Segments: consecutive nodes inside one way (drop the junction between two ways' arrays).
    starts = np.concatenate(([0], np.cumsum(lengths)[:-1]))
    is_last = np.zeros(len(all_ids), dtype=bool)
    is_last[starts + lengths - 1] = True
    seg = np.nonzero(~is_last)[0]
    a, b = inverse[seg], inverse[seg + 1]
    way_of_seg = np.repeat(np.arange(len(ids)), lengths - 1)
    speed = np.asarray(speeds)[way_of_seg]
    direction = np.asarray(dirs, dtype=np.int8)[way_of_seg]
    metres = haversine(node_lon[a], node_lat[a], node_lon[b], node_lat[b])
    keep = a != b
    a, b, speed, direction, metres = a[keep], b[keep], speed[keep], direction[keep], metres[keep]
    seconds = metres / (speed / 3.6)
    fwd = direction >= 0
    bwd = direction <= 0
    u = np.concatenate((a[fwd], b[bwd]))
    v = np.concatenate((b[fwd], a[bwd]))
    m = np.concatenate((metres[fwd], metres[bwd]))
    s = np.concatenate((seconds[fwd], seconds[bwd]))
    print(f"  roads: {len(uniq):,} nodes, {len(u):,} directed edges")
    return Roads(node_lon, node_lat, u.astype(np.int64), v.astype(np.int64), m, s, len(ids))


def cached_roads(pbf: Path, sha256: str) -> Roads:
    """read_roads, cached next to the extract (data/external/services/, gitignored) per extract and rules."""
    import hashlib
    import inspect

    rules = hashlib.sha256((inspect.getsource(cfg.way_speed) + inspect.getsource(cfg.way_direction) + repr(cfg.SPEEDS_KMH) + repr(cfg.MAXSPEED_ZONES) + repr(sorted(cfg.ACCESS_NO)) + repr(cfg.TRACK_GRADE_KMH)).encode()).hexdigest()[:8]
    path = cfg.CACHE / f"roads-{sha256[:8]}-{rules}.npz"
    if path.exists():
        z = np.load(path)
        print(f"  roads: cached {path.name}")
        return Roads(z["lon"], z["lat"], z["u"], z["v"], z["metres"], z["seconds"], int(z["ways"]))
    r = read_roads(pbf)
    for old in cfg.CACHE.glob("roads-*.npz"):
        old.unlink()
    np.savez(path, lon=r.lon, lat=r.lat, u=r.u, v=r.v, metres=r.metres, seconds=r.seconds, ways=r.ways)
    return r


@dataclass
class Nearest:
    seconds: np.ndarray  # per node; inf where no facility is reachable
    metres: np.ndarray  # road distance along the fastest path; inf likewise
    facility: np.ndarray  # per node: index into the category's facility list, -1 if unreachable


class Graph:
    def __init__(self, n: int, rev_time: csr_matrix, edge_keys: np.ndarray, edge_metres: np.ndarray, main: np.ndarray, xy: np.ndarray):
        self.n = n
        self.rev_time = rev_time  # entry [v, u] = seconds of the original edge u -> v (fastest of duplicates)
        self.edge_keys = edge_keys  # sorted u * n + v of the kept original edges
        self.edge_metres = edge_metres  # aligned with edge_keys
        self.main = main  # bool per node: in the largest strongly connected component
        self.xy = xy  # projected node coordinates (EPSG:3763 metres), for snapping
        self._tree = cKDTree(xy[main])
        self._main_idx = np.nonzero(main)[0]

    @classmethod
    def build(cls, n: int, u: np.ndarray, v: np.ndarray, metres: np.ndarray, seconds: np.ndarray, xy: np.ndarray) -> "Graph":
        # Parallel edges: keep the fastest per (u, v), with its own length.
        keys = u.astype(np.int64) * n + v.astype(np.int64)
        order = np.lexsort((seconds, keys))
        keys, metres, seconds = keys[order], metres[order], seconds[order]
        first = np.ones(len(keys), dtype=bool)
        first[1:] = keys[1:] != keys[:-1]
        keys, metres, seconds = keys[first], metres[first], seconds[first]
        uu, vv = keys // n, keys % n
        # scipy treats an explicit 0 as "no edge" in some paths; a 1 ms floor keeps zero-length edges.
        weights = np.maximum(seconds, 1e-3)
        rev = csr_matrix((weights, (vv, uu)), shape=(n, n))
        fwd = csr_matrix((weights, (uu, vv)), shape=(n, n))
        _, labels = connected_components(fwd, directed=True, connection="strong")
        main = labels == np.bincount(labels).argmax()
        return cls(n, rev, keys, metres, main, xy)

    def snap(self, xy: np.ndarray, max_m: float = cfg.SNAP_MAX_M) -> tuple[np.ndarray, np.ndarray]:
        """Nearest main-component node for each point: (node index or -1 beyond max_m, distance m)."""
        if len(xy) == 0:
            return np.zeros(0, dtype=np.int64), np.zeros(0)
        dist, idx = self._tree.query(xy)
        node = self._main_idx[idx]
        node = np.where(dist <= max_m, node, -1)
        return node, dist

    def edge_length(self, u: np.ndarray, v: np.ndarray) -> np.ndarray:
        keys = u.astype(np.int64) * self.n + v.astype(np.int64)
        pos = np.searchsorted(self.edge_keys, keys)
        pos = np.minimum(pos, len(self.edge_keys) - 1)
        if not np.array_equal(self.edge_keys[pos], keys):
            raise ValueError("edge_length: a path step is not an edge")
        return self.edge_metres[pos]

    def nearest(self, facility_nodes: np.ndarray) -> Nearest:
        """Multi-source Dijkstra from every facility on the reversed graph: origin -> nearest facility."""
        sources, first = np.unique(facility_nodes, return_index=True)
        dist, pred, src = dijkstra(self.rev_time, directed=True, indices=sources, return_predecessors=True, min_only=True)
        facility_of_node = np.full(self.n, -1, dtype=np.int64)
        facility_of_node[sources] = first  # facilities sharing a node: the first in the list
        reach = np.isfinite(dist)
        facility = np.where(reach, facility_of_node[np.maximum(src, 0)], -1)
        metres = self.path_metres(pred, reach)
        return Nearest(dist, metres, facility)

    def path_metres(self, pred: np.ndarray, reach: np.ndarray) -> np.ndarray:
        """Road metres from each node to its tree root along `pred` (pointer jumping, O(n log depth))."""
        has = (pred >= 0) & reach
        step = np.zeros(self.n)
        x = np.nonzero(has)[0]
        # pred[x] is the next node towards the facility: the original edge is x -> pred[x].
        step[x] = self.edge_length(x, pred[x])
        acc = step.copy()
        nxt = np.where(has, pred, -1)
        while True:
            live = nxt >= 0
            if not live.any():
                break
            idx = np.nonzero(live)[0]
            parent = nxt[idx]
            acc_new = acc.copy()
            acc_new[idx] = acc[idx] + acc[parent]
            nxt_new = nxt.copy()
            nxt_new[idx] = nxt[parent]
            acc, nxt = acc_new, nxt_new
        acc[~reach] = np.inf
        return acc
