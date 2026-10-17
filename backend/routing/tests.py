import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .geometry import METERS_PER_MILE, sample_route
from .providers import ProviderError, weather_at
from .risk import classify, summarize, recommend


class BackendIndexTests(SimpleTestCase):
    @override_settings(TEMPLATES=[{
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "OPTIONS": {"loaders": [("django.template.loaders.locmem.Loader", {})]},
    }])
    def test_api_image_root_without_frontend_build(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    @override_settings(TEMPLATES=[{
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "OPTIONS": {"loaders": [("django.template.loaders.locmem.Loader", {
            "index.html": "<html>React build</html>",
        })]},
    }])
    def test_combined_image_root_keeps_frontend(self):
        response = self.client.get("/")
        self.assertContains(response, "React build")


class RiskTests(SimpleTestCase):
    def test_wind_continuous_boundaries(self):
        for wind, score in [
            (24.999, 0),
            (25, 1),
            (34.999, 1),
            (35, 2),
            (44.999, 2),
            (45, 3),
            (54.999, 3),
            (55, 4),
        ]:
            with self.subTest(wind=wind):
                self.assertEqual(classify(wind, 0, 0, 0)["score"], score)

    def test_rain_and_snow_shared_boundaries(self):
        for value, expected in [
            (0.0999, 0),
            (0.1, 1),
            (0.2499, 1),
            (0.25, 2),
            (0.4999, 2),
            (0.5, 3),
            (1, 3),
            (1.0001, 4),
        ]:
            with self.subTest(rain=value):
                self.assertEqual(classify(0, value, 0, 0)["score"], expected)
        for value, expected in [
            (0.4999, 0),
            (0.5, 1),
            (0.9999, 1),
            (1, 2),
            (1.9999, 2),
            (2, 3),
            (3, 3),
            (3.0001, 4),
        ]:
            with self.subTest(snow=value):
                self.assertEqual(classify(0, 0, value, 0)["score"], expected)

    def test_load_rules_are_strict_and_never_downgrade(self):
        self.assertEqual(classify(45, 0, 0, 30000)["score"], 3)
        self.assertEqual(classify(45, 0, 0, 30001)["score"], 4)
        self.assertEqual(classify(35, 0, 0, 40000)["score"], 2)
        self.assertEqual(classify(35, 0, 0, 40001)["score"], 3)
        self.assertEqual(classify(55, 0, 0, 0)["score"], 4)
        self.assertEqual(classify(35, 2, 0, 40001)["score"], 4)

    def test_missing_or_invalid_weather_cannot_be_low_risk(self):
        for value in [float("nan"), float("inf"), -1]:
            with self.assertRaises(ValueError):
                classify(value, 0, 0, 0)

    def test_mileage_is_conserved_and_weighted(self):
        points = [
            {"mile": m, "risk": {"score": s}}
            for m, s in [(0, 0), (10, 1), (25, 3), (27, 2)]
        ]
        summary = summarize(points)
        self.assertEqual(sum(summary["risk_miles"].values()), 27)
        self.assertEqual(summary["risk_miles"]["Severe"], 17)
        self.assertAlmostEqual(summary["average_risk"], 61 / 27)

    def test_recommendation_lexicographic_and_no_travel(self):
        def route(id, severe, high, average, duration, eligible=True):
            return {
                "id": id,
                "duration_seconds": duration,
                "summary": {
                    "eligible": eligible,
                    "risk_miles": {"Severe": severe, "High": high},
                    "average_risk": average,
                },
            }

        base = route("base", 1, 10, 2, 100)
        candidates = [
            route("less-severe", 0, 100, 3, 10000),
            route("less-high", 1, 9, 3, 10000),
            route("average", 1, 10, 1, 10000),
            route("faster", 1, 10, 2, 99),
        ]
        for r in candidates:
            with self.subTest(candidate=r["id"]):
                self.assertEqual(recommend([base, r]), r["id"])
        blocked = route("blocked", 0, 0, 0, 1, False)
        self.assertEqual(recommend([blocked, base]), "base")
        self.assertIsNone(recommend([blocked]))


class GeometryTests(SimpleTestCase):
    def test_checkpoint_distance_and_segment_specific_eta(self):
        departure = datetime(2026, 1, 1, tzinfo=timezone.utc)
        route = {
            "geometry": [[0, 0], [1, 0], [2, 0]],
            "segment_distances": [10 * METERS_PER_MILE, 10 * METERS_PER_MILE],
            "segment_durations": [100, 900],
        }
        points = sample_route(route, 10, departure)
        self.assertEqual([p["mile"] for p in points], [0, 10, 20])
        self.assertEqual(
            points[1]["eta"], (departure + timedelta(seconds=100)).isoformat()
        )
        self.assertEqual(
            points[-1]["eta"], (departure + timedelta(seconds=1000)).isoformat()
        )

    def test_partial_final_interval_and_short_trip(self):
        now = datetime.now(timezone.utc)
        route = {
            "geometry": [[0, 0], [1, 0]],
            "segment_distances": [12 * METERS_PER_MILE],
            "segment_durations": [600],
        }
        points = sample_route(route, 10, now)
        self.assertEqual([round(p["mile"]) for p in points], [0, 10, 12])
        self.assertEqual(points[-1]["coordinate"], [1, 0])
        self.assertEqual(len(sample_route(route, 50, now)), 2)


class ForecastTests(SimpleTestCase):
    def setUp(self):
        self.base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.series = {
            "time": [
                self.base.timestamp(),
                (self.base + timedelta(hours=1)).timestamp(),
            ],
            "wind_speed_10m": [10, 35],
            "rain": [0, 25.4],
            "showers": [0, 2.54],
            "snowfall": [0, 2.54],
            "temperature_2m": [50, 51],
        }

    def test_hour_alignment_and_unit_conversion(self):
        result = weather_at(self.series, self.base + timedelta(minutes=15))
        self.assertEqual(result["wind_mph"], 35)
        self.assertAlmostEqual(result["rain_in"], 1.1)
        self.assertAlmostEqual(result["snow_in"], 1)
        self.assertEqual(weather_at(self.series, self.base)["wind_mph"], 10)

    def test_missing_and_out_of_range_forecasts_raise(self):
        for when in [self.base - timedelta(seconds=1), self.base + timedelta(hours=2)]:
            with self.assertRaises(ProviderError):
                weather_at(self.series, when)
        self.series["rain"][1] = None
        with self.assertRaises(ProviderError):
            weather_at(self.series, self.base + timedelta(hours=1))


class APITests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.payload = {
            "mode": "demo",
            "departure": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "load_lb": 32000,
            "spacing_miles": 25,
        }

    def post(self, path, data):
        return self.client.post(
            "/api/" + path + "/", json.dumps(data), content_type="application/json"
        )

    def test_full_demo_plan_and_corridor(self):
        response = self.post("plan", self.payload)
        self.assertEqual(response.status_code, 200, response.content)
        result = response.json()
        self.assertEqual(len(result["routes"]), 3)
        self.assertIn("simulated", result["warnings"][0])
        for route in result["routes"]:
            self.assertAlmostEqual(
                sum(route["summary"]["risk_miles"].values()),
                route["distance_meters"] / METERS_PER_MILE,
                places=3,
            )
            self.assertAlmostEqual(
                (
                    datetime.fromisoformat(route["checkpoints"][-1]["eta"])
                    - datetime.fromisoformat(result["departure"])
                ).total_seconds(),
                route["duration_seconds"],
                places=2,
            )
        corridor = self.post(
            "corridor",
            {
                "mode": "demo",
                "coordinates": result["corridor_coordinates"],
                "base_time": result["forecast_base"],
                "load_lb": 32000,
            },
        )
        self.assertEqual(corridor.status_code, 200, corridor.content)
        self.assertEqual(len(corridor.json()["cells"]), 49)
        self.assertTrue(all(len(c["scores"]) == 49 for c in corridor.json()["cells"]))

    def test_invalid_and_outdated_inputs(self):
        for key, value in [
            ("load_lb", -1),
            ("load_lb", "NaN"),
            ("spacing_miles", 12),
            ("mode", "unknown"),
            ("departure", "2020-01-01T00:00:00Z"),
            ("departure", "2026-01-01T00:00:00"),
        ]:
            with self.subTest(key=key, value=value):
                self.assertEqual(
                    self.post("plan", self.payload | {key: value}).status_code, 400
                )
        self.assertEqual(self.post("plan", []).status_code, 400)
        self.assertEqual(self.client.get("/api/plan/").status_code, 405)

    @patch("routing.providers.routes", side_effect=ProviderError("Service unavailable"))
    def test_live_failure_never_silently_uses_demo(self, mocked):
        data = self.payload | {
            "mode": "live",
            "origin": {"name": "A", "coordinate": [1, 2]},
            "destination": {"name": "B", "coordinate": [2, 3]},
        }
        response = self.post("plan", data)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"], "Service unavailable")

    def test_invalid_coordinates_and_corridor_limits(self):
        for coords in [[[181, 1]], [[0, 91]], [[0, 0]] * 50]:
            response = self.post(
                "corridor",
                {
                    "mode": "demo",
                    "coordinates": coords,
                    "base_time": datetime.now(timezone.utc).isoformat(),
                    "load_lb": 0,
                },
            )
            self.assertEqual(response.status_code, 400)
