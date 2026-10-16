"""Check the real Nginx -> Gunicorn stack without external weather services."""
import json
import sys
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.request import Request, urlopen

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:8080'


def fetch(path, payload=None):
    request = Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Content-Type': 'application/json'} if payload is not None else {},
    )
    with urlopen(request, timeout=30) as response:
        assert response.status == 200, (path, response.status)
        return response.read()


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value and value.startswith('/assets/'):
                self.paths.append(value)


parser = Assets()
parser.feed(fetch('/').decode())
assert len(parser.paths) >= 2, 'Missing built frontend assets'
for path in parser.paths:
    assert fetch(path), f'Empty asset: {path}'
assert json.loads(fetch('/api/health/'))['status'] == 'ok'
plan = json.loads(fetch('/api/plan/', {
    'mode': 'demo',
    'departure': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    'load_lb': 32000,
    'spacing_miles': 25,
}))
assert len(plan['routes']) == 3, 'Expected three demo routes'
assert plan['recommended_id'] in [route['id'] for route in plan['routes']]
corridor = json.loads(fetch('/api/corridor/', {
    'mode': 'demo',
    'coordinates': plan['corridor_coordinates'],
    'base_time': plan['forecast_base'],
    'load_lb': plan['load_lb'],
}))
assert len(corridor['cells']) == 49
assert all(len(cell['scores']) == 49 for cell in corridor['cells'])
print('PASS: frontend HTML + assets, proxied health, three routes, recommendation, 49x49 weather corridor')
