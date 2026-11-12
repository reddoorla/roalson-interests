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
  6. lib/logos.py matches the listed names only: "Lowe's Market" (the grocer) is not Lowe's.
Needs network (OpenFreeMap tiles), like every map render. Exits 1 on any failure.
"""
import json, os, subprocess, sys, tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'test', 'fixture-traffic-job.json')
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


def matching():
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
    from logos import with_logo, _index
    idx = _index()
    expect = {"Lowe's": 'lowes', "Lowe's Market": None, 'H-E-B plus!': 'heb', 'H-E-B': 'heb', 'The Home Depot': 'home-depot',
              'Walmart Supercenter': 'walmart', "Chili's": None, 'James Avery Jewelry': None}
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
        json.dump([{**base, 'out': os.path.join(t, 'W.png')}, {**base, 'out': a}, {**base, 'out': a2}, {**jb, 'out': b}, {**jc, 'out': c}], open(jobs, 'w'))
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
    matching()
    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main()
