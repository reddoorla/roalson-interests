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
    assert 'Information About Brokerage Services' in orig[pno].get_text(), f'{uid}: IABS page not found at {pno + 1}'
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
