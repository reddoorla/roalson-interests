import json, math, subprocess
import mapbox_vector_tile as mvt
from intersection import TILEJSON, _tile, _lonlat, _fetch

ANCHOR = {'supermarket': 0, 'doityourself': 0, 'hardware': 0, 'department_store': 0, 'hospital': 0, 'mall': 0, 'wholesale': 0,
          'college': 1, 'university': 1, 'fast_food': 2, 'restaurant': 2, 'hotel': 3, 'chemist': 3, 'pharmacy': 3, 'cafe': 4, 'fuel': 5, 'bank': 5}


def _norm(s):
    return ''.join(c for c in (s or '').lower() if c.isalnum()).removeprefix('the')


def businesses(bounds, site, featured=(), limit=6, sep_m=180, max_tier=1):
    url = json.loads(subprocess.run(['curl', '-sS', '-f', '-m', '60', TILEJSON], check=True, capture_output=True, text=True).stdout)['tiles'][0]
    x0, y1 = _tile(bounds[0], bounds[1], 14)
    x1, y0 = _tile(bounds[2], bounds[3], 14)
    found = {}
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            t = mvt.decode(_fetch(url, 14, x, y), default_options={'y_coord_down': True})
            L = t.get('poi', {})
            ext = L.get('extent', 4096)
            for f in L.get('features', []):
                p, g = f['properties'], f['geometry']
                if g['type'] != 'Point' or not p.get('name'):
                    continue
                lon, lat = _lonlat(x, y, *g['coordinates'], 14, ext)
                if not (bounds[0] <= lat <= bounds[2] and bounds[1] <= lon <= bounds[3]):
                    continue
                found.setdefault(_norm(p['name']), {'name': p['name'], 'lat': round(lat, 6), 'lon': round(lon, 6), 'sub': p.get('subclass') or p.get('class')})
    m = lambda a, b: math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0])))
    want = [_norm(n) for n in featured]
    first = [found[k] for k in want if k in found]
    rest = sorted([v for k, v in found.items() if k not in want and ANCHOR.get(v['sub'], 99) <= max_tier],
                  key=lambda v: (ANCHOR[v['sub']], m((v['lat'], v['lon']), site)))
    out = []
    for v in first + rest:
        if v in first or not any(m((v['lat'], v['lon']), (o['lat'], o['lon'])) < sep_m for o in out):
            out.append(v)
        if len(out) >= limit:
            break
    return [{'name': v['name'], 'lat': v['lat'], 'lon': v['lon'], **({'featured': True} if v in first else {})} for v in out], [n for n, k in zip(featured, want) if k not in found]
