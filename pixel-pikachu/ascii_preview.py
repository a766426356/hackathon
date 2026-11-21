import numpy as np
from PIL import Image

import pikachu as P

CHARS = [
    (P.YELLOW, "Y"), (P.YELLOW_DARK, "y"), (P.EAR_DARK, "K"), (P.CHEEK, "R"),
    (P.INK, "@"), (P.WHITE, "o"), (P.TAIL_BROWN, "B"), (P.OUTLINE, "#"),
]

src = Image.open("pikachu_pixel_src.png").convert("RGBA")
a = np.array(src)
h, w = a.shape[:2]

print("legend: Y=yellow  y=dark-yellow  K=ear-tip  R=cheek  @=ink  o=white  B=brown  #=outline")
print(f"size {w}x{h}")
print("     " + "".join(str(i % 10) for i in range(w)))
for y in range(h):
    row = []
    for x in range(w):
        px = tuple(a[y, x])
        if px[3] == 0:
            row.append(".")
            continue
        ch = "?"
        for col, c in CHARS:
            if px == col:
                ch = c
                break
        row.append(ch)
    print(f"{y:3d}  " + "".join(row))
