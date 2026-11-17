"""Logos on the Area Map with Traffic Counts: the three behaviours, through the real renderer.

usage: python3 build/test_logos.py

Renders build/test/fixture-traffic-job.json (Hwy 46 at Spencer Ranch Blvd, the map Erik's hand
edit broke on 2026-11-12) with node build/maps.mjs, as PNG so nothing is lost to JPEG:

  W      a throwaway first render: the first map on a fresh page antialiases its HTML labels
         differently (measured 2026-11-12: 12,896 pixels, all inside label text), so it warms up.
  A, A2  no logos, twice. They must be identical, or the diff in check 4 proves nothing.
  B      the same job with a solid magenta test logo on The Home Depot only.

Checks:
  1. The Home Depot shows a logo in B, and the logo's box is solidly magenta in the image, so the
     logo is drawn on top of the map, beside its dot.
  2. Every other business keeps its name (kind "name", no logo) at the same box as in A.
  3. No magenta anywhere in B outside the logo box.
  4. Outside The Home Depot's label box in A and its logo box in B (and their leader lines), B
     matches A to within antialiasing (JITTER): the basemap, roads, road labels, counts, pin and outline are unchanged.
  5. Nothing the map draws (a road line, a road label or shield, the site outline) lies under a
     logo: maps.mjs records what its line, symbol and site layers render inside each logo box.
  7. C: a test business on IH 10 northwest of the SH 46 interchange, where the logo's first spot
     lies over the interstate, keeps its name or finds a spot with nothing protected under it.
     This is the case check 5 cannot reach (in B the first spot is already clear): with the road
     rule removed, the logo lands on IH 10 (measured 2026-11-12).
  6. lib/logos.py matches the listed names only: "Lowe's Market" (the grocer) is its own logo, not
     Lowe's; "Walmart Neighborhood Market" and a bare "Walmart" are not Walmart Supercenter.
  8. Crowded maps, with the real logos (2026-11-16, option B of reddoor-workspace
     decisions/2026-11-16-1835-roalson-logo-placement-relax-which-protection.md):
     D  build/test/fixture-dove-canyon-job.json: Costco is drawn as a logo over part of a secondary
        or tertiary road (`roads`), with nothing protected under it.
     K  build/test/fixture-kingsville-job.json: Whataburger is drawn as a logo, with nothing
        protected under it, at one of the extra spots around its dot (`via` == 'ring').
     R  build/test/fixture-bandera-job.json, its logos at 28 px (option B's size; at 22 every logo
        there fits on the first pass): Sam's Club is drawn as a logo on the second pass or later
        (`pass`), once another logo has moved off its name's spot.
     N  the Hwy 46 fixture plus a test business whose name is too long for the map: its logo is
        drawn anyway, its dot is back on the map (read from the map's dot layer), and nothing
        protected lies under it. A second business of the same name, with no room even for its
        logo, neither takes that dot away nor gets a bare dot of its own.
     M  the Hwy 46 fixture plus a test business with a long name beside the IH 10 count: its logo is
        drawn within 15 px of a count or its dot, so check 9M has something to catch.
  10. Option C and Erik's sizes (2026-11-16, reddoor-workspace
     decisions/2026-11-16-2251-roalson-option-c-logos-with-no-room.md):
     sizes  lib/logos.py reads build/logo-sizes.json: 22 px by default; Whataburger and CHRISTUS at
            28 at Kingsville only; the Children's Hospital and University Health at 28 everywhere;
            every 402 W. Nueva logo at 28 except UTSA, H-E-B and La Michoacana (22); an unknown logo
            named in a scale, an unknown listing, or a scale that is a boolean, not finite or not
            positive stops the build.
     S      the Kingsville fixture with Whataburger at logo_px 28: its logo box is 28 px tall plus
            padding, where the K render (no logo_px, the 22 px default) draws it 22 px tall, and
            nothing protected lies under it.
     L      in D (Dove Canyon at 22 px), Ross is drawn on a horizontal leader line (`via` == 'line',
            the line level with its dot), with nothing protected under it.
     G      build/test/fixture-comfort-job.json (IH 10 at 87, siteLine set): Love's, whose dot is inside
            the site, is drawn on a line that crosses the site outline, its logo box clear of the site.
            G0, the same job without siteLine: Love's keeps its name.
     Y      build/test/fixture-st-marys-job.json: Nix is a logo, and every logo's `under` is empty. Before
            the clip fix Nix recorded bridge_street, which lies 0.69 px inside the name's old box. The
            map's 28 px logos (the Children's Hospital, University Health) sit among road names, so a
            rule that let a scaled logo cover a label is caught here (measured 2026-11-16).
     J      build/make_jobs.py's site_jobs, the real job path: Kingsville's job carries Whataburger and
            CHRISTUS at 28; IH 10 at 87's carries siteLine and Dove Canyon's does not, and
            geo/sites.json flags IH 10 at 87 alone.
  11. overlaps() itself, on hand-made records whose answers are known: the line checks; (round 3)
      the logo box against counts, labels, dots and other leader lines, and missing records; (round 4)
      a logo's own line ending inside its box, a line along the box's edge, and a record rounded from
      the drawn box; (round 5) a logo with no drawn box recorded, and two logos drawn on one spot; (round 6) two logos sharing
      one mark, and a logo with no mark beside a name label on its spot.
  9. In every render above, no logo overlaps a count or its dot, an intersection label or ring, the
     pin, another business's label, or any business dot: maps.mjs records each one's final box in
     boxes.json (`marks`), since they are HTML or a circle layer that `under` cannot see. No logo's
     leader line crosses one of those (its own dot and box aside), another leader line (`segs`), or
     a symbol or the site (`line_under`), except a horizontal line across the site where siteLine is set.
     No logo box lies over another leader line, and each logo's record is the box the page drew (its
     own `biz` mark; marks are matched one to one, nearest first, over every business). Every business's line, logo or name, is in `segs` (9x), and
     9L proves the fixtures draw logo lines, so those checks are not vacuous.
Needs network (OpenFreeMap tiles), like every map render. Exits 1 on any failure.
"""
import json, os, subprocess, sys, tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'test', 'fixture-traffic-job.json')
DOVE = os.path.join(HERE, 'test', 'fixture-dove-canyon-job.json')
KINGSVILLE = os.path.join(HERE, 'test', 'fixture-kingsville-job.json')
BANDERA = os.path.join(HERE, 'test', 'fixture-bandera-job.json')
COMFORT = os.path.join(HERE, 'test', 'fixture-comfort-job.json')
STMARYS = os.path.join(HERE, 'test', 'fixture-st-marys-job.json')
# Wider than the map at 11 px Archivo, so the name has no room anywhere and only its logo can show.
LONG = 'Test Business With A Name Far Too Long To Fit Anywhere On This Map, Whichever Side Of The Dot It Tries'
TARGET = 'The Home Depot'
MAGENTA = (255, 0, 255)
JITTER = 32
fails = []


