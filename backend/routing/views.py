import json
import math
from datetime import datetime, timedelta, timezone
from functools import wraps

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from . import demo, providers
from .geometry import sample_route, corridor_grid
from .risk import classify, summarize, recommend


def api(fn):
    @wraps(fn)
    def wrapped(request, *args, **kwargs):
        key = f"limit:{fn.__name__}:{request.META.get('REMOTE_ADDR')}:{int(datetime.now().timestamp())//60}"
        count = cache.get(key, 0)
        if count >= (90 if fn.__name__ == "places" else 20):
            return JsonResponse(
                {"error": "Too many requests. Please wait a minute."}, status=429
            )
        cache.set(key, count + 1, 70)
        try:
            return fn(request, *args, **kwargs)
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            return JsonResponse(
                {
                    "error": (
                        str(exc)
                        if isinstance(exc, ValueError)
                        else "Invalid request. Check all fields."
                    )
                },
                status=400,
            )
        except providers.ProviderError as exc:
            return JsonResponse({"error": str(exc)}, status=502)

    return wrapped


def body(request):
    if len(request.body) > 32000:
        raise ValueError("Request is too large")
    data = json.loads(request.body)
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    return data


def number(value, minimum, maximum, label):
    if isinstance(value, bool):
        raise ValueError(f"Invalid {label}")
    result = float(value)
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}")
    return result


def coordinate(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("Coordinates must be [longitude, latitude]")
    return [
        number(value[0], -180, 180, "longitude"),
        number(value[1], -85, 85, "latitude"),
    ]


def date(value):
    result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Date/time must include a timezone")
    return result.astimezone(timezone.utc)


def mode(data):
    value = data.get("mode", "live")
    if value not in ("live", "demo"):
        raise ValueError("Mode must be live or demo")
    return value


@require_GET
def health(request):
    return JsonResponse(
        {
            "status": "ok",
            "routing": "ors-hgv" if settings.ORS_API_KEY else "osrm",
            "version": "1.0.0",
        }
    )


@require_GET
@api
def places(request):
    query = request.GET.get("q", "").strip()
    if not 2 <= len(query) <= 120:
        raise ValueError("Search must contain 2–120 characters")
    return JsonResponse({"places": providers.geocode(query)})


@require_POST
@api
def plan(request):
    data = body(request)
    current_mode = mode(data)
    load = number(data.get("load_lb"), 0, 150000, "load (lb)")
    spacing = number(data.get("spacing_miles", 25), 10, 50, "checkpoint spacing")
    if spacing not in (10, 25, 50):
        raise ValueError("Checkpoint spacing must be 10, 25 or 50 miles")
    departure = date(data["departure"])
    now = datetime.now(timezone.utc)
    if not now - timedelta(minutes=10) <= departure <= now + timedelta(days=7):
        raise ValueError("Choose a departure within the next 7 days")
    base = now.replace(minute=0, second=0, microsecond=0)
    if current_mode == "demo":
        origin, destination = demo.ORIGIN, demo.DESTINATION
        raw_routes, provider = demo.routes(), "Recorded OSRM roads · simulated weather"
        warnings = [
            "Demo: fixed Chicago–Detroit routes with simulated weather. Not a live forecast."
        ]
    else:
        origin, destination = data["origin"], data["destination"]
        for place in (origin, destination):
            if (
                not isinstance(place, dict)
                or not isinstance(place.get("name"), str)
                or len(place["name"]) > 200
            ):
                raise ValueError(
                    "Select a valid origin and destination from the search results"
                )
            place["coordinate"] = coordinate(place["coordinate"])
        if origin["coordinate"] == destination["coordinate"]:
            raise ValueError("Origin and destination must be different")
        raw_routes, provider = providers.routes(
            origin["coordinate"], destination["coordinate"], load
        )
        warnings = (
            []
            if settings.ORS_API_KEY
            else [
                "Standard road profile: bridge clearance, legal truck limits, traffic and driver breaks are not modeled. Configure ORS_API_KEY for heavy-vehicle routing."
            ]
        )
    if len(raw_routes) < 3:
        warnings.append(
            f"The routing service found {len(raw_routes)} distinct options. No additional routes have been fabricated."
        )
    sampled = [sample_route(raw, spacing, departure) for raw in raw_routes]
    # Batch across all alternatives, including deduplication of shared roads.
    forecasts = iter(
        providers.weather_many([p["coordinate"] for points in sampled for p in points])
        if current_mode == "live"
        else []
    )
    evaluated = []
    for index, raw in enumerate(raw_routes):
        points = sampled[index]
        for point in points:
            when = date(point["eta"])
            weather = (
                providers.weather_at(next(forecasts), when)
                if current_mode == "live"
                else demo.weather_at(point["coordinate"], when, base)
            )
            point["weather"] = weather
            point["risk"] = classify(
                weather["wind_mph"], weather["rain_in"], weather["snow_in"], load
            )
        evaluated.append(
            {k: v for k, v in raw.items() if not k.startswith("segment_")}
            | {
                "id": f"route-{index+1}",
                "name": f"Route {index+1}",
                "checkpoints": points,
                "summary": summarize(points),
            }
        )
    recommended = recommend(evaluated)
    if recommended is None:
        warnings.append(
            "No safe recommendation: every route contains a No Travel checkpoint. Delay departure and recheck conditions."
        )
    return JsonResponse(
        {
            "routes": evaluated,
            "recommended_id": recommended,
            "mode": current_mode,
            "provider": provider,
            "warnings": warnings,
            "departure": departure.isoformat(),
            "forecast_base": base.isoformat(),
            "corridor_coordinates": corridor_grid(raw_routes),
            "load_lb": load,
            "spacing_miles": spacing,
            "origin": origin,
            "destination": destination,
        }
    )


@require_POST
@api
def corridor(request):
    data = body(request)
    current_mode = mode(data)
    points = data.get("coordinates")
    if not isinstance(points, list) or not 1 <= len(points) <= 49:
        raise ValueError("Provide 1–49 corridor coordinates")
    coords = [coordinate(p) for p in points]
    load = number(data.get("load_lb"), 0, 150000, "load (lb)")
    base = date(data["base_time"])
    if abs((base - datetime.now(timezone.utc)).total_seconds()) > 7200:
        raise ValueError("Forecast has expired. Recalculate the trip.")
    forecasts = providers.weather_many(coords) if current_mode == "live" else None
    cells = []
    for index, point in enumerate(coords):
        scores, winds = [], []
        for hour in range(49):
            when = base + timedelta(hours=hour)
            weather = (
                providers.weather_at(forecasts[index], when)
                if forecasts
                else demo.weather_at(point, when, base)
            )
            scores.append(
                classify(
                    weather["wind_mph"], weather["rain_in"], weather["snow_in"], load
                )["score"]
            )
            winds.append(round(weather["wind_mph"], 1))
        cells.append({"coordinate": point, "scores": scores, "wind_mph": winds})
    return JsonResponse({"base_time": base.isoformat(), "cells": cells})
