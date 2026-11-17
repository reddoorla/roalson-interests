"""Erik's 11-17 asks: forced logo spots, the exact allowance for their breaks, and excluded businesses.

usage: python3 build/test_logo_overrides.py

The operator let Erik's seven 11-17 asks break the placement rules ("just try and make the best result
possible and flag it"). Four logos are drawn at a set spot from build/logo-overrides.json, and Builder's
Mark is excluded from 5001 Walzem through geo/sites.json exclude_businesses. Renders through the real
maps.mjs (needs network for tiles, like every map render) and checks:

  1. KN: the Kingsville fixture with CHRISTUS's logo removed. KF: the same fixture with CHRISTUS forced at
     [0, -70] from its dot.
     a. CHRISTUS is a logo in KF, drawn `via` 'forced', its box centred exactly at the dot plus `at`.
     b. Its leader line runs from its dot to the nearest point of its box.
     c. Every other business in KF has the same record (box, kind, via, line) as in KN: a forced logo is
        drawn after every other logo, so it moves nothing else. The rule-placed logos are tried while
        the forced business still shows its name, as they are on KN.
     d. Its own `biz` mark matches its record (test_logos.overlaps finds no "drawn box" problem).
  2. KL: the Kingsville fixture plus a business whose name fits nowhere, with a logo forced at [60, 0]:
     the logo is drawn, its dot is back on the map (read from the dot layer), and it is not in `dropped`.
  3. logo_check.allowed() on KF's own record: the exact list of breaks passes; one break missing from the
     list fails; one extra listed break fails; a forced name that is not drawn forced fails; a logo drawn
     forced that no override names fails.
  4. lib/logos.forced() stops the build on a listing geo/sites.json and geo/map-only.json lack, an `at`
     that is not two numbers, and an override without `why` or `breaks`.
  5. lib/pois.businesses(): at 5001 Walzem, Builder's Mark Home Improvement is in the tiles and among the
     businesses without `exclude`, and absent with it; excluding a name not in the tiles stops the build.
  6. build/make_jobs.py's site_jobs, the real job path: 5001 Walzem's traffic job has no Builder's Mark;
     IH 10 at Menger Springs' has Whataburger; each of the four forced logos in build/logo-overrides.json
     reaches its job as `force` with its `at`, and no other business on those maps is forced; and
     lib/mapjobs.py stops when an override names a business the map does not show.
Exits 1 on any failure.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'lib'))
from test_logos import KINGSVILLE, LONG, check, fails, overlaps, render
import logo_check
import logos as L
import pois
import mapjobs

FORCE_AT = [0, -70]


def recs(png):
    return json.load(open(png + '.boxes.json'))


def main():
    os.chdir(ROOT)
    k = json.load(open(KINGSVILLE))
    with tempfile.TemporaryDirectory() as t:
        kn, kf, kl = (os.path.join(t, f'{x}.png') for x in ('KN', 'KF', 'KL'))
        jn = json.loads(json.dumps(k))
        jf = json.loads(json.dumps(k))
        for b in jn['businesses']:
            if b['name'].startswith('CHRISTUS'):
                b.pop('logo'); b.pop('logo_sha')
        for b in jf['businesses']:
            if b['name'].startswith('CHRISTUS'):
                b['force'] = {'at': FORCE_AT}
        jl = json.loads(json.dumps(k))
        jl['businesses'].append({'name': LONG, 'lat': 27.4915, 'lon': -97.8540, 'logo': 'build/assets/logos/whataburger.png', 'force': {'at': [60, 0]}})
        jobs = os.path.join(t, 'jobs.json')
        json.dump([{**k, 'out': os.path.join(t, 'W.png')}, {**jn, 'out': kn}, {**jf, 'out': kf}, {**jl, 'out': kl}], open(jobs, 'w'))
        render(jobs)

        rf, rn = recs(kf), recs(kn)
        c = next((b for b in rf['businesses'] if b['name'].startswith('CHRISTUS')), None)
        check(bool(c) and c['kind'] == 'logo' and c.get('via') == 'forced', f"1a. CHRISTUS is drawn as a forced logo (kind={c and c['kind']}, via={c and c.get('via')})")
        if c:
            cx, cy = (c['l'] + c['r']) / 2, (c['t'] + c['b']) / 2
            want = (c['dot'][0] + FORCE_AT[0], c['dot'][1] + FORCE_AT[1])
            check(abs(cx - want[0]) < 0.01 and abs(cy - want[1]) < 0.01, f'1a. its box is centred at the dot plus `at`: centre ({cx:.2f}, {cy:.2f}), wanted ({want[0]:.2f}, {want[1]:.2f})')
            ln = c.get('line')
            near = ln and (max(c['l'], min(c['dot'][0], c['r'])), max(c['t'], min(c['dot'][1], c['b'])))
            check(bool(ln) and abs(ln[0] - c['dot'][0]) < 0.01 and abs(ln[1] - c['dot'][1]) < 0.01 and abs(ln[2] - near[0]) < 0.01 and abs(ln[3] - near[1]) < 0.01,
                  f'1b. its leader line runs from the dot to the nearest point of its box ({ln})')
            check(any(abs(s[0] - c['dot'][0]) < 0.01 and abs(s[3] - near[1]) < 0.01 for s in rf['segs']), '1b. the line is in segs')
        key = lambda b: {k: b.get(k) for k in ('name', 'kind', 'l', 't', 'r', 'b', 'via', 'line', 'pass')}
        others_f = [key(b) for b in rf['businesses'] if not b['name'].startswith('CHRISTUS')]
        others_n = [key(b) for b in rn['businesses'] if not b['name'].startswith('CHRISTUS')]
        check(others_f == others_n and len(others_f) == 3, f'1c. the other three businesses have the same records as with CHRISTUS unforced and logo-less ({len(others_f)} compared)')
        over = overlaps(kf)
        check(not any('drawn box' in o or 'recorded box' in o for o in over), f'1d. the forced logo\'s record is its drawn box ({[o for o in over if "box" in o]})')

        rl = recs(kl)
        lg = next((b for b in rl['businesses'] if b['name'] == LONG), None)
        dots = [m for m in rl['marks'] if m['kind'] == 'biz-dot' and m.get('name') == LONG]
        check(bool(lg) and lg['kind'] == 'logo' and lg.get('via') == 'forced' and len(dots) == 1 and not any(LONG in d for d in rl['dropped']),
              f"2. a forced logo whose name fits nowhere is drawn, with its dot back ({lg and lg.get('via')}, {len(dots)} dot, dropped {[d[:30] for d in rl['dropped']]})")

        # 3. The allowance is exact.
        name = c['name'] if c else 'CHRISTUS Spohn Hospital - Kleberg'
        pre = name[:24] + ' '
        under = {name: c.get('under')} if c and c.get('under') else {}
        exact = sorted({o[len(pre):] for o in over if o.startswith(pre)} | {f'under {x}' for x in under.get(name, [])})
        run = lambda w: logo_check.allowed('x', kf, list(over), dict(under), want=w)
        check(bool(exact), f'3. control: the forced CHRISTUS breaks something to allow ({exact})')
        check(run({name: {'breaks': exact}}) == [], '3. the exact list of breaks passes')
        check(bool(exact) and run({name: {'breaks': exact[1:]}}) != [], '3. a break missing from the list fails')
        check(run({name: {'breaks': exact + ['under road_motorway_test']}}) != [], '3. an extra listed break fails')
        check(run({name: {'breaks': exact}, 'Walmart Supercenter': {'breaks': []}}) != [], '3. a forced name not drawn forced fails')
        check(run({}) != [], '3. a logo drawn forced that no override names fails')

        # 4. Validation.
        def stops(spec):
            p = os.path.join(t, 'ov.json')
            json.dump(spec, open(p, 'w'))
            try:
                L.forced('urban-loop-road', path=p)
            except SystemExit:
                return True
            return False
        ok = {'at': [1, 2], 'why': 'w', 'breaks': []}
        check(not stops({'listings': {'urban-loop-road': {'logos': {'X': ok}}}}), '4. control: a well-formed override loads')
        check(stops({'listings': {'no-such-listing': {'logos': {'X': ok}}}}), '4. an unknown listing stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {**ok, 'at': [1]}}}}}), '4. an `at` of one number stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {**ok, 'at': [True, 2]}}}}}), '4. a boolean in `at` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {k: v for k, v in ok.items() if k != 'breaks'}}}}}), '4. an override without `breaks` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {k: v for k, v in ok.items() if k != 'why'}}}}}), '4. an override without `why` stops the build')

    # 5. Excluding a business, on the real tiles at 5001 Walzem.
    import make_jobs
    sites = json.load(open(os.path.join(ROOT, 'geo', 'sites.json')))
    J, _, _ = make_jobs.site_jobs('5001-walzem-road', sites['5001-walzem-road'])
    tj = next(j for j in J if j['out'].endswith('/traffic.jpg'))
    bounds, site = tj['bounds'], tj['center']
    bm = "Builder's Mark Home Improvement"
    with_bm, _ = pois.businesses(bounds, site, ())
    without, _ = pois.businesses(bounds, site, (), exclude=[bm])
    check(bm in [b['name'] for b in with_bm], f'5. control: {bm} is in the tiles and among the businesses without exclude')
    check(bm not in [b['name'] for b in without], f'5. with exclude it is not')
    try:
        pois.businesses(bounds, site, (), exclude=['No Such Store Anywhere'])
        stopped = False
    except SystemExit:
        stopped = True
    check(stopped, '5. excluding a name not in the tiles stops the build')

    # 6. The real job path.
    check(bm not in [b['name'] for b in tj['businesses']], '6. 5001 Walzem\'s traffic job has no Builder\'s Mark')
    J, _, _ = make_jobs.site_jobs('ih-10-at-menger-springs', sites['ih-10-at-menger-springs'])
    tj = next(j for j in J if j['out'].endswith('/traffic.jpg'))
    check('Whataburger' in [b['name'] for b in tj['businesses']], '6. IH 10 at Menger Springs\' traffic job has Whataburger')
    spec = json.load(open(os.path.join(HERE, 'logo-overrides.json')))['listings']
    for uid, o in spec.items():
        J, _, _ = make_jobs.site_jobs(uid, sites[uid])
        tj = next(j for j in J if j['out'].endswith('/traffic.jpg'))
        got = {b['name']: b['force']['at'] for b in tj['businesses'] if b.get('force')}
        check(got == {n: v['at'] for n, v in o['logos'].items()}, f'6. {uid}: the job forces exactly {sorted(o["logos"])} at their `at` ({got})')
    real = mapjobs.forced
    mapjobs.forced = lambda uid: {'Nowhere On This Map': {'at': [0, 0], 'why': 'w', 'breaks': []}}
    try:
        make_jobs.site_jobs('5001-walzem-road', sites['5001-walzem-road'])
        stopped = False
    except SystemExit:
        stopped = True
    finally:
        mapjobs.forced = real
    check(stopped, '6. an override naming a business the map does not show stops the build')

    print(f'{len(fails)} failed' if fails else 'all passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
