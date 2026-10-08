import json, os, re, sys, html, base64, io
import pymupdf
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)
esc = lambda s: html.escape(str(s), quote=True)

SITE_BASE = 'https://www.roalson.com/properties/'
TODAY = 'September 2026'

DISCLOSURE = [
    "As to the subject property, Roalson Interests (\"Broker\") makes no warranties, representations or guarantees regarding the structural integrity, soundness or suitability, for any purpose, of any improvements which may be located on the property. Furthermore, Broker makes no warranties, representations or guarantees regarding any prior uses of the property or the nature and condition of the property, including, without limitation, (1) the water, soil and geology and the existence of any environmental hazards or conditions thereon (including, but not limited to, the presence of underground storage tanks, asbestos, radon, contaminated soil or hazardous substances), or the property's compliance with any applicable laws rules or regulations regarding such substances; and (2) the compliance of the property or its operation (past, present or future) with any building codes, laws, ordinances or regulations of any government or other body.",
    "Broker does not have the technical expertise to either determine whether any improvements are in compliance with ADA requirements or to advise a principal on the requirements of the ADA. You are advised to contact an attorney, contractor, architect, engineer or other qualified professional of your own choosing to determine to what degree, if at all, ADA impacts the subject property.",
    "Regarding the above items, any potential PURCHASER will rely solely on its own investigation of the property. Any information provided or to be provided, with respect to the property by Broker was obtained from sources deemed reliable but is in no way warranted or guaranteed by Broker. Broker has not made any independent investigation or verification of such information, and does not make any representations as to the accuracy or completeness of such information.",
]


def img_uri(path, max_px=None, quality=88, enhance=False):
    path = path if os.path.isabs(path) else A(path)
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert('RGB')
    if max_px and max(im.size) > max_px:
        im.thumbnail((max_px, max_px), Image.LANCZOS)
    if enhance:
        im = ImageOps.autocontrast(im, cutoff=0.4, preserve_tone=True)
        im = ImageEnhance.Color(im).enhance(1.06)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=quality, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def svg_uri(name):
    return 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(HERE, 'assets', name), 'rb').read()).decode()


def qr_uri(url):
    import qrcode
    from qrcode.image.svg import SvgPathImage
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, box_size=10)
    q.add_data(url)
    q.make(fit=True)
    img = q.make_image(image_factory=SvgPathImage)
    s = img.to_string().decode()
    s = s.replace('fill="#000000"', 'fill="#652323"')
    return 'data:image/svg+xml;base64,' + base64.b64encode(s.encode()).decode()


STD_EMAIL = {'bart wilson': 'bwilson@roalson.com', 'matt howard': 'mhoward@roalson.com'}


def apply_corrections(uid, d):
    fixes = [c for c in json.load(open(A('build', 'corrections.json'))) if c['uid'] == uid] if os.path.exists(A('build', 'corrections.json')) else []
    def walk(o, fx):
        if isinstance(o, str):
            for c in fx:
                o = o.replace(c['find'], c['replace'])
            return o
        if isinstance(o, list):
            return [walk(x, fx) for x in o]
        if isinstance(o, dict):
            return {k: (walk(v, fx) if k not in ('qa_notes', 'pages', 'uid') else v) for k, v in o.items()}
        return o
    d = walk(d, [c for c in fixes if not c.get('scope')])
    for c in [c for c in fixes if c.get('scope')]:
        d[c['scope']] = walk(d[c['scope']], [c])
    ovp = A('build', 'overrides.json')
    if os.path.exists(ovp):
        d.update({k: v for k, v in json.load(open(ovp)).get(uid, {}).items() if k != 'map_label'})
    c = d['contact']
    names = [n.strip().lower() for n in re.split(r'\bor\b|,|&', c.get('names', '').lower()) if n.strip()]
    if names and all(n in STD_EMAIL for n in names):
        c['emails'] = [STD_EMAIL[n] for n in names]
    return d


def para(text):
    return ''.join(f'<p>{esc(t)}</p>' for t in str(text).split('\n') if t.strip())


