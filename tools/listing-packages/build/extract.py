import json, os, re, sys
import pymupdf
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)


def page_images(page):
    return [i for i in page.get_image_info(xrefs=True) if i['xref']]


def save_xref(doc, xref, dest):
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha >= 4:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if pix.alpha:
        pix = pymupdf.Pixmap(pix, 0)
    pix.save(dest)


def cover_photo(doc, dest, trim=0):
    infos = page_images(doc[0])
    area = lambda i: (i['bbox'][2] - i['bbox'][0]) * (i['bbox'][3] - i['bbox'][1])
    cands = [i for i in infos if not (i['bbox'][2] - i['bbox'][0] > 560 and i['bbox'][3] - i['bbox'][1] > 700) and (i['bbox'][2] - i['bbox'][0]) > 150]
    cands.sort(key=area, reverse=True)
    save_xref(doc, cands[0]['xref'], dest)
    if trim:
        im = Image.open(dest).convert('RGB')
        im.crop((trim, trim, im.width - trim, im.height - trim)).save(dest)


def content_rect(page):
    boxes, native = [], 0
    for i in page.get_image_info(xrefs=True):
        b = pymupdf.Rect(i['bbox'])
        if b.width > 560 and b.height > 700:
            continue
        if min(b.width, b.height) < 80:
            continue
        boxes.append(b)
        native = max(native, i['width'] / max(b.width, 1) * 72)
    if not boxes:
        return None, 300
    u = boxes[0]
    for b in boxes[1:]:
        u |= b
    return u * page.rotation_matrix, native


def exhibit(doc, pno, dest):
    page = doc[pno - 1]
    r, native = content_rect(page)
    r = pymupdf.Rect(r).normalize() & page.rect
    dpi = int(min(300, max(220, native)))
    page.get_pixmap(clip=r, dpi=dpi).save(dest)
    im = Image.open(dest).convert('RGB')
    bb = ImageOps.invert(im.convert('L')).point(lambda v: 255 if v > 28 else 0).getbbox()
    if bb:
        pad = int(0.012 * max(im.size))
        bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad))
        if (bb[2] - bb[0]) * (bb[3] - bb[1]) < 0.92 * im.width * im.height:
            im = im.crop(bb)
    im.save(dest)


def build(uid, plan):
    doc = pymupdf.open(A('originals', f'{uid}.pdf'))
    paths = [plan.get('cover')] + plan.get('photos', []) + [c['img'] for c in plan.get('carry', [])]
    for rel in [p for p in paths if p and not p.startswith('build/')]:
        dest = A(rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        name = os.path.basename(rel)
        if rel.startswith('photos/'):
            m = re.match(rf'{re.escape(uid)}-p(\d+)-(\d+)\.png$', name)
            page = doc[int(m.group(1)) - 1]
            save_xref(doc, page_images(page)[int(m.group(2))]['xref'], dest)
        elif rel.startswith('covers/'):
            cover_photo(doc, dest, trim=6 if name.endswith('-trim.png') else 0)
        elif rel.startswith('exhibits/'):
            exhibit(doc, int(re.search(r'-p(\d+)\.png$', name).group(1)), dest)
        else:
            raise SystemExit(f'{uid}: no recipe for {rel}')
        print(uid, rel)


if __name__ == '__main__':
    plans = json.load(open(A('build', 'plans.json')))
    for uid in (sys.argv[1:] or sorted(plans)):
        build(uid, plans.get(uid, {}))
