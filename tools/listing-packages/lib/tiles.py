import math, os, io, hashlib, subprocess, concurrent.futures as cf
from PIL import Image
CACHE=os.path.join(os.path.dirname(__file__),'..','tilecache')
os.makedirs(CACHE,exist_ok=True)
def ll2px(lat,lon,z):
    n=256*2**z
    x=(lon+180)/360*n
    y=(1-math.log(math.tan(math.radians(lat))+1/math.cos(math.radians(lat)))/math.pi)/2*n
    return x,y
def px2ll(x,y,z):
    n=256*2**z
    lon=x/n*360-180
    lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
    return lat,lon
def fetch(url):
    h=hashlib.sha1(url.encode()).hexdigest()
    p=os.path.join(CACHE,h)
    if not os.path.exists(p) or os.path.getsize(p)==0:
        for _ in range(4):
            r=subprocess.run(['curl','-sS','-m','40','-f','-A','roalson-package-builder/1.0 (tucker@reddoorla.com)','-o',p,url],capture_output=True)
            if r.returncode==0 and os.path.getsize(p)>0: break
        else:
            return None
    try:
        return Image.open(p).convert('RGB')
    except Exception:
        return None
TEMPLATES={
 'esri':'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
 'usgs':'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
}
def stitch(src,lat,lon,z,w,h,cx=None,cy=None):
    """Return a w x h image centred on lat/lon at zoom z (256px tiles)."""
    X,Y=ll2px(lat,lon,z)
    x0=X-w/2; y0=Y-h/2
    tx0=int(math.floor(x0/256)); ty0=int(math.floor(y0/256))
    tx1=int(math.floor((x0+w)/256)); ty1=int(math.floor((y0+h)/256))
    canvas=Image.new('RGB',((tx1-tx0+1)*256,(ty1-ty0+1)*256),(200,200,200))
    jobs={}
    with cf.ThreadPoolExecutor(8) as ex:
        for tx in range(tx0,tx1+1):
            for ty in range(ty0,ty1+1):
                jobs[(tx,ty)]=ex.submit(fetch,TEMPLATES[src].format(z=z,x=tx,y=ty))
    missing=0
    for (tx,ty),f in jobs.items():
        im=f.result()
        if im is None: missing+=1; continue
        if im.size!=(256,256): im=im.resize((256,256))
        canvas.paste(im,((tx-tx0)*256,(ty-ty0)*256))
    ox=int(round(x0-tx0*256)); oy=int(round(y0-ty0*256))
    out=canvas.crop((ox,oy,ox+w,oy+h))
    return out,missing
