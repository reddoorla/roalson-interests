import json
import os
import re
import sys

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from landid_compare import flat, acres

A = lambda *p: os.path.join(ROOT, *p)
NOTE = 'Boundary shown is approximate, drawn by the broker in Land id ({when}); refer to a survey for exact lines.'


def parts_of(uid):
    rec = json.load(open(A('geo', 'landid', f'{uid}.json')))
    polys = []
    for f in rec['features']:
        if f['geometry']['type'] not in ('Polygon', 'MultiPolygon'):
            continue
        g = shape({'type': f['geometry']['type'], 'coordinates': flat(f['geometry']['coordinates'])})
        polys.append(g if g.is_valid else g.buffer(0))
    return rec, polys


def main(uids, when):
    path = A('geo', 'sites.json')
    sites = json.load(open(path))
    for uid in uids:
        rec, polys = parts_of(uid)
        s = sites[uid]
        geom = unary_union(polys)
        s['geom'] = json.loads(json.dumps(mapping(geom)))
        main_part = max(polys, key=lambda g: g.area)
        c = main_part.representative_point() if len(polys) > 1 else geom.centroid
        if len(polys) == 1 and not geom.contains(c):
            c = geom.representative_point()
        s['centroid'] = [c.y, c.x]
        s['boundary_source'] = {'landid_url': rec['landid_url'], 'landid_updated_at': rec['updated_at'], 'fetched': rec['fetched'], 'acres': [round(acres(g), 3) for g in polys]}
        s['boundary_note'] = NOTE.format(when=when)
        labels = s.get('landid_part_labels')
        if len(polys) > 1 and s.get('extra_pins') and not (labels and len(labels) == len(polys)):
            sys.exit(f'{uid}: {len(polys)} Land ID parts but landid_part_labels does not name each one; the old pins would be kept')
        if labels and len(labels) == len(polys):
            order = sorted(range(len(polys)), key=lambda i: -polys[i].area)
            s['poly_label'] = labels[order[0]]
            s['extra_pins'] = [{'lat': polys[i].representative_point().y, 'lon': polys[i].representative_point().x, 'label': labels[i]} for i in order[1:]]
        print(f"{uid}: {len(polys)} part(s), {sum(acres(g) for g in polys):.3f} ac, centroid {s['centroid']}")
    json.dump(sites, open(path, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    if len(sys.argv) < 3 or not re.fullmatch(r'[A-Z][a-z]+ \d{4}', sys.argv[1]):
        sys.exit('usage: apply_landid.py "<Month YYYY>" <uid>...')
    main(sys.argv[2:], sys.argv[1])
