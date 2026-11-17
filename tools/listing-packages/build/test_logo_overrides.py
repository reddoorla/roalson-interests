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
     forced that no override names fails. On hand-made records (review round 1, 2026-11-17): a forced
     logo and a rule-placed logo whose names share their first 24 characters each keep their own findings,
     so the rule-placed one's break is left to fail; a finding recorded on another logo that the forced
     one covers is left to fail too; a forced box past the map's margins is the break "outside the open
     map"; a forced name drawn twice fails.
  4. lib/logos.forced() stops the build on a listing geo/sites.json and geo/map-only.json lack, an `at`
     that is not two numbers, and an override without `why`, `flag` or `breaks`, or with a break that is
     not a string.
  5. lib/pois.businesses(): at 5001 Walzem, Builder's Mark Home Improvement is in the tiles and among the
     businesses without `exclude`, and absent with it; excluding a name not in the tiles stops the build.
  6. build/make_jobs.py's site_jobs, the real job path: 5001 Walzem's traffic job has no Builder's Mark;
     IH 10 at Menger Springs' has Whataburger; each of the four forced logos in build/logo-overrides.json
     reaches its job as `force` with its `at`, and no other business on those maps is forced; and
     lib/mapjobs.py stops when an override names a business the map does not show, or a name two
     businesses on the map share, and when an exclusion has no `why`; lib/pois.py stops on a name
     excluded twice.
  7. build/swap_area_map.py's under_ok(), the guard that refuses to put a map with something protected
     under a logo into Erik's PDF: a forced logo covering exactly its override's "under" layers passes;
     one more or one fewer layer fails; a rule-placed logo with anything under it fails, even one whose
     name has an override; a forced logo no override names fails when it covers anything (one that
     covers nothing passes this guard, and logo_check.allowed() fails it).
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
        ci = next((i for i, b in enumerate(rf['businesses']) if b['name'] == name), None)
        found = overlaps(kf, by_index=True)
        exact = sorted({m for i, m in found if i == ci} | {f'under {x}' for x in (c or {}).get('under', [])})
        run = lambda w, png=kf, fd=found: logo_check.allowed('x', png, list(fd), want=w)[0]
        check(bool(exact), f'3. control: the forced CHRISTUS breaks something to allow ({exact})')
        check(run({name: {'breaks': exact}}) == [], '3. the exact list of breaks passes')
        check(bool(exact) and run({name: {'breaks': exact[1:]}}) != [], '3. a break missing from the list fails')
        check(run({name: {'breaks': exact + ['under road_motorway_test']}}) != [], '3. an extra listed break fails')
        check(run({name: {'breaks': exact}, 'Walmart Supercenter': {'breaks': []}}) != [], '3. a forced name not drawn forced fails')
        check(run({}) != [], '3. a logo drawn forced that no override names fails')

        # Hand-made records.
        def rec(bs, w=672, h=690):
            p = os.path.join(t, f'h{len(os.listdir(t))}.png')
            json.dump({'width': w, 'height': h, 'dpr': 2.5, 'businesses': bs, 'marks': [], 'segs': [], 'dropped': []}, open(p + '.boxes.json', 'w'))
            return p
        box = lambda l, t_, **k: {'kind': 'logo', 'l': l, 't': t_, 'r': l + 40, 'b': t_ + 28, 'line': None, 'under': [], 'dot': [l, t_], **k}
        a, b2 = 'UTSA Downtown Campus - Buena Vista District', 'UTSA Downtown Campus - Business Building'
        p = rec([box(100, 100, name=a, via='forced'), box(300, 300, name=b2, via='fixed')])
        bad, left, _ = logo_check.allowed('x', p, [(0, 'over biz'), (1, 'over biz')], want={a: {'breaks': ['over biz']}})
        check(bad == [] and left == [(1, 'over biz')], f'3. a 24-character name prefix shared with a rule-placed logo: the forced one\'s break is allowed, the other\'s is left to fail ({bad}, {left})')
        bad, left, _ = logo_check.allowed('x', p, [(1, 'over biz')], want={a: {'breaks': []}})
        check(bad == [] and left == [(1, 'over biz')], f'3. a finding recorded on the logo a forced one covers is left to fail ({left})')
        p = rec([box(100, 30, name=a, via='forced')])
        bad, _, _ = logo_check.allowed('x', p, [], want={a: {'breaks': []}})
        check(bool(bad) and logo_check.allowed('x', p, [], want={a: {'breaks': ['outside the open map']}})[0] == [], f'3. a forced box above the top margin is the break "outside the open map" ({bad})')
        p = rec([box(100, 100, name=a, via='forced'), box(300, 300, name=a, via='forced')])
        check(logo_check.allowed('x', p, [], want={a: {'breaks': []}})[0] != [], '3. a forced name drawn twice fails')

        # 4. Validation.
        def stops(spec):
            p = os.path.join(t, 'ov.json')
            json.dump(spec, open(p, 'w'))
            try:
                L.forced('urban-loop-road', path=p)
            except SystemExit:
                return True
            return False
        ok = {'at': [1, 2], 'why': 'w', 'flag': 'f', 'breaks': []}
        check(not stops({'listings': {'urban-loop-road': {'logos': {'X': ok}}}}), '4. control: a well-formed override loads')
        check(stops({'listings': {'no-such-listing': {'logos': {'X': ok}}}}), '4. an unknown listing stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {**ok, 'at': [1]}}}}}), '4. an `at` of one number stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {**ok, 'at': [True, 2]}}}}}), '4. a boolean in `at` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {k: v for k, v in ok.items() if k != 'breaks'}}}}}), '4. an override without `breaks` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {k: v for k, v in ok.items() if k != 'why'}}}}}), '4. an override without `why` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {k: v for k, v in ok.items() if k != 'flag'}}}}}), '4. an override without `flag` stops the build')
        check(stops({'listings': {'urban-loop-road': {'logos': {'X': {**ok, 'breaks': [1]}}}}}), '4. a break that is not a string stops the build')

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
    try:
        pois.businesses(bounds, site, (), exclude=[bm, bm])
        stopped = False
    except SystemExit:
        stopped = True
    check(stopped, '5. excluding one name twice stops the build')

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
    def stops_job(uid, site, fake):
        # lib/logos.with_logo reads logos.forced, and lib/mapjobs.py its own import of it: patch both.
        real_l = L.forced
        mapjobs.forced = L.forced = fake
        try:
            make_jobs.site_jobs(uid, site)
            return False
        except SystemExit:
            return True
        finally:
            mapjobs.forced, L.forced = real, real_l
    # Kingsville shows one Whataburger; a second, added by hand at another spot, shares its name.
    kg = json.loads(json.dumps(sites['highway-77-at-general-cavazos-kingsville']))
    kg['manual_businesses'] = [{'name': 'Whataburger', 'lat': 27.4950, 'lon': -97.8560}]
    one = lambda uid: {'Whataburger': {'at': [0, 0], 'why': 'w', 'breaks': []}}
    check(not stops_job('highway-77-at-general-cavazos-kingsville', sites['highway-77-at-general-cavazos-kingsville'], one), '6. control: forcing Kingsville\'s one Whataburger builds')
    check(stops_job('highway-77-at-general-cavazos-kingsville', kg, one), '6. forcing a name two businesses on the map share stops the build')
    wz = json.loads(json.dumps(sites['5001-walzem-road']))
    wz['exclude_businesses'] = [{'name': bm}]
    try:
        make_jobs.site_jobs('5001-walzem-road', wz)
        stopped = False
    except SystemExit:
        stopped = True
    check(stopped, '6. an exclusion with no why stops the build')

    # 7. The swap guard.
    from swap_area_map import under_ok
    w = {'X': {'breaks': ['under road_motorway', 'line over pin']}}
    check(under_ok({'name': 'X', 'via': 'forced', 'under': ['road_motorway']}, w), '7. a forced logo covering exactly its listed layer passes')
    check(not under_ok({'name': 'X', 'via': 'forced', 'under': ['road_motorway', 'road_link']}, w), '7. one more layer fails')
    check(not under_ok({'name': 'X', 'via': 'forced', 'under': []}, w), '7. one fewer layer fails')
    check(not under_ok({'name': 'X', 'via': 'ring', 'under': ['road_motorway']}, w), '7. a rule-placed logo with something under it fails, though its name has an override')
    check(not under_ok({'name': 'Y', 'via': 'forced', 'under': ['road_motorway']}, w), '7. a forced logo no override names, covering something, fails')
    check(under_ok({'name': 'Y', 'via': 'fixed', 'under': []}, w), '7. control: a rule-placed logo with nothing under it passes')

    print(f'{len(fails)} failed' if fails else 'all passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
