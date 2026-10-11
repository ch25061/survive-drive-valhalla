"""Verify the staged whole-U.S. graph with offline Actor calls before activation."""
import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from valhalla import Actor

parser = argparse.ArgumentParser()
parser.add_argument('--stage', required=True)
parser.add_argument('--cities-proof', required=True)
parser.add_argument('--trip-proof', required=True)
args = parser.parse_args()
stage = Path(args.stage).resolve()
build = json.loads((stage / 'build-status.json').read_text())
assert build['phase'] == 'built' and build['exit_code'] == 0
config = json.loads((stage / 'valhalla-national.json').read_text())
assert config['mjolnir']['tile_dir'] == str(stage / 'tiles')
assert config['service_limits']['max_radius'] == 1600
config['logging'] = {'type': 'std_out', 'color': False, 'long_request': 0}
actor = Actor(config)
results = []

def distance(a, b):
    p, q = map(math.radians, (a[0], b[0]))
    h = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(math.radians(b[1]-a[1])/2)**2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, max(0, h))))

def decode(value):
    points, i, lat, lon = [], 0, 0, 0
    while i < len(value):
        numbers = []
        for _ in range(2):
            result, shift = 0, 0
            while True:
                byte = ord(value[i])-63
                i += 1
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            numbers.append(~(result >> 1) if result & 1 else result >> 1)
        lat += numbers[0]
        lon += numbers[1]
        points.append([lat/1e6, lon/1e6])
    return points

def check(name, payload):
    response = actor.route(payload)
    trips = [response['trip']] + [item.get('trip', item) for item in response.get('alternates', [])]
    gaps = []
    for trip in trips:
        start, end = decode(trip['legs'][0]['shape'])[0], decode(trip['legs'][-1]['shape'])[-1]
        original = payload['locations']
        a, b = [original[0]['lat'], original[0]['lon']], [original[-1]['lat'], original[-1]['lon']]
        pair = [distance(start, a), distance(end, b)]
        assert max(pair) <= 100, f'{name}: original endpoint mismatch {pair}'
        gaps.append(pair)
    results.append({'name': name, 'passed': True, 'routes': len(trips), 'endpoint_gaps_m': gaps})
    print(json.dumps(results[-1]), flush=True)

def payload(a, b):
    return {'locations': [{'lat': p[0], 'lon': p[1], 'type': 'break', 'search_cutoff': 100} for p in (a, b)], 'costing': 'auto', 'units': 'kilometers', 'shape_format': 'polyline6'}

try:
    cities = json.loads(Path(args.cities_proof).read_text())['results']
    for city in cities:
        route = city['route']
        check(city['name'] + ', ' + city['state'], payload(route['origin'], route['destination']))
    # These small places were never selected by the 100K population rule.
    towns = [('Austin, Nevada', 39.493, -117.07), ('Lynchburg, Tennessee', 35.283, -86.374),
             ('Malta, Montana', 48.36, -107.874), ('Calais, Maine', 45.184, -67.276),
             ('Delta Junction, Alaska', 64.038, -145.73), ('Hana, Hawaii', 20.756, -155.987),
             ('Marco Island, Florida', 25.9397, -81.7279), ('Key West, Florida', 24.555, -81.78)]
    for name, lat, lon in towns:
        located = actor.locate({'locations': [{'lat': lat, 'lon': lon, 'radius': 1600, 'search_cutoff': 1600}], 'costing': 'auto', 'verbose': True})
        points = []
        for edge in located[0].get('edges', []):
            if not edge.get('edge', {}).get('access', {}).get('car'):
                continue
            point = [edge['correlated_lat'], edge['correlated_lon']]
            if not any(distance(point, other) < 100 for other in points):
                points.append(point)
        passed = False
        for a in points[:12]:
            for b in points[:12]:
                if distance(a, b) < 100:
                    continue
                try:
                    check(name, payload(a, b))
                    passed = True
                    break
                except RuntimeError:
                    continue
            if passed:
                break
        assert passed, 'No complete driving path verified in ' + name
    for original in json.loads(Path(args.trip_proof).read_text()):
        check('Original Naples ' + original['kind'], original['payload'])
    proof = {'schema': 'rs_national_road_verification_v1', 'verified_at': datetime.now(timezone.utc).isoformat(),
             'source_md5': build['source_md5'], 'passed': True, 'checked_cities': len(cities),
             'checked_small_places': len(towns), 'results': results, 'http_route_requests': 0, 'avm_calls': 0}
except Exception as error:
    proof = {'schema': 'rs_national_road_verification_v1', 'passed': False, 'error': str(error), 'results': results}
    (stage / 'verification.json').write_text(json.dumps(proof, indent=2))
    raise
(stage / 'verification.json').write_text(json.dumps(proof, indent=2))
