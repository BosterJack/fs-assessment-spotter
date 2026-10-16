"""Pure, independently testable assessment rules. Units: mph, inches/hour, lb."""

import math

LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"]


def classify(wind, rain, snow, load):
    if any(not math.isfinite(v) or v < 0 for v in (wind, rain, snow, load)):
        raise ValueError("Weather and load values must be finite and non-negative")
    # Decimal wind values use continuous bands: [25,35), [35,45), etc.
    w = sum(wind >= threshold for threshold in (25, 35, 45, 55))
    # Shared rain/snow boundaries belong to the more conservative band;
    # No Travel stays strictly >1 inch rain / >3 inches snow per the brief.
    r = (
        4
        if rain > 1
        else 3 if rain >= 0.5 else 2 if rain >= 0.25 else 1 if rain >= 0.1 else 0
    )
    s = (
        4
        if snow > 3
        else 3 if snow >= 2 else 2 if snow >= 1 else 1 if snow >= 0.5 else 0
    )
    if wind >= 55 or (wind >= 45 and load > 30000):
        w = 4
    elif wind >= 35 and load > 40000:
        w = max(w, 3)
    score = max(w, r, s)
    return {
        "score": score,
        "level": LEVELS[score],
        "factors": {"wind": LEVELS[w], "rain": LEVELS[r], "snow": LEVELS[s]},
    }


def summarize(checkpoints):
    miles = [0.0] * 5
    # Each interval gets the worst of its endpoints. Endpoints themselves have
    # no extra distance, so summed exposure always equals total route mileage.
    for left, right in zip(checkpoints, checkpoints[1:]):
        miles[max(left["risk"]["score"], right["risk"]["score"])] += (
            right["mile"] - left["mile"]
        )
    total = sum(miles)
    return {
        "risk_miles": dict(zip(LEVELS, miles)),
        "average_risk": sum(i * m for i, m in enumerate(miles)) / total if total else 0,
        "max_risk": LEVELS[max(p["risk"]["score"] for p in checkpoints)],
        "eligible": not any(p["risk"]["score"] == 4 for p in checkpoints),
    }


def recommend(routes):
    eligible = [r for r in routes if r["summary"]["eligible"]]
    if not eligible:
        return None
    return min(
        eligible,
        key=lambda r: (
            r["summary"]["risk_miles"]["Severe"],
            r["summary"]["risk_miles"]["High"],
            r["summary"]["average_risk"],
            r["duration_seconds"],
        ),
    )["id"]
