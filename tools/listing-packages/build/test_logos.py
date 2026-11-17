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
import json, math, os, subprocess, sys, tempfile

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
# How far a box may sit from the point it labels with no leader line, as maps.mjs's place() decides it
# (`near`): 9 px for a business (logo or name), 12 for a count or an intersection label. Measured from the
# point to the box's nearest point, as place() measures it.
LOGO_NEAR, LABEL_NEAR = 9, 12
# The dots a logo can be read as belonging to: other businesses', the counts', the pin's and the
# intersection rings (#379).
DOTS = ('biz-dot', 'aadt-dot', 'pin-dot', 'xring')
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


def box_dist(p, b):
    """Distance from point p to the nearest point of box b (0 inside it)."""
    return math.hypot(max(b['l'] - p[0], 0, p[0] - b['r']), max(b['t'] - p[1], 0, p[1] - b['b']))


def nearest(p, b):
    """The point of box b nearest p: where maps.mjs ends a leader line from p."""
    return [max(b['l'], min(p[0], b['r'])), max(b['t'], min(p[1], b['b']))]


def same(a, b, tol=0.01):
    return len(a) == len(b) and all(abs(u - v) < tol for u, v in zip(a, b))


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
    out += ties(d)
    if by_index:
        return out
    return [m if i is None else f"{d['businesses'][i]['name'][:24]} {m}" for i, m in out]


def near_dots(b, marks):
    """The dots a logo `b` may be read as belonging to (#379): every other dot (another business's, a count's,
    the pin's, an intersection ring) within LOGO_NEAR of its box, or, for a logo with no line, closer to it
    than its own dot. Every dot is measured from its centre, the point it marks, as maps.mjs measures `near`;
    so the pin's 18 px dot and a 16 px ring count only where their centre is that near (review round 2: from
    their edges, four more logos (five findings) would fail, among them Scenic Loop's Fairfield and Circle K, #379's map half).
    The SITE tag is not a dot. Each is (kind, name or None, distance to the box, whether it is closer than its
    own, its centre)."""
    out = []
    own = box_dist(b['dot'], b)
    ln = b.get('line')
    for m in marks:
        if m['kind'] not in DOTS:
            continue
        c = ((m['l'] + m['r']) / 2, (m['t'] + m['b']) / 2)
        if m['kind'] == 'biz-dot' and math.hypot(c[0] - b['dot'][0], c[1] - b['dot'][1]) < 0.5:
            continue  # its own dot
        od = box_dist(c, b)
        closer = not ln and od < own
        if closer or od <= LOGO_NEAR:
            out.append((m['kind'], m.get('name'), od, closer, c))
    return out


