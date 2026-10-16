"""External service boundaries, caching, units and strict forecast coverage."""

import hashlib
import json
import math
from datetime import datetime, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from .geometry import haversine


class ProviderError(Exception):
    pass


def request_json(method, url, **kwargs):
    try:
        response = requests.request(
            method,
            url,
            timeout=(6, 35),
            headers=kwargs.pop("headers", {"User-Agent": "SpotterAssessment/1.0"}),
            **kwargs,
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ProviderError(
            "An external data service is unavailable or rate limited. Please retry shortly; demo mode remains available."
        ) from exc


def geocode(query):
    key = "geo:" + hashlib.sha256(query.strip().lower().encode()).hexdigest()
    result = cache.get(key)
    if result is None:
        data = request_json(
            "GET",
            settings.GEOCODING_URL,
            params={"name": query, "count": 6, "language": "en"},
        )
        result = [
            {
                "name": ", ".join(
                    filter(None, [p["name"], p.get("admin1"), p.get("country")])
                ),
                "coordinate": [p["longitude"], p["latitude"]],
            }
            for p in data.get("results", [])
        ]
        cache.set(key, result, 86400)
    return result


def routes(origin, destination, load):
    key = (
        "routes:"
        + hashlib.sha256(
            json.dumps([origin, destination, bool(settings.ORS_API_KEY), load]).encode()
        ).hexdigest()
    )
    cached = cache.get(key)
    if cached:
        return cached
    if settings.ORS_API_KEY:
        data = request_json(
            "POST",
            "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson",
            headers={"Authorization": settings.ORS_API_KEY},
            json={
                "coordinates": [origin, destination],
                "alternative_routes": {
                    "target_count": 3,
                    "share_factor": 0.85,
                    "weight_factor": 1.8,
                },
                "options": {
                    "profile_params": {
                        "restrictions": {"weight": (load + 18000) * 0.00045359237}
                    }
                },
            },
        )
        result = []
        for feature in data.get("features", [])[:3]:
            coords = feature["geometry"]["coordinates"]
            summary = feature["properties"]["summary"]
            # ORS steps carry actual road-section duration, interpolated within
            # each step by geometry length instead of a route-wide speed.
            distances = [haversine(a, b) for a, b in zip(coords, coords[1:])]
            scale = summary["distance"] / sum(distances)
            distances = [d * scale for d in distances]
            durations = [0.0] * len(distances)
            for segment in feature["properties"]["segments"]:
                for step in segment["steps"]:
                    a, b = step["way_points"]
                    length = sum(distances[a:b])
                    for i in range(a, b):
                        durations[i] = (
                            step["duration"] * distances[i] / length if length else 0
                        )
            result.append(
                {
                    "geometry": coords,
                    "distance_meters": summary["distance"],
                    "duration_seconds": summary["duration"],
                    "segment_distances": distances,
                    "segment_durations": durations,
                }
            )
        provider = "OpenRouteService · heavy goods vehicle"
    else:
        pair = ";".join(
            ",".join(str(v) for v in point) for point in [origin, destination]
        )
        data = request_json(
            "GET",
            f"{settings.OSRM_URL}/route/v1/driving/{pair}",
            params={
                "alternatives": "3",
                "overview": "full",
                "geometries": "geojson",
                "annotations": "distance,duration",
                "steps": "false",
            },
        )
        raw_routes = data.get("routes", [])[:3]
        # Alternatives are not guaranteed. Ask the actual routing engine for
        # a road route through an offset midpoint, never a hand-drawn line.
        for direction in (1, -1):
            if not raw_routes or len(raw_routes) >= 3:
                break
            dx, dy = destination[0] - origin[0], destination[1] - origin[1]
            norm = math.hypot(dx, dy)
            if norm == 0:
                break
            offset = min(0.65, norm * 0.18)
            midpoint = [
                (origin[0] + destination[0]) / 2 - dy / norm * offset * direction,
                (origin[1] + destination[1]) / 2 + dx / norm * offset * direction,
            ]
            via = ";".join(
                ",".join(str(v) for v in p) for p in [origin, midpoint, destination]
            )
            try:
                extra = request_json(
                    "GET",
                    f"{settings.OSRM_URL}/route/v1/driving/{via}",
                    params={
                        "overview": "full",
                        "geometries": "geojson",
                        "annotations": "distance,duration",
                        "steps": "false",
                    },
                )
                candidate = extra.get("routes", [None])[0]
                if (
                    candidate
                    and candidate["distance"] < raw_routes[0]["distance"] * 1.8
                ):
                    cells = {
                        (round(c[0], 2), round(c[1], 2))
                        for c in candidate["geometry"]["coordinates"]
                    }
                    others = [
                        {
                            (round(c[0], 2), round(c[1], 2))
                            for c in r["geometry"]["coordinates"]
                        }
                        for r in raw_routes
                    ]
                    if all(
                        len(cells & other) / max(1, len(cells | other)) < 0.96
                        for other in others
                    ):
                        raw_routes.append(candidate)
            except ProviderError:
                pass  # Original valid routes remain usable, with a count warning.
        result = []
        for route in raw_routes:
            annotations = [leg["annotation"] for leg in route["legs"]]
            result.append(
                {
                    "geometry": route["geometry"]["coordinates"],
                    "distance_meters": route["distance"],
                    "duration_seconds": route["duration"],
                    "segment_distances": [
                        d for a in annotations for d in a["distance"]
                    ],
                    "segment_durations": [
                        d for a in annotations for d in a["duration"]
                    ],
                }
            )
        provider = "OSRM · standard road profile"
    if not result:
        raise ProviderError("No road route found. Try locations connected by road.")
    cache.set(key, (result, provider), 1800)
    return result, provider


def weather_many(coordinates):
    rounded = [(round(c[0], 3), round(c[1], 3)) for c in coordinates]
    today = datetime.now(timezone.utc).date().isoformat()
    keys = {c: f"weather:{today}:{c[0]}:{c[1]}" for c in rounded}
    found = cache.get_many(keys.values())
    missing = list(dict.fromkeys(c for c in rounded if keys[c] not in found))
    for offset in range(0, len(missing), 35):
        batch = missing[offset : offset + 35]
        data = request_json(
            "GET",
            settings.WEATHER_URL,
            params={
                "latitude": ",".join(str(c[1]) for c in batch),
                "longitude": ",".join(str(c[0]) for c in batch),
                "hourly": "temperature_2m,rain,showers,snowfall,wind_speed_10m",
                "wind_speed_unit": "mph",
                "temperature_unit": "fahrenheit",
                "precipitation_unit": "mm",
                "timeformat": "unixtime",
                "timezone": "UTC",
                "forecast_days": 16,
            },
        )
        rows = data if isinstance(data, list) else [data]
        if len(rows) != len(batch):
            raise ProviderError("Weather provider returned incomplete locations")
        for coordinate, row in zip(batch, rows):
            if "hourly" not in row:
                raise ProviderError(
                    "Weather forecast is unavailable for part of this trip"
                )
            found[keys[coordinate]] = row["hourly"]
            cache.set(keys[coordinate], row["hourly"], 1200)
    return [found[keys[c]] for c in rounded]


def weather_at(series, when):
    from bisect import bisect_left

    timestamp = when.timestamp()
    times = series["time"]
    if not times or timestamp < times[0] or timestamp > times[-1]:
        raise ProviderError(
            "An arrival time falls outside the available forecast. Choose an earlier departure or a shorter trip."
        )
    # Ceiling hour: precipitation is the accumulation for the preceding hour.
    index = bisect_left(times, timestamp)
    fields = {
        name: series[name][index]
        for name in ["wind_speed_10m", "rain", "showers", "snowfall", "temperature_2m"]
    }
    if any(v is None or not math.isfinite(v) for v in fields.values()):
        raise ProviderError(
            "Missing weather observations: this route cannot be safely ranked."
        )
    return {
        "wind_mph": fields["wind_speed_10m"],
        "rain_in": (fields["rain"] + fields["showers"]) / 25.4,
        "snow_in": fields["snowfall"] / 2.54,
        "temperature_f": fields["temperature_2m"],
        "forecast_time": datetime.fromtimestamp(times[index], timezone.utc).isoformat(),
    }
