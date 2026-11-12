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
import os, sys

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TITLE = 'Area Map with Traffic Counts'


def swap(uid, src, out):
    new = os.path.join(ROOT, 'maps', uid, 'traffic.jpg')
    doc = pymupdf.open(src)
    pages = [p for p in doc if TITLE in p.get_text()]
    if len(pages) != 1:
        sys.exit(f'{uid}: {len(pages)} "{TITLE}" pages in {src}; expected 1')
    page = pages[0]
    img = max(page.get_image_info(xrefs=True), key=lambda i: i['width'] * i['height'])
    size = Image.open(new).size
    if (img['width'], img['height']) != size:
        sys.exit(f"{uid}: the map on page {page.number + 1} is {img['width']}x{img['height']}, the generator's is {size[0]}x{size[1]}; not swapped")
    page.replace_image(img['xref'], filename=new)
    doc.save(out, garbage=3, deflate=True)
    # Prove it: the same pages with the same text, and that page's map is now the generator's.
    a, b = pymupdf.open(src), pymupdf.open(out)
    if len(a) != len(b) or any(x.get_text() != y.get_text() for x, y in zip(a, b)):
        sys.exit(f'{uid}: {out} does not keep the text of every page of {src}')
    got = max(b[page.number].get_image_info(xrefs=True), key=lambda i: i['width'] * i['height'])
    if pymupdf.Pixmap(b, got['xref']).tobytes('png') != pymupdf.Pixmap(new).tobytes('png'):
        sys.exit(f'{uid}: the map in {out} is not {new}')
    return page.number + 1


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    n = swap(*sys.argv[1:])
    print(sys.argv[1], 'map swapped on page', n, '->', sys.argv[3])
