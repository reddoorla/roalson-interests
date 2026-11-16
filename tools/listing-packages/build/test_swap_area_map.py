"""swap_area_map.py on a package saved again after an earlier swap.

usage: python3 build/test_swap_area_map.py [uid]

Needs a rendered, stamped maps/<uid>/traffic.jpg (make_jobs.py, then maps.mjs); the default uid is
loop-1604-at-dove-canyon. Builds two one-page PDFs titled "Area Map with Traffic Counts", each with
an old map image of the generator's size:

  plain   the map drawn once.
  copied  the map drawn once and an identical copy listed in the page's resources but not drawn,
          which is how Erik's 5001 Walzem Road package stood on 2026-11-16, after our 11-13 swap and
          his editor's save. PyMuPDF's get_image_info names the copy, not the drawn image.

Checks, for each: the swap succeeds, and every image of the map's size on that page is the new
map, so whichever one the page draws, it is not the old map. Exits 1 on any failure.
"""
import io, os, subprocess, sys, tempfile

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
fails = []


def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok:
        fails.append(what)


def build(path, size, copied):
    b = io.BytesIO()
    Image.new('RGB', size, (200, 180, 160)).save(b, 'JPEG')
    doc = pymupdf.open()
    pg = doc.new_page(width=612, height=792)
    pg.insert_text((54, 90), 'Area Map with Traffic Counts', fontsize=14)
    x1 = pg.insert_image(pymupdf.Rect(54, 116.25, 558, 633.75), stream=b.getvalue())
    if copied:
        x2 = doc.get_new_xref()
        doc.update_object(x2, doc.xref_object(x1))
        doc.update_stream(x2, doc.xref_stream_raw(x1), compress=False)
        doc.xref_set_key(x2, 'Filter', '/DCTDecode')
        res = int(doc.xref_get_key(pg.xref, 'Resources')[1].split()[0])
        doc.xref_set_key(res, 'XObject', doc.xref_get_key(res, 'XObject')[1][:-2] + f'/fzImg9 {x2} 0 R>>')
    doc.save(path)
    return x1


def main(uid):
    new = os.path.join(ROOT, 'maps', uid, 'traffic.jpg')
    size = Image.open(new).size
    want = pymupdf.Pixmap(new).tobytes('png')
    with tempfile.TemporaryDirectory() as t:
        for case in ('plain', 'copied'):
            src, out = os.path.join(t, f'{case}.pdf'), os.path.join(t, f'{case}-out.pdf')
            drawn = build(src, size, case == 'copied')
            if case == 'copied':
                named = [i['xref'] for i in pymupdf.open(src)[0].get_image_info(xrefs=True)]
                check(named != [drawn], f'control: get_image_info names the undrawn copy here, as on 5001 Walzem ({named}, drawn {drawn})')
            r = subprocess.run([sys.executable, os.path.join(HERE, 'swap_area_map.py'), uid, src, out], capture_output=True, text=True)
            check(r.returncode == 0, f'{case}: the swap succeeds ({(r.stdout + r.stderr).strip()[-160:]})')
            if r.returncode == 0:
                imgs = [x[0] for x in pymupdf.open(out)[0].get_images(full=True) if (x[2], x[3]) == size]
                same = [pymupdf.Pixmap(pymupdf.open(out), x).tobytes('png') == want for x in imgs]
                check(bool(imgs) and all(same), f'{case}: every map-sized image on the page is the new map ({sum(same)} of {len(imgs)})')
    if fails:
        sys.exit(f'{len(fails)} check(s) failed')
    print('all checks passed')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'loop-1604-at-dove-canyon')
