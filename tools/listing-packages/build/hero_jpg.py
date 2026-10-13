import os
import sys

import numpy as np
from PIL import Image

src, dst, ref = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
im = Image.open(src).convert('RGB')
a = np.asarray(im.convert('L'), float)
if a.std() < 8:
    sys.exit(f'{src}: flat image (std {a.std():.1f}), the map did not render')
os.makedirs(os.path.dirname(dst), exist_ok=True)
im.save(dst, 'JPEG', quality=88, optimize=True, progressive=True)
msg = f'hero {im.size[0]}x{im.size[1]}'
if ref:
    r = np.asarray(Image.open(ref).convert('L'), float)
    if r.shape == a.shape:
        msg += f', vs Land ID preview {abs(a - r).mean():.2f}/255'
print(msg)
