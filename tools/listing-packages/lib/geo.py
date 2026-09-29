import json,subprocess,urllib.parse,math
PARCELS="https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer"
NFHL="https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer"
def get(url,params):
    q=urllib.parse.urlencode(params)
    for _ in range(4):
        r=subprocess.run(['curl','-sS','-m','60',url+'?'+q],capture_output=True,text=True)
        try: return json.loads(r.stdout)
        except Exception: pass
    return {}
def identify(base,layers,lat,lon,tol=1,span=0.004,geom=True):
    return get(base+'/identify',{'geometry':f'{lon},{lat}','geometryType':'esriGeometryPoint','sr':4326,'layers':layers,'tolerance':tol,
        'mapExtent':f'{lon-span},{lat-span},{lon+span},{lat+span}','imageDisplay':'800,800,96','returnGeometry':str(geom).lower(),'f':'json'}).get('results',[])
def parcel_at(lat,lon):
    res=identify(PARCELS,'all:0',lat,lon,tol=0)
    return res
def parcels_in(lat,lon,half_m):
    dlat=half_m/111320; dlon=half_m/(111320*math.cos(math.radians(lat)))
    return get(PARCELS+'/identify',{'geometry':json.dumps({'xmin':lon-dlon,'ymin':lat-dlat,'xmax':lon+dlon,'ymax':lat+dlat,'spatialReference':{'wkid':4326}}),
        'geometryType':'esriGeometryEnvelope','sr':4326,'layers':'all:0','tolerance':0,'mapExtent':f'{lon-dlon},{lat-dlat},{lon+dlon},{lat+dlat}',
        'imageDisplay':'800,800,96','returnGeometry':'true','f':'json'}).get('results',[])
def flood_at(lat,lon):
    res=identify(NFHL,'all:28',lat,lon,tol=0,geom=False)
    return [{k:r['attributes'].get(k) for k in ['FLD_ZONE','ZONE_SUBTY','SFHA_TF','DFIRM_ID','Flood Zone','Zone Subtype']} for r in res]
def flood_near(lat,lon,half_m):
    dlat=half_m/111320; dlon=half_m/(111320*math.cos(math.radians(lat)))
    res=get(NFHL+'/identify',{'geometry':json.dumps({'xmin':lon-dlon,'ymin':lat-dlat,'xmax':lon+dlon,'ymax':lat+dlat,'spatialReference':{'wkid':4326}}),
        'geometryType':'esriGeometryEnvelope','sr':4326,'layers':'all:28','tolerance':0,'mapExtent':f'{lon-dlon},{lat-dlat},{lon+dlon},{lat+dlat}',
        'imageDisplay':'800,800,96','returnGeometry':'false','f':'json'}).get('results',[])
    return sorted({(r['attributes'].get('FLD_ZONE') or r['attributes'].get('Flood Zone'), r['attributes'].get('ZONE_SUBTY') or r['attributes'].get('Zone Subtype')) for r in res}, key=str)
