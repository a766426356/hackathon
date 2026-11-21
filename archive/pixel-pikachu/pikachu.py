"""
Pixel-art Pikachu generator (v6).

Drawn on a 96x96 logical grid with hard-edged primitives. Every part is
rasterised into a boolean mask and unioned into one silhouette, so the whole
figure gets a single 1px ink outline (edge-clamped dilation, no wrap-around).
The result is auto-cropped to its content box and upscaled with NEAREST so
each logical pixel stays a crisp square.

Layout rules learned the hard way:
  * overlapping parts only; two masks that merely touch leave a 1px seam,
  * no part may come within 2px of another unless it is meant to fuse,
  * strokes are disc chains (brush) so zig-zags never self-intersect.
"""

import math

import numpy as np
from PIL import Image, ImageDraw

# ---------------------------------------------------------------- palette
YELLOW      = (255, 214, 51, 255)
YELLOW_DARK = (232, 178, 30, 255)
EAR_DARK    = (58, 46, 36, 255)
CHEEK       = (233, 76, 60, 255)
INK         = (43, 32, 24, 255)
WHITE       = (255, 255, 255, 255)
TAIL_BROWN  = (140, 92, 44, 255)
OUTLINE     = (72, 52, 34, 255)

W = H = 96
S = 10
PAD = 3

YY, XX = np.mgrid[0:H, 0:W]


# ---------------------------------------------------------------- helpers
def as_mask(draw_fn):
    img = Image.new("L", (W, H), 0)
    draw_fn(ImageDraw.Draw(img))
    return np.array(img) > 127


def poly(pts):
    return as_mask(lambda d: d.polygon(pts, fill=255))


def ell(box):
    return as_mask(lambda d: d.ellipse(box, fill=255))


def rrect(box, r):
    return as_mask(lambda d: d.rounded_rectangle(box, radius=r, fill=255))


def pixels(pts):
    m = np.zeros((H, W), dtype=bool)
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H:
            m[y, x] = True
    return m


def brush(pts, widths):
    """Tapered stroke built from densely packed discs (no self-intersection,
    so zig-zags stay solid instead of getting even-odd holes)."""
    def draw(d):
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            steps = max(1, int(math.dist(pts[i], pts[i + 1]) / 0.3))
            for k in range(steps + 1):
                t = k / steps
                x = x0 + (x1 - x0) * t
                y = y0 + (y1 - y0) * t
                r = (widths[i] + (widths[i + 1] - widths[i]) * t) / 2.0
                d.ellipse((x - r, y - r, x + r, y + r), fill=255)

    return as_mask(draw)


def seg(p0, p1, w0, w1=None):
    """Flat-capped trapezoid along p0->p1, widths are diameters. Unlike brush
    the ends are square, so chaining them yields crisp pixel-art corners
    instead of rounded blobs."""
    if w1 is None:
        w1 = w0
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L, dx / L
    a, b = w0 / 2.0, w1 / 2.0
    return poly([(x0 + nx * a, y0 + ny * a), (x1 + nx * b, y1 + ny * b),
                 (x1 - nx * b, y1 - ny * b), (x0 - nx * a, y0 - ny * a)])


def dilate(m):
    p = np.pad(m, 1, mode="edge")
    out = np.zeros_like(m)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out |= p[1 + dy: 1 + dy + H, 1 + dx: 1 + dx + W]
    return out