def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok:
        fails.append(what)


def render(jobs):
    r = subprocess.run(['node', os.path.join(HERE, 'maps.mjs'), jobs, '--force'], capture_output=True, text=True)
    sys.stdout.write(''.join(l + '\n' for l in (r.stdout + r.stderr).splitlines() if l.startswith(('ok', 'FAIL', 'dropped', 'pageerror'))))
    if r.returncode:
        sys.exit(f'maps.mjs exited {r.returncode}:\n{r.stderr[-2000:]}')


def boxes(png):
    return {b['name']: b for b in json.load(open(png + '.boxes.json'))['businesses']}


def seg_in_rect(x1, y1, x2, y2, r, touch=False):
    """Whether the segment passes through rectangle r's interior (Liang-Barsky clipping), or with
    `touch` also runs along or meets its edge (a line's 1.2 px stroke then lies half on the box)."""
    t0, t1, dx, dy = 0.0, 1.0, x2 - x1, y2 - y1
    for p, q in ((-dx, x1 - r['l']), (dx, r['r'] - x1), (-dy, y1 - r['t']), (dy, r['b'] - y1)):
        if p == 0:
            if q < 0 or (q == 0 and not touch):
                return False
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    return t1 - t0 >= 0 if touch else t1 - t0 > 1e-6


def segs_cross(a, b):
    o = lambda px, py, qx, qy, rx, ry: (qx - px) * (ry - py) - (qy - py) * (rx - px)
    sg = lambda v: (v > 1e-9) - (v < -1e-9)
    return (sg(o(*a, b[0], b[1])) * sg(o(*a, b[2], b[3])) < 0) and (sg(o(*b, a[0], a[1])) * sg(o(*b, a[2], a[3])) < 0)


