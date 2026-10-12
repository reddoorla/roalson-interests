import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = 'https://roalson-interests.cdn.prismic.io/api/v2'


def curl_json(url, params=None):
    args = ['curl', '-sS', '-f', '-m', '60', '-G', url]
    for k, v in (params or {}).items():
        args += ['--data-urlencode', f'{k}={v}']
    return json.loads(subprocess.run(args, check=True, capture_output=True, text=True).stdout)


def main(only):
    ref = curl_json(API)['refs'][0]['ref']
    res = curl_json(API + '/documents/search', {'ref': ref, 'q': '[[at(document.type,"property")]]', 'pageSize': '100'})
    out = os.path.join(ROOT, 'originals')
    os.makedirs(out, exist_ok=True)
    listing = {}
    for doc in res['results']:
        uid = doc['uid']
        pdf = (doc['data'].get('package_pdf') or {})
        listing[uid] = {k: doc['data'].get(k) for k in ('title', 'category', 'status', 'transaction_type', 'total_price', 'price_per_unit', 'size_label', 'acres', 'zoning', 'location')}
        if only and uid not in only:
            continue
        if not pdf.get('url'):
            print('no package_pdf', uid)
            continue
        dest = os.path.join(out, f'{uid}.pdf')
        if os.path.exists(dest) and os.path.getsize(dest) == int(pdf.get('size') or -1):
            continue
        subprocess.run(['curl', '-sS', '-f', '-m', '300', '-o', dest, pdf['url']], check=True)
        print('fetched', uid, os.path.getsize(dest))
    json.dump(listing, open(os.path.join(out, 'prismic.json'), 'w'), indent=1)
    print(len(res['results']), 'properties')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
