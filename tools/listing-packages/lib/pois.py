import re
from intersection import _tile, _lonlat, fetch_tile, meters

ANCHOR = {'supermarket': 0, 'doityourself': 0, 'hardware': 0, 'department_store': 0, 'hospital': 0, 'mall': 0, 'wholesale': 0,
          'college': 1, 'university': 1, 'fast_food': 2, 'restaurant': 2, 'hotel': 3, 'chemist': 3, 'pharmacy': 3, 'cafe': 4, 'fuel': 5, 'bank': 5}


def _norm(s):
    s = re.sub(r'^the\s+', '', (s or '').strip().lower())
    return ''.join(c for c in s if c.isalnum())


def businesses(bounds, site, featured=(), limit=6, sep_m=180, max_tier=1):
    """Named businesses inside bounds, from the z14 OpenFreeMap poi layer: the featured names first,
    then anchors (ANCHOR tier <= max_tier) nearest the site. One location per name, the nearest."""
    x0, y1 = _tile(bounds[0], bounds[1], 14)
    x1, y0 = _tile(bounds[2], bounds[3], 14)
    found = {}
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            L = fetch_tile(14, x, y).get('poi', {})
            ext = L.get('extent', 4096)
            for f in L.get('features', []):
                p, g = f['properties'], f['geometry']
                if g['type'] != 'Point' or not p.get('name'):
                    continue
                lon, lat = _lonlat(x, y, *g['coordinates'], 14, ext)
                if not (bounds[0] <= lat <= bounds[2] and bounds[1] <= lon <= bounds[3]):
                    continue
                v = {'name': p['name'], 'lat': round(lat, 6), 'lon': round(lon, 6), 'sub': p.get('subclass') or p.get('class'), 'm': meters((lat, lon), site)}
                k = _norm(p['name'])
                if k not in found or v['m'] < found[k]['m']:
                    found[k] = v
    want = [_norm(n) for n in featured]
    first = [found[k] for k in want if k in found]
    rest = sorted([v for k, v in found.items() if k not in want and ANCHOR.get(v['sub'], 99) <= max_tier],
                  key=lambda v: (ANCHOR[v['sub']], v['m']))
    out = list(first)
    for v in rest:
        if len(out) >= limit:
            break
        if not any(meters((v['lat'], v['lon']), (o['lat'], o['lon'])) < sep_m for o in out):
            out.append(v)
    return [{'name': v['name'], 'lat': v['lat'], 'lon': v['lon'], **({'featured': True} if v in first else {})} for v in out], [n for n, k in zip(featured, want) if k not in found]
