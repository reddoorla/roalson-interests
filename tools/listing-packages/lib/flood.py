import json,subprocess,urllib.parse,math,os
NFHL="https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
CACHE=os.path.join(os.path.dirname(__file__),'..','geo','flood')
os.makedirs(CACHE,exist_ok=True)
def classify(p):
    z=(p.get('FLD_ZONE') or '').upper(); sub=(p.get('ZONE_SUBTY') or '').upper()
    if 'FLOODWAY' in sub: return 'floodway'
    if z.startswith('A') or z.startswith('V'): return 'a100'
    if z=='X' and ('0.2' in sub or 'LEVEE' in sub): return 'x500'
    return None
def flood_geojson(key,lat,lon,half_m):
    p=os.path.join(CACHE,f'{key}@{lat:.6f},{lon:.6f},{half_m}.geojson')
    if os.path.exists(p): return json.load(open(p))
    dlat=half_m/111320; dlon=half_m/(111320*math.cos(math.radians(lat)))
    env=json.dumps({'xmin':lon-dlon,'ymin':lat-dlat,'xmax':lon+dlon,'ymax':lat+dlat,'spatialReference':{'wkid':4326}})
    q=urllib.parse.urlencode({'geometry':env,'geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects','outFields':'FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID','returnGeometry':'true','outSR':4326,'geometryPrecision':6,'f':'geojson'})
    for _ in range(4):
        r=subprocess.run(['curl','-sS','-m','90',NFHL+'?'+q],capture_output=True,text=True)
        try:
            g=json.loads(r.stdout); break
        except Exception: g=None
    if not g or 'features' not in g: return None
    feats=[]
    for f in g['features']:
        c=classify(f['properties'])
        if c: f['properties']['cls']=c; feats.append(f)
    out={'type':'FeatureCollection','features':feats,'_zones':sorted({(f['properties'].get('FLD_ZONE'),f['properties'].get('ZONE_SUBTY')) for f in g['features']},key=str),'_dfirm':sorted({f['properties'].get('DFIRM_ID') for f in g['features']},key=str)}
    json.dump(out,open(p,'w'))
    return out
