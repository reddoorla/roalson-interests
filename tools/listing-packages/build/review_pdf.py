import base64, os, re, subprocess
import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = lambda *p: os.path.join(ROOT, *p)


def main():
    md = open(A('review', 'review-notes.md')).read()
    md = re.sub(r'(?m)^(  )+(?=[-*] )', lambda m: '    ' * (len(m.group(0)) // 2), md)
    body = markdown.markdown(md, extensions=['extra', 'sane_lists'])
    fonts = open(os.path.join(HERE, 'assets', 'fonts.css')).read()
    mark = 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(HERE, 'assets', 'wordmark-garnet.svg'), 'rb').read()).decode()
    css = """@page { size: 8.5in 11in; margin: 0.75in 0.8in 0.8in; }
body{font-family:'Atkinson Hyperlegible Next',Arial,sans-serif;color:#2D2D2D;font-size:10.5px;line-height:1.55;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #652323;padding-bottom:14px;margin-bottom:18px}
.top img{width:120px} .top .m{font-family:Archivo,Arial,sans-serif;font-weight:700;font-size:10px;letter-spacing:.865px;text-transform:uppercase;color:#B2AC9F}
h1{font-weight:500;font-size:26px;line-height:1.25;color:#652323;margin:0 0 6px}
h2{font-weight:500;font-size:18px;color:#652323;margin:26px 0 8px;padding-top:10px;border-top:0.5px solid #B2AC9F;break-after:avoid}
h3{font-family:Archivo,Arial,sans-serif;font-weight:700;font-size:10.5px;letter-spacing:.865px;text-transform:uppercase;color:#652323;margin:18px 0 6px;break-after:avoid}
p{margin:6px 0} ul{margin:4px 0 8px;padding-left:18px} li{margin:3px 0} li::marker{color:#652323}
strong{color:#3D0707;font-weight:600}"""
    html = f'<!doctype html><html><head><meta charset="utf-8"><title>Listing Package Review Notes — Roalson Interests</title><style>{fonts}{css}</style></head><body><div class="top"><img src="{mark}" alt="Roalson Interests"><span class="m">Internal review · not for distribution</span></div>{body}</body></html>'
    os.makedirs(A('out'), exist_ok=True)
    src = A('out', 'review-notes.html')
    open(src, 'w').write(html)
    subprocess.run(['node', os.path.join(HERE, 'printdoc.mjs'), src, A('out', '00 - Review Notes (read first).pdf')], check=True)


if __name__ == '__main__':
    main()
