import json
import math
import os
import sys

import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'lib'))
sys.path.insert(0, HERE)
from flood import flood_geojson
from flood_verdicts import verdict, PIN

A = lambda *p: os.path.join(ROOT, *p)


def acres(g):
    p = math.radians(g.centroid.y)
    m_lat = 111132.954 - 559.822 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    m_lon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    m = shapely.transform(g, lambda c: c * [m_lon, m_lat])
    return m.area / 4046.8564224


def flat(coords):
    if coords and isinstance(coords[0], (int, float)):
        return coords[:2]
    return [flat(c) for c in coords]


def landid_geom(uid):
    p = A('geo', 'landid', f'{uid}.json')
    if not os.path.exists(p):
        return None, []
    rec = json.load(open(p))
    polys = [shape({'type': f['geometry']['type'], 'coordinates': flat(f['geometry']['coordinates'])}) for f in rec['features'] if f['geometry']['type'] in ('Polygon', 'MultiPolygon')]
    polys = [g if g.is_valid else g.buffer(0) for g in polys]
    return (unary_union(polys) if polys else None), polys


def flood_hits(uid, site, lat, lon):
    fl = flood_geojson(uid, lat, lon, 1500) or {'features': []}
    hits = {}
    for f in fl['features']:
        g = shape(f['geometry'])
        if not g.is_valid:
            g = g.buffer(0)
        inter = site.intersection(g)
        if not inter.is_empty and inter.area > 0:
            hits[f['properties']['cls']] = hits.get(f['properties']['cls'], 0) + inter.area / site.area
    return hits


def main(uids):
    sites = json.load(open(A('geo', 'sites.json')))
    verdicts = json.load(open(A('geo', 'flood-verdicts.json')))
    out = {}
    for uid in uids or sorted(sites):
        s = sites[uid]
        d = json.load(open(A('data', f'{uid}.json')))
        lid, parts = landid_geom(uid)
        cur = shape(s['geom']) if s.get('geom') else None
        row = {'stated': d.get('size_headline'), 'landid_parts': len(parts)}
        if lid is not None:
            row['landid_acres'] = round(acres(lid), 3)
            row['landid_part_acres'] = [round(acres(g), 3) for g in parts]
        if cur is not None:
            row['current_acres'] = round(acres(cur), 3)
        if lid is not None and cur is not None:
            row['iou'] = round(lid.intersection(cur).area / lid.union(cur).area, 3)
        else:
            row['iou'] = None
        if lid is not None:
            lat, lon = (s['centroid'] if s.get('geom') and s.get('centroid') else [s['lat'], s['lon']])
            hits = flood_hits(uid, lid, lat, lon)
            row['landid_hits'] = {k: round(v, 4) for k, v in hits.items()}
            row['landid_verdict'] = verdict(lid, hits)
        row['current_hits'] = {k: round(v, 4) for k, v in verdicts[uid]['hits'].items()}
        row['current_verdict'] = verdicts[uid]['verdict']
        row['verdict_changes'] = lid is not None and row['landid_verdict'] != row['current_verdict']
        out[uid] = row
        print(f"{uid:42s} stated={row['stated']!s:22s} landid={row.get('landid_acres')!s:8s} parts={row['landid_part_acres'] if lid is not None else '-'} current={row.get('current_acres')!s:8s} iou={row['iou']!s:6s} flood_change={'YES' if row['verdict_changes'] else 'no'}")
    json.dump(out, open(A('qa', 'landid-compare.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
