"""Map-only sites: packages Erik made outside this generator, which get only their Area Map with Traffic Counts.

geo/map-only.json lists them (2026-11-13: Hwy 46 West Development Site). Each is swapped into Erik's own
PDF with build/swap_area_map.py, as the 23 generator packages were on 2026-11-12, so it is built at the
frame and pixel size of the map it replaces:

  site            [lat, lon] of the SITE pin
  intersection    the labelled ring, as in geo/sites.json
  businesses      names to label, in order (OpenStreetMap's spelling). Each must be in the tiles and
                  must find room on the map, or the build stops (so must every count). business_limit
                  caps the listed names plus the anchors the tiles add after them (listed names are
                  always kept; manual_businesses are not counted), so a limit equal to the list adds none
  manual_businesses  a name and dot for a business the tiles lack, as in geo/sites.json
  traffic_ids     the TxDOT stations whose counts his facts row quotes, in order (required)
  view            {"center": [lat, lon], "zoom": z}: a fixed frame instead of fitting the bounds
  height_px       the image height of his map, when it differs from the generator's 1725

The outline is the broker's Land ID polygon, geo/landid/<uid>.json, as build/apply_landid.py reads it.
These sites are kept out of geo/sites.json so the full-package steps (flood verdicts, pkg.py,
landid_compare) never see them, and make_jobs.py refuses a uid listed in both.
Why: reddoor-workspace decisions/2026-11-13-0343-roalson-three-packages-maps-not-reproducible.md.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'lib'))
sys.path.insert(0, HERE)
from mapjobs import jobs_for
from apply_landid import parts_of
from shapely.geometry import mapping
from shapely.ops import unary_union

PATH = os.path.join(ROOT, 'geo', 'map-only.json')


def load(sites, path=PATH):
    entries = json.load(open(path)) if os.path.exists(path) else {}
    both = sorted(set(entries) & set(sites))
    if both:
        sys.exit(f'{both}: in both geo/sites.json and geo/map-only.json')
    return entries


def jobs(uid, s, outdir=None):
    """The one traffic-map job for a map-only site."""
    if not os.path.exists(os.path.join(ROOT, 'geo', 'landid', f'{uid}.json')):
        sys.exit(f'{uid}: no geo/landid/{uid}.json; fetch the broker outline with build/fetch_landid.mjs first')
    _, polys = parts_of(uid)
    if not polys:
        sys.exit(f'{uid}: no Land ID polygon in geo/landid/{uid}.json')
    geom = json.loads(json.dumps(mapping(unary_union(polys))))
    J, _ = jobs_for(uid, s['site'], outdir or os.path.join(ROOT, 'maps', uid), uid, geom=geom, cover=False,
                    intersection=s.get('intersection'), featured=s.get('businesses', ()),
                    manual_businesses=s.get('manual_businesses', ()), traffic_ids=s['traffic_ids'],
                    traffic_view=s.get('view'), only_traffic=True, business_limit=s.get('business_limit', 6),
                    height_px=s.get('height_px'))
    return J
