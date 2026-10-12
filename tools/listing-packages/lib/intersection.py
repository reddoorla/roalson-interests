import json, math, os, re, subprocess, sys
from itertools import combinations
from shapely.geometry import LineString, Point
from shapely.ops import unary_union

TILEJSON = 'https://tiles.openfreemap.org/planet'
CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tilecache')
MAJOR = {'motorway': 3, 'trunk': 2, 'primary': 1}
Z = 14


def _tile(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def _lonlat(x, y, px, py, z, ext):
    n = 2 ** z
    lon = (x + px / ext) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / ext) / n))))
    return lon, lat


def meters(a, b):
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0])))


def tile_url():
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, 'tilejson.json')
    if not os.path.exists(p):
        b = subprocess.run(['curl', '-sS', '-f', '-m', '60', TILEJSON], check=True, capture_output=True).stdout
        json.loads(b)
        open(p + '.tmp', 'wb').write(b)
        os.replace(p + '.tmp', p)
    return json.load(open(p))['tiles'][0]


def fetch_tile(z, x, y):
    import mapbox_vector_tile as mvt
    p = os.path.join(CACHE, f'{z}-{x}-{y}.pbf')
    if not os.path.exists(p):
        b = subprocess.run(['curl', '-sS', '-f', '-m', '60', tile_url().format(z=z, x=x, y=y)], check=True, capture_output=True).stdout
        open(p + '.tmp', 'wb').write(b)
        os.replace(p + '.tmp', p)
    return mvt.decode(open(p, 'rb').read(), default_options={'y_coord_down': True})


def road_key(p):
    ref = (p.get('ref') or '').upper()
    ref = re.sub(r'\bBUSINESS\b', 'BUS', ref)
    ref = re.sub(r'^(TX|SH|IH|I)[ -]+', '', ref).strip()
    return ref or (p.get('name') or '').strip()


def major_roads(lat, lon, radius_tiles=2):
    x0, y0 = _tile(lat, lon, Z)
    roads = {}
    for dx in range(-radius_tiles, radius_tiles + 1):
        for dy in range(-radius_tiles, radius_tiles + 1):
            x, y = x0 + dx, y0 + dy
            L = fetch_tile(Z, x, y).get('transportation_name')
            if not L:
                continue
            ext = L.get('extent', 4096)
            for f in L['features']:
                p = f['properties']
                if p.get('class') not in MAJOR:
                    continue
                g = f['geometry']
                parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']] if g['type'] == 'LineString' else []
                k = road_key(p)
                if not k:
                    continue
                r = roads.setdefault(k, {'name': p.get('name'), 'ref': p.get('ref'), 'class': p['class'], 'lines': []})
                r['lines'] += [LineString([_lonlat(x, y, a, b, Z, ext) for a, b in part]) for part in parts if len(part) > 1]
    return roads


def crossings(lat, lon, radius_tiles=2):
    """Crossings of two different major roads, those involving a motorway or trunk first, then nearest first."""
    site = (lat, lon)
    out = []
    for (ka, a), (kb, b) in combinations(major_roads(lat, lon, radius_tiles).items(), 2):
        if not a['lines'] or not b['lines']:
            continue
        hit = unary_union(a['lines']).intersection(unary_union(b['lines']))
        if hit.is_empty:
            continue
        pts = [g.centroid for g in getattr(hit, 'geoms', [hit])]
        pt = min(pts, key=lambda c: meters((c.y, c.x), site))
        rank = MAJOR[a['class']] + MAJOR[b['class']]
        out.append({'lat': round(pt.y, 6), 'lon': round(pt.x, 6), 'm': round(meters((pt.y, pt.x), site)), 'rank': rank,
                    'a': a['ref'] or a['name'], 'b': b['ref'] or b['name'], 'a_class': a['class'], 'b_class': b['class']})
    return sorted(out, key=lambda r: (r['rank'] < 4, r['m']))


if __name__ == '__main__':
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    for r in crossings(lat, lon)[:6]:
        print(json.dumps(r))