def overlaps(png, by_index=False):
    """Every (logo, mark) pair whose boxes overlap, from boxes.json's `marks` (the logo's own box excluded),
    and what each logo's leader line crosses (review round 1, 2026-11-16): a mark other than its own dot
    and box, another leader line (`segs`), or anything `line_under` records but the site, which only a
    horizontal line on a listing with siteLine may cross. With `by_index`, each finding is (the index of
    the business in boxes.json, or None, and the finding without the name), so a caller can attribute it
    to one business even when two names share their first 24 characters (2026-11-17, review round 1)."""
    d = json.load(open(png + '.boxes.json'))
    out = []
    # A record without the line measurements passes nothing (review round 3, 2026-11-17): a missing
    # field is not an empty one.
    if 'segs' not in d:
        out.append((None, 'segs not recorded'))
    # Each logo's own drawn box: the one nearest `biz` mark (review round 5, 2026-11-17). Exactly one mark is
    # excused per logo, so two logos drawn on top of each other each still see the other's mark.
    dev = lambda m, b: max(abs(m[k] - b[k]) for k in 'ltrb')
    # One to one (review round 6, 2026-11-17): every business, logo or name, claims the nearest unclaimed
    # mark, closest pairs first, so two logos cannot share one mark and a logo cannot take a name's.
    bizm = [m for m in d['marks'] if m['kind'] == 'biz']
    pairs = sorted((dev(m, b), i, j) for i, b in enumerate(d['businesses']) if all(k in b for k in 'ltrb')
                   for j, m in enumerate(bizm) if dev(m, b) < 0.5)
    owns, used = {i: None for i, b in enumerate(d['businesses'])}, set()
    for _, i, j in pairs:
        if owns[i] is None and j not in used:
            owns[i] = bizm[j]
            used.add(j)
    # A name label with no drawn box of its own means a mark went to the wrong business (or is missing).
    for i, b in enumerate(d['businesses']):
        if b['kind'] != 'logo' and all(k in b for k in 'ltrb') and owns[i] is None:
            out.append((i, "drawn box not recorded"))
    for i, b in enumerate(d['businesses']):
        if b['kind'] != 'logo' or not b.get('line'):
            continue
        if 'line_under' not in b:
            out.append((i, "line_under not recorded"))
        # The test starts where the line leaves its dot's own 10 px box, as maps.mjs's check does: inside
        # it the line is on its dot (El Merkadito's dot on 402 W. Nueva is 1.4 px inside the SITE tag).
        x1, y1, x2, y2 = b['line']
        ex = min([5 / abs(v) for v in (x2 - x1, y2 - y1) if v] or [1])
        ln = b['line'] if ex >= 1 else [x1 + (x2 - x1) * ex, y1 + (y2 - y1) * ex, x2, y2]
        for m in d['marks']:
            if m is owns[i]:
                continue
            if seg_in_rect(*ln, m):
                out.append((i, f"line over {m['kind']}"))
        for sg in d.get('segs', []):
            # The whole line, as maps.mjs checks it: a crossing near the dot is still a crossing.
            if not all(abs(u - v) < 0.01 for u, v in zip(sg, b['line'])) and segs_cross(b['line'], sg):
                out.append((i, "line crosses a leader line"))
        flat = abs(y1 - y2) < 0.01
        allowed = {'site-fill', 'site-line', 'site-halo'} if d.get('siteLine') and b.get('via') == 'line' and flat else set()
        for lid in set(b.get('line_under', [])) - allowed:
            out.append((i, f"line over {lid}"))
    for i, b in enumerate(d['businesses']):
        if b['kind'] != 'logo':
            continue
        # The record is the box the page drew (review round 4, 2026-11-17): the logo's own `biz` mark is
        # read from the page, so a record rounded from it (offsetWidth) differs and fails here. A logo with
        # no drawn box recorded fails too (round 5): a missing mark is not a matching one.
        own = owns[i]
        if own is None:
            out.append((i, "drawn box not recorded"))
        elif dev(own, b) > 0.05:
            out.append((i, "recorded box differs from the drawn box"))
        # No logo box over another leader line (review round 3, 2026-11-17): leader lines are SVG, which
        # `under` cannot see, and the pixel diff masks the logo box.
        for sg in d.get('segs', []):
            if not (b.get('line') and all(abs(u - v) < 0.01 for u, v in zip(sg, b['line']))) and seg_in_rect(*sg, b, touch=True):
                out.append((i, "over a leader line"))
        for m in d['marks']:
            if m is owns[i]:
                continue
            # place() keeps 3 px around every label, count and pin, and a ring 1 px on two sides, so those
            # need 1 px of air; dots
            # are kept clear by under a pixel (a business dot by 0.2 px, a count dot by 0.5), so they
            # need only not overlap.
            g = 0 if m['kind'] in ('biz-dot', 'aadt-dot') else 1
            if m['l'] - g < b['r'] and m['r'] + g > b['l'] and m['t'] - g < b['b'] and m['b'] + g > b['t']:
                out.append((i, f"over {m['kind']}"))
    if by_index:
        return out
    return [m if i is None else f"{d['businesses'][i]['name'][:24]} {m}" for i, m in out]


def matching():
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
    from logos import with_logo, _index
    idx = _index()
    # Erik's 11-13 logos (the operator, 2026-11-16: "make sure all the logos erik provided are being
    # used"): Lowe's Market, James Avery and H-E-B plus! now have their own files.
    expect = {"Lowe's": 'lowes', "Lowe's Market": 'lowes-market', 'H-E-B plus!': 'heb-plus', 'H-E-B': 'heb', 'The Home Depot': 'home-depot',
              'Walmart Supercenter': 'walmart', "Chili's": None, 'James Avery Jewelry': 'james-avery',
              'Walmart Neighborhood Market': None, 'Walmart': None}
    got = {n: (os.path.splitext(os.path.basename(with_logo({'name': n}, idx).get('logo', '')))[0] or None) for n in expect}
    check(got == expect, f'6. logos match listed names only: {got}')
    hd = with_logo({'name': 'The Home Depot'}, idx)
    check(bool(hd.get('logo_sha')), '6. a matched logo carries its file hash, so replacing the file re-renders the map')


