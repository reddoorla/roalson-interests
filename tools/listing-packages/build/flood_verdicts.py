import json, os, sys
from shapely.geometry import shape, Point

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'lib'))
from flood import flood_geojson

A = lambda *p: os.path.join(ROOT, *p)
PIN = 'Tract boundaries appear on the survey and exhibit pages; the zones mapped around the site pin are shown for comparison.'


def pct(v):
    p = round(v * 100)
    return 5 * round(p / 5) if p >= 10 else p


def verdict(site_geom, hits):
    fw, a, x = hits.get('floodway', 0), hits.get('a100', 0), hits.get('x500', 0)
    parts = []
    if fw >= 0.03:
        parts.append(f'about {pct(fw)}% within the regulatory floodway')
    if a >= 0.03:
        parts.append(f'about {pct(a)}% within the 1% annual chance (100-year) flood hazard area')
    if x >= 0.03:
        parts.append(f'about {pct(x)}% within the 0.2% annual chance (500-year) area')
    if parts:
        return 'NFHL mapping shows the property ' + '; '.join(parts) + '.'
    if fw + a + x > 0:
        return 'NFHL mapping shows a mapped flood hazard area along the edge of the property (under 3% of its area); the balance is Zone X.'
    return 'NFHL mapping shows no special flood hazard area on the property (Zone X, minimal flood hazard).'


def main():
    sites = json.load(open(A('geo', 'sites.json')))
    out = {}
    for uid, s in sites.items():
        lat, lon = (s['centroid'] if s.get('geom') and s.get('centroid') else [s['lat'], s['lon']])
        fl = flood_geojson(uid, lat, lon, 1500) or {'features': []}
        site = shape(s['geom']) if s.get('geom') else Point(s['lon'], s['lat']).buffer(0.0003)
        hits = {}
        for f in fl['features']:
            g = shape(f['geometry'])
            if not g.is_valid:
                g = g.buffer(0)
            inter = site.intersection(g)
            if not inter.is_empty and inter.area > 0:
                hits[f['properties']['cls']] = hits.get(f['properties']['cls'], 0) + inter.area / site.area
        text = PIN if (not s.get('geom') or s.get('extra_pins')) else verdict(site, hits)
        out[uid] = {'hits': hits, 'verdict': text}
        print(uid, '|', text)
    json.dump(out, open(A('geo', 'flood-verdicts.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
