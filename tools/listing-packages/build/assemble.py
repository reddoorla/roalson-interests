import json, os, sys, re
import pymupdf
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)
def fname(d):
    return json.load(open(A('build', 'filenames.json')))[d['uid']] + '.pdf'
def assemble(uid):
    d = json.load(open(A('data', f'{uid}.json')))
    body = pymupdf.open(A('out', 'html', f'{uid}.body.pdf'))
    orig = pymupdf.open(A('originals', f'{uid}.pdf'))
    iabs = [p['page'] for p in d['pages'] if p['kind'] == 'iabs']
    pno = (iabs[-1] if iabs else len(orig)) - 1
    if pno >= len(orig) or 'Information About Brokerage Services' not in orig[pno].get_text():
        found = [i for i in range(len(orig)) if 'Information About Brokerage Services' in orig[i].get_text()]
        assert found, f'{uid}: no IABS page in the original'
        print(f'{uid}: IABS not at page {pno + 1} of the original (its data pages describe another file); using page {found[-1] + 1}')
        pno = found[-1]
    body.insert_pdf(orig, from_page=pno, to_page=pno)
    body.set_metadata({'title': f"{d['title']} — {d['city']}", 'author': 'Roalson Interests', 'subject': f"{d['transaction']} · {d['type_label']} · Listing package",
                       'keywords': 'Roalson Interests, commercial real estate, San Antonio', 'creator': 'Roalson Interests', 'producer': 'Roalson Interests'})
    toc = []
    os.makedirs(A('out', 'pdf'), exist_ok=True)
    out = A('out', 'pdf', fname(d))
    body.save(out, garbage=4, deflate=True, clean=True)
    return out, len(body)
if __name__ == '__main__':
    for uid in sys.argv[1:]:
        out, n = assemble(uid)
        print(uid, n, 'pages', os.path.getsize(out) // 1024, 'KB', os.path.basename(out))
