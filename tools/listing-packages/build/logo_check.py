"""Check every listing's Area Map with its logos against the same map without them.

usage: python3 build/make_jobs.py && python3 build/logo_check.py [uid ...]

For each listing's traffic map in build/jobs-all.json, renders the job twice as PNG into
qa/logos/<uid>/ (once with every logo stripped, once as the build renders it, after a warm-up
render) and reports:
  - each business: logo, name (its logo did not fit, or it has none), or dropped; a logo whose
    business had no room even for its name and was left off is listed under logo_left_off;
  - pixels that differ by more than test_logos.JITTER outside the swapped label and logo boxes.
    A count above SPECKS means a road, road label, count or other label moved or vanished, and
    the script exits 1. So does anything protected recorded under a logo (`under`), a logo over a
    count, its dot, an intersection label or ring, the pin, another label or a business dot, or a
    logo's leader line over one of those, across another leader line (`segs`), or over a symbol or
    the site (`line_under`; the site only for a horizontal line where siteLine is set), a logo box
    over another leader line, a record missing `segs` or a line's `line_under` (review round 3,
    2026-11-17), or a logo whose record differs from its drawn box or has none (rounds 4 and 5):
    those are test_logos.overlaps, from boxes.json. So does a logo file that would not
    decode (`dropped` says "unreadable"), which would otherwise read as a logo with no room. Below it is antialiasing: on 2026-11-12, IH 10 at Highway 46 differed in 7
    pixels on one row of a count box's border (at most 51/255), the box itself unmoved, while a
    vanished road label or count changes hundreds.
A logo drawn at a forced spot (build/logo-overrides.json, Erik's 11-17 asks, 2026-11-17) may break exactly
the rules its override lists in `breaks`, in this script's words; any difference fails (allowed()).
Writes qa/logos/report.json, and a side-by-side qa/logos/<uid>/compare.png per listing.
"""
import json, os, subprocess, sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from test_logos import JITTER, mask_for, overlaps

sys.path.insert(0, os.path.join(ROOT, 'lib'))
from logos import forced

A = lambda *p: os.path.join(ROOT, *p)
SPECKS = 40


def allowed(uid, after, over, covered, want=None):
    """Takes the breaks build/logo-overrides.json allows on `uid` out of `over` and `covered`, and returns
    what fails: a forced logo that is not drawn at its forced spot, or whose breaks differ in any way from
    the override's list (2026-11-17, Erik's 11-17 asks). The allowance names the listing, the business and
    each break, word for word: a break not listed fails, and so does a listed break the map no longer has."""
    want = forced(uid) if want is None else want
    drawn = {b['name']: b for b in json.load(open(after + '.boxes.json'))['businesses']}
    bad = []
    for b in drawn.values():
        if b.get('via') == 'forced' and b['name'] not in want:
            bad.append(f"{b['name']}: drawn at a forced spot no override names")
    for name, o in want.items():
        if drawn.get(name, {}).get('via') != 'forced':
            bad.append(f'{name}: not drawn at its forced spot')
            continue
        pre = name[:24] + ' '
        got = {s[len(pre):] for s in over if s.startswith(pre)} | {f'under {lid}' for lid in covered.pop(name, [])}
        over[:] = [s for s in over if not s.startswith(pre)]
        if got != set(o['breaks']):
            bad.append(f"{name}: breaks {sorted(got)}, but build/logo-overrides.json allows {sorted(o['breaks'])}")
    return bad


