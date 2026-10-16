import math
from bisect import bisect_right
from datetime import timedelta

METERS_PER_MILE = 1609.344


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def cumulative(values):
    result = [0.0]
    for value in values:
        result.append(result[-1] + value)
    return result


def sample_route(route, spacing, departure):
    coords = route["geometry"]
    distances = route["segment_distances"]
    durations = route["segment_durations"]
    if (
        len(coords) < 2
        or len(distances) != len(coords) - 1
        or len(durations) != len(distances)
    ):
        raise ValueError("Routing provider returned inconsistent geometry annotations")
    # OSRM edge annotations can omit turn penalties included in the summary.
    # Reconcile totals while preserving each road segment's relative timing.
    distance_total, duration_total = sum(distances), sum(durations)
    if distance_total > 0 and route.get("distance_meters"):
        distances = [v * route["distance_meters"] / distance_total for v in distances]
    if duration_total > 0 and route.get("duration_seconds"):
        durations = [v * route["duration_seconds"] / duration_total for v in durations]
    along, times = cumulative(distances), cumulative(durations)
    total = along[-1]
    step = spacing * METERS_PER_MILE
    if total <= 0 or not math.isfinite(total):
        raise ValueError("No usable road route between these locations")
    targets = [i * step for i in range(int(total // step) + 1)]
    if total - targets[-1] > 0.01:
        targets.append(total)
    else:
        targets[-1] = total
    if len(targets) > 180:
        raise ValueError(
            "Trip is too long at this checkpoint spacing. Choose 25 or 50 miles, or a shorter trip."
        )
    points = []
    for target in targets:
        index = min(bisect_right(along, target) - 1, len(distances) - 1)
        fraction = (target - along[index]) / distances[index] if distances[index] else 0
        start, end = coords[index : index + 2]
        points.append(
            {
                "coordinate": [
                    start[0] + (end[0] - start[0]) * fraction,
                    start[1] + (end[1] - start[1]) * fraction,
                ],
                "mile": target / METERS_PER_MILE,
                "eta": (
                    departure
                    + timedelta(seconds=times[index] + durations[index] * fraction)
                ).isoformat(),
            }
        )
    return points


def corridor_grid(routes):
    # Bounded spatial grid, not repeated route checkpoints. At most 49 cells.
    coords = [c for route in routes for c in route["geometry"]]
    xmin, xmax = min(c[0] for c in coords), max(c[0] for c in coords)
    ymin, ymax = min(c[1] for c in coords), max(c[1] for c in coords)
    padx, pady = max((xmax - xmin) * 0.12, 0.08), max((ymax - ymin) * 0.12, 0.08)
    return [
        [
            xmin - padx + (xmax - xmin + 2 * padx) * x / 6,
            ymin - pady + (ymax - ymin + 2 * pady) * y / 6,
        ]
        for y in range(7)
        for x in range(7)
    ]
