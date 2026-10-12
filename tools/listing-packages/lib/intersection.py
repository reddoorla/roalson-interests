import json, math, os, subprocess, sys
from itertools import combinations
import mapbox_vector_tile as mvt
from shapely.geometry import LineString, MultiLineString, Point
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


def _fetch(url, z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f'{z}-{x}-{y}.pbf')
    if not os.path.exists(p):
        b = subprocess.run(['curl', '-sS', '-f', '-m', '60', url.format(z=z, x=x, y=y)], check=True, capture_output=True).stdout
        open(p, 'wb').write(b)
    return open(p, 'rb').read()


def road_key(p):
    ref = (p.get('ref') or '').upper().replace('TX ', '').replace('SH ', '').replace('IH ', '').replace('I ', '').strip()
    return ref or (p.get('name') or '').strip()


def major_roads(lat, lon, radius_tiles=2):
    url = json.loads(subprocess.run(['curl', '-sS', '-f', '-m', '60', TILEJSON], check=True, capture_output=True, text=True).stdout)['tiles'][0]
    url = url.replace('{z}', '{z}').replace('{x}', '{x}').replace('{y}', '{y}')
    x0, y0 = _tile(lat, lon, Z)
    names, lines = {}, {}
    for dx in range(-radius_tiles, radius_tiles + 1):
        for dy in range(-radius_tiles, radius_tiles + 1):
            x, y = x0 + dx, y0 + dy
            t = mvt.decode(_fetch(url, Z, x, y), default_options={'y_coord_down': True})
            for layer in ('transportation', 'transportation_name'):
                L = t.get(layer)
                if not L:
                    continue
                ext = L.get('extent', 4096)
                for f in L['features']:
                    p = f['properties']
                    if p.get('class') not in MAJOR or p.get('ramp') == 1 or p.get('brunnel') == 'ramp':
                        continue
                    g = f['geometry']
                    parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']] if g['type'] == 'LineString' else []
                    if layer == 'transportation_name':
                        k = road_key(p)
                        if k:
                            names.setdefault(k, {'name': p.get('name'), 'ref': p.get('ref'), 'class': p['class'], 'lines': []})
                            names[k]['lines'] += [LineString([_lonlat(x, y, a, b, Z, ext) for a, b in part]) for part in parts if len(part) > 1]
    return names


def nearest_intersection(lat, lon, radius_tiles=2):
    roads = major_roads(lat, lon, radius_tiles)
    site = Point(lon, lat)
    best = []
    for (ka, a), (kb, b) in combinations(roads.items(), 2):
        if not a['lines'] or not b['lines']:
            continue
        ga, gb = unary_union(a['lines']), unary_union(b['lines'])
        hit = ga.intersection(gb)
        if hit.is_empty:
            ga2 = ga.buffer(0.0004)
            hit = ga2.intersection(gb)
            if hit.is_empty:
                continue
        pt = hit.representative_point() if hit.geom_type != 'Point' else hit
        pts = [g for g in getattr(hit, 'geoms', [hit])]
        pt = min((g.centroid for g in pts), key=lambda c: c.distance(site))
        rank = MAJOR[a['class']] + MAJOR[b['class']]
        d = pt.distance(site) * 111320 * math.cos(math.radians(lat))
        best.append({'lat': round(pt.y, 6), 'lon': round(pt.x, 6), 'm': round(d), 'rank': rank, 'a': a['ref'] or a['name'], 'b': b['ref'] or b['name'], 'a_class': a['class'], 'b_class': b['class']})
    return sorted(best, key=lambda r: (-(r['rank'] >= 4), r['m']))


if __name__ == '__main__':
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    for r in nearest_intersection(lat, lon)[:6]:
        print(json.dumps(r))
