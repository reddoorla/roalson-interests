import json,subprocess,urllib.parse,os,math,re
AADT="https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT_Annuals_(Public_View)/FeatureServer/0/query"
CACHE=os.path.join(os.path.dirname(__file__),'..','geo','traffic'); os.makedirs(CACHE,exist_ok=True)
def road_name(r):
    r=(r or '').strip()
    m=re.match(r'^(IH|US|SH|FM|SL|SS|BI|BU|RM|PR|SPUR|LOOP)\s*0*(\d+\w*)$',r)
    if m:
        k,n=m.groups(); k={'SL':'Loop','SS':'Spur','BI':'Bus. IH','BU':'Bus. US','RM':'RM','PR':'PR'}.get(k,k)
        return f'{k} {n}'
    return r.title()
def stations(key,lat,lon,radius_m):
    p=os.path.join(CACHE,f'{key}@{lat:.6f},{lon:.6f},{radius_m}.json')
    if os.path.exists(p): return json.load(open(p))
    q=urllib.parse.urlencode({'geometry':f'{lon},{lat}','geometryType':'esriGeometryPoint','inSR':4326,'distance':radius_m,'units':'esriSRUnit_Meter',
        'outFields':'TRFC_STATN_ID,AADT_RPT_YEAR,AADT_RPT_QTY,ON_ROAD,LATITUDE,LONGITUDE,AADT_RPT_HIST_01_QTY','returnGeometry':'false','f':'json'})
    for _ in range(4):
        r=subprocess.run(['curl','-sS','-m','60',AADT+'?'+q],capture_output=True,text=True)
        try: d=json.loads(r.stdout); break
        except Exception: d={}
    out=[]
    for f in d.get('features',[]):
        a=f['attributes']
        if not a.get('AADT_RPT_QTY'): continue
        dist=math.hypot((a['LATITUDE']-lat)*111320,(a['LONGITUDE']-lon)*111320*math.cos(math.radians(lat)))
        out.append({'id':a['TRFC_STATN_ID'],'year':a['AADT_RPT_YEAR'],'qty':a['AADT_RPT_QTY'],'prev':a.get('AADT_RPT_HIST_01_QTY'),'road':road_name(a['ON_ROAD']),'raw_road':a['ON_ROAD'],'lat':a['LATITUDE'],'lon':a['LONGITUDE'],'d':round(dist)})
    out.sort(key=lambda s:s['d'])
    json.dump(out,open(p,'w'))
    return out