def sizes():
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
    from logos import logo_px, with_logo, _index
    lg = lambda n: f'build/assets/logos/{n}.png'
    kv, nv = 'highway-77-at-general-cavazos-kingsville', '402-w-nueva-street'
    expect = {
        ('walmart', None): 22, ('whataburger', kv): 28, ('christus-spohn', kv): 28, ('whataburger', 'menger-springs-road'): 22,
        ('walmart', kv): 22, ('childrens-hospital', 'urban-loop-road'): 28, ('university-health', '101-w-commerce-street'): 28,
        ('el-merkadito', nv): 28, ('childrens-hospital', nv): 28, ('university-health', nv): 28,
        ('nix', '101-w-commerce-street'): 28, ('nix', 'st-marys-at-martin-river-walk'): 22,
        ('lowes-market', 'ih-10-at-highway-87-comfort'): 28, ('ross', 'loop-1604-at-dove-canyon'): 22,
    }
    got = {k: logo_px(lg(k[0]), k[1]) for k in expect}
    check(got == expect, f'10sizes. Erik\'s per-logo sizes: {[(k, got[k]) for k in expect if got[k] != expect[k]] or "all as listed"}')
    # Erik, 2026-11-16 2:28pm PT: "increase all the logos except UTSA and HEB by 125%"; La Michoacana at
    # 22 is the operator's answer (all six then show).
    excl = {n: logo_px(lg(n), nv) for n in ('utsa', 'heb', 'la-michoacana')}
    check(excl == {'utsa': 22, 'heb': 22, 'la-michoacana': 22}, f'10sizes. 402 W. Nueva: UTSA, H-E-B and La Michoacana stay at 22 px: {excl}')
    wb = with_logo({'name': 'Whataburger'}, _index(), uid=kv)
    check(wb.get('logo_px') == 28, f"10sizes. with_logo carries the listing's size into the job (logo_px={wb.get('logo_px')})")
    with tempfile.TemporaryDirectory() as t:
        bad = os.path.join(t, 'sizes.json')
        json.dump({'default_px': 22, 'listings': {kv: {'scale': {'no-such-logo': 2}}}}, open(bad, 'w'))
        try:
            logo_px(lg('walmart'), kv, sizes_path=bad)
            refused = False
        except SystemExit:
            refused = True
        check(refused, '10sizes. a scale naming a logo build/logos.json lacks stops the build')
        json.dump({'default_px': 22, 'listings': {'402-w-nueva-st': {'scale': {'*': 1.25}}}}, open(bad, 'w'))
        try:
            logo_px(lg('walmart'), kv, sizes_path=bad)
            refused = False
        except SystemExit:
            refused = True
        check(refused, '10sizes. a scale for a listing geo/sites.json and geo/map-only.json lack stops the build')
        for v in (True, float('nan'), float('inf'), 0, -1):
            open(bad, 'w').write(json.dumps({'default_px': 22, 'listings': {kv: {'scale': {'walmart': v}}}}))
            try:
                logo_px(lg('walmart'), kv, sizes_path=bad)
                refused = False
            except SystemExit:
                refused = True
            check(refused, f'10sizes. a scale of {v!r} stops the build')