def main(only):
    jobs = [j for j in json.load(open(A('build', 'jobs-all.json'))) if j['out'].endswith('/traffic.jpg')]
    jobs = [j for j in jobs if not only or j['out'].split('/')[-2] in only]
    run, pairs = [], []
    for j in jobs:
        uid = j['out'].split('/')[-2]
        d = A('qa', 'logos', uid)
        os.makedirs(d, exist_ok=True)
        bare = json.loads(json.dumps(j))
        for b in bare['businesses']:
            b.pop('logo', None)
            b.pop('logo_sha', None)
        # The bare render is only the comparison; `strict` guards the map that is delivered, which `after`
        # still renders with it. On Hwy 46 West, Whataburger's logo has room but its name does not (2026-11-17).
        bare.pop('strict', None)
        before, after = os.path.join(d, 'before.png'), os.path.join(d, 'after.png')
        if not run:
            run.append({**bare, 'out': os.path.join(d, 'warmup.png')})
        run += [{**bare, 'out': before}, {**j, 'out': after}]
        pairs.append((uid, before, after))
    spec = A('qa', 'logos', 'jobs.json')
    json.dump(run, open(spec, 'w'))
    r = subprocess.run(['node', A('build', 'maps.mjs'), spec, '--force'], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-3000:])
    report, bad = {}, 0
    for uid, before, after in pairs:
        B0 = np.asarray(Image.open(before).convert('RGB')).astype(int)
        B1 = np.asarray(Image.open(after).convert('RGB')).astype(int)
        key = lambda b: (b['name'], round(b['dot'][0]), round(b['dot'][1]))  # two of one chain can share a map
        bx0 = {key(b): b for b in json.load(open(before + '.boxes.json'))['businesses']}
        meta = json.load(open(after + '.boxes.json'))
        bx1 = {key(b): b for b in meta['businesses']}
        swapped = [b for b in bx1.values() if b['kind'] == 'logo']
        items = swapped + [b['was'] for b in swapped if b.get('was')] + [bx0[key(b)] for b in swapped if key(b) in bx0]
        # A logo whose name had no room brings its dot back too (maps.mjs: 3.4 px plus a 1.4 px stroke).
        items += [{'l': b['dot'][0] - 6, 't': b['dot'][1] - 6, 'r': b['dot'][0] + 6, 'b': b['dot'][1] + 6} for b in swapped if not b.get('was')]
        mask = mask_for(B0.shape, meta['dpr'], items)
        delta = np.abs(B0 - B1).max(axis=2)
        n = int(((delta > JITTER) & ~mask).sum())
        # A logo box with no `under` record came from a renderer before that record existed.
        covered = {b['name']: b.get('under', 'not recorded') for b in swapped if b.get('under', 'not recorded')}
        # A logo over a count, its dot, an intersection label or ring, the pin, another label or a business
        # dot: these are HTML or a circle layer, which `under` cannot see (2026-11-16: with that rule
        # broken for scaled logos, four maps put a logo over a count, the pin or a label and this script
        # still passed).
        over = overlaps(after)
        # A logo file that would not decode drops off like a logo with no room; it must not pass as one
        # (review round 3, 2026-11-17).
        unreadable = sorted(d for d in meta['dropped'] if 'unreadable' in d)
        # Erik's 11-17 asks: a forced logo may break exactly the rules its override lists, no more, no fewer.
        forced_bad = allowed(uid, after, over, covered)
        bad += n > SPECKS or bool(covered) or bool(over) or bool(unreadable) or bool(forced_bad)
        report[uid] = {
            'logo': sorted(b['name'] for b in swapped),
            'logo_no_room': sorted(b['name'] for b in bx1.values() if b['kind'] == 'name' and b['logo']),
            'logo_left_off': sorted(d[5:].split(' (')[0] for d in meta['dropped'] if d.startswith('logo ') and 'left off' in d),
            'name': sorted(b['name'] for b in bx1.values() if b['kind'] == 'name' and not b['logo']),
            'changed_outside_boxes': n,
            'drawn_under_a_logo': covered,
            'logo_over_a_mark': over,
            'logo_unreadable': unreadable,
            'forced': {b['name']: b.get('under', []) for b in swapped if b.get('via') == 'forced'},
            'forced_mismatch': forced_bad,
            'largest_difference_outside_boxes': int((delta * ~mask).max()),
        }
        w = B0.shape[1]
        c = Image.new('RGB', (w * 2 + 20, B0.shape[0]), 'white')
        c.paste(Image.open(before).convert('RGB'), (0, 0))
        c.paste(Image.open(after).convert('RGB'), (w + 20, 0))
        c.save(os.path.join(os.path.dirname(before), 'compare.png'))
        print(uid.ljust(42), 'logos', report[uid]['logo'], '| no room', report[uid]['logo_no_room'], '| left off', report[uid]['logo_left_off'], '| changed', n, '| under a logo', covered or '-', '| over a mark', over or '-', '| unreadable', unreadable or '-', '| forced', report[uid]['forced'] and sorted(report[uid]['forced']) or '-', '| forced mismatch', forced_bad or '-')
    json.dump(report, open(A('qa', 'logos', 'report.json'), 'w'), indent=1)
    if bad:
        sys.exit(f'{bad} map(s) changed outside the logo boxes, have something protected under a logo, or have a logo over a count, pin, label, dot or leader line, or have a logo file that would not decode, or break other rules than build/logo-overrides.json allows')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