def ties(d):
    """What ties each box to its point, and whether the record of leader lines is complete (#380 and the
    checker half of #379, 2026-11-17). The checks above trust `segs` and each logo's `line`; these check
    that those records hold every line that is drawn, and that a logo reads as its own dot's:
      - a logo farther than LOGO_NEAR from its dot has a line that starts at the dot and ends on its box (X2);
      - every business line is in `segs`, a count or intersection label farther than LABEL_NEAR from its
        point (`pt`, recorded since #380) has its line in `segs` (X1), and every line in `segs` is one of
        those (nothing else draws a leader line);
      - every pin has its stem recorded, so the checks above see it;
      - no other dot (another business's, a count's, the pin's, an intersection ring) is within LOGO_NEAR
        of a logo box, nor closer to it than its own dot. A logo with a line is joined to its dot by it,
        so only the first applies to it. A logo with no line is within LOGO_NEAR of its own dot, so the
        second is also the first; its message says which reading it is.
    Returns (business index or None, finding) pairs, as overlaps(by_index=True)."""
    out = []
    segs, marks, biz = d.get('segs', []), d.get('marks', []), d['businesses']
    owned = [False] * len(segs)
    for i, b in enumerate(biz):
        if b.get('line'):
            hits = [k for k, sg in enumerate(segs) if same(sg, b['line'])]
            if not hits:
                out.append((i, 'line not in segs'))
            for k in hits:
                owned[k] = True
    for m in marks:
        if m['kind'] == 'aadt' and 'pt' not in m:
            out.append((None, 'a count with no point recorded'))
        if m['kind'] not in ('aadt', 'ref') or 'pt' not in m:
            continue
        # A label owns at most one line, from its point to its box (review round 3: a line matched by its start
        # alone let a stray line from a count's point pass).
        hits = [k for k, sg in enumerate(segs) if same(sg[:2], m['pt']) and box_dist(sg[2:], m) < 1]
        for k in hits:
            owned[k] = True
        if len(hits) > 1:
            out.append((None, f"{m['kind']} with {len(hits)} lines"))
        # place() sizes a label by offsetWidth, rounded to whole px, where the mark is the drawn box: up to
        # 0.5 px of slack (review round 1: 1 px left a band where a missing line passed).
        if box_dist(m['pt'], m) > LABEL_NEAR + 0.5 and not hits:
            out.append((None, f"{m['kind']} line not in segs"))
    out += [(None, 'a leader line in segs that nothing draws') for o in owned if not o]
    # A placed intersection label has a ring; a fixed one does not. So every ring's label must carry its point,
    # or the line check above skips it as fixed (review round 1). A ring whose label had no room is in
    # `dropped` instead (maps.mjs then stamps nothing, but a record can still say so; review round 2).
    rings = sum(m['kind'] == 'xring' for m in marks) - sum(x.startswith('intersection ') for x in d.get('dropped', []))
    if sum(m['kind'] == 'ref' and 'pt' in m for m in marks) < rings:
        out.append((None, 'an intersection label with no point recorded'))
    if sum(m['kind'] == 'pin-stem' for m in marks) < sum(m['kind'] == 'pin' for m in marks):
        out.append((None, 'pin stem not recorded'))
    for i, b in enumerate(biz):
        if not all(k in b for k in 'ltrb'):
            continue
        # A name label too (review round 3): its record is the drawn box and its line was measured from the
        # offsetWidth box, so it gets the labels' 0.5 px of slack, and its line may end up to 1 px off the box.
        name = b['kind'] != 'logo'
        own = box_dist(b['dot'], b)
        ln = b.get('line')
        if own > LOGO_NEAR + (0.5 if name else 0):
            if not ln:
                out.append((i, 'off its dot with no leader line'))
            elif not (same(ln[:2], b['dot']) and box_dist(ln[2:], b) < (1 if name else 0.05)):
                out.append((i, 'leader line does not join its dot to its box'))
        if name:
            continue
        for kind, name, od, closer, _ in near_dots(b, marks):
            who = f"{kind} {name}" if name else kind
            out.append((i, f"another dot ({who}) {'closer than its own' if closer else f'within {LOGO_NEAR} px'}"))
    return out


APPROVED = os.path.join(HERE, 'logo-check-approved.json')
CLOSER = 'another dot ('


