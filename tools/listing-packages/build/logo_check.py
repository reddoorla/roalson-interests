"""Check every listing's Area Map with its logos against the same map without them.

usage: python3 build/make_jobs.py && python3 build/logo_check.py [uid ...]

For each listing's traffic map in build/jobs-all.json, renders the job twice as PNG into
qa/logos/<uid>/ (once with every logo stripped, once as the build renders it, after a warm-up
render) and reports:
  - each business: logo, name (its logo did not fit, or it has none), or dropped;
  - pixels that differ by more than test_logos.JITTER outside the swapped label and logo boxes.
    A count above SPECKS means a road, road label, count or other label moved or vanished, and
    the script exits 1. Below it is antialiasing: on 2026-11-12, IH 10 at Highway 46 differed in 7
    pixels on one row of a count box's border (at most 51/255), the box itself unmoved, while a
    vanished road label or count changes hundreds.
Writes qa/logos/report.json, and a side-by-side qa/logos/<uid>/compare.png per listing.
"""
import json, os, subprocess, sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from test_logos import JITTER, mask_for

A = lambda *p: os.path.join(ROOT, *p)
SPECKS = 40


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
        mask = mask_for(B0.shape, meta['dpr'], items)
        delta = np.abs(B0 - B1).max(axis=2)
        n = int(((delta > JITTER) & ~mask).sum())
        covered = {b['name']: b['under'] for b in swapped if b.get('under')}
        bad += n > SPECKS or bool(covered)
        report[uid] = {
            'logo': sorted(b['name'] for b in swapped),
            'logo_no_room': sorted(b['name'] for b in bx1.values() if b['kind'] == 'name' and b['logo']),
            'name': sorted(b['name'] for b in bx1.values() if b['kind'] == 'name' and not b['logo']),
            'changed_outside_boxes': n,
            'drawn_under_a_logo': covered,
            'largest_difference_outside_boxes': int((delta * ~mask).max()),
        }
        w = B0.shape[1]
        c = Image.new('RGB', (w * 2 + 20, B0.shape[0]), 'white')
        c.paste(Image.open(before).convert('RGB'), (0, 0))
        c.paste(Image.open(after).convert('RGB'), (w + 20, 0))
        c.save(os.path.join(os.path.dirname(before), 'compare.png'))
        print(uid.ljust(42), 'logos', report[uid]['logo'], '| no room', report[uid]['logo_no_room'], '| changed', n, '| under a logo', covered or '-')
    json.dump(report, open(A('qa', 'logos', 'report.json'), 'w'), indent=1)
    if bad:
        sys.exit(f'{bad} map(s) changed outside the logo boxes')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
