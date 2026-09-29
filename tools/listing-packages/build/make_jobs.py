import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'lib'))
from mapjobs import jobs_for, choose_stations
A = lambda *p: os.path.join(ROOT, *p)
LEG = '''<b>FEMA Flood Hazard Zones</b>
<div class="row"><span class="sw" style="background:rgba(18,69,122,.8)"></span>Regulatory floodway</div>
<div class="row"><span class="sw" style="background:rgba(47,127,193,.62)"></span>1% annual chance flood hazard (Zone A / AE)</div>
<div class="row"><span class="sw" style="background:rgba(232,163,61,.6)"></span>0.2% annual chance flood hazard (shaded Zone X)</div>
<div class="row"><span class="sw" style="background:rgba(101,35,35,.2);outline:2px solid #652323;outline-offset:-2px"></span>Subject property{approx}</div>
<div style="margin-top:4px;padding-top:6px;border-top:0.5px solid #d9d4c9;color:#2D2D2D;font-size:10px"><b style="display:inline;font-size:9px">At the site:</b> {verdict}</div>'''
sites = json.load(open(A('geo', 'sites.json')))
verdicts = json.load(open(A('geo', 'flood-verdicts.json')))
ovr = json.load(open(A('build', 'overrides.json')))
covers_needed = {'101-w-commerce-street': False, '13810-lookout-road': False, '25331-ih-10-west': False, 'urban-loop-road': False}
only = set(sys.argv[1:])
jobs, meta = [], json.load(open(A('geo', 'meta.json')))
for uid, s in sites.items():
    if only and uid not in only:
        continue
    d = json.load(open(A('data', f'{uid}.json')))
    geom = s['geom']
    if geom and geom['type'] == 'MultiPolygon':
        geom = {'type': 'MultiPolygon', 'coordinates': [p for p in geom['coordinates'] if len(p[0]) > 4]}
    site = s['centroid'] if s.get('centroid') and geom else [s['lat'], s['lon']]
    title = ovr.get(uid, {}).get('map_label') or ovr.get(uid, {}).get('title') or d['title']
    if len(title) > 40:
        title = title[:38].rsplit(' ', 1)[0] + '…'
    J, m = jobs_for(uid, site, A('maps', uid), title, geom=geom, cover=covers_needed.get(uid, True),
                    extra_pins=s.get('extra_pins'), pin_label=s.get('poly_label', 'Site'))
    for j in J:
        if j['out'].endswith('/flood.jpg'):
            j['legend'] = LEG.replace('{verdict}', verdicts[uid]['verdict']).replace('{approx}', ' (approximate boundary)' if geom else ' (site pin)')
        if s.get('extra_pins') and (j['out'].endswith('/aerial.jpg') or j['out'].endswith('/cover.jpg')) and j.get('bounds'):
            b = j['bounds']
            for p in s['extra_pins']:
                b = [min(b[0], p['lat']), min(b[1], p['lon']), max(b[2], p['lat']), max(b[3], p['lon'])]
            j['bounds'] = b
    jobs += J
    meta[uid]['traffic'] = m['traffic']
    meta[uid]['site'] = site
json.dump(jobs, open(A('build', 'jobs-all.json'), 'w'))
json.dump(meta, open(A('geo', 'meta.json'), 'w'), indent=1)
for k in range(3):
    json.dump(jobs[k::3], open(A('build', f'jobs-{k}.json'), 'w'))
print(len(jobs), 'jobs')
