import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def patch(path, y, x0, x1, gap=8):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    b = a.copy()
    for yy in range(y - gap + 1, y + gap):
        t = (yy - (y - gap)) / (2 * gap)
        b[yy, x0:x1] = (1 - t) * a[y - gap, x0:x1] + t * a[y + gap, x0:x1]
    Image.fromarray(b.clip(0, 255).astype(np.uint8)).save(path, quality=92)


if __name__ == '__main__':
    for rel, spans in json.load(open(os.path.join(HERE, 'postfix.json'))).items():
        path = os.path.join(ROOT, 'maps', rel)
        if os.path.exists(path):
            for y, x0, x1 in spans:
                patch(path, y, x0, x1)
            print('patched', rel)