# ---------------------------------------------------------------- sprite
def build():
    canvas = np.zeros((H, W, 4), dtype=np.uint8)
    alpha = np.zeros((H, W), dtype=bool)

    def solid(m, color):
        nonlocal alpha
        canvas[m] = color
        alpha |= m

    # ---------------------------------------------------------- tail
    # Built from overlapping flat-capped trapezoids: the sign of a lightning
    # bolt is a hard zig-zag, and square joins give that at pixel scale.
    # Trajectory is right-and-up at ~40 deg, so the shaft never gets near the
    # head (head right edge 58, shaft left edge >=62 the whole way), and the
    # root starts *under* the hip (x<=60, body x<=49, feet x<=53) so the
    # junction is a genuine overlap: no seam, no sliver, no sealed pocket.
    m_tail  = seg((44, 64), (60, 62), 14, 12)      # root, buried in the hip
    m_tail |= seg((60, 62), (77, 47), 12, 11)      # shaft, down-right
    m_tail |= seg((76, 48), (70, 36), 11, 9)       # kick back = the notch
    m_tail |= seg((70, 36), (87, 28), 9, 5)        # out again, tapering
    m_tail |= poly([(83, 22), (94, 27), (86, 32)])  # angular tip
    solid(m_tail, YELLOW)
    solid(m_tail & (YY >= 64), TAIL_BROWN)         # brown root, hidden

    # ---------------------------------------------------------- feet + body
    solid(ell((25, 66, 38, 74)), YELLOW)
    solid(ell((40, 66, 53, 74)), YELLOW)
    solid(rrect((29, 49, 49, 69), 9), YELLOW)

    # ---------------------------------------------------------- arm
    # one visible arm, overlapping the body by 3px so the shoulder has no
    # seam; the right side belongs to the tail
    solid(ell((19, 52, 32, 64)), YELLOW)

    # ---------------------------------------------------------- ears
    ear_l = brush([(29, 38), (22, 22), (16, 8)], [9, 6.5, 3])
    ear_r = brush([(49, 38), (56, 22), (62, 8)], [9, 6.5, 3])
    solid(ear_l, YELLOW)
    solid(ear_r, YELLOW)
    solid(ear_l & (YY <= 17), EAR_DARK)                       # top third only
    solid(ear_r & (YY <= 17), EAR_DARK)

    # ---------------------------------------------------------- head
    m_head = ell((20, 24, 58, 56))
    solid(m_head, YELLOW)

    # ---------------------------------------------------------- cheeks
    solid(ell((23, 43, 31, 51)), CHEEK)
    solid(ell((47, 43, 55, 51)), CHEEK)

    # ---------------------------------------------------------- eyes
    eye_l = ell((29, 32, 36, 42))
    eye_r = ell((42, 32, 49, 42))
    solid(eye_l, INK)
    solid(eye_r, INK)
    solid(pixels([(31, 34), (32, 34), (31, 35), (32, 35)]), WHITE)
    solid(pixels([(44, 34), (45, 34), (44, 35), (45, 35)]), WHITE)

    # ---------------------------------------------------------- nose
    solid(pixels([(38, 45), (39, 45), (40, 45), (38, 46), (39, 46), (40, 46)]), INK)

    # ---------------------------------------------------------- mouth (ω)
    # two 1px-wide "U" bowls side by side; a single connected zig-zag read as
    # scattered dots at this resolution.
    mouth = [
        (34, 48), (35, 48), (40, 48), (41, 48),
        (33, 49), (36, 49), (39, 49), (42, 49),
        (34, 50), (35, 50), (40, 50), (41, 50),
    ]
    solid(pixels(mouth), INK)

    # ---------------------------------------------------------- shading
    inner = np.zeros_like(alpha)
    inner[:H - 2, :W - 2] = alpha[2:, 2:]
    shade = alpha & ~inner & (canvas == YELLOW).all(axis=2)
    canvas[shade] = YELLOW_DARK

    # ---------------------------------------------------------- outline
    out = dilate(alpha) & ~alpha
    canvas[out] = OUTLINE
    return canvas


def crop_square(canvas):
    a = canvas[..., 3] > 0
    ys, xs = np.where(a)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    sub = canvas[y0:y1 + 1, x0:x1 + 1]
    h, w = sub.shape[:2]
    side = max(h, w) + PAD * 2
    out = np.zeros((side, side, 4), dtype=np.uint8)
    oy = (side - h) // 2
    ox = (side - w) // 2
    out[oy:oy + h, ox:ox + w] = sub
    return out


def holes(canvas):
    """Real holes only: transparent regions that the outside cannot reach.
    Concave notches open to the border are fine, so flood-fill the empty
    space inward from the frame instead of guessing per row."""
    from collections import deque

    a = canvas[..., 3] > 0
    h, w = a.shape
    seen = ~a & False
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not a[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if not a[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not a[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return [(int(x), int(y)) for y, x in zip(*np.where(~a & ~seen))]


def main():
    raw = build()
    canvas = crop_square(raw)
    img = Image.fromarray(canvas, "RGBA")
    img.save("pikachu_pixel_src.png")
    h, w = canvas.shape[:2]
    img.resize((w * S, h * S), Image.NEAREST).save("pikachu_pixel.png")
    hh = holes(raw)
    print("logical", (w, h), "->", (w * S, h * S))
    print("holes:", len(hh), hh[:12])


if __name__ == "__main__":
    main()
