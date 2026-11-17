"""Which business on an Area Map gets a logo (decided 2026-11-12, superseding Operator decisions 119).

`build/logos.json` lists each logo file and the exact business names it stands for, as the map
prints them (OpenStreetMap's spelling, or a `manual_businesses` name). Matching is on those names
only, compared case- and punctuation-blind; there is no fuzzy match, so a business whose name is
not listed keeps its name and pin.
"""
import hashlib, json, math, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SPEC = os.path.join(ROOT, 'build', 'logos.json')


def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def _index(spec_path=SPEC):
    if not os.path.exists(spec_path):
        return {}
    out = {}
    for lg in json.load(open(spec_path))['logos']:
        f = os.path.join(ROOT, lg['file'])
        if not os.path.exists(f):
            raise SystemExit(f"{lg['file']}: listed in build/logos.json but missing; run build/logos.py")
        sha = hashlib.sha1(open(f, 'rb').read()).hexdigest()[:12]
        for n in lg['names']:
            k = norm(n)
            if k in out and out[k]['logo'] != lg['file']:
                raise SystemExit(f'build/logos.json: "{n}" is listed under two logos')
            out[k] = {'logo': lg['file'], 'logo_sha': sha}
    return out


_INDEX = None
SIZES = os.path.join(ROOT, 'build', 'logo-sizes.json')


def logo_px(logo, uid=None, sizes_path=SIZES):
    """How tall `logo` (a path from build/logos.json) draws on `uid`'s map, in CSS px.

    build/logo-sizes.json gives the default (22 since option C, 2026-11-16) and Erik's scales. The
    first match wins: the logo named on the listing, then named in `logos` (every map), then the
    listing's "*", else 1. The height is rounded to a whole px, halves up: 22 x 1.25 = 27.5 draws
    at 28."""
    spec = json.load(open(sizes_path))
    known = {os.path.basename(lg['file'])[:-4] for lg in json.load(open(SPEC))['logos']}
    everywhere = spec.get('logos', {}).get('scale', {})
    listings = spec.get('listings', {})
    uids = set(json.load(open(os.path.join(ROOT, 'geo', 'sites.json')))) | set(json.load(open(os.path.join(ROOT, 'geo', 'map-only.json'))))
    if set(listings) - uids:
        raise SystemExit(f'build/logo-sizes.json: scales listings geo/sites.json and geo/map-only.json do not list: {sorted(set(listings) - uids)}')
    for where, sc in [('logos', everywhere)] + [(u, v.get('scale', {})) for u, v in listings.items()]:
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 for v in sc.values()):
            raise SystemExit(f'build/logo-sizes.json: {where} has a scale that is not a positive number: {sc}')
        if set(sc) - {'*'} - known:
            raise SystemExit(f'build/logo-sizes.json: {where} scales logos build/logos.json does not list: {sorted(set(sc) - {"*"} - known)}')
    scale = listings.get(uid, {}).get('scale', {})
    key = os.path.basename(logo)[:-4]
    s = scale[key] if key in scale else everywhere[key] if key in everywhere else scale.get('*', 1)
    return int(spec['default_px'] * s + 0.5)


OVERRIDES = os.path.join(ROOT, 'build', 'logo-overrides.json')


def forced(uid, path=OVERRIDES):
    """{business name: override} for `uid` from build/logo-overrides.json: logos drawn at a set spot
    instead of by the placement rules (2026-11-17, Erik's 11-17 asks; the operator let them break the
    rules and asked that every break be flagged). Each override has `at`, the logo's centre as [x, y] CSS
    px from its dot on the 672 px map, a `why` quoting the ask, and `breaks`, which build/logo_check.py
    requires to equal what the rendered map records, word for word."""
    if not os.path.exists(path):
        return {}
    spec = json.load(open(path)).get('listings', {})
    uids = set(json.load(open(os.path.join(ROOT, 'geo', 'sites.json')))) | set(json.load(open(os.path.join(ROOT, 'geo', 'map-only.json'))))
    if set(spec) - uids:
        raise SystemExit(f'build/logo-overrides.json: listings geo/sites.json and geo/map-only.json do not list: {sorted(set(spec) - uids)}')
    out = {}
    for name, o in spec.get(uid, {}).get('logos', {}).items():
        at = o.get('at')
        if not (isinstance(at, list) and len(at) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in at)):
            raise SystemExit(f'build/logo-overrides.json: {uid} "{name}": `at` must be [x, y] in px')
        if not isinstance(o.get('breaks'), list) or not all(isinstance(x, str) for x in o['breaks']) or not o.get('why') or not o.get('flag'):
            raise SystemExit(f'build/logo-overrides.json: {uid} "{name}" needs `why`, `flag` and a `breaks` list of strings (empty when it breaks nothing)')
        out[name] = o
    return out


def with_logo(b, index=None, uid=None):
    """The business dict, plus `logo` (a path under the tool's root), `logo_sha` and `logo_px` (its
    height on `uid`'s map) when its name has one. The sha and the height are part of the map's job
    spec, so replacing a logo file or changing its size re-renders the maps that use it."""
    global _INDEX
    if index is None:
        if _INDEX is None:
            _INDEX = _index()
        index = _INDEX
    hit = index.get(norm(b['name']))
    if not hit:
        return dict(b)
    out = {**b, **hit, 'logo_px': logo_px(hit['logo'], uid)}
    f = forced(uid).get(b['name']) if uid else None
    if f:
        out['force'] = {'at': f['at']}
    return out
