"""Recorded OSRM road geometries; deterministic, explicitly synthetic weather."""

import json
import math
from pathlib import Path

ORIGIN = {"name": "Chicago, Illinois, United States", "coordinate": [-87.6298, 41.8781]}
DESTINATION = {
    "name": "Detroit, Michigan, United States",
    "coordinate": [-83.0458, 42.3314],
}


def routes():
    data = json.loads(
        Path(__file__).with_name("demo_routes.json").read_text(encoding="utf-8")
    )
    return [
        {
            "geometry": r["geometry"]["coordinates"],
            "distance_meters": r["distance"],
            "duration_seconds": r["duration"],
            "segment_distances": [
                v for leg in r["legs"] for v in leg["annotation"]["distance"]
            ],
            "segment_durations": [
                v for leg in r["legs"] for v in leg["annotation"]["duration"]
            ],
        }
        for r in data["routes"]
    ]


def weather_at(coordinate, when, base):
    lon, lat = coordinate
    hours = (when - base).total_seconds() / 3600
    center = -85.5 + 0.018 * hours
    front = math.exp(-(((lon - center) / 0.85) ** 2) - ((lat - 41.72) / 0.35) ** 2)
    wind = max(4, 14 + 32 * front + 3 * math.sin(hours / 5 + lon))
    rain = max(0, 0.36 * front + 0.02 * math.sin(hours / 4 + lat))
    return {
        "wind_mph": wind,
        "rain_in": rain,
        "snow_in": 0,
        "temperature_f": 59 - 8 * front,
        "forecast_time": when.isoformat(),
    }