def instrument():
    """overlaps() on hand-made boxes.json records, so the line checks are proven on inputs where the
    answer is known (review round 1, 2026-11-16): a clean line passes; a line over a count, across
    another leader line, or over a road label fails; the site passes only for a horizontal line on a
    listing with siteLine; the dot's own box is excused."""
    logo = {'name': 'T', 'kind': 'logo', 'l': 200, 't': 90, 'r': 240, 'b': 110, 'dot': [100, 100], 'line': [100, 100, 200, 100], 'via': 'line', 'line_under': []}
    dot = {'kind': 'biz-dot', 'name': 'T', 'l': 95.2, 't': 95.2, 'r': 104.8, 'b': 104.8}
    def run(siteLine=False, marks=(), segs=(), drop=None, nomark=False, others=(), **kw):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, 'x.png')
            biz = {k: v for k, v in {**logo, **kw}.items() if v is not None}
            mine = [] if nomark else [{'kind': 'biz', **{k: biz[k] for k in 'ltrb'}}]
            rec = {'businesses': [biz, *others], 'marks': [dot, *mine, *marks], 'segs': [biz.get('line', logo['line']), *segs], 'siteLine': siteLine}
            rec.pop(drop, None)
            json.dump(rec, open(p + '.boxes.json', 'w'))
            return overlaps(p)
    cases = {
        'clean': (run(), False),
        'line over a count': (run(marks=[{'kind': 'aadt', 'l': 140, 't': 95, 'r': 160, 'b': 105}]), True),
        'line across a leader line': (run(segs=[[150, 80, 150, 120]]), True),
        'line over a road label': (run(line_under=['highway-name-major']), True),
        'site, siteLine, horizontal': (run(siteLine=True, line_under=['site-line']), False),
        'site, no siteLine': (run(line_under=['site-line']), True),
        'site, siteLine, a ring line': (run(siteLine=True, line_under=['site-line'], via='ring'), True),
        'site, siteLine, a slanted line': (run(siteLine=True, line_under=['site-line'], line=[100, 100, 200, 95]), True),
        'a tag over the dot (inside its own box)': (run(marks=[{'kind': 'pin', 'l': 60, 't': 80, 'r': 101.4, 'b': 104}]), False),
        'a tag just past the dot\'s own box': (run(marks=[{'kind': 'pin', 'l': 60, 't': 80, 'r': 106, 'b': 104}]), True),
        'a neighbour\'s dot where the line leaves its own box': (run(marks=[{'kind': 'biz-dot', 'name': 'B', 'l': 103.2, 't': 95.2, 'r': 112.8, 'b': 104.8}]), True),
        'a ring line across a leader line': (run(segs=[[150, 80, 150, 120]], via='ring'), True),
        # The logo box itself (review round 3, 2026-11-17): x 200-240, y 90-110.
        'a leader line through the logo box': (run(segs=[[220, 60, 220, 140]]), True),
        'a leader line clipping the box\'s corner': (run(segs=[[225, 80, 245, 95]]), True),
        # The logo's own line, ending 0.5 px inside its box, is not "another leader line" (round 4).
        'its own line ending inside its box': (run(line=[100, 100, 200.5, 100]), False),
        'a leader line along the box\'s top edge': (run(segs=[[210, 90, 260, 90]]), True),
        'the record rounded from the drawn box': (run(nomark=True, marks=[{'kind': 'biz', 'l': 200, 't': 90, 'r': 240.29, 'b': 110}]), True),
        'no drawn box recorded for the logo': (run(nomark=True), True),
        # Two other logos drawn on one spot, away from T and its line, each with its drawn mark.
        'two logos drawn on top of each other': (run(others=[{'name': n, 'kind': 'logo', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 200]} for n in 'UV'],
                                                     marks=[{'kind': 'biz', 'l': 300, 't': 150, 'r': 340, 'b': 170}] * 2), True),
        'two logos drawn on one spot with one mark between them': (run(others=[{'name': n, 'kind': 'logo', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 200]} for n in 'UV'],
                                                                     marks=[{'kind': 'biz', 'l': 300, 't': 150, 'r': 340, 'b': 170}]), True),
        'a logo with no mark beside a name label on its spot': (run(others=[{'name': 'U', 'kind': 'logo', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 200]},
                                                                            {'name': 'N', 'kind': 'name', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 140]}],
                                                                    marks=[{'kind': 'biz', 'l': 300, 't': 150, 'r': 340, 'b': 170}]), True),
        'one other logo, clear of it': (run(others=[{'name': 'U', 'kind': 'logo', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 200]}],
                                            marks=[{'kind': 'biz', 'l': 300, 't': 150, 'r': 340, 'b': 170}]), False),
        'a leader line 1 px clear of the box': (run(segs=[[241, 60, 241, 140]]), False),
        'a count under the box': (run(marks=[{'kind': 'aadt', 'l': 230, 't': 95, 'r': 260, 'b': 105}]), True),
        'a label 0.5 px from the box': (run(marks=[{'kind': 'label', 'l': 240.5, 't': 95, 'r': 270, 'b': 105}]), True),
        'a label 1.5 px from the box': (run(marks=[{'kind': 'label', 'l': 241.5, 't': 95, 'r': 270, 'b': 105}]), False),
        'a business dot touching the box': (run(marks=[{'kind': 'biz-dot', 'name': 'B', 'l': 240, 't': 95, 'r': 249.6, 'b': 104.6}]), False),
        'the logo\'s own box (its drawn mark, recorded once)': (run(), False),
        'no segs recorded': (run(drop='segs'), True),
        'no line_under recorded': (run(line_under=None), True),
    }
    bad = [k for k, (got, want) in cases.items() if bool(got) != want]
    check(not bad, f'11. overlaps() on hand-made records: {bad or "every case as expected"}')


