import base64, glob, io, json, os, re, subprocess, sys
import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)
N = json.load(open(os.path.join(HERE, 'filenames.json')))
PAIR_UID = 'loop-1604-at-dove-canyon'
NEW_UID = 'ih-35-at-wonderworld-san-marcos'


def page_png(pdf, needle=None, index=0):
    doc = pymupdf.open(pdf)
    if needle:
        index = next(i for i, p in enumerate(doc) if needle in p.get_text())
    return Image.open(io.BytesIO(doc[index].get_pixmap(dpi=130).tobytes('png')))


def uri(img, maxw=1300):
    img = img.convert('RGB')
    img.thumbnail((maxw, maxw * 2))
    b = io.BytesIO()
    img.save(b, 'JPEG', quality=86)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def svg(name):
    return 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(HERE, 'assets', name), 'rb').read()).decode()


def stats():
    packages = len(glob.glob(A('out', 'pdf', '*.pdf')))
    maps = len(glob.glob(A('maps', '*', '*.jpg')))
    typos = len(json.load(open(os.path.join(HERE, 'corrections.json'))))
    notes = open(A('review', 'review-notes.md')).read()
    decisions = notes.split('## Needs a decision', 1)[1].split('\n## ', 1)[0]
    items = len(re.findall(r'(?m)^- ', decisions))
    return packages, maps, typos, items


def main(facts):
    orig = lambda uid: A('originals', f'{uid}.pdf')
    new = lambda uid: A('out', 'pdf', N[uid] + '.pdf')
    W = svg('wordmark-garnet.svg')
    packages, maps, typos, items = stats()
    pages = [
        ('The cover', page_png(orig(PAIR_UID), index=0), 'Before', page_png(new(PAIR_UID)), 'After'),
        ('Specifications', page_png(orig(PAIR_UID), index=1), 'Before', page_png(new(PAIR_UID), index=1), 'After'),
        ('Location map', page_png(orig(PAIR_UID), 'Location Map'), 'Before', page_png(new(PAIR_UID), 'Location Map'), 'After'),
        ('Aerial', page_png(orig(PAIR_UID), index=5), 'Before', page_png(new(PAIR_UID), 'Aerial Map\n'), 'After · USGS imagery, county parcel boundary'),
        ('Traffic counts and flood zones', page_png(new(NEW_UID), 'Traffic Counts'), 'TxDOT 2025 traffic counts', page_png(new(NEW_UID), 'FEMA Flood Zones'), 'FEMA flood zones'),
    ]
    total = len(pages) + 1
    title = lambda uid: N[uid].split(',')[0]
    first = f'''<section class="pg"><div class="hd"><div><div class="mi">Listing package refresh</div><h1>{packages} listing packages, rebuilt in the new Roalson template</h1></div><img src="{W}"></div>
<div class="stats"><div><b>{packages}</b><span>packages rebuilt</span></div><div><b>{maps}</b><span>new maps and aerials</span></div><div><b>{facts:,}</b><span>facts checked against the originals</span></div><div><b>{typos}</b><span>typos corrected</span></div><div><b>{items}</b><span>items flagged for a broker decision</span></div></div>
<div class="cols"><div><h3>In every package</h3><ul>
<li>The approved Land and Existing Property templates, with the contact details added to the cover header.</li>
<li><b>New location and area maps</b> in the website's own map style, with nearby businesses labelled.</li>
<li><b>New high-resolution aerials</b> from USGS orthoimagery (public domain), with site boundaries drawn from county appraisal records.</li>
<li><b>New traffic exhibit</b> with TxDOT's latest counts at the stations nearest each site.</li>
<li><b>New FEMA flood exhibit</b> with a plain-language finding for each site.</li>
</ul></div><div><h3>Cleaned up along the way</h3><ul>
<li>Surveys, site plans and floor plans carried over at full resolution. Landscape drawings get landscape pages.</li>
<li>Current office address on every disclosure page. Wrong broker emails corrected.</li>
<li>A QR code on each package linking to the listing on the new website.</li>
<li>The TREC Information About Brokerage Services form is appended exactly as published.</li>
<li>Searchable, tagged PDFs sized for email.</li>
</ul></div></div><div class="ft">1 of {total}</div></section>'''
    rest = ''
    for i, (t, a, la, b, lb) in enumerate(pages):
        sub = title(PAIR_UID) if i < 4 else title(NEW_UID)
        ey = 'Before and after' if i < 4 else 'New in every package'
        rest += f'''<section class="pg"><div class="hd"><div><div class="mi">{ey} · {sub}</div><h2>{t}</h2></div><img src="{W}"></div>
<div class="duo"><div><div class="lab">{la}</div><img src="{uri(a)}"></div><div><div class="lab g">{lb}</div><img src="{uri(b)}"></div></div><div class="ft">{i + 2} of {total}</div></section>'''
    css = open(os.path.join(HERE, 'showcase.css')).read()
    fonts = open(os.path.join(HERE, 'assets', 'fonts.css')).read()
    src = A('out', 'showcase.html')
    open(src, 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>Listing Package Refresh — Before and After</title><style>{fonts}{css}</style></head><body>{first}{rest}</body></html>')
    subprocess.run(['node', os.path.join(HERE, 'printland.mjs'), src, A('out', '01 - Before and After.pdf')], check=True)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 3040)
