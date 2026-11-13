"""Map-only sites (build/map_only.py, geo/map-only.json): one traffic map, at a fixed frame and pixel size.

usage: python3 build/test_map_only.py

Uses the real entry, Hwy 46 West Development Site, whose map is swapped into Erik's own PDF:

  1. map_only.jobs gives exactly one job, the traffic map, with the entry's center and zoom and no
     bounds to fit, and heightPx from the entry.
  2. Its counts are the pinned TxDOT stations, in the entry's order (the three his facts row quotes).
  3. Its businesses are the listed names, in order. business_limit caps the anchors added after them
     (the listed names are always kept): two names with a limit of 2 give exactly those two, where
     the default limit adds anchors from the frame (H-E-B plus!, Walmart, Methodist are all anchors).
  4. A station id that is not near the site stops the build, naming it; so does an empty traffic_ids
     (the generator never picks a map-only site's counts itself), and a listed business the tiles lack.
  5. A uid in both geo/sites.json and geo/map-only.json is refused.
  6. Rendered through maps.mjs (after a warm-up), the map is 1680 x height_px, and its rows are
     the top rows of the same map rendered at full height: cut, never rescaled. Two renders of one map
     differ by antialiasing only (test_logos.JITTER); a 1725-to-1724 rescale moves every edge.
     The same cut written as JPEG (the real traffic.jpg path) is a JPEG of that size matching the PNG
     to within JPEG loss, and a heightPx taller than the map or not a whole number fails the render.
  7. In that render each count dot sits where the entry's frame projects its station (within 1 px),
     so the frame is the entry's and not one fitted to the bounds.
Needs network (TxDOT, OpenFreeMap tiles), like every map render. Exits 1 on any failure.
"""
import copy, json, math, os, subprocess, sys, tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import map_only
from test_logos import JITTER

UID = 'hwy-46-west-development-site'
fails = []


def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok:
        fails.append(what)


def project(view, lat, lon, width, height):
    k = 512 * 2 ** view['zoom']
    merc = lambda la, lo: ((lo + 180) / 360, 0.5 - math.log((1 + math.sin(math.radians(la))) / (1 - math.sin(math.radians(la)))) / (4 * math.pi))
    cx, cy = merc(*view['center'])
    x, y = merc(lat, lon)
    return (x - cx) * k + width / 2, (y - cy) * k + height / 2


def count_dots(png, dpr):
    """Centres (CSS px) of the filled garnet count dots: 9 px discs with a white ring, 20 to 25 device px."""
    a = np.asarray(Image.open(png).convert('RGB')).astype(int)
    g = (np.abs(a[..., 0] - 101) < 30) & (np.abs(a[..., 1] - 35) < 30) & (np.abs(a[..., 2] - 35) < 30)
    lab, _ = ndimage.label(g)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if 19 <= h <= 25 and 19 <= w <= 25 and abs(h - w) <= 2 and (lab[sl] == i + 1).mean() > 0.65:
            cy, cx = ndimage.center_of_mass(lab[sl] == i + 1)
            out.append(((sl[1].start + cx + 0.5) / dpr, (sl[0].start + cy + 0.5) / dpr))
    return out