def approved(uid, png, found, path=APPROVED):
    """Takes the closer-dot findings build/logo-check-approved.json keeps on `uid` out of `found`
    (overlaps(by_index=True)) and returns (what fails, the findings left). Each listed business must have
    exactly its listed `dots` near it (near_dots()): the same kinds and business names, each within 0.5 px of
    its listed distance and its centre within 0.5 px of its listed `at` (review rounds 1 and 2: the finding's
    words alone passed a dot that had moved or been swapped, and distance alone a dot slid along the box).
    The logo's own box must be within 0.5 px of its listed `box` (review round 3: a logo slid along the edge
    nearest its approved dot kept every distance). A dot gone, a new one, or one that moved fails. Only closer-dot findings are
    taken off; an entry with no `why` or `date`, a listing geo/sites.json and geo/map-only.json lack, or a
    name the map does not show as a logo exactly once stops it (the operator's answer (a), 2026-11-17)."""
    spec = json.load(open(path)).get('listings', {})
    root = os.path.dirname(HERE)
    uids = set(json.load(open(os.path.join(root, 'geo', 'sites.json')))) | set(json.load(open(os.path.join(root, 'geo', 'map-only.json'))))
    if set(spec) - uids:
        raise SystemExit(f'build/logo-check-approved.json: listings geo/sites.json and geo/map-only.json do not list: {sorted(set(spec) - uids)}')
    rec = json.load(open(png + '.boxes.json'))
    biz = rec['businesses']
    bad, keep = [], set()
    for name, e in spec.get(uid, {}).items():
        f = e.get('dots')
        # Finite numbers only (review round 3: NaN compares false with everything, so it approved any dot).
        n = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
        ok = lambda x: isinstance(x, dict) and set(x) <= {'kind', 'name', 'px', 'at'} and x.get('kind') in DOTS and n(x.get('px')) and isinstance(x.get('at'), list) and len(x['at']) == 2 and all(n(v) for v in x['at'])
        box = e.get('box')
        if not (isinstance(f, list) and f and all(ok(x) for x in f)) or not (isinstance(box, list) and len(box) == 4 and all(n(v) for v in box)) or not e.get('why') or not e.get('date'):
            raise SystemExit(f'build/logo-check-approved.json: {uid} "{name}" needs `why`, `date`, `box` [l, t, r, b] and `dots`, a list of {{kind, name, px, at}}')
        idx = [i for i, b in enumerate(biz) if b['name'] == name and b['kind'] == 'logo']
        if len(idx) != 1:
            bad.append(f'{name}: approved, but drawn as a logo {len(idx)} times, not once')
            continue
        key = lambda t: (t[0], t[1] or '', t[2])
        got = sorted(((k, nm, round(od, 2), [round(v, 2) for v in c]) for k, nm, od, _, c in near_dots(biz[idx[0]], rec['marks'])), key=key)
        want = sorted(((x['kind'], x.get('name'), x['px'], x['at']) for x in f), key=key)
        # The logo's own box too (review round 3: sliding along the edge nearest an approved dot kept that
        # dot's distance and centre).
        lb = biz[idx[0]]
        if any(abs(lb[k] - v) > 0.5 for k, v in zip('ltrb', e['box'])):
            bad.append(f"{name}: drawn at {[round(lb[k], 2) for k in 'ltrb']}, but build/logo-check-approved.json approves it at {e['box']}")
        elif len(got) != len(want) or any(g[:2] != w[:2] or abs(g[2] - w[2]) > 0.5 or math.hypot(g[3][0] - w[3][0], g[3][1] - w[3][1]) > 0.5 for g, w in zip(got, want)):
            bad.append(f"{name}: has dots {got}, but build/logo-check-approved.json approves {want}")
        else:
            keep.add(idx[0])
    return bad, [(k, m) for k, m in found if not (k in keep and m.startswith(CLOSER))]


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
        # #381 (2026-11-17): each of these built at a wrong size, or as if unset, with no error. Each is a
        # change to the committed file, so everything else in it stays as committed.
        real = json.load(open(os.path.join(HERE, 'logo-sizes.json')))
        cf = 'ih-10-at-highway-87-comfort'
        def edited(f):
            s = json.loads(json.dumps(real))
            f(s)
            return s
        bad381 = {
            'an every-map "*" under logos.scale': edited(lambda s: s['logos']['scale'].__setitem__('*', 3)),
            'a listing entry spelled "scales"': edited(lambda s: s['listings'].__setitem__(cf, {'why': 'x', 'scales': {'loves': 3}})),
            'a misspelled key under logos': edited(lambda s: s['logos'].__setitem__('scales', {'walmart': 2})),
            'a misspelled top-level key': edited(lambda s: s.__setitem__('listing', {})),
            'a scale of 0.01 (rounds to 0 px)': edited(lambda s: s['listings'][kv]['scale'].__setitem__('walmart', 0.01)),
            'default_px -22': edited(lambda s: s.__setitem__('default_px', -22)),
            'default_px 0': edited(lambda s: s.__setitem__('default_px', 0)),
            'default_px "22"': edited(lambda s: s.__setitem__('default_px', '22')),
            'default_px missing': edited(lambda s: s.pop('default_px')),
            'default_px 0.4 (rounds to 0 px)': edited(lambda s: s.__setitem__('default_px', 0.4)),
            'a listing scale that is a list': edited(lambda s: s['listings'][kv].__setitem__('scale', [1.25])),
        }
        through = []
        for what, spec in bad381.items():
            json.dump(spec, open(bad, 'w'))
            try:
                through.append(f'{what}: {logo_px(lg("walmart"), kv, sizes_path=bad)} px')
            except SystemExit:
                pass
            except Exception as e:  # a crash is not a refusal that names the problem
                through.append(f'{what}: crashed ({type(e).__name__})')
        check(not through, f'10sizes. #381: each edit that built wrongly with no error now stops the build: {through or "all refused"}')
        json.dump(real, open(bad, 'w'))
        check(logo_px(lg('whataburger'), kv, sizes_path=bad) == 28, '10sizes. #381: the committed file, copied, still builds (control for the refusals above)')


