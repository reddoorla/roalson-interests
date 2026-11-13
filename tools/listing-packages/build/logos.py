"""Turn the logos in Erik's Dropbox folder into the PNGs the Area Map draws.

usage: python3 build/logos.py <folder of Erik's logo files>

`build/logos.json` names each logo's source file and the business names (as OpenStreetMap
spells them, or as a listing's `manual_businesses` does) it stands for. This script reads each
source (.eps through Ghostscript; .ai, .pdf and .svg through PyMuPDF; .png as is), trims the
transparent or white margin, and writes `build/assets/logos/<slug>.png` at HEIGHT pixels tall.
The PNGs are committed, so a rebuild does not need Ghostscript or the Dropbox folder.
"""
import json, os, subprocess, sys, tempfile

import numpy as np
import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)
HEIGHT = 160
WHITE = 244  # a pixel this light in every channel counts as artboard margin


def rasterize(src):
    ext = os.path.splitext(src)[1].lower()
    if ext == '.eps':
        with tempfile.TemporaryDirectory() as t:
            out = os.path.join(t, 'x.png')
            subprocess.run(['gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop', '-sDEVICE=pngalpha', '-r600', '-o', out, src], check=True)
            Image.MAX_IMAGE_PIXELS = None
            return Image.open(out).convert('RGBA')
    if ext in ('.ai', '.pdf', '.svg'):
        page = pymupdf.open(src)[0]
        z = 2400 / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=True)
        return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
    if ext == '.png':
        return Image.open(src).convert('RGBA')
    raise SystemExit(f'{src}: no reader for {ext}')


def trim(im):
    """Crop to the pixels that are neither transparent nor near-white artboard."""
    a = np.asarray(im)
    w, h = im.size
    ink = (a[..., 3] > 24) & ~((a[..., :3] >= WHITE).all(axis=2))
    box = Image.fromarray((ink * 255).astype('uint8')).getbbox()
    if not box:
        raise SystemExit('logo is blank')
    pad = max(2, round(0.04 * max(box[2] - box[0], box[3] - box[1])))
    return im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)))


def main(folder):
    spec = json.load(open(A('build', 'logos.json')))
    os.makedirs(A('build', 'assets', 'logos'), exist_ok=True)
    for lg in spec['logos']:
        im = rasterize(os.path.join(folder, lg['source']))
        im.thumbnail((4000, 1600))
        im = trim(im)
        im = im.resize((max(1, round(im.width * HEIGHT / im.height)), HEIGHT), Image.LANCZOS)
        im.save(A(lg['file']), optimize=True)
        print(lg['file'], im.size, '←', lg['source'])


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