def row_html(r):
    label = r['label']
    if label.lower().startswith('investment opportunity') and r.get('pairs'):
        cells = ''.join(f'<div><div class="ik">{esc(k)}</div><div class="iv">{esc(v)}</div></div>' for k, v in r['pairs'])
        return f'<div class="item invest"><div class="h">{esc(label)}</div><div class="g">{cells}</div></div>'
    v = ''
    if r.get('text'):
        v += para(r['text'])
    if r.get('pairs'):
        v += '<div class="pairs">' + ''.join(f'<div class="pk">{esc(k + ":" if k and not k.endswith(":") else k) or "&nbsp;"}</div><div>{esc(val)}</div>' for k, val in r['pairs']) + '</div>'
    if r.get('table'):
        t = r['table']
        cols = t['columns']
        th = ''.join(f'<th>{esc(c)}</th>' for c in cols)
        body = ''.join('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in row) + '</tr>' for row in t['rows'])
        v += f'<table class="t"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>'
    if r.get('note'):
        v += f'<div class="note">{esc(r["note"])}</div>'
    return f'<div class="item row"><div class="k">{esc(label)}</div><div class="v">{v}</div></div>'


def contact_line(c):
    parts = [f'Phone: {esc(c["phone"])}'] if c.get('phone') else []
    if c.get('fax'):
        parts.append(f'Fax: {esc(c["fax"])}')
    first = ' &nbsp;·&nbsp; '.join(parts)
    second = ' &nbsp;/&nbsp; '.join(esc(e) for e in c.get('emails', []))
    if c.get('web'):
        second += f' &nbsp;·&nbsp; {esc(c["web"])}'
    return first, second


def foot(mark):
    return f'<div class="foot"><span class="pg">{{PG}}</span><img src="{mark}" alt="Roalson Interests"></div>'


def exhibit_page(W, eyebrow, title, inner, cap='', date='', cls=''):
    d = f'<span class="date">{esc(date)}</span>' if date else ''
    c = f'<div class="cap">{cap}</div>' if cap else ''
    return (f'<section class="page xp {cls}"><div class="xhead"><div class="micro">{esc(eyebrow)}</div>{d}</div>'
            f'<h2 class="x">{esc(title)}</h2><div class="hair"></div>{inner}{c}{foot(W)}</section>')


def build(uid, plan):
    d = json.load(open(A('data', f'{uid}.json')))
    d = apply_corrections(uid, d)
    geo = json.load(open(A('geo', 'sites.json')))[uid]
    meta = json.load(open(A('geo', 'meta.json')))[uid]
    flood = json.load(open(A('geo', 'flood-verdicts.json')))[uid]
    W = svg_uri('wordmark-garnet.svg')
    WR = svg_uri('wordmark-reverse.svg')
    MARK = svg_uri('mark-garnet.svg')
    WATER = svg_uri('mark-dust.svg' if d['variant'] == 'existing' else 'mark-garnet.svg')
    c = d['contact']
    l1, l2 = contact_line(c)
    maps = A('maps', uid)
    pages = []
    overlays = []

    # cover
    cover_img = plan.get('cover') or os.path.join(maps, 'cover.jpg')
    cover_uri = img_uri(cover_img, max_px=2600, quality=86, enhance=plan.get('cover_enhance', False))
    title = d['title']
    long = ' long' if len(title) > 30 else ''
    chips = f'<span>{esc(d["transaction"])}</span><i></i><span>{esc(d["type_label"])}</span>'
    tag = f'<div class="tag">{esc(d["eyebrow"])}</div>' if d.get('eyebrow') and d['eyebrow'].lower() != d['transaction'].lower() else ''
    size = f' &nbsp;·&nbsp; {esc(d["size_headline"])}' if d.get('size_headline') else ''
    cover_credit = ''
    pages.append(f'''<section class="page cover">
<div class="hdr">
 <div class="top"><img src="{WR}" alt="Roalson Interests">
  <div class="contact"><div class="k">For information contact</div><div class="n">{esc(c["names"])}</div>
  <div class="l">{l1}<br>{l2}</div></div></div>
 <div class="chips">{chips}</div>
 <h1 class="{long.strip()}">{esc(title)}</h1>
 <div class="city">{esc(d["city"])}{size}</div>
 {tag}
</div>
<div class="photo"><img class="ph" src="{cover_uri}" alt="" style="object-position:{plan.get('cover_pos', '50% 50%')}"></div>
<img class="mark" src="{WATER}" alt="">
{cover_credit}
<div class="pgc">{{PG}}</div>
</section>''')

    # spec pages (flowed by JS)
    spec_eyebrow = d['eyebrow'] or f'{d["transaction"]} — {d["type_label"]}'
    items = ''.join(row_html(r) for r in d['rows'])
    if d.get('comments'):
        items += '<div class="item row"><div class="k">Comments</div><div class="v"><ul class="bul">' + ''.join(f'<li><span>{esc(x)}</span></li>' for x in d['comments']) + '</ul></div></div>'
    contact_box = f'<div class="contactbox" id="contactbox"><div class="h">For information contact: {esc(c["names"])}</div><div class="b">{l1}<br>{l2}</div></div>'
    head = f'''<div class="spec-head"><div><div class="micro">{esc(spec_eyebrow)}</div><h1>{esc(title)}</h1><div class="city">{esc(d["city"])}</div></div><img src="{MARK}" alt="Roalson Interests"></div><div class="rule"></div>'''
    for i in range(4):
        pages.append(f'<section class="page spec" data-flow="spec">{head if i == 0 else ""}<div class="flow"></div>{foot(W)}</section>')
    src = f'<div id="spec-src" style="display:none">{items}</div><div id="contact-src" style="display:none">{contact_box}</div>'

    # exhibits
    def mapimg(name):
        return img_uri(os.path.join(maps, name), max_px=2400, quality=87)
    accessed = geo.get('accessed', TODAY)
    boundary_note = geo.get('boundary_note') or ('Boundary shown is approximate, drawn from county appraisal district parcel data (Texas StratMap, ' + TODAY + '); refer to the survey for exact lines.') if geo['geom'] else 'Site location shown by pin; refer to the survey and exhibits for tract boundaries.'
    pages.append(exhibit_page(W, 'Exhibit', 'Location Map', f'<div class="frame"><img src="{mapimg("location.jpg")}" alt="Location map"></div>', cap='Map data © OpenMapTiles © OpenStreetMap contributors.'))
    pages.append(exhibit_page(W, 'Exhibit', 'Area Map', f'<div class="frame"><img src="{mapimg("area.jpg")}" alt="Area map"></div>', cap='Map data © OpenMapTiles © OpenStreetMap contributors. ' + boundary_note))
    pages.append(exhibit_page(W, 'Exhibit', 'Aerial Map', f'<div class="frame"><img src="{mapimg("aerial.jpg")}" alt="Aerial map"></div>', cap='Imagery: USGS The National Map, NAIP / high-resolution orthoimagery (public domain). Labels © OpenStreetMap contributors. ' + boundary_note))
    pages.append(exhibit_page(W, 'Exhibit', 'Aerial Map — Surrounding Area', f'<div class="frame"><img src="{mapimg("aerial-wide.jpg")}" alt="Aerial map, surrounding area"></div>', cap='Imagery: USGS The National Map, NAIP / high-resolution orthoimagery (public domain). Road labels © OpenStreetMap contributors.'))
    if os.path.exists(os.path.join(maps, 'traffic.jpg')) and meta['traffic']:
        yr = max(t['year'] for t in meta['traffic'])
        top = sorted([t for t in meta['traffic'] if t.get('label')], key=lambda t: t['d'])[:3]
        facts = ''.join(f'<div><div class="fk">{esc(t["label"])}</div><div class="fv">{t["qty"]:,} vehicles per day<br><span style="color:#8e8676;font-size:9.5px">{t["d"] / 1609.34:.1f} mi from site · {t["year"]}</span></div></div>' for t in top)
        pages.append(exhibit_page(W, 'Exhibit', 'Traffic Counts', f'<div class="frame"><img src="{mapimg("traffic.jpg")}" alt="Traffic count map"></div><div class="facts">{facts}</div>',
                                  cap=f'Annual average daily traffic (AADT), {yr} counts published by the Texas Department of Transportation (TxDOT), for count stations near the site; two-way totals. The specification pages quote the counts in the original package. Map data © OpenMapTiles © OpenStreetMap contributors.'))
    pages.append(exhibit_page(W, 'Exhibit', 'FEMA Flood Zones', f'<div class="frame"><img src="{mapimg("flood.jpg")}" alt="FEMA flood zone map"></div>',
                              cap=f'<b>{esc(flood["verdict"])}</b> Source: FEMA National Flood Hazard Layer, accessed {accessed}. Imagery: USGS; labels © OpenStreetMap contributors. Panel {esc(", ".join(x for x in (meta.get("dfirm") or []) if x) or "n/a")}. For general reference only — verify with a current FEMA FIRMette, survey or elevation certificate.'))

    for ex in plan.get('carry', []):
        uri = img_uri(ex['img'], max_px=3000, quality=90)
        iw, ih = Image.open(ex['img'] if os.path.isabs(ex['img']) else A(ex['img'])).size
        pages.append(exhibit_page(W, ex.get('eyebrow', 'Exhibit'), ex['title'], f'<div class="frame white"><img class="contain" src="{uri}" alt="{esc(ex["title"])}"></div>', cap=esc(ex.get('cap', '')), cls='land' if iw > ih * 1.2 else ''))

    photos = plan.get('photos', [])
    for i in range(0, len(photos), 2):
        pair = photos[i:i + 2]
        fr = ''
        for ph in pair:
            w, h = Image.open(ph if os.path.isabs(ph) else A(ph)).size
            fit = ' class="contain"' if h > w else ''
            bg = ' style="background:#F2EFE9"' if h > w else ''
            fr += f'<div class="frame"{bg}><img{fit} src="{img_uri(ph, max_px=2200, quality=86, enhance=True)}" alt=""></div>'
        t = plan.get('photo_title', 'Property Photographs')
        pages.append(exhibit_page(W, 'Exhibit', t, f'<div class="frames">{fr}</div>'))

    # demographics
    dov = d.get('demographic_overview')
    dsrc = ''
    if dov:
        cols = dov['columns']
        n = len(cols)
        gt = f'grid-template-columns:1fr {" ".join(["104px"] * n)}'
        colhdr = f'<div class="dcols" style="{gt}"><div></div>' + ''.join(f'<div>{esc(x)}</div>' for x in cols) + '</div>'
        secs = ''
        for s in dov['sections']:
            rows = ''.join(f'<div class="dr" style="{gt}">' + ''.join(f'<div>{esc(x)}</div>' for x in (r + [''] * (n + 1 - len(r)))[:n + 1]) + '</div>' for r in s['rows'])
            h = f'<div class="dh">{esc(s["heading"])}</div>' if s.get('heading') else '<div style="height:10px"></div>'
            secs += f'<div class="item dsec">{h}{rows}</div>'
        if dov.get('source'):
            secs += f'<div class="item src">{esc(dov["source"])}</div>'
        dt = dov.get('date') or ''
        dtitle = dov.get('title') or title
        for i in range(3):
            ey = 'Demographic Overview' + (' (Continued)' if i else '')
            pages.append(f'<section class="page demo" data-flow="demo"><div class="xhead"><div class="micro">{ey}</div><span class="date">{esc(dt)}</span></div><h2 class="x">{esc(dtitle)}</h2><div class="rule" style="margin:14px 0 16px"></div>{colhdr}<div class="flow dflow"></div>{foot(W)}</section>')
        dsrc = f'<div id="demo-src" style="display:none">{secs}</div>'

    # disclosure
    qr = qr_uri(SITE_BASE + uid)
    who = 'PURCHASER or TENANT' if 'lease' in d['transaction'].lower() else 'PURCHASER'
    disc = ''.join(f'<p>{esc(p.replace("PURCHASER", who))}</p>' for p in DISCLOSURE)
    pages.append(f'''<section class="page"><div class="micro">Disclosure</div><h2 class="x">Property Disclosure Statement</h2><div class="rule" style="margin:14px 0 18px"></div>
<div class="disc">{disc}</div>
<div class="broker"><div class="h">Broker: Roalson Interests</div><div class="b">17721 Rogers Ranch Parkway, Suite 125<br>San Antonio, Texas 78258</div>
<div class="qr"><img src="{qr}" alt=""><div class="t"><b>View this listing online</b>{esc(SITE_BASE.replace("https://", "") + uid)}<br>Maps, photos and the latest version of this package.</div></div></div>
{foot(W)}</section>''')

    fonts = open(os.path.join(HERE, 'assets', 'fonts.css')).read()
    css = open(os.path.join(HERE, 'template.css')).read()
    js = open(os.path.join(HERE, 'flow.js')).read()
    doc = f'''<!doctype html><html><head><meta charset="utf-8"><title>{esc(title)} — Roalson Interests</title><style>{fonts}{css}</style></head>
<body>{''.join(pages)}{src}{dsrc}<script>{js}</script></body></html>'''
    return doc, overlays, d


if __name__ == '__main__':
    uid = sys.argv[1]
    plan = json.load(open(A('build', 'plans.json'))).get(uid, {})
    doc, overlays, d = build(uid, plan)
    os.makedirs(A('out', 'html'), exist_ok=True)
    open(A('out', 'html', f'{uid}.html'), 'w').write(doc)
    json.dump(overlays, open(A('out', 'html', f'{uid}.overlays.json'), 'w'))
    print('html', uid, len(doc) // 1024, 'KB', 'overlays', len(overlays))
