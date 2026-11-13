"""Which business on an Area Map gets a logo (decided 2026-11-12, superseding Operator decisions 119).

`build/logos.json` lists each logo file and the exact business names it stands for, as the map
prints them (OpenStreetMap's spelling, or a `manual_businesses` name). Matching is on those names
only, compared case- and punctuation-blind; there is no fuzzy match, so a business whose name is
not listed keeps its name and pin.
"""
import hashlib, json, os, re

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


def with_logo(b, index=None):
    """The business dict, plus `logo` (a path under the tool's root) and `logo_sha` when its name has one.
    The sha is part of the map's job spec, so replacing a logo file re-renders the maps that use it."""
    global _INDEX
    if index is None:
        if _INDEX is None:
            _INDEX = _index()
        index = _INDEX
    hit = index.get(norm(b['name']))
    return {**b, **hit} if hit else dict(b)
