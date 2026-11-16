"""Put this generator's Area Map with Traffic Counts into a package someone has edited by hand.

usage: python3 build/swap_area_map.py <uid> <their.pdf> <out.pdf>

Since 2026-10-14 Erik edits the delivered packages by hand (contact blocks, prices, sizes), and none
of that is in data/. A full rebuild would revert him, so for the area-map logos the operator chose
(reddoor-workspace decisions/2026-11-12-2308-roalson-logo-review-set-keeps-eriks-edits.md) to
replace only the map image on that page of his PDF with maps/<uid>/traffic.jpg, as the generator
renders it now. Nothing is drawn over a map: the whole image is the generator's. Every other byte
of his page and of every other page is kept.

It refuses unless his PDF has exactly one Area Map with Traffic Counts page, whose largest image
has the generator map's pixel size, so a page laid out some other way is never touched.
"""
import hashlib, json, os, sys

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TITLE = 'Area Map with Traffic Counts'


def swap(uid, src, out):
    new = os.path.join(ROOT, 'maps', uid, 'traffic.jpg')
    if os.path.abspath(out) == os.path.abspath(src):
        sys.exit(f'{uid}: write to a new file, not over {src}')
    # maps.mjs writes the stamp only for a map that rendered completely; the map must be at least
    # as new as the logo assignment in build/logos.json.
    if not os.path.exists(new + '.job.json') or os.path.getmtime(new) < os.path.getmtime(os.path.join(HERE, 'logos.json')):
        sys.exit(f'{uid}: {new} is unstamped or older than build/logos.json; run make_jobs.py and maps.mjs first')
    renderer = hashlib.sha1(open(os.path.join(HERE, 'maps.mjs'), 'rb').read()).hexdigest()[:12]
    if os.path.exists(new + '.job.json') and json.load(open(new + '.job.json')).get('renderer') != renderer:
        sys.exit(f'{uid}: {new} was drawn by another version of maps.mjs; render it again first')
    rec = json.load(open(new + '.boxes.json')) if os.path.exists(new + '.boxes.json') else None
    if not rec or any(b['kind'] == 'logo' and b.get('under') != [] for b in rec['businesses']):
        sys.exit(f'{uid}: {new}.boxes.json is missing, or a logo has something protected under it or no record of it')
    doc = pymupdf.open(src)
    pages = [p for p in doc if TITLE in p.get_text()]
    if len(pages) != 1:
        sys.exit(f'{uid}: {len(pages)} "{TITLE}" pages in {src}; expected 1')
    page = pages[0]
    img = max(page.get_image_info(xrefs=True), key=lambda i: i['width'] * i['height'])
    over = [i for i in page.get_image_info(xrefs=True) if i['xref'] != img['xref'] and pymupdf.Rect(i['bbox']).intersects(pymupdf.Rect(img['bbox']))]
    if over:
        sys.exit(f'{uid}: {len(over)} other image(s) sit on the map on page {page.number + 1} (hand-placed logos?); not swapped')
    size = Image.open(new).size
    if (img['width'], img['height']) != size:
        sys.exit(f"{uid}: the map on page {page.number + 1} is {img['width']}x{img['height']}, the generator's is {size[0]}x{size[1]}; not swapped")
    # Every image on the page with the map's size and the displayed map's pixels is replaced, not
    # only the xref get_image_info names. A package saved again after an earlier swap can hold two
    # identical copies of the map, one drawn (`/X51 Do`) and one only listed in the page's resources,
    # and get_image_info then names the copy that is not drawn: 5001 Walzem Road, 2026-11-16, where
    # replacing that one alone left Erik's old map on the page (the proof below caught it).
    shown = pymupdf.Pixmap(doc, img['xref']).tobytes('png')
    want = pymupdf.Pixmap(new).tobytes('png')
    if shown == want:
        print(f'{uid}: the map on page {page.number + 1} of {src} is already {new}; nothing written')
        sys.exit(0)
    copies = [x[0] for x in page.get_images(full=True) if (x[2], x[3]) == size and pymupdf.Pixmap(doc, x[0]).tobytes('png') == shown]
    # replace_image changes the image everywhere in the file, so an image another page also uses (the
    # map copied onto another page by hand) would change there too (review round 1). Refuse instead.
    shared = sorted({o.number + 1 for o in doc if o.number != page.number for x in o.get_images(full=True) if x[0] in copies})
    if shared:
        sys.exit(f'{uid}: the map on page {page.number + 1} is also used on page(s) {shared}; not swapped')
    for x in copies:
        page.replace_image(x, filename=new)
    doc.save(out, garbage=3, deflate=True)

    def fail(msg):
        # A file that failed its proof is never left where it could be uploaded.
        os.remove(out)
        sys.exit(msg)

    # Prove it: the same pages with the same text, and that page's map is now the generator's.
    a, b = pymupdf.open(src), pymupdf.open(out)
    if len(a) != len(b) or any(x.get_text() != y.get_text() for x, y in zip(a, b)):
        fail(f'{uid}: {out} does not keep the text of every page of {src}')
    got = max(b[page.number].get_image_info(xrefs=True), key=lambda i: i['width'] * i['height'])
    if pymupdf.Pixmap(b, got['xref']).tobytes('png') != want:
        fail(f'{uid}: the map in {out} is not {new}')
    # And no image of the map's size on that page still holds the old map, whichever one is drawn.
    if any(pymupdf.Pixmap(b, x[0]).tobytes('png') == shown for x in b[page.number].get_images(full=True) if (x[2], x[3]) == size):
        fail(f'{uid}: {out} still holds the old map on page {page.number + 1}')
    # And every other page looks exactly as it did, as does the map page outside the map's box.
    for x, y in zip(a, b):
        pa, pb = x.get_pixmap(dpi=50), y.get_pixmap(dpi=50)
        if x.number == page.number:
            for pm in (pa, pb):
                r = pymupdf.Rect(img['bbox']) * (50 / 72)
                pm.set_rect(pymupdf.IRect(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1), (0, 0, 0) if pm.n == 3 else (0,) * pm.n)
        if pa.samples != pb.samples:
            fail(f'{uid}: page {x.number + 1} of {out} does not look like page {x.number + 1} of {src}')
    return page.number + 1


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    n = swap(*sys.argv[1:])
    print(sys.argv[1], 'map swapped on page', n, '->', sys.argv[3])