def job_path():
    """The real path into a job, build/make_jobs.py's site_jobs: Erik's per-listing sizes and the site line
    reach the traffic jobs (review round 1, 2026-11-16: the fixtures carry both written in, so a job
    builder that dropped them passed every other check)."""
    sys.path.insert(0, HERE)
    import make_jobs
    tj = lambda uid: next(j for j in make_jobs.site_jobs(uid, make_jobs.sites[uid])[0] if j['out'].endswith('/traffic.jpg'))
    kv, cf, dv = tj('highway-77-at-general-cavazos-kingsville'), tj('ih-10-at-highway-87-comfort'), tj('loop-1604-at-dove-canyon')
    px = {b['name']: b.get('logo_px') for b in kv['businesses'] if b.get('logo')}
    check(px.get('Whataburger') == 28 and px.get('CHRISTUS Spohn Hospital - Kleberg') == 28 and px.get('Walmart Supercenter') == 22,
          f'10J. make_jobs: Kingsville\'s traffic job carries Erik\'s sizes ({px})')
    flagged = sorted(u for u, v in make_jobs.sites.items() if v.get('logo_line_across_site'))
    check(cf.get('siteLine') is True and 'siteLine' not in dv and flagged == ['ih-10-at-highway-87-comfort'],
          f"10J. make_jobs: siteLine reaches IH 10 at 87's traffic job and not Dove Canyon's, and only IH 10 at 87 is flagged (Comfort {cf.get('siteLine')}, Dove Canyon {dv.get('siteLine')}, flagged {flagged})")


def mask_for(shape, dpr, items, pad=3):
    """Device-pixel mask of the given label boxes and leader lines, padded by `pad` CSS px."""
    m = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for b in items:
        d.rectangle([(b['l'] - pad) * dpr, (b['t'] - pad) * dpr, (b['r'] + pad) * dpr, (b['b'] + pad) * dpr], fill=255)
        if b.get('line'):
            x1, y1, x2, y2 = (v * dpr for v in b['line'])
            d.line([x1, y1, x2, y2], fill=255, width=int((2 * pad + 2) * dpr))
    return np.asarray(m) > 0