def main():
    entry = json.load(open(map_only.PATH))[UID]
    tmp = tempfile.mkdtemp()
    J = map_only.jobs(UID, entry, outdir=tmp)
    check(len(J) == 1 and J[0]['out'].endswith('/traffic.jpg'), f'1. one job, the traffic map ({[os.path.basename(j["out"]) for j in J]})')
    j = J[0]
    check(not any(k in j for k in ('bounds', 'padding', 'maxZoom')) and j['center'] == entry['view']['center'] and j['zoom'] == entry['view']['zoom'],
          f"1. the entry's fixed frame (center {j['center']}, zoom {j.get('zoom')}, bounds {j.get('bounds')})")
    check(j.get('heightPx') == entry['height_px'], f"1. heightPx {j.get('heightPx')} is the entry's {entry['height_px']}")

    sys.path.insert(0, os.path.join(ROOT, 'lib'))
    from traffic import stations
    by = {s['id']: s for s in stations(UID, entry['site'][0], entry['site'][1], 4000)}
    want = [(f"{by[i]['qty']:,}", by[i]['lat'], by[i]['lon']) for i in entry['traffic_ids']]
    got = [(t['qty'], t['lat'], t['lon']) for t in j['traffic']]
    check(got == want, f'2. counts are the pinned stations in order: {[g[0] for g in got]} (want {[w[0] for w in want]})')

    names = [b['name'] for b in j['businesses']]
    check(names == entry['businesses'][:len(names)] and len(names) >= 4, f'3. businesses are the listed names, in order: {names}')
    pair = entry['businesses'][:2]
    two = map_only.jobs(UID, dict(entry, businesses=pair, business_limit=2), outdir=tmp)[0]
    more = map_only.jobs(UID, dict(entry, businesses=pair, business_limit=6), outdir=tmp)[0]
    check([b['name'] for b in two['businesses']] == pair and len(more['businesses']) > 2,
          f"3. business_limit 2 keeps {[b['name'] for b in two['businesses']]}; limit 6 adds anchors ({len(more['businesses'])} businesses)")

    try:
        map_only.jobs(UID, dict(entry, traffic_ids=entry['traffic_ids'] + ['999X99']), outdir=tmp)
        check(False, '4. a station id not near the site stops the build')
    except SystemExit as e:
        check('999X99' in str(e), f'4. a station id not near the site stops the build ({e})')

    for bad, what in [(dict(entry, traffic_ids=[]), 'traffic_ids'), (dict(entry, businesses=entry['businesses'] + ['No Such Store 999']), 'No Such Store 999')]:
        try:
            map_only.jobs(UID, bad, outdir=tmp)
            check(False, f'4. {what} stops the build')
        except SystemExit as e:
            check(what in str(e), f'4. {what} stops the build ({e})')

    try:
        map_only.load({UID: {}})
        check(False, '5. a uid in both files is refused')
    except SystemExit as e:
        check(UID in str(e), f'5. a uid in both files is refused ({e})')

    full = copy.deepcopy(j)
    full.pop('heightPx')
    run = [dict(full, out=os.path.join(tmp, 'W.png')), dict(full, out=os.path.join(tmp, 'full.png')), dict(j, out=os.path.join(tmp, 'cut.png')), dict(j, out=os.path.join(tmp, 'cut.jpg'))]
    spec = os.path.join(tmp, 'jobs.json')
    json.dump(run, open(spec, 'w'))
    r = subprocess.run(['node', os.path.join(HERE, 'maps.mjs'), spec, '--force'], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'maps.mjs exited {r.returncode}:\n{r.stderr[-2000:]}')
    F = np.asarray(Image.open(os.path.join(tmp, 'full.png')).convert('RGB')).astype(int)
    C = np.asarray(Image.open(os.path.join(tmp, 'cut.png')).convert('RGB')).astype(int)
    w_px = round(j['width'] * j['dpr'])
    check(C.shape[:2] == (entry['height_px'], w_px), f"6. the map is {C.shape[1]}x{C.shape[0]} (want {w_px}x{entry['height_px']})")
    n = min(C.shape[0], F.shape[0])
    off = int((np.abs(F[:n] - C[:n]).max(axis=2) > JITTER).sum()) if C.shape[1] == F.shape[1] else -1
    check(F.shape[0] > C.shape[0] and off == 0, f'6. its rows are the top {n} rows of the full-height render ({off} pixels differ by more than {JITTER})')

    jpg = os.path.join(tmp, 'cut.jpg')
    J8 = Image.open(jpg)
    loss = float(np.abs(np.asarray(J8.convert('RGB')).astype(int) - C).mean()) if J8.size == (C.shape[1], C.shape[0]) else 99
    check(open(jpg, 'rb').read(3) == b'\xff\xd8\xff' and J8.format == 'JPEG' and loss < 1.5,
          f'6. the .jpg cut is a {J8.format} of {J8.size[0]}x{J8.size[1]} within JPEG loss of the PNG (mean difference {loss:.2f}/255)')
    for h in (round(j['height'] * j['dpr']) + 1, entry['height_px'] + 0.5):
        spec2 = os.path.join(tmp, 'bad.json')
        json.dump([dict(j, out=os.path.join(tmp, 'bad.png'), heightPx=h)], open(spec2, 'w'))
        r2 = subprocess.run(['node', os.path.join(HERE, 'maps.mjs'), spec2, '--force'], capture_output=True, text=True)
        check(r2.returncode != 0 and 'whole number of pixels' in r2.stderr and not os.path.exists(os.path.join(tmp, 'bad.png')), f'6. heightPx {h} fails the render')

    dots = count_dots(os.path.join(tmp, 'cut.png'), j['dpr'])
    worst = []
    for t in j['traffic']:
        px = project(entry['view'], t['lat'], t['lon'], j['width'], j['height'])
        worst.append(min((math.hypot(px[0] - d[0], px[1] - d[1]) for d in dots), default=99))
    check(len(worst) == 3 and max(worst) <= 1.0, f"7. each count dot is where the entry's frame puts its station (off by {[round(w, 2) for w in worst]} px)")

    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main()
