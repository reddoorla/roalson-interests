import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from strings(x)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in ('qa_notes', 'pages', 'uid'):
                yield from strings(v)


def main(path):
    bad = 0
    for c in json.load(open(path)):
        d = json.load(open(A('data', f"{c['uid']}.json")))
        n = sum(s.count(c['find']) for s in strings(d[c['scope']] if c.get('scope') else d))
        if n == 0:
            bad += 1
            print(f"NO MATCH  {c['uid']}: {c['find'][:70]!r}")
        elif n > 1 and c.get('scope') == 'rows':
            print(f"{n} matches {c['uid']}: {c['find'][:70]!r}")
    print(f'{bad} correction(s) match nothing')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else A('build', 'corrections.json')))
