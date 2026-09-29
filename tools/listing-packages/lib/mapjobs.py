import json,math,sys,os
sys.path.insert(0,os.path.dirname(__file__))
from flood import flood_geojson
from traffic import stations
SA=(29.4246,-98.4951)
W,H=672,760
CREDIT_BRAND='© OpenMapTiles © OpenStreetMap contributors'
CREDIT_AER='Imagery: USGS The National Map (NAIP / HRO) · Labels © OpenStreetMap contributors'
def bbox_geom(g,pad_m=0):
    cs=[]
    polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    for poly in polys:
        for r in poly: cs+=r
    xs=[p[0] for p in cs]; ys=[p[1] for p in cs]
    lat=sum(ys)/len(ys); dlat=pad_m/111320; dlon=pad_m/(111320*math.cos(math.radians(lat)))
    return [min(ys)-dlat,min(xs)-dlon,max(ys)+dlat,max(xs)+dlon]
def fc(g): return {'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':g}]}
def miles(a,b):
    R=3958.8; la1,lo1,la2,lo2=map(math.radians,[a[0],a[1],b[0],b[1]])
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
def extent_m(g):
    b=bbox_geom(g); return max((b[2]-b[0])*111320,(b[3]-b[1])*111320*math.cos(math.radians(b[0])))
import re as _re
def station_label(s):
    r=s['road']
    if _re.match(r'^([A-Z][a-z]\d+|-|Fc\d+)$',r): return None
    r=_re.sub(r"'S\b","'s",r)
    if _re.search(r'(NB|SB|EB|WB)SR$',s['id']): return f'{r} Frontage Rd'
    return r
def _m(a,b): return math.hypot((a['lat']-b['lat'])*111320,(a['lon']-b['lon'])*111320*math.cos(math.radians(a['lat'])))
def choose_stations(st,limit=7,sep=190):
    c=[dict(x,label=station_label(x)) for x in st]
    c=[x for x in c if x['label']]
    main=[x for x in c if not x['label'].endswith('Frontage Rd')]
    c=[x for x in c if not (x['label'].endswith('Frontage Rd') and any(m['road']==x['road'] and _m(m,x)<700 for m in main))]
    near=sorted([x for x in c if x['d']<=600],key=lambda x:-x['qty']/(1+x['d']/150))
    rest=sorted([x for x in c if x['d']>600],key=lambda x:-x['qty']/(1+x['d']/400))
    out=[]
    for x in near:
        if any(_m(x,y)<sep for y in out): continue
        out.append(x)
        if len(out)>=4: break
    for x in rest:
        if any(_m(x,y)<sep for y in out): continue
        out.append(x)
        if len(out)>=limit: break
    return sorted(out,key=lambda x:x['d'])
def jobs_for(uid,site,outdir,title,geom=None,cover=True,date='September 2026',extra_pins=None,pin_label='Site'):
    lat,lon=site
    J=[]
    poly=fc(geom) if geom else None
    ext=extent_m(geom) if geom else 120
    pin={'lat':lat,'lon':lon,'label':pin_label}
    if cover:
        cj={'out':f'{outdir}/cover.jpg','kind':'aerial','width':816,'height':660,'dpr':3,'center':[lat,lon],'polygon':poly,'credit':'Imagery: USGS The National Map'}
        if geom: cj.update({'bounds':bbox_geom(geom),'padding':{'top':150,'bottom':90,'left':300,'right':90},'maxZoom':18.0})
        else: cj.update({'zoom':17.0,'pin':pin})
        J.append(cj)
    d=miles(site,SA)
    if d<3.5:
        loc={'zoom':12.4}; refs=[]
    else:
        b=[min(lat,SA[0]),min(lon,SA[1]),max(lat,SA[0]),max(lon,SA[1])]
        loc={'bounds':b,'padding':{'top':170,'bottom':120,'left':170,'right':170},'maxZoom':11.3}; refs=[{'lat':SA[0],'lon':SA[1],'label':'Downtown San Antonio'}]
    J.append({'out':f'{outdir}/location.jpg','kind':'brand','width':W,'height':H,'dpr':2.5,'center':[lat,lon],**loc,'pin':{'lat':lat,'lon':lon,'label':title,'large':True},'refs':refs,'scale':True,'credit':CREDIT_BRAND})
    area={'zoom':15.0 if ext<400 else 14.4}
    J.append({'out':f'{outdir}/area.jpg','kind':'brand','pois':True,'width':W,'height':H,'dpr':2.5,'center':[lat,lon],**area,'polygon':poly,'pin':pin,'scale':True,'north':True,'credit':CREDIT_BRAND})
    aer={'bounds':bbox_geom(geom),'padding':150,'maxZoom':18.0} if geom else {'zoom':17.6}
    J.append({'out':f'{outdir}/aerial.jpg','kind':'aerial','width':W,'height':H,'dpr':2.5,'center':[lat,lon],**aer,'polygon':poly,'pin':None if geom else pin,'scale':True,'north':True,'credit':CREDIT_AER})
    J.append({'out':f'{outdir}/aerial-wide.jpg','kind':'aerial','width':W,'height':H,'dpr':2.5,'center':[lat,lon],'zoom':15.3 if ext<500 else 14.6,'polygon':poly,'pin':pin,'scale':True,'north':True,'credit':CREDIT_AER})
    st=stations(uid,lat,lon,2600)
    pick=choose_stations(st)
    if pick:
        pts=[(lat,lon)]+[(s['lat'],s['lon']) for s in pick]
        if geom:
            gb=bbox_geom(geom); pts+=[(gb[0],gb[1]),(gb[2],gb[3])]
        tb=[min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]
        J.append({'out':f'{outdir}/traffic.jpg','kind':'brand','width':W,'height':690,'dpr':2.5,'center':[lat,lon],'bounds':tb,'padding':{'top':120,'bottom':80,'left':110,'right':110},'maxZoom':15.2,
                  'polygon':poly,'pin':pin,'traffic':[{'lat':s['lat'],'lon':s['lon'],'qty':f"{s['qty']:,}",'road':f"{s['label']} · {s['year']}"} for s in pick],
                  'scale':True,'north':True,'credit':CREDIT_BRAND+' · Counts: TxDOT'})
    fl=flood_geojson(uid,lat,lon,1500)
    fb={'bounds':bbox_geom(geom,pad_m=max(250,ext*0.6)),'padding':30,'maxZoom':17.4} if geom else {'zoom':16.2}
    J.append({'out':f'{outdir}/flood.jpg','kind':'aerial','labels':True,'width':W,'height':H,'dpr':2.5,'center':[lat,lon],**fb,'polygon':poly,'pin':None if geom else pin,
              'flood':{'type':'FeatureCollection','features':fl['features']} if fl else None,'legend':'__FLOOD__','scale':True,'north':True,'credit':'Imagery: USGS The National Map · Flood data: FEMA NFHL'})
    if extra_pins:
        for j in J:
            if j['out'].endswith('location.jpg'): continue
            j['pins']=extra_pins
            if j.get('polygon') and not j.get('pin'): j['pin']=pin
    for j in J:
        for k in [k for k,v in j.items() if v is None]: del j[k]
    return J,{'traffic':pick,'flood':fl}