def main():
    base = json.load(open(FIXTURE))
    with tempfile.TemporaryDirectory() as t:
        logo = os.path.join(t, 'magenta.png')
        Image.new('RGB', (240, 120), MAGENTA).save(logo)
        a, a2, b = (os.path.join(t, f'{k}.png') for k in ('A', 'A2', 'B'))
        jb = json.loads(json.dumps(base))
        for biz in jb['businesses']:
            if biz['name'] == TARGET:
                biz['logo'] = logo
        jobs = os.path.join(t, 'jobs.json')
        jc = json.loads(json.dumps(base))
        jc['businesses'].append({'name': 'Test Stop', 'lat': 29.7855, 'lon': -98.7455, 'logo': logo})
        c = os.path.join(t, 'C.png')
        jn = json.loads(json.dumps(base))
        jn['businesses'].append({'name': LONG, 'lat': 29.77494, 'lon': -98.74337, 'logo': logo})
        # A second business of the same name where even its logo has no room (measured 2026-11-16):
        # it must not take the first one's dot with it (review round 1, dots were keyed by name).
        jn['businesses'].append({'name': LONG, 'lat': 29.77494, 'lon': -98.74926, 'logo': logo})
        jm = json.loads(json.dumps(base))
        jm['businesses'].append({'name': LONG, 'lat': 29.78395, 'lon': -98.74300, 'logo': logo})
        dv, kv, nn, mm, rr = (os.path.join(t, f'{k}.png') for k in ('D', 'K', 'N', 'M', 'R'))
        sv, gv, g0, yv = (os.path.join(t, f'{k}.png') for k in ('S', 'G', 'G0', 'Y'))
        js = json.load(open(KINGSVILLE))
        for biz in js['businesses']:
            if biz['name'] == 'Whataburger':
                biz['logo_px'] = 28
        # 8R keeps its 28 px logos (option B's size): at option C's 22 px every logo on the Bandera map fits on
        # the first pass, and no real map needs a second pass (measured 2026-11-16), so 28 px is the input
        # that still exercises the retry.
        jr = json.load(open(BANDERA))
        for biz in jr['businesses']:
            if biz.get('logo'):
                biz['logo_px'] = 28
        jg = json.load(open(COMFORT))
        jg0 = {k: v for k, v in jg.items() if k != 'siteLine'}
        json.dump([{**base, 'out': os.path.join(t, 'W.png')}, {**base, 'out': a}, {**base, 'out': a2}, {**jb, 'out': b}, {**jc, 'out': c},
                   {**json.load(open(DOVE)), 'out': dv}, {**json.load(open(KINGSVILLE)), 'out': kv}, {**jn, 'out': nn}, {**jm, 'out': mm},
                   {**jr, 'out': rr}, {**js, 'out': sv}, {**jg, 'out': gv}, {**jg0, 'out': g0},
                   {**json.load(open(STMARYS)), 'out': yv}], open(jobs, 'w'))
        render(jobs)
        A, A2, B = (np.asarray(Image.open(p).convert('RGB')).astype(int) for p in (a, a2, b))
        dpr = base['dpr']
        bxA, bxB = boxes(a), boxes(b)

        d0 = np.abs(A - A2).max(axis=2)
        diff0 = int((d0 > JITTER).sum())
        check(diff0 == 0, f'control: two renders without logos match ({diff0} pixels differ by more than {JITTER}; {int((d0 > 0).sum())} differ at all)')

        hd = bxB.get(TARGET)
        check(bool(hd) and hd['kind'] == 'logo', f'1. {TARGET} is drawn as a logo (kind={hd and hd["kind"]})')
        if hd:
            l, tp, r, bt = (int(round(v * dpr)) for v in (hd['l'], hd['t'], hd['r'], hd['b']))
            inner = B[tp + 3 * int(dpr):bt - 3 * int(dpr), l + 4 * int(dpr):r - 4 * int(dpr)]
            mag = (np.abs(inner - np.array(MAGENTA)).max(axis=2) < 40).mean() if inner.size else 0
            check(mag > 0.9, f'1. the logo box is magenta in the image, so it is above the map ({mag:.0%} of it)')
            dx, dy = hd['dot']
            near = max(hd['l'] - dx, dx - hd['r'], hd['t'] - dy, dy - hd['b'], 0)
            check(near <= 12 or bool(hd['line']), f'1. the logo sits beside its dot ({near:.0f}px away, leader line: {bool(hd["line"])})')

        others = [n for n in bxA if n != TARGET]
        same = [n for n in others if n in bxB and bxB[n]['kind'] == 'name' and not bxB[n]['logo']
                and all(abs(bxB[n][k] - bxA[n][k]) < 0.01 for k in 'ltrb')]
        check(len(others) > 0 and same == others, f'2. the {len(others)} businesses without a logo keep their name, in place: {sorted(set(others) - set(same)) or "all"}')

        changed = mask_for(A.shape, dpr, [x for x in (bxA.get(TARGET), hd, hd and hd.get('was')) if x])
        stray = (np.abs(B - np.array(MAGENTA)).max(axis=2) < 40) & ~changed
        check(int(stray.sum()) == 0, f'3. no magenta outside the logo box ({int(stray.sum())} pixels)')

        # Renders that draw a logo antialias the HTML labels' text and edges slightly differently
        # (measured 2026-11-12: 477 pixels, at most 11/255 apart, between two identical logo
        # renders). A road, label or count that moves or vanishes differs by far more than JITTER.
        delta = np.abs(A - B).max(axis=2)
        print(f'   largest difference outside the boxes: {int((delta * ~changed).max())}/255')
        moved = (delta > JITTER) & ~changed
        n = int(moved.sum())
        if n:
            ys, xs = np.nonzero(moved)
            print(f'   changed region: x {xs.min() / dpr:.0f}-{xs.max() / dpr:.0f}, y {ys.min() / dpr:.0f}-{ys.max() / dpr:.0f} (CSS px)')
        check(n == 0, f'4. outside the label and logo boxes the map is unchanged ({n} pixels differ)')
        if hd:
            check(hd.get('under') == [], f"5. nothing the map draws lies under the logo (under: {hd.get('under')})")
        ts = boxes(c).get('Test Stop')
        check(bool(ts) and (ts['kind'] == 'name' or ts.get('under') == []),
              f"7. a logo on IH 10 keeps its name or covers nothing protected (kind={ts and ts['kind']}, under={ts and ts.get('under')})")
        co = boxes(dv).get('Costco')
        check(bool(co) and co['kind'] == 'logo' and co.get('under') == [] and any('secondary_tertiary' in r for r in co.get('roads', [])),
              f"8D. Dove Canyon: Costco is a logo over part of a secondary or tertiary road, nothing protected under it (kind={co and co['kind']}, under={co and co.get('under')}, roads={co and co.get('roads')})")
        wb = boxes(kv).get('Whataburger')
        check(bool(wb) and wb['kind'] == 'logo' and wb.get('under') == [] and wb.get('via') == 'ring',
              f"8K. Kingsville: Whataburger is a logo at a ring spot, nothing protected under it (kind={wb and wb['kind']}, via={wb and wb.get('via')}, under={wb and wb.get('under')})")
        sc = boxes(rr).get("Sam's Club")
        check(bool(sc) and sc['kind'] == 'logo' and sc.get('under') == [] and (sc.get('pass') or 0) >= 2,
              f"8R. Bandera: Sam's Club is a logo placed on a later pass, nothing protected under it (kind={sc and sc['kind']}, pass={sc and sc.get('pass')}, under={sc and sc.get('under')})")
        nm = json.load(open(nn + '.boxes.json'))
        tn = {x['name']: x for x in nm['businesses']}.get(LONG)
        dot = tn and any(m['kind'] == 'biz-dot' and m.get('name') == LONG and abs((m['l'] + m['r']) / 2 - tn['dot'][0]) < 0.5 and abs((m['t'] + m['b']) / 2 - tn['dot'][1]) < 0.5 for m in nm['marks'])
        check(bool(tn) and tn['kind'] == 'logo' and 'was' not in tn and tn.get('under') == [] and dot and nm['dropped'].count(f'business {LONG}') == 1
              and sum(m['kind'] == 'biz-dot' and m.get('name') == LONG for m in nm['marks']) == 1,
              f"8N. a business whose name has no room shows its logo and its dot, nothing protected under it (kind={tn and tn['kind']}, under={tn and tn.get('under')}, dot={dot})")
        tm = boxes(mm).get(LONG)
        aadt = [m for m in json.load(open(mm + '.boxes.json'))['marks'] if m['kind'] in ('aadt', 'aadt-dot')]
        near = min((max(m['l'] - tm['r'], tm['l'] - m['r'], m['t'] - tm['b'], tm['t'] - m['b'], 0) for m in aadt), default=1e9) if tm else 1e9
        check(bool(tm) and tm['kind'] == 'logo' and near < 15,
              f"8M. the test logo is drawn {near:.0f}px from a count or its dot, so 9M is not vacuous (kind={tm and tm['kind']})")
        # 10. Option C and Erik's sizes.
        ws, wk = boxes(sv).get('Whataburger'), boxes(kv).get('Whataburger')
        hs, hk = (x and x['kind'] == 'logo' and round(x['b'] - x['t'], 1) for x in (ws, wk))
        # .biz.logo pads 3 px above and below the image; Whataburger's logo is near square (166x160), far
        # below the 92/28 aspect where the width cap would set the size instead.
        dpx = json.load(open(os.path.join(HERE, 'logo-sizes.json')))['default_px']
        check(hs and hk and round(hs - hk, 1) == 6 and round(hk - 6, 1) == dpx and ws.get('under') == [],
              f"10S. Whataburger draws 28 px tall at logo_px 28 and 22 px by default, nothing protected under it (boxes {hs} and {hk} px with padding, under={ws and ws.get('under')})")
        ro = boxes(dv).get('Ross')
        flat = bool(ro) and bool(ro.get('line')) and abs(ro['line'][1] - ro['line'][3]) < 0.01
        check(bool(ro) and ro['kind'] == 'logo' and ro.get('via') == 'line' and flat and ro.get('under') == [],
              f"10L. Dove Canyon: Ross is a logo on a horizontal leader line, nothing protected under it (kind={ro and ro['kind']}, via={ro and ro.get('via')}, line={ro and ro.get('line')}, under={ro and ro.get('under')})")
        lv, lv0 = boxes(gv).get("Love's"), boxes(g0).get("Love's")
        check(bool(lv) and lv['kind'] == 'logo' and lv.get('via') == 'line' and lv.get('under') == [] and any(i.startswith('site-') for i in lv.get('line_under', [])),
              f"10G. IH 10 at 87 (siteLine): Love's is a logo on a line across the site, its box clear of the site (kind={lv and lv['kind']}, via={lv and lv.get('via')}, under={lv and lv.get('under')}, line_under={lv and lv.get('line_under')})")
        check(bool(lv0) and lv0['kind'] == 'name',
              f"10G0. the same map without siteLine: Love's keeps its name, so the line crosses the site only where a listing allows it (kind={lv0 and lv0['kind']})")
        by = boxes(yv)
        nx = by.get('Nix Medical Center')
        yu = {n: x.get('under') for n, x in by.items() if x['kind'] == 'logo' and x.get('under') != []}
        check(bool(nx) and nx['kind'] == 'logo' and not yu,
              f"10Y. St. Mary's: Nix is a logo, and nothing protected is recorded under any logo (kind={nx and nx['kind']}, under={yu or 'none'})")
        for k, png in (('B', b), ('C', c), ('D', dv), ('K', kv), ('N', nn), ('M', mm), ('R', rr), ('S', sv), ('G', gv), ('G0', g0), ('Y', yv)):
            ov = overlaps(png)
            check(ov == [], f'9{k}. no logo overlaps a count, ring, pin, label or dot: {ov or "none"}')
            # Every logo line drawn is in `segs` (review round 4, 2026-11-17): positive evidence the
            # field is live, so an empty `segs` cannot pass the line checks on a map that has lines.
            rec = json.load(open(png + '.boxes.json'))
            lines = [x['line'] for x in rec['businesses'] if x.get('line')]
            gone = [ln for ln in lines if not any(all(abs(u - v) < 0.01 for u, v in zip(ln, sg)) for sg in rec['segs'])]
            check(not gone, f'9{k}. every business line, logo or name ({len(lines)}), is recorded in segs: {gone or "yes"}')
        allb = [x for png in (b, c, dv, kv, nn, mm, rr, sv, gv, g0, yv) for x in json.load(open(png + '.boxes.json'))['businesses'] if x.get('line')]
        nl, ll = sum(x['kind'] == 'logo' for x in allb), sum(x['kind'] == 'name' for x in allb)
        check(nl > 0 and ll > 0, f'9L. the 9x segs checks are not vacuous: {nl} logo lines and {ll} name lines drawn')
    matching()
    sizes()
    instrument()
    job_path()
    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main()
