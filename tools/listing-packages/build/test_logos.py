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
     R  build/test/fixture-bandera-job.json: Sam's Club is drawn as a logo on the second pass or
        later (`pass`), once another logo has moved off its name's spot.
     N  the Hwy 46 fixture plus a test business whose name is too long for the map: its logo is
        drawn anyway, its dot is back on the map (read from the map's dot layer), and nothing
        protected lies under it. A second business of the same name, with no room even for its
        logo, neither takes that dot away nor gets a bare dot of its own.
     M  the Hwy 46 fixture plus a test business with a long name beside the IH 10 count: its logo is
        drawn within 15 px of a count or its dot, so check 9M has something to catch.
  9. In every render above, no logo overlaps a count or its dot, an intersection label or ring, the
     pin, another business's label, or any business dot: maps.mjs records each one's final box in
     boxes.json (`marks`), since they are HTML or a circle layer that `under` cannot see.
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


def overlaps(png):
    """Every (logo, mark) pair whose boxes overlap, from boxes.json's `marks` (the logo's own box excluded)."""
    d = json.load(open(png + '.boxes.json'))
    out = []
    for b in d['businesses']:
        if b['kind'] != 'logo':
            continue
        for m in d['marks']:
            if m['kind'] == 'biz' and all(abs(m[k] - b[k]) < 0.5 for k in 'ltrb'):
                continue
            # place() keeps 3 px around every label, count and pin, and a ring 1 px on two sides, so those
            # need 1 px of air; dots
            # are kept clear by under a pixel (a business dot by 0.2 px, a count dot by 0.5), so they
            # need only not overlap.
            g = 0 if m['kind'] in ('biz-dot', 'aadt-dot') else 1
            if m['l'] - g < b['r'] and m['r'] + g > b['l'] and m['t'] - g < b['b'] and m['b'] + g > b['t']:
                out.append(f"{b['name'][:24]} over {m['kind']}")
    return out


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
        json.dump([{**base, 'out': os.path.join(t, 'W.png')}, {**base, 'out': a}, {**base, 'out': a2}, {**jb, 'out': b}, {**jc, 'out': c},
                   {**json.load(open(DOVE)), 'out': dv}, {**json.load(open(KINGSVILLE)), 'out': kv}, {**jn, 'out': nn}, {**jm, 'out': mm},
                   {**json.load(open(BANDERA)), 'out': rr}], open(jobs, 'w'))
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
        for k, png in (('B', b), ('C', c), ('D', dv), ('K', kv), ('N', nn), ('M', mm), ('R', rr)):
            ov = overlaps(png)
            check(ov == [], f'9{k}. no logo overlaps a count, ring, pin, label or dot: {ov or "none"}')
    matching()
    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main()