def instrument():
    """overlaps() on hand-made boxes.json records, so the line checks are proven on inputs where the
    answer is known (review round 1, 2026-11-16): a clean line passes; a line over a count, across
    another leader line, or over a road label fails; the site passes only for a horizontal line on a
    listing with siteLine; the dot's own box is excused."""
    logo = {'name': 'T', 'kind': 'logo', 'l': 200, 't': 90, 'r': 240, 'b': 110, 'dot': [100, 100], 'line': [100, 100, 200, 100], 'via': 'line', 'line_under': []}
    dot = {'kind': 'biz-dot', 'name': 'T', 'l': 95.2, 't': 95.2, 'r': 104.8, 'b': 104.8}
    # Since #380 every line in `segs` must be drawn by something, and every pin must have its stem: the
    # helper gives each extra seg the name label that draws it (no box, so it is not matched to a mark) and
    # each pin tag its stem, 9 px tall below the tag, as maps.mjs draws them, so the cases written before
    # #380 still test only what they name. owners=False and stems=False leave them out.
    def run(siteLine=False, marks=(), segs=(), drop=None, nomark=False, others=(), owners=True, stems=True, dropped=(), **kw):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, 'x.png')
            biz = {k: v for k, v in {**logo, **kw}.items() if v is not None}
            mine = [] if nomark else [{'kind': 'biz', **{k: biz[k] for k in 'ltrb'}}]
            drawers = [{'name': 'S', 'kind': 'name', 'dot': sg[:2], 'line': sg} for sg in segs] if owners else []
            stem = [{'kind': 'pin-stem', 'l': (m['l'] + m['r']) / 2 - 7, 't': m['b'], 'r': (m['l'] + m['r']) / 2 + 7, 'b': m['b'] + 9}
                    for m in marks if m['kind'] == 'pin'] if stems else []
            rec = {'businesses': [biz, *others, *drawers], 'marks': [dot, *mine, *marks, *stem], 'segs': [*([biz['line']] if biz.get('line') else []), *segs], 'siteLine': siteLine, 'dropped': list(dropped)}
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
        # Its dot moved from (320, 200) to (320, 178), beside the box, in #380: 30 px out with no line is
        # now a finding of its own ('a logo off its dot with no line', below).
        'one other logo, clear of it': (run(others=[{'name': 'U', 'kind': 'logo', 'l': 300, 't': 150, 'r': 340, 'b': 170, 'dot': [320, 178]}],
                                            marks=[{'kind': 'biz', 'l': 300, 't': 150, 'r': 340, 'b': 170}]), False),
        'a leader line 1 px clear of the box': (run(segs=[[241, 60, 241, 140]]), False),
        'a count under the box': (run(marks=[{'kind': 'aadt', 'l': 230, 't': 95, 'r': 260, 'b': 105}]), True),
        'a label 0.5 px from the box': (run(marks=[{'kind': 'label', 'l': 240.5, 't': 95, 'r': 270, 'b': 105}]), True),
        'a label 1.5 px from the box': (run(marks=[{'kind': 'label', 'l': 241.5, 't': 95, 'r': 270, 'b': 105}]), False),
        # Was False until #379's checker half (2026-11-17): a dot touching a logo box reads as its dot.
        'a business dot touching the box': (run(marks=[{'kind': 'biz-dot', 'name': 'B', 'l': 240, 't': 95, 'r': 249.6, 'b': 104.6}]), True),
        # #380 and #379's checker half, 2026-11-17. T's box is x 200-240, y 90-110, its dot (100, 100).
        'a logo off its dot with no line (X2)': (run(line=None, via='fixed'), True),
        'a line from somewhere other than its dot': (run(line=[110, 100, 200, 100]), True),
        'a line ending short of its box': (run(line=[100, 100, 190, 100]), True),
        'a business line missing from segs': (run(others=[{'name': 'N', 'kind': 'name', 'dot': [400, 400], 'line': [400, 400, 430, 400]}]), True),
        'a leader line in segs that nothing draws': (run(segs=[[500, 500, 520, 520]], owners=False), True),
        'a count 40 px from its point, its line not in segs (X1)': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 360]}]), True),
        'a count 40 px from its point, its line in segs': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 360]}], segs=[[320, 360, 320, 320]], owners=False), False),
        'an intersection label 40 px out, its line not in segs (X1)': (run(marks=[{'kind': 'ref', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 360]}]), True),
        'a count 13 px from its point, its line not in segs (review round 1)': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 333]}]), True),
        'a count 10 px from its point, no line': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 330]}]), False),
        'an intersection ring whose label has no point recorded': (run(marks=[{'kind': 'xring', 'l': 400, 't': 400, 'r': 417, 'b': 417}, {'kind': 'ref', 'l': 380, 't': 360, 'r': 440, 'b': 376}]), True),
        'an intersection ring whose label has its point': (run(marks=[{'kind': 'xring', 'l': 400, 't': 400, 'r': 417, 'b': 417}, {'kind': 'ref', 'l': 380, 't': 380, 'r': 440, 'b': 396, 'pt': [408.5, 408.5]}]), False),
        'a ring whose label was dropped (review round 2)': (run(marks=[{'kind': 'xring', 'l': 400, 't': 400, 'r': 417, 'b': 417}], dropped=['intersection X & Y']), False),
        'a stray line from a count\'s point (review round 3)': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320, 'pt': [320, 330]}], segs=[[320, 330, 400, 370]], owners=False), True),
        'a name off its dot with no line (review round 3)': (run(others=[{'name': 'N', 'kind': 'name', 'l': 400, 't': 400, 'r': 440, 'b': 412, 'dot': [420, 440]}], marks=[{'kind': 'biz', 'l': 400, 't': 400, 'r': 440, 'b': 412}]), True),
        'a name beside its dot': (run(others=[{'name': 'N', 'kind': 'name', 'l': 400, 't': 400, 'r': 440, 'b': 412, 'dot': [420, 420]}], marks=[{'kind': 'biz', 'l': 400, 't': 400, 'r': 440, 'b': 412}]), False),
        'a count with no point recorded': (run(marks=[{'kind': 'aadt', 'l': 300, 't': 300, 'r': 340, 'b': 320}]), True),
        'a line through the pin\'s stem': (run(marks=[{'kind': 'pin', 'l': 120, 't': 70, 'r': 170, 'b': 94}]), True),
        'a pin tag clear of the line, its stem too': (run(marks=[{'kind': 'pin', 'l': 120, 't': 40, 'r': 170, 'b': 64}]), False),
        'a pin with no stem recorded': (run(marks=[{'kind': 'pin', 'l': 120, 't': 40, 'r': 170, 'b': 64}], stems=False), True),
        'the north panel under the box': (run(marks=[{'kind': 'north', 'l': 230, 't': 14, 'r': 260, 'b': 91}]), True),
        'a count dot 6 px below the box': (run(marks=[{'kind': 'aadt-dot', 'l': 213.5, 't': 109.5, 'r': 226.5, 'b': 122.5}]), True),
        'the pin\'s dot 9 px from the box': (run(marks=[{'kind': 'pin-dot', 'l': 240, 't': 91, 'r': 258, 'b': 109}]), True),
        'a business dot 12 px from the box': (run(marks=[{'kind': 'biz-dot', 'name': 'B', 'l': 247.2, 't': 95.2, 'r': 256.8, 'b': 104.8}]), False),
        'a dot nearer the box than its own, no line': (run(line=None, via='fixed', dot=[196, 100], marks=[{'kind': 'xring', 'l': 236, 't': 92, 'r': 252, 'b': 108}]), True),
        'the logo\'s own box (its drawn mark, recorded once)': (run(), False),
        'no segs recorded': (run(drop='segs'), True),
        'no line_under recorded': (run(line_under=None), True),
    }
    bad = [k for k, (got, want) in cases.items() if bool(got) != want]
    check(not bad, f'11. overlaps() on hand-made records: {bad or "every case as expected"}')
    # Dove Canyon as option C drew it (#379, rendered 2026-11-17 from staging a19e66d): Costco's dot is 6.6 px
    # under the middle of the Walmart logo, and Ross's dot 5.3 px from Costco's. Each finding, and no other.
    dc = {'businesses': [
        {'name': 'Costco', 'kind': 'logo', 'l': 313.23, 't': 227.3, 'r': 393.51, 'b': 253.3, 'dot': [377.51, 193.3], 'line': [377.51, 193.3, 377.51, 227.3], 'line_under': []},
        {'name': 'Ross', 'kind': 'logo', 'l': 458.85, 't': 222.35, 'r': 520.74, 'b': 250.35, 'dot': [398.85, 236.35], 'line': [398.85, 236.35, 458.85, 236.35], 'line_under': []},
        {'name': 'Walmart Supercenter', 'kind': 'logo', 'l': 324.05, 't': 163.63, 'r': 404.33, 'b': 186.73, 'dot': [404.33, 155.63], 'line': None}],
        'marks': [{'kind': 'biz-dot', 'name': n, 'l': x - 4.8, 't': y - 4.8, 'r': x + 4.8, 'b': y + 4.8} for n, x, y in
                  (('Costco', 377.51, 193.3), ('Ross', 398.85, 236.35), ('Walmart Supercenter', 404.33, 155.63))],
        'segs': [[377.51, 193.3, 377.51, 227.3], [398.85, 236.35, 458.85, 236.35]], 'siteLine': False}
    dc['marks'] += [{'kind': 'biz', **{k: b[k] for k in 'ltrb'}} for b in dc['businesses']]
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, 'dc.png')
        json.dump(dc, open(p + '.boxes.json', 'w'))
        got = sorted(overlaps(p))
        want = ['Costco another dot (biz-dot Ross) within 9 px', 'Walmart Supercenter another dot (biz-dot Costco) closer than its own']
        check(got == want, f"11. Dove Canyon's option C Walmart and Costco (#379): {got}")
        # approved() on the same record: the committed list clears it; a missing, extra or changed finding,
        # another rule's finding listed, or a listed business not drawn as a logo, fails.
        dcu = 'loop-1604-at-dove-canyon'
        real = json.load(open(APPROVED))
        def appr(edit=None, extra=(), marks=()):
            spec = json.loads(json.dumps(real))
            if edit:
                edit(spec['listings'][dcu])
            q = os.path.join(t, 'appr.json')
            json.dump(spec, open(q, 'w'))
            r = os.path.join(t, 'dc2.png')
            json.dump({**dc, 'marks': dc['marks'] + list(marks)}, open(r + '.boxes.json', 'w'))
            try:
                bad, left = approved(dcu, r, overlaps(r, by_index=True) + list(extra), path=q)
                return bad + [m for _, m in left]
            except SystemExit as e:
                return [f'refused: {e}']
        acases = {
            'as committed': (appr(), False),
            'Costco not approved': (appr(lambda e: e.pop('Costco')), True),
            'a dot approved that the map lacks': (appr(lambda e: e['Costco']['dots'].append({'kind': 'pin-dot', 'px': 4})), True),
            'the approved dot 1 px nearer than listed': (appr(lambda e: e['Costco']['dots'][0].__setitem__('px', e['Costco']['dots'][0]['px'] + 1)), True),
            'the approved dot 0.4 px off (within tolerance)': (appr(lambda e: e['Costco']['dots'][0].__setitem__('px', e['Costco']['dots'][0]['px'] + 0.4)), False),
            'another business\'s dot in the listed one\'s place': (appr(lambda e: e['Costco']['dots'][0].__setitem__('name', 'Walmart Supercenter')), True),
            'another rule\'s finding on an approved logo': (appr(extra=[(2, 'over aadt')]), True),
            'a new count dot beside the approved Walmart logo': (appr(marks=[{'kind': 'aadt-dot', 'l': 330, 't': 188, 'r': 343, 'b': 201}]), True),
            'the approved dot slid 40 px along the box (review round 2)': (appr(lambda e: e['Walmart Supercenter']['dots'][0].__setitem__('at', [e['Walmart Supercenter']['dots'][0]['at'][0] - 40, e['Walmart Supercenter']['dots'][0]['at'][1]])), True),
            'the approved logo slid 3 px along its edge (review round 3)': (appr(lambda e: e['Walmart Supercenter'].__setitem__('box', [v + (3 if k in 'lr' else 0) for k, v in zip('ltrb', e['Walmart Supercenter']['box'])])), True),
            'NaN for an approved dot (review round 3)': (appr(lambda e: e['Costco']['dots'][0].update(px=float('nan'), at=[float('nan')] * 2)), True),
            'a malformed dot': (appr(lambda e: e['Costco']['dots'].append({'kind': 'aadt-dot', 'px': '4'})), True),
            'no why': (appr(lambda e: e['Costco'].pop('why')), True),
            'a listed business not on the map': (appr(lambda e: e.__setitem__('Target', {**e['Costco']})), True),
        }
    abad = [k for k, (g, w) in acases.items() if bool(g) != w]
    check(not abad, f'11. approved() (build/logo-check-approved.json): {abad or "every case as expected"}')


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
    # #381: logo_line_across_site must be a boolean; the string "false" was truthy and turned the line on.
    refused = []
    for v in ('false', 'true', 1, 0, None):
        try:
            make_jobs.site_jobs('loop-1604-at-dove-canyon', {**make_jobs.sites['loop-1604-at-dove-canyon'], 'logo_line_across_site': v})
        except SystemExit:
            refused.append(v)
    check(refused == ['false', 'true', 1, 0, None], f'10J. #381: logo_line_across_site that is not true or false stops the build (refused {refused})')
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
        # P (#380, 2026-11-17): IH 10 at 87 plus a test business whose dot is inside the site at about
        # (292, 163.5), level with the SITE pin's stem. Before the stem was taken, its logo's line was drawn
        # [292, 163.5, 368, 163.5] straight through the stem, and overlaps() passed it.
        jp = json.loads(json.dumps(jg))
        jp['businesses'].append({'name': 'Stem Test', 'lat': 29.984101823894836, 'lon': -98.90290373245251, 'logo': 'build/assets/logos/walmart.png', 'logo_px': 22})
        pv = os.path.join(t, 'P.png')
        json.dump([{**base, 'out': os.path.join(t, 'W.png')}, {**base, 'out': a}, {**base, 'out': a2}, {**jb, 'out': b}, {**jc, 'out': c},
                   {**json.load(open(DOVE)), 'out': dv}, {**json.load(open(KINGSVILLE)), 'out': kv}, {**jn, 'out': nn}, {**jm, 'out': mm},
                   {**jr, 'out': rr}, {**js, 'out': sv}, {**jg, 'out': gv}, {**jg0, 'out': g0},
                   {**json.load(open(STMARYS)), 'out': yv}, {**jp, 'out': pv}], open(jobs, 'w'))
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
        rp = json.load(open(pv + '.boxes.json'))
        st = {x['name']: x for x in rp['businesses']}.get('Stem Test')
        tag = next((m for m in rp['marks'] if m['kind'] == 'pin'), None)
        pdot = next((m for m in rp['marks'] if m['kind'] == 'pin-dot'), None)
        stem = next((m for m in rp['marks'] if m['kind'] == 'pin-stem'), None)
        level = bool(st and tag and pdot) and tag['b'] < st['dot'][1] < pdot['t'] and st['dot'][0] < tag['l']
        # Since the stem is taken, the logo finds no spot and the business keeps its name; with the stem not
        # taken, the logo is drawn on a line through it and 9P below fails (mutation P1).
        check(level and bool(stem),
              f"9P. the test dot is level with the pin's stem and left of it, so 9P is not vacuous (dot {st and [round(v, 1) for v in st['dot']]}, stem {stem and [round(stem[k], 1) for k in 'ltrb']}, kind {st and st['kind']})")
        # D, K and S are Dove Canyon and Kingsville as Erik approved them: their closer-dot findings are the ones
        # build/logo-check-approved.json lists, exactly (the operator's answer (a), 2026-11-17).
        uids = {'D': 'loop-1604-at-dove-canyon', 'K': 'highway-77-at-general-cavazos-kingsville', 'S': 'highway-77-at-general-cavazos-kingsville'}
        for k, png in (('B', b), ('C', c), ('D', dv), ('K', kv), ('N', nn), ('M', mm), ('R', rr), ('S', sv), ('G', gv), ('G0', g0), ('Y', yv), ('P', pv)):
            bad_ok, left = approved(uids.get(k), png, overlaps(png, by_index=True))
            rec = json.load(open(png + '.boxes.json'))
            ov = bad_ok + [m if i is None else f"{rec['businesses'][i]['name'][:24]} {m}" for i, m in left]
            check(ov == [], f'9{k}. no logo overlaps a count, ring, pin, label or dot{" (as approved)" if k in uids else ""}: {ov or "none"}')
            # Every logo line drawn is in `segs` (review round 4, 2026-11-17): positive evidence the
            # field is live, so an empty `segs` cannot pass the line checks on a map that has lines.
            rec = json.load(open(png + '.boxes.json'))
            lines = [x['line'] for x in rec['businesses'] if x.get('line')]
            gone = [ln for ln in lines if not any(all(abs(u - v) < 0.01 for u, v in zip(ln, sg)) for sg in rec['segs'])]
            check(not gone, f'9{k}. every business line, logo or name ({len(lines)}), is recorded in segs: {gone or "yes"}')
        recs = [json.load(open(png + '.boxes.json')) for png in (b, c, dv, kv, nn, mm, rr, sv, gv, g0, yv, pv)]
        allb = [x for r in recs for x in r['businesses'] if x.get('line')]
        nl, ll = sum(x['kind'] == 'logo' for x in allb), sum(x['kind'] == 'name' for x in allb)
        check(nl > 0 and ll > 0, f'9L. the 9x segs checks are not vacuous: {nl} logo lines and {ll} name lines drawn')
        # #380: the count and intersection-label line checks (X1), and the logo-to-dot tie (X2), have lines to
        # find in these renders, so a renderer that dropped them is caught here, not passed as a map without.
        lab = {k: sum(m['kind'] == k and 'pt' in m and box_dist(m['pt'], m) > LABEL_NEAR + 1 for r in recs for m in r['marks']) for k in ('aadt', 'ref')}
        far = sum(x['kind'] == 'logo' and x.get('via') != 'line' and box_dist(x['dot'], x) > LOGO_NEAR for x in allb)
        # No fixture puts a count far enough out to draw a line (three real maps do: logo_check.py checks
        # those, and check 11 a hand-made one); intersection labels draw them here.
        check(lab['ref'] > 0 and far > 0, f'9L. #380: the renders draw intersection-label lines ({lab["ref"]}; count lines {lab["aadt"]}) and logo lines from a fixed or ring spot ({far})')
    matching()
    sizes()
    instrument()
    job_path()
    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main()
