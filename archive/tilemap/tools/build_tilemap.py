#!/usr/bin/env python3
"""Build a pixel-art campus tile map from the photographed Jidian-block campus plan.

Outputs (into ../):
  tileset.png             16x16 tiles, RGBA, 8 columns
  tileset@4x.png          4x reference sheet with tile numbers
  campus.tilemap.json     agent-facing semantic map (glyph grid + ids + POIs)
  campus.tmj              Tiled-compatible map
  campus_ascii.txt        two ASCII layers with a ruler
  campus_preview.png      2048x2048 rendered map (16px tile x2)
  campus_preview_1024.png 1024x1024 rendered map
  campus_legend.png       human legend sheet

Style reference: 微信图片_20261121125129_228_236.png
Layout reference: IMG_5550.HEIC (张江 · 集创路 / 祖冲之路 / 芳春路 / 集电路 block)
"""
from __future__ import annotations

import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

W = H = 64          # tiles
TS = 16             # logical tile edge in art pixels
SCALE = 2           # preview upscale -> 2048px
COLS = 8            # tileset columns

# --------------------------------------------------------------------------
# palette (sampled + harmonised from the pixel-art reference)
# --------------------------------------------------------------------------
P = dict(
    grass='#8FAE45', grass_l='#9BBA50', grass_d='#7F9C39', grass_xl='#A9C55E',
    flower_w='#F1EAD4', flower_y='#E8C25E', flower_p='#D8A7B5',
    path='#C9C2C7', path_l='#D6D0D4', path_d='#B3ACB3', path_line='#BDB6BC',
    plaza='#D8CCC2', plaza_d='#C6B8AC', plaza_l='#E3D8CE',
    brick='#C2A48C', brick_d='#A98A73', brick_l='#D2B8A2',
    road='#63646C', road_l='#6E6F78', road_d='#575860',
    curb='#A3A4AC', curb_d='#7A7B84',
    dash='#E9E5E2', cross='#EDE9E5',
    hedge_d='#3E6B33', hedge='#578A3E', hedge_l='#7CB253', hedge_xl='#95C966',
    tree_d='#356B37', tree='#4C8C44', tree_l='#69A855', tree_xl='#8CC168',
    trunk='#5B3E28', trunk_d='#432C1C',
    water_d='#4E8794', water='#6FA8B4', water_l='#93C6CD',
    roof='#3B404B', roof_l='#474D59', roof_ll='#535A68', roof_d='#333842',
    roof_edge='#606775',
    roof_cds='#3D4752', roof_cds_l='#4A5561', roof_cds_edge='#64707E',
    roof_gym='#414A48', roof_gym_l='#4D5754', roof_gym_edge='#67726F',
    stone='#CBC3C0', stone_d='#A79F9E', stone_l='#DED7D3',
    track='#B96F5F', track_d='#A25F51', track_l='#C98774',
    court='#6E9C8B', court_d='#5E8778', court_l='#83AF9E',
    bench='#9A6B45', bench_d='#6E4A2F',
    lamp='#3B404B', lamp_l='#F0CE7B',
    line='#F2EFEA',
)

# --------------------------------------------------------------------------
# legend
# --------------------------------------------------------------------------
GROUND = {
    'g': dict(id=0,  name='grass',        zh='草地',          walkable=True,  speed=1.0, tags=['lawn']),
    'f': dict(id=3,  name='grass_flower', zh='开花草地',      walkable=True,  speed=1.0, tags=['lawn', 'decor']),
    'u': dict(id=4,  name='grass_tuft',   zh='草丛',          walkable=True,  speed=1.0, tags=['lawn', 'decor']),
    'p': dict(id=5,  name='pavement',     zh='人行道',        walkable=True,  speed=1.0, tags=['path']),
    'P': dict(id=7,  name='plaza_stone',  zh='石材广场',      walkable=True,  speed=1.0, tags=['plaza']),
    'b': dict(id=8,  name='brick_plaza',  zh='砖石广场',      walkable=True,  speed=1.0, tags=['plaza']),
    'r': dict(id=9,  name='road',         zh='车行道',        walkable=False, speed=0.0, tags=['road']),
    'z': dict(id=10, name='crosswalk_h',  zh='斑马线·横穿车行道', walkable=True, speed=1.0, tags=['crossing']),
    'x': dict(id=11, name='crosswalk_v',  zh='斑马线·纵穿车行道', walkable=True, speed=1.0, tags=['crossing']),
    'k': dict(id=12, name='track',        zh='塑胶跑道',      walkable=True,  speed=1.25, tags=['sport']),
    'c': dict(id=13, name='court',        zh='球场',          walkable=True,  speed=1.0, tags=['sport']),
    's': dict(id=14, name='stairs',       zh='台阶',          walkable=True,  speed=0.8, tags=['stairs']),
    'w': dict(id=15, name='water',        zh='水面',          walkable=False, speed=0.0, tags=['water']),
}

PROPS = {
    '.': dict(id=-1, name='none',   zh='空',       solid=False),
    'H': dict(id=16, name='hedge',  zh='绿篱',     solid=True),
    'T': dict(id=17, name='tree',   zh='树木',     solid=True),
    'n': dict(id=18, name='bench',  zh='长椅',     solid=True),
    'l': dict(id=19, name='lamp',   zh='路灯',     solid=True),
    'B': dict(id=20, name='roof',   zh='建筑屋顶', solid=True),
}

ROOF_TILE = {'teach': 20, 'cds': 21, 'gym': 22}

# --------------------------------------------------------------------------
# deterministic noise
# --------------------------------------------------------------------------
def h32(*args) -> float:
    n = 2166136261
    for a in args:
        n = (n ^ (int(a) & 0xFFFFFFFF)) * 16777619 & 0xFFFFFFFF
        n ^= n >> 13
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 16
    return (n & 0xFFFFFF) / 0xFFFFFF


def cell_noise(x, y, salt=0):
    return h32(x * 374761393 + y * 668265263, salt, y * 2246822519)


# --------------------------------------------------------------------------
# layout
# --------------------------------------------------------------------------
GROUND_G = [['g'] * W for _ in range(H)]
PROP_G = [['.'] * W for _ in range(H)]
BID_G = [[None] * W for _ in range(H)]


def rect(x0, y0, x1, y1, ch, layer=GROUND_G):
    for y in range(max(0, y0), min(H - 1, y1) + 1):
        for x in range(max(0, x0), min(W - 1, x1) + 1):
            layer[y][x] = ch


def ell(cx, cy, rx, ry, ch, layer=GROUND_G):
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                layer[y][x] = ch


def ell_area(cx, cy, rx, ry):
    out = []
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                out.append((x, y))
    return out


# ---- roads + outer verge -------------------------------------------------
rect(0, 2, 63, 5, 'r')       # 祖冲之路 (north)
rect(0, 58, 63, 61, 'r')     # 集电路 (south)
rect(2, 0, 5, 63, 'r')       # 集创路 (west)
rect(58, 0, 61, 63, 'r')     # 芳春路 (east)

rect(6, 1, 57, 1, 'p')       # city-side sidewalks
rect(6, 62, 57, 62, 'p')
rect(1, 6, 1, 57, 'p')
rect(62, 6, 62, 57, 'p')

# ---- block sidewalk ring -------------------------------------------------
rect(6, 6, 57, 7, 'p')
rect(6, 56, 57, 57, 'p')
rect(6, 6, 7, 57, 'p')
rect(56, 6, 57, 57, 'p')

# ---- interior circulation ------------------------------------------------
rect(8, 19, 55, 20, 'p')     # north promenade
rect(8, 29, 55, 30, 'p')     # south of 7/6/5
rect(8, 45, 55, 46, 'p')     # south of 1 / CDS-1
rect(24, 19, 25, 57, 'p')    # west spine
rect(36, 19, 37, 57, 'p')    # east spine
rect(26, 29, 34, 56, 'p')    # central axis

# ---- north sports strip --------------------------------------------------
track_tiles = ell_area(17.5, 14.5, 7.6, 4.7)
for x, y in track_tiles:
    if 10 <= x <= 25 and 10 <= y <= 19:
        GROUND_G[y][x] = 'k'
for x, y in ell_area(17.5, 14.5, 5.1, 2.5):
    if 10 <= x <= 25 and 10 <= y <= 19:
        GROUND_G[y][x] = 'g'

for x0, x1 in ((27, 30), (32, 35)):
    rect(x0, 11, x1, 17, 'c')

# ---- buildings -----------------------------------------------------------
BUILDINGS = [
    dict(id='b7', label='7#', name='7 号楼', zh='7 号楼', rects=[(9, 21, 23, 27)],
         roof='teach', door=dict(x=16, y=28, side='s'), tags=['teaching']),
    dict(id='b6', label='6#', name='6 号楼', zh='6 号楼', rects=[(26, 21, 34, 28)],
         roof='teach', door=dict(x=30, y=29, side='s'), tags=['teaching']),
    dict(id='b5', label='5#', name='5 号楼', zh='5 号楼', rects=[(38, 21, 52, 27)],
         roof='teach', door=dict(x=45, y=28, side='s'), tags=['teaching']),
    dict(id='b1', label='1#', name='1 号楼', zh='1 号楼',
         rects=[(9, 31, 23, 40), (9, 41, 17, 44)],
         roof='teach', door=dict(x=13, y=45, side='s'), tags=['teaching']),
    dict(id='b2', label='2#', name='2 号楼', zh='2 号楼',
         rects=[(9, 47, 19, 50), (9, 51, 16, 54)],
         roof='teach', door=dict(x=13, y=46, side='n'), tags=['teaching']),
    dict(id='cds1', label='CDS-1', name='CDS-1', zh='CDS-1',
         rects=[(38, 31, 52, 41)], roof='cds',
         door=dict(x=45, y=42, side='s'), tags=['teaching', 'lab']),
    dict(id='cds2', label='CDS-2', name='CDS-2', zh='CDS-2',
         rects=[(38, 47, 52, 54)], roof='cds',
         door=dict(x=45, y=46, side='n'), tags=['teaching']),
    dict(id='gym', label='GYM', name='体育馆', zh='体育馆',
         rects=[(39, 10, 53, 18)], roof='gym',
         door=dict(x=46, y=19, side='s'), tags=['sport', 'indoor']),
]

for b in BUILDINGS:
    for (x0, y0, x1, y1) in b['rects']:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                PROP_G[y][x] = 'B'
                BID_G[y][x] = b['id']

# ---- central fountain plaza ---------------------------------------------
ell(30, 37, 4.6, 4.6, 'P')
ell(30, 37, 2.3, 2.3, 'w')

# ---- brick plaza, stairs, planters --------------------------------------
rect(26, 42, 34, 55, 'b')          # brick forecourt
rect(27, 43, 33, 44, 's')          # grand stair
for (cx, cy, rx, ry) in ((28.0, 48.0, 1.7, 1.1), (32.0, 51.0, 1.6, 1.0), (30.0, 54.0, 1.9, 1.0)):
    for x, y in ell_area(cx, cy, rx, ry):
        GROUND_G[y][x] = 'g'
    for x, y in ell_area(cx, cy, rx + 0.55, ry + 0.55):
        if GROUND_G[y][x] == 'b':
            GROUND_G[y][x] = 'P'

# ---- door approaches -----------------------------------------------------
for b in BUILDINGS:
    d = b['door']
    if d['side'] == 's':
        for x in range(d['x'] - 1, d['x'] + 2):
            if GROUND_G[d['y']][x] in 'gr':
                GROUND_G[d['y']][x] = 'p'
    else:
        for x in range(d['x'] - 1, d['x'] + 2):
            if GROUND_G[d['y']][x] in 'gr':
                GROUND_G[d['y']][x] = 'p'

# stone edging frames the central axis
for yy in range(31, 56):
    if GROUND_G[yy][26] in 'pb':
        GROUND_G[yy][26] = 'P'
    if GROUND_G[yy][34] in 'pb':
        GROUND_G[yy][34] = 'P'

# CDS-1 stoop down to the promenade
rect(44, 42, 46, 44, 'p')
# 7# / 5# stoops
rect(15, 28, 17, 28, 'p')
rect(44, 28, 46, 28, 'p')

# ---- crosswalks ----------------------------------------------------------
def zebra_v(x0, x1, y0, y1):   # crossing a horizontal road, bars horizontal
    rect(x0, y0, x1, y1, 'z')


def zebra_h(x0, x1, y0, y1):   # crossing a vertical road, bars vertical
    rect(x0, y0, x1, y1, 'x')


for x0 in (13, 28, 44):        # north + south gates
    zebra_v(x0, x0 + 4, 2, 5)
    zebra_v(x0, x0 + 4, 58, 61)
for y0 in (27, 43):            # west + east gates
    zebra_h(2, 5, y0, y0 + 4)
    zebra_h(58, 61, y0, y0 + 4)

# --------------------------------------------------------------------------
# POIs
# --------------------------------------------------------------------------
POIS = [
    dict(id='spawn', name='出生点', zh='中央大道南端', kind='spawn', x=30, y=56),
    dict(id='gate_south', name='南门', zh='集电路 · 南门', kind='gate', x=30, y=57),
    dict(id='gate_north', name='北门', zh='祖冲之路 · 北门', kind='gate', x=30, y=7),
    dict(id='gate_west', name='西门', zh='集创路 · 西门', kind='gate', x=6, y=29),
    dict(id='gate_east', name='东门', zh='芳春路 · 东门', kind='gate', x=57, y=29),
    dict(id='b7', name='7 号楼', zh='7 号楼', kind='building_entrance', x=16, y=28, building='b7', actions=['enter']),
    dict(id='b6', name='6 号楼', zh='6 号楼', kind='building_entrance', x=30, y=29, building='b6', actions=['enter']),
    dict(id='b5', name='5 号楼', zh='5 号楼', kind='building_entrance', x=45, y=28, building='b5', actions=['enter']),
    dict(id='b1', name='1 号楼', zh='1 号楼', kind='building_entrance', x=13, y=45, building='b1', actions=['enter']),
    dict(id='b2', name='2 号楼', zh='2 号楼', kind='building_entrance', x=13, y=46, building='b2', actions=['enter']),
    dict(id='cds1', name='CDS-1', zh='CDS-1', kind='building_entrance', x=45, y=42, building='cds1', actions=['enter']),
    dict(id='cds2', name='CDS-2', zh='CDS-2', kind='building_entrance', x=45, y=46, building='cds2', actions=['enter']),
    dict(id='gym', name='体育馆', zh='体育馆', kind='building_entrance', x=46, y=19, building='gym', actions=['enter']),
    dict(id='track', name='田径场', zh='塑胶跑道', kind='sport', x=17, y=14, actions=['run']),
    dict(id='courts', name='球场', zh='室外球场', kind='sport', x=28, y=14, actions=['play']),
    dict(id='fountain', name='圆形广场', zh='圆形喷泉广场', kind='landmark', x=30, y=34),
    dict(id='stairs', name='大台阶', zh='中央大台阶', kind='landmark', x=30, y=43),
    dict(id='brick_plaza', name='砖石广场', zh='砖石广场', kind='plaza', x=30, y=50),
]

# --------------------------------------------------------------------------
# decoration: grass variants, hedges, trees, lamps, benches
# --------------------------------------------------------------------------
POI_POINTS = [(p['x'], p['y']) for p in POIS]
DOOR_POINTS = [(b['door']['x'], b['door']['y']) for b in BUILDINGS]


def near(px, py, pts, r):
    return any(abs(px - x) <= r and abs(py - y) <= r for x, y in pts)


def is_ground(x, y, chars):
    return 0 <= x < W and 0 <= y < H and GROUND_G[y][x] in chars


# grass decor variants (kept in the ground layer; all walkable)
for y in range(H):
    for x in range(W):
        if GROUND_G[y][x] == 'g':
            n = cell_noise(x, y, 7)
            if n > 0.955 and near(x, y, POI_POINTS, 1) is False:
                GROUND_G[y][x] = 'f'
            elif n > 0.82:
                GROUND_G[y][x] = 'u'

# hedges: continuous clippings along path edges, broken every few tiles for access
PATHISH = 'pPbs'
for y in range(H):
    for x in range(W):
        if PROP_G[y][x] != '.' or GROUND_G[y][x] not in 'guf' \
                or near(x, y, POI_POINTS, 2) or near(x, y, DOOR_POINTS, 2):
            continue
        horiz = is_ground(x, y - 1, PATHISH) or is_ground(x, y + 1, PATHISH)
        vert = is_ground(x - 1, y, PATHISH) or is_ground(x + 1, y, PATHISH)
        if not (horiz or vert):
            continue
        keep = True
        if horiz and cell_noise(x // 3, y, 121) < 0.24:
            keep = False
        if vert and cell_noise(x, y // 3, 123) < 0.24:
            keep = False
        if keep:
            PROP_G[y][x] = 'H'

# trees: framed edges + lawn clusters
TREE_CANDIDATES = []
for y in range(0, H, 3):
    TREE_CANDIDATES += [(0, y), (63, y), (y, 0), (y, 63)]
for x in range(9, 56, 4):
    TREE_CANDIDATES += [(x, 8), (x, 55)]
for y in range(9, 56, 4):
    TREE_CANDIDATES += [(8, y), (55, y)]

for (x, y) in TREE_CANDIDATES:
    if 0 <= x < W and 0 <= y < H and GROUND_G[y][x] in 'guf' and PROP_G[y][x] == '.' \
            and not near(x, y, POI_POINTS, 2):
        PROP_G[y][x] = 'T'

for y in range(H):
    for x in range(W):
        if PROP_G[y][x] != '.' or GROUND_G[y][x] not in 'guf':
            continue
        if near(x, y, POI_POINTS, 2) or near(x, y, DOOR_POINTS, 2):
            continue
        # keep trees off the running track infield and the brick forecourt
        if 10 <= x <= 25 and 10 <= y <= 19:
            continue
        if 26 <= x <= 35 and 42 <= y <= 55:
            continue
        if cell_noise(x, y, 33) > 0.905:
            if not any(PROP_G[yy][xx] == 'T' for yy in range(max(0, y - 2), min(H, y + 3))
                       for xx in range(max(0, x - 2), min(W, x + 3))):
                PROP_G[y][x] = 'T'

# groves at the lawn corners, like the mature planting on the reference render
CLUSTERS = [(9, 9), (14, 9), (23, 9), (27, 9), (36, 10), (54, 9),
            (9, 22), (23, 22), (36, 22), (54, 22), (9, 32), (9, 43),
            (24, 47), (24, 53), (35, 32), (35, 43), (54, 32), (54, 43),
            (17, 22), (44, 43), (10, 55), (48, 55)]
for (gx, gy) in CLUSTERS:
    for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
        x, y = gx + dx, gy + dy
        if 0 <= x < W and 0 <= y < H and GROUND_G[y][x] in 'guf' and PROP_G[y][x] == '.' \
                and not near(x, y, POI_POINTS, 2) and not near(x, y, DOOR_POINTS, 2):
            PROP_G[y][x] = 'T'

# trees standing in the three oval planters
for (x, y) in [(28, 48), (32, 51), (30, 54)]:
    if GROUND_G[y][x] == 'g':
        PROP_G[y][x] = 'T'

# lamps + benches
for (x, y) in [(27, 31), (33, 31), (27, 40), (33, 40), (27, 47), (33, 47),
               (27, 52), (33, 52), (11, 20), (21, 20), (41, 20), (51, 20)]:
    if PROP_G[y][x] == '.' and GROUND_G[y][x] in 'pP':
        PROP_G[y][x] = 'l'
for (x, y) in [(28, 42), (32, 42), (28, 50), (31, 53), (21, 29), (48, 29), (11, 45), (50, 45)]:
    if PROP_G[y][x] == '.' and GROUND_G[y][x] in 'pPb':
        PROP_G[y][x] = 'n'

# --------------------------------------------------------------------------
# walkability + validation
# --------------------------------------------------------------------------
def solid(x, y):
    if not (0 <= x < W and 0 <= y < H):
        return True
    g = GROUND_G[y][x]
    p = PROP_G[y][x]
    return (not GROUND[g]['walkable']) or PROPS[p]['solid']


def bfs(start):
    seen = {start}
    q = [start]
    for cx, cy in q:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (cx + dx, cy + dy)
            if n not in seen and not solid(*n):
                seen.add(n)
                q.append(n)
    return seen


reach = bfs((30, 56))
unreachable = [p['id'] for p in POIS if (p['x'], p['y']) not in reach]
print('walkable tiles:', len(reach), '/', W * H)
print('unreachable POIs:', unreachable or 'none')

# clear obstructions that sit on POIs
for p in POIS:
    if (p['x'], p['y']) not in reach:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                x, y = p['x'] + dx, p['y'] + dy
                if PROP_G[y][x] in 'HTnl' and GROUND_G[y][x] != 'B':
                    PROP_G[y][x] = '.'
reach = bfs((30, 56))
print('after clearing, unreachable POIs:', [p['id'] for p in POIS if (p['x'], p['y']) not in reach] or 'none')

# --------------------------------------------------------------------------
# tile art
# --------------------------------------------------------------------------
def tile_new(bg):
    img = Image.new('RGBA', (TS, TS), bg)
    return img, ImageDraw.Draw(img)


def rnd_rect(d, x, y, w, h, c):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def tile_grass(v=0):
    img, d = tile_new(P['grass'])
    # broad mown patches
    for i in range(3):
        x = int(cell_noise(v + 1, i, 5) * 11)
        y = int(cell_noise(v + 1, i, 9) * 11)
        d.rectangle([x, y, x + 2, y + 1], fill=P['grass_l'] if i % 2 else P['grass_d'])
    # short blades: 2px clusters, three tones
    for i in range(7):
        x = 1 + int(cell_noise(v + 2, i, 17) * 13)
        y = 1 + int(cell_noise(v + 3, i, 19) * 13)
        d.point((x, y), fill=P['grass_xl'])
        d.point((x, y + 1), fill=P['grass_d'])
        if i % 2:
            d.point((x + 1, y + 1), fill=P['grass_l'])
    # clover dots
    for i in range(2):
        x = int(cell_noise(v + 4, i, 21) * 14)
        y = int(cell_noise(v + 5, i, 23) * 14)
        d.rectangle([x, y, x + 1, y], fill=P['grass_l'])
    return img


def tile_tuft():
    img, d = tile_new(P['grass'])
    for i in range(3):
        x = 3 + i * 4
        y = 12
        d.line([x, y, x - 1, y - 4], fill=P['grass_d'])
        d.line([x, y, x + 1, y - 5], fill=P['grass_l'])
        d.point((x + 1, y - 6), fill=P['grass_xl'])
    return img


def tile_flower(white=True):
    img, d = tile_new(P['grass'])
    blooms = [(3, 4), (11, 8)] if white else [(5, 11), (12, 3)]
    for i, (bx, by) in enumerate(blooms):
        c = P['flower_w'] if (white or i == 0) else P['flower_p']
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            d.point((bx + dx, by + dy), fill=c)
        d.point((bx, by), fill=P['flower_y'])
        d.point((bx + 2, by + 1), fill=P['grass_d'])
    for (px, py) in ((8, 12), (2, 9), (13, 13)):
        d.point((px, py), fill=P['flower_w'])
    return img


def tile_path(v=0):
    img, d = tile_new(P['path'])
    n = cell_noise(v, 4, 23)
    d.rectangle([0, 0, 15, 0], fill=P['path_line'])
    d.rectangle([0, 0, 0, 15], fill=P['path_line'])
    if v % 2 == 0:
        d.rectangle([7, 1, 7, 15], fill=P['path_line'])
        d.rectangle([1, 7, 15, 7], fill=P['path_line'])
    for i in range(6):
        x = int(cell_noise(v, i, 41) * 15)
        y = int(cell_noise(v, i, 43) * 15)
        d.point((x, y), fill=P['path_l'] if i % 2 else P['path_d'])
    if n > 0.78:
        d.rectangle([10, 10, 12, 11], fill=P['path_d'])
    if n < 0.12:
        d.rectangle([3, 3, 4, 3], fill=P['path_l'])
    return img


def tile_plaza():
    img, d = tile_new(P['plaza'])
    d.rectangle([0, 0, 15, 0], fill=P['plaza_d'])
    d.rectangle([0, 0, 0, 15], fill=P['plaza_d'])
    d.rectangle([8, 0, 8, 15], fill=P['plaza_d'])
    d.rectangle([0, 8, 15, 8], fill=P['plaza_d'])
    d.rectangle([2, 2, 6, 6], fill=P['plaza_l'])
    d.rectangle([10, 10, 14, 13], fill=P['plaza_l'])
    d.point((3, 12), fill=P['plaza_d'])
    return img


def tile_brick():
    img, d = tile_new(P['brick'])
    for row in range(4):
        y = row * 4
        d.rectangle([0, y, 15, y], fill=P['brick_d'])
        off = 0 if row % 2 == 0 else 4
        for x in range(off, 16, 8):
            d.rectangle([x, y, x, y + 3], fill=P['brick_d'])
        d.rectangle([0, y + 1, 15, y + 1], fill=P['brick_l'])
    return img


def tile_road():
    img, d = tile_new(P['road'])
    d.rectangle([0, 0, 15, 0], fill=P['road_l'])
    for i in range(9):
        x = int(cell_noise(i, 5, 61) * 16)
        y = int(cell_noise(i, 6, 63) * 16)
        d.point((x, y), fill=P['road_d'] if i % 3 else P['road_l'])
    # subtle asphalt seams so large roads do not look flat
    d.rectangle([0, 5, 3, 5], fill=P['road_d'])
    d.rectangle([11, 12, 15, 12], fill=P['road_d'])
    return img


def tile_cross(vertical=True):
    img, d = tile_new(P['road'])
    for k in (0, 8):
        if vertical:
            d.rectangle([0, k, 15, k + 2], fill=P['cross'])
            d.rectangle([0, k + 3, 15, k + 3], fill=P['road_d'])
        else:
            d.rectangle([k, 0, k + 2, 15], fill=P['cross'])
            d.rectangle([k + 3, 0, k + 3, 15], fill=P['road_d'])
    return img


def tile_track():
    img, d = tile_new(P['track'])
    for i in range(7):
        x = int(cell_noise(i, 7, 71) * 16)
        y = int(cell_noise(i, 8, 73) * 16)
        d.point((x, y), fill=P['track_d'] if i % 2 else P['track_l'])
    return img


def tile_court():
    img, d = tile_new(P['court'])
    for i in range(6):
        x = int(cell_noise(i, 9, 81) * 16)
        y = int(cell_noise(i, 10, 83) * 16)
        d.point((x, y), fill=P['court_d'] if i % 2 else P['court_l'])
    return img


def tile_stairs():
    img, d = tile_new(P['plaza'])
    for row in range(4):
        y = row * 4
        d.rectangle([0, y, 15, y + 1], fill=P['stone_l'])
        d.rectangle([0, y + 2, 15, y + 2], fill=P['stone_d'])
        d.rectangle([0, y + 3, 15, y + 3], fill=P['plaza_d'])
    return img


def tile_water():
    img, d = tile_new(P['water'])
    d.rectangle([1, 3, 6, 3], fill=P['water_l'])
    d.rectangle([9, 8, 14, 8], fill=P['water_l'])
    d.rectangle([3, 12, 7, 12], fill=P['water_l'])
    d.rectangle([2, 9, 4, 9], fill=P['water_d'])
    return img


def tile_hedge():
    img, d = tile_new(P['hedge_d'])
    d.rectangle([0, 1, 15, 14], fill=P['hedge'])
    d.rectangle([0, 1, 15, 2], fill=P['hedge_l'])
    d.rectangle([0, 13, 15, 14], fill=P['hedge_d'])
    # clipped scallops
    for (cx, cy) in ((2, 4), (7, 3), (12, 5), (4, 9), (9, 8), (14, 11)):
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=P['hedge_l'])
        d.point((cx - 1, cy - 2), fill=P['hedge_xl'])
        d.point((cx + 2, cy + 2), fill=P['hedge_d'])
    d.rectangle([0, 0, 15, 0], fill=P['hedge_d'])
    d.rectangle([0, 15, 15, 15], fill=P['hedge_d'])
    return img


def tile_tree():
    img, d = tile_new((0, 0, 0, 0))
    # ground shadow
    d.ellipse([2, 11, 14, 15], fill=(45, 62, 38, 90))
    d.rectangle([7, 9, 8, 15], fill=P['trunk'])
    d.rectangle([7, 10, 7, 15], fill=P['trunk_d'])
    # canopy: dark rim, mid mass, sun-lit crown
    d.ellipse([0, 0, 15, 13], fill=P['tree_d'])
    d.ellipse([1, 1, 14, 12], fill=P['tree'])
    d.ellipse([2, 2, 12, 10], fill=P['tree_l'])
    d.ellipse([4, 3, 9, 7], fill=P['tree_xl'])
    d.point((2, 6), fill=P['tree_d'])
    d.point((13, 8), fill=P['tree_d'])
    d.point((10, 2), fill=P['tree_xl'])
    d.point((6, 11), fill=P['tree_d'])
    d.point((11, 5), fill=P['tree_l'])
    return img


def tile_roof(kind):
    base = P['roof'] if kind == 'teach' else (P['roof_cds'] if kind == 'cds' else P['roof_gym'])
    light = P['roof_l'] if kind == 'teach' else (P['roof_cds_l'] if kind == 'cds' else P['roof_gym_l'])
    img, d = tile_new(base)
    d.rectangle([0, 0, 15, 0], fill=light)
    d.rectangle([0, 8, 15, 8], fill=P['roof_d'])
    d.rectangle([8, 0, 8, 15], fill=P['roof_d'])
    for i in range(4):
        x = int(cell_noise(i, 3, 101) * 14) + 1
        y = int(cell_noise(i, 4, 103) * 6) + 9
        d.point((x, y), fill=light)
    if kind == 'gym':
        d.rectangle([3, 12, 9, 12], fill=P['roof_gym_l'])
    return img


def tile_bench():
    img, d = tile_new((0, 0, 0, 0))
    d.rectangle([1, 7, 14, 12], fill=P['bench_d'])
    d.rectangle([1, 7, 14, 10], fill=P['bench'])
    d.rectangle([1, 8, 14, 8], fill=P['plaza_l'])
    d.rectangle([1, 10, 14, 10], fill=P['bench_d'])
    d.rectangle([2, 12, 3, 14], fill=P['bench_d'])
    d.rectangle([12, 12, 13, 14], fill=P['bench_d'])
    return img


def tile_lamp():
    img, d = tile_new((0, 0, 0, 0))
    d.rectangle([7, 5, 8, 15], fill=P['lamp'])
    d.rectangle([6, 1, 9, 4], fill=P['lamp'])
    d.rectangle([6, 2, 9, 3], fill=P['lamp_l'])
    d.rectangle([5, 5, 10, 5], fill=P['lamp'])
    d.point((7, 0), fill=P['lamp_l'])
    return img


TILE_ART = [
    ('g0', lambda: tile_grass(0)), ('g1', lambda: tile_grass(1)), ('g2', lambda: tile_grass(2)),
    ('flower', tile_flower), ('tuft', tile_tuft),
    ('path0', lambda: tile_path(0)), ('path1', lambda: tile_path(1)), ('plaza', tile_plaza),
    ('brick', tile_brick), ('road', tile_road),
    ('cross_h', lambda: tile_cross(True)), ('cross_v', lambda: tile_cross(False)),
    ('track', tile_track), ('court', tile_court), ('stairs', tile_stairs), ('water', tile_water),
    ('hedge', tile_hedge), ('tree', tile_tree), ('bench', tile_bench), ('lamp', tile_lamp),
    ('roof', lambda: tile_roof('teach')), ('roof2', lambda: tile_roof('cds')), ('roof3', lambda: tile_roof('gym')),
    ('blank', lambda: tile_new((0, 0, 0, 0))[0]),
]

# patch: ids from legend must line up with TILE_ART
assert len(TILE_ART) == 24, len(TILE_ART)

# --------------------------------------------------------------------------
# render map
# --------------------------------------------------------------------------
def ground_tile(g, x, y):
    v = int(cell_noise(x, y, 201) * 3)
    if g == 'g':
        return TILE_ART[v][1]()
    if g == 'f':
        return TILE_ART[3][1]()
    if g == 'u':
        return TILE_ART[4][1]()
    if g == 'p':
        return TILE_ART[5 + (v % 2)][1]()
    if g == 'P':
        return TILE_ART[7][1]()
    if g == 'b':
        return TILE_ART[8][1]()
    if g == 'r':
        return TILE_ART[9][1]()
    if g == 'z':
        return TILE_ART[10][1]()
    if g == 'x':
        return TILE_ART[11][1]()
    if g == 'k':
        return TILE_ART[12][1]()
    if g == 'c':
        return TILE_ART[13][1]()
    if g == 's':
        return TILE_ART[14][1]()
    if g == 'w':
        return TILE_ART[15][1]()
    raise KeyError(g)


ROADISH = set('rzx')


def prop_tile(p, b):
    if p == 'H':
        return TILE_ART[16][1]()
    if p == 'T':
        return TILE_ART[17][1]()
    if p == 'n':
        return TILE_ART[18][1]()
    if p == 'l':
        return TILE_ART[19][1]()
    if p == 'B':
        kind = next(x['roof'] for x in BUILDINGS if x['id'] == b)
        return TILE_ART[20 if kind == 'teach' else (21 if kind == 'cds' else 22)][1]()
    raise KeyError(p)


map_img = Image.new('RGBA', (W * TS, H * TS), P['grass'])
for y in range(H):
    for x in range(W):
        map_img.paste(ground_tile(GROUND_G[y][x], x, y), (x * TS, y * TS))

for y in range(H):
    for x in range(W):
        p = PROP_G[y][x]
        if p in 'HTnlB':
            map_img.alpha_composite(prop_tile(p, BID_G[y][x]), (x * TS, y * TS))

d = ImageDraw.Draw(map_img)

# curbs + centre dashes
for y in range(H):
    for x in range(W):
        if GROUND_G[y][x] not in ROADISH:
            continue
        px, py = x * TS, y * TS
        if GROUND_G[y][x] == 'r':
            if y > 0 and GROUND_G[y - 1][x] not in ROADISH:
                d.line([px, py, px + TS - 1, py], fill=P['curb'])
                d.line([px, py + 1, px + TS - 1, py + 1], fill=P['curb_d'])
            if y < H - 1 and GROUND_G[y + 1][x] not in ROADISH:
                d.line([px, py + TS - 1, px + TS - 1, py + TS - 1], fill=P['curb'])
                d.line([px, py + TS - 2, px + TS - 1, py + TS - 2], fill=P['curb_d'])
            if x > 0 and GROUND_G[y][x - 1] not in ROADISH:
                d.line([px, py, px, py + TS - 1], fill=P['curb'])
                d.line([px + 1, py, px + 1, py + TS - 1], fill=P['curb_d'])
            if x < W - 1 and GROUND_G[y][x + 1] not in ROADISH:
                d.line([px + TS - 1, py, px + TS - 1, py + TS - 1], fill=P['curb'])
                d.line([px + TS - 2, py, px + TS - 2, py + TS - 1], fill=P['curb_d'])

# dashes on the four roads (stop short of the corner junctions)
for x in range(6 * TS, 58 * TS, 12):
    d.rectangle([x, 63, x + 5, 64], fill=P['dash'])
    d.rectangle([x, 958, x + 5, 959], fill=P['dash'])
for y in range(6 * TS, 58 * TS, 12):
    d.rectangle([63, y, 64, y + 5], fill=P['dash'])
    d.rectangle([958, y, 959, y + 5], fill=P['dash'])

# water rim
for y in range(H):
    for x in range(W):
        if GROUND_G[y][x] != 'w':
            continue
        px, py = x * TS, y * TS
        for (nx, ny), line in (
            ((0, -1), [(px, py), (px + 15, py)]),
            ((0, 1), [(px, py + 15), (px + 15, py + 15)]),
            ((-1, 0), [(px, py), (px, py + 15)]),
            ((1, 0), [(px + 15, py), (px + 15, py + 15)]),
        ):
            if not (0 <= x + nx < W and 0 <= y + ny < H) or GROUND_G[y + ny][x + nx] != 'w':
                d.line(line, fill=P['stone_l'])

# track lanes
d.ellipse([10 * TS + 2, 10 * TS + 2, 25 * TS - 2, 19 * TS - 2], outline=P['track_d'])
d.ellipse([10 * TS + 5, 10 * TS + 5, 25 * TS - 5, 19 * TS - 5], outline=P['line'])
d.ellipse([10 * TS + 8, 10 * TS + 8, 25 * TS - 8, 19 * TS - 8], outline=P['line'])

# court lines
for x0, x1 in ((27, 30), (32, 35)):
    d.rectangle([x0 * TS + 2, 11 * TS + 2, (x1 + 1) * TS - 3, 18 * TS - 3], outline=P['line'])
    d.line([x0 * TS + 2, 14 * TS + 7, (x1 + 1) * TS - 3, 14 * TS + 7], fill=P['line'])
    d.ellipse([(x0 + 1.5) * TS, 13 * TS + 4, (x0 + 2.5) * TS, 14 * TS + 4], outline=P['line'])

# circular fountain plaza
fx, fy = 30 * TS, 37 * TS
d.ellipse([fx - 4.0 * TS, fy - 4.0 * TS, fx + 4.0 * TS, fy + 4.0 * TS], fill=P['plaza'])
d.ellipse([fx - 3.85 * TS, fy - 3.85 * TS, fx + 3.85 * TS, fy + 3.85 * TS], outline=P['plaza_d'])
d.ellipse([fx - 3.4 * TS, fy - 3.4 * TS, fx + 3.4 * TS, fy + 3.4 * TS], outline=P['stone_l'])
d.ellipse([fx - 3.95 * TS, fy - 3.95 * TS, fx + 3.95 * TS, fy + 3.95 * TS], outline=P['plaza_d'])
for k in range(16):
    a = k * math.pi / 8
    d.line([fx + math.cos(a) * 3.45 * TS, fy + math.sin(a) * 3.45 * TS,
            fx + math.cos(a) * 3.85 * TS, fy + math.sin(a) * 3.85 * TS], fill=P['plaza_d'])
d.ellipse([fx - 3.05 * TS, fy - 3.05 * TS, fx + 3.05 * TS, fy + 3.05 * TS], fill=P['stone'])
d.ellipse([fx - 2.85 * TS, fy - 2.85 * TS, fx + 2.85 * TS, fy + 2.85 * TS], fill=P['stone_d'])
d.ellipse([fx - 2.6 * TS, fy - 2.6 * TS, fx + 2.6 * TS, fy + 2.6 * TS], fill=P['water_d'])
d.ellipse([fx - 2.2 * TS, fy - 2.2 * TS, fx + 2.2 * TS, fy + 2.2 * TS], fill=P['water'])
# segmented stone kerb, echoing the circular paving on the plan
for k in range(8):
    a = k * math.pi / 4
    x0 = fx + math.cos(a - 0.18) * 3.15 * TS
    y0 = fy + math.sin(a - 0.18) * 3.15 * TS
    x1 = fx + math.cos(a + 0.18) * 3.15 * TS
    y1 = fy + math.sin(a + 0.18) * 3.15 * TS
    d.line([x0, y0, x1, y1], fill=P['stone_l'], width=5)
# water highlights + jet
d.arc([fx - 2.35 * TS, fy - 2.35 * TS, fx + 2.35 * TS, fy + 2.35 * TS], 200, 275, fill=P['water_l'], width=2)
d.arc([fx - 1.55 * TS, fy - 1.55 * TS, fx + 1.55 * TS, fy + 1.55 * TS], 15, 85, fill=P['water_l'], width=2)
d.arc([fx - 1.0 * TS, fy - 1.0 * TS, fx + 1.0 * TS, fy + 1.0 * TS], 190, 250, fill=P['water_d'])
d.ellipse([fx - 5, fy - 5, fx + 5, fy + 5], fill=P['stone_l'])
d.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill=P['water_l'])
d.rectangle([fx - 1, fy - 14, fx, fy - 7], fill=P['water_l'])
d.point((fx - 3, fy - 12), fill=P['water_l'])
d.point((fx + 3, fy - 12), fill=P['water_l'])

# planter rims (rings only — the trees inside are already composited)
for (cx, cy, rx, ry) in ((28.0, 48.0, 1.7, 1.1), (32.0, 51.0, 1.6, 1.0), (30.0, 54.0, 1.9, 1.0)):
    d.ellipse([(cx - rx - 0.55) * TS, (cy - ry - 0.55) * TS, (cx + rx + 0.55) * TS, (cy + ry + 0.55) * TS],
              outline=P['stone_l'], width=3)
    d.ellipse([(cx - rx - 0.2) * TS, (cy - ry - 0.2) * TS, (cx + rx + 0.2) * TS, (cy + ry + 0.2) * TS],
              outline=P['stone_d'], width=2)

# stairs edge rails
for y0 in (43 * TS, 44 * TS):
    d.line([27 * TS, y0, 34 * TS - 1, y0], fill=P['stone_l'])
d.rectangle([26 * TS, 43 * TS, 26 * TS + 15, 45 * TS - 1], fill=P['plaza_d'])
d.rectangle([33 * TS + 1, 43 * TS, 34 * TS, 45 * TS - 1], fill=P['plaza_d'])

# building parapets + roof clutter + doors
for b in BUILDINGS:
    kind = b['roof']
    edge = P['roof_edge'] if kind == 'teach' else (P['roof_cds_edge'] if kind == 'cds' else P['roof_gym_edge'])
    light = P['roof_l'] if kind == 'teach' else (P['roof_cds_l'] if kind == 'cds' else P['roof_gym_l'])
    roof_cells = [(x, y) for y in range(H) for x in range(W) if BID_G[y][x] == b['id']]
    for (x, y) in roof_cells:
        px, py = x * TS, y * TS
        if BID_G[y][x - 1] != b['id'] if x > 0 else True:
            d.rectangle([px, py, px + 1, py + 15], fill=edge)
        if x < W - 1 and BID_G[y][x + 1] != b['id']:
            d.rectangle([px + 14, py, px + 15, py + 15], fill=edge)
        if y > 0 and BID_G[y - 1][x] != b['id']:
            d.rectangle([px, py, px + 15, py + 1], fill=edge)
        if y < H - 1 and BID_G[y + 1][x] != b['id']:
            d.rectangle([px, py + 14, px + 15, py + 15], fill=edge)
        # deterministic roof clutter, kept clear of the parapet
        interior = (x > 0 and BID_G[y][x - 1] == b['id'] and x < W - 1 and BID_G[y][x + 1] == b['id']
                    and y > 0 and BID_G[y - 1][x] == b['id'] and y < H - 1 and BID_G[y + 1][x] == b['id'])
        n = cell_noise(x, y, 301)
        if interior and n > 0.93:
            d.rectangle([px + 4, py + 5, px + 10, py + 9], fill=P['roof_d'])
            d.rectangle([px + 5, py + 6, px + 9, py + 8], fill=light)
            d.rectangle([px + 5, py + 6, px + 9, py + 6], fill=P['roof_ll'])
        elif interior and n < 0.05:
            d.rectangle([px + 4, py + 6, px + 11, py + 8], fill=P['roof_ll'])
            d.rectangle([px + 4, py + 6, px + 11, py + 6], fill=light)
    # circular skylight for the gym
    if b['id'] == 'gym':
        d.ellipse([43 * TS, 12 * TS, 49 * TS, 17 * TS], outline=P['line'], width=2)
        d.ellipse([43.5 * TS, 12.4 * TS, 48.5 * TS, 16.6 * TS], fill=P['water_d'])
        d.ellipse([44 * TS, 12.9 * TS, 48 * TS, 16.1 * TS], fill=P['water'])
        d.arc([44 * TS, 13 * TS, 48 * TS, 16 * TS], 200, 250, fill=P['water_l'])
    # 1# has a round light-well, like the drilled hole on the plan
    if b['id'] == 'b1':
        d.ellipse([20.1 * TS, 36.1 * TS, 22.9 * TS, 38.9 * TS], fill=P['plaza_d'])
        d.ellipse([20.35 * TS, 36.35 * TS, 22.65 * TS, 38.65 * TS], fill=P['stone'])
        d.ellipse([20.9 * TS, 36.9 * TS, 22.1 * TS, 38.1 * TS], fill=P['plaza_l'])

# doors: lit awning + stone step, so entrances read at map scale
for b in BUILDINGS:
    dr = b['door']
    ex = dr['x'] * TS
    if dr['side'] == 's':
        ey = (dr['y'] - 1) * TS + 12
        d.rectangle([ex + 2, ey, ex + 13, ey + 1], fill=P['water_l'])
        d.rectangle([ex + 3, ey + 1, ex + 12, ey + 3], fill='#2B2F38')
        d.rectangle([ex + 4, ey + 2, ex + 7, ey + 3], fill=P['water_d'])
        d.rectangle([ex + 1, dr['y'] * TS, ex + 14, dr['y'] * TS + 2], fill=P['stone_l'])
        d.rectangle([ex + 1, dr['y'] * TS + 2, ex + 14, dr['y'] * TS + 3], fill=P['stone_d'])
    else:
        ey = (dr['y'] + 1) * TS
        d.rectangle([ex + 2, ey, ex + 13, ey + 1], fill=P['water_l'])
        d.rectangle([ex + 3, ey + 1, ex + 12, ey + 3], fill='#2B2F38')
        d.rectangle([ex + 4, ey + 2, ex + 7, ey + 3], fill=P['water_d'])
        d.rectangle([ex + 1, dr['y'] * TS + 14, ex + 14, dr['y'] * TS + 15], fill=P['stone_l'])

# --------------------------------------------------------------------------
# pixel font + labels
# --------------------------------------------------------------------------
FONT = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    ' ': ['00000'] * 7,
}


def text_w(t):
    return len(t) * 6 - 1


def draw_text(dr, text, x, y, color, scale=1):
    cx = x
    for ch in text.upper():
        rows = FONT.get(ch, FONT[' '])
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == '1':
                    dr.rectangle([cx + rx * scale, y + ry * scale, cx + (rx + 1) * scale - 1, y + (ry + 1) * scale - 1],
                                 fill=color)
        cx += 6 * scale


def pill(dr, x, y, w, h, fill, border, text, tc, scale=2):
    pts = [(x + 2, y), (x + w - 3, y), (x + w - 1, y + 2), (x + w - 1, y + h - 3),
           (x + w - 3, y + h - 1), (x + 2, y + h - 1), (x, y + h - 3), (x, y + 2)]
    dr.polygon(pts, fill=border)
    inner = [(x + 3, y + 1), (x + w - 4, y + 1), (x + w - 2, y + 3), (x + w - 2, y + h - 4),
             (x + w - 4, y + h - 2), (x + 3, y + h - 2), (x + 1, y + h - 4), (x + 1, y + 3)]
    dr.polygon(inner, fill=fill)
    tw = text_w(text) * scale
    draw_text(dr, text, x + (w - tw) // 2, y + (h - 7 * scale) // 2, tc, scale)


# map furniture: compass + scale bar (present in both clean and labelled renders)
ccx, ccy = 22, 22
d.ellipse([ccx - 13, ccy - 13, ccx + 13, ccy + 13], fill=P['stone_l'], outline=P['stone_d'])
d.ellipse([ccx - 10, ccy - 10, ccx + 10, ccy + 10], outline=P['path_line'])
d.polygon([(ccx, ccy - 8), (ccx - 4, ccy + 4), (ccx, ccy + 1), (ccx + 4, ccy + 4)], fill=P['roof'])
d.rectangle([ccx - 1, ccy + 1, ccx, ccy + 1], fill=P['stone_d'])

sx, sy = 7 * TS, 62 * TS + 2
for k in range(3):
    d.rectangle([sx + k * 16, sy + 1, sx + k * 16 + 15, sy + 4], fill=P['roof_d'] if k % 2 == 0 else P['path_l'])
    d.rectangle([sx + k * 16, sy + 1, sx + k * 16, sy + 4], fill=P['roof_d'])
d.rectangle([sx, sy + 1, sx + 47, sy + 1], fill=P['roof_d'])
draw_text(d, '10M', sx + 52, sy - 1, P['roof_d'], 1)

# clean render (no labels) for use as a game background
clean = map_img.copy()

# labelled render for humans / map inspection
labeled = map_img.copy()
ld = ImageDraw.Draw(labeled)
for b in BUILDINGS:
    cells = [(x, y) for y in range(H) for x in range(W) if BID_G[y][x] == b['id']]
    cx = sum(x for x, _ in cells) / len(cells)
    cy = sum(y for _, y in cells) / len(cells)
    label = b['label']
    tw = text_w(label) * 2
    w = tw + 11
    h = 20
    bx = int(cx * TS) - w // 2
    by = int(cy * TS) - h // 2
    pill(ld, bx, by, w, h, '#4F9E92', '#2F6B62', label, P['line'])

road_labels = [(6, 38, 'ZUCHONGZHI RD'), (6, 934, 'JIDIAN RD')]
for x, y, name in road_labels:
    draw_text(ld, name, x * TS + 4, y, (226, 223, 219), 1)

for name, x, y in (('JICHUANG RD', 34, 96), ('FANGCHUN RD', 930, 96)):
    tmp = Image.new('RGBA', (text_w(name) + 2, 9), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    draw_text(td, name, 1, 1, (226, 223, 219), 1)
    rot = tmp.rotate(90, expand=True)
    labeled.alpha_composite(rot, (x, y))

preview = labeled.resize((W * TS * SCALE, H * TS * SCALE), Image.NEAREST).convert('RGB')
preview.save(os.path.join(OUT, 'campus_preview.png'), optimize=True)
preview.resize((W * TS, H * TS), Image.NEAREST).save(
    os.path.join(OUT, 'campus_preview_1024.png'), optimize=True)

clean_big = clean.resize((W * TS * SCALE, H * TS * SCALE), Image.NEAREST).convert('RGB')
clean_big.save(os.path.join(OUT, 'campus_clean.png'), optimize=True)
clean_big.resize((W * TS, H * TS), Image.NEAREST).save(
    os.path.join(OUT, 'campus_clean_1024.png'), optimize=True)

# --------------------------------------------------------------------------
# tileset atlas
# --------------------------------------------------------------------------
atlas = Image.new('RGBA', (COLS * TS, (len(TILE_ART) // COLS + (1 if len(TILE_ART) % COLS else 0)) * TS),
                  (0, 0, 0, 0))
for i, (key, fn) in enumerate(TILE_ART):
    if i == 23:
        break
    atlas.alpha_composite(fn(), ((i % COLS) * TS, (i // COLS) * TS))
atlas.save(os.path.join(OUT, 'tileset.png'), optimize=True)

# labelled 4x tile sheet
S4 = 4
cols4 = COLS
rows4 = 3
cell = TS * S4
pad = 32
sheet = Image.new('RGB', (cols4 * cell + 20, rows4 * (cell + pad) + 20), '#23262D')
sd = ImageDraw.Draw(sheet)
for i, (key, fn) in enumerate(TILE_ART):
    if i == 23:
        break
    x = 10 + (i % cols4) * cell
    y = 10 + (i // cols4) * (cell + pad)
    sd.rectangle([x - 2, y - 2, x + cell + 1, y + cell + 1], fill='#34383F')
    sheet.paste(fn().resize((cell, cell), Image.NEAREST), (x, y))
    draw_text(sd, f'{i:02d}', x + 2, y + cell + 4, '#C9C2C7', 1)
    draw_text(sd, key.upper()[:9], x + 22, y + cell + 4, '#8FAE45', 1)
    draw_text(sd, 'TILE ' + f'{i:02d}', x + 2, y + cell + 16, '#6E727B', 1)
sheet.save(os.path.join(OUT, 'tileset@4x.png'), optimize=True)

# --------------------------------------------------------------------------
# JSON map
# --------------------------------------------------------------------------
def rows(layer):
    return [''.join(r) for r in layer]


def tile_variant_id(g, x, y):
    v = int(cell_noise(x, y, 201) * 3)
    if g == 'g':
        return v
    if g == 'p':
        return 5 + (v % 2)
    return GROUND[g]['id']


ground_rows = rows(GROUND_G)
prop_rows = rows(PROP_G)

walk_rows = []
walk_ids = []
for y in range(H):
    walk_rows.append(''.join('1' if not solid(x, y) else '0' for x in range(W)))

# regions
REGIONS = [
    dict(id='campus', name='校园街区', rect=[6, 6, 57, 57], tags=['campus']),
    dict(id='ring', name='环校步道', rect=[6, 6, 57, 57], tags=['path', 'ring']),
    dict(id='north_promenade', name='北侧步道', rect=[8, 19, 55, 20], tags=['path']),
    dict(id='central_axis', name='中央大道', rect=[26, 29, 34, 56], tags=['path', 'axis']),
    dict(id='sports_field', name='田径场', rect=[10, 10, 25, 19], tags=['sport', 'track']),
    dict(id='courts', name='室外球场', rect=[27, 11, 35, 17], tags=['sport', 'court']),
    dict(id='fountain_plaza', name='圆形广场', rect=[26, 33, 34, 41], tags=['plaza', 'landmark']),
    dict(id='brick_plaza', name='砖石广场', rect=[26, 42, 34, 55], tags=['plaza']),
]

ROADS = [
    dict(id='zuchongzhi', zh='祖冲之路', en='ZUCHONGZHI RD', axis='h', rect=[0, 2, 63, 5]),
    dict(id='jichuang', zh='集创路', en='JICHUANG RD', axis='v', rect=[2, 0, 5, 63]),
    dict(id='fangchun', zh='芳春路', en='FANGCHUN RD', axis='v', rect=[58, 0, 61, 63]),
    dict(id='jidian', zh='集电路', en='JIDIAN RD', axis='h', rect=[0, 58, 63, 61]),
]

tiles_meta = []
for g, info in GROUND.items():
    ids = [info['id']]
    if g == 'g':
        ids = [0, 1, 2]
    elif g == 'p':
        ids = [5, 6]
    for i in ids:
        tiles_meta.append(dict(id=i, key=TILE_ART[i][0], glyph=g, name=info['name'],
                               walkable=info['walkable'], role='ground'))
for g, info in PROPS.items():
    if info['id'] >= 0:
        tiles_meta.append(dict(id=info['id'], key=TILE_ART[info['id']][0], glyph=g, name=info['name'],
                               solid=info['solid'], role='prop'))
tiles_meta.append(dict(id=21, key='roof2', glyph='B', name='CDS roof', solid=True, role='prop'))
tiles_meta.append(dict(id=22, key='roof3', glyph='B', name='gym roof', solid=True, role='prop'))
tiles_meta.sort(key=lambda t: t['id'])

ground_ids = [[tile_variant_id(GROUND_G[y][x], x, y) for x in range(W)] for y in range(H)]
prop_ids = []
for y in range(H):
    row = []
    for x in range(W):
        p = PROP_G[y][x]
        if p == 'B':
            bid = BID_G[y][x]
            kind = next(b['roof'] for b in BUILDINGS if b['id'] == bid)
            row.append(ROOF_TILE[kind])
        else:
            row.append(PROPS[p]['id'])
    prop_ids.append(row)

MAP = dict(
    format='dsh.campus.tilemap/1',
    name='张江学园 · 集电校区',
    subtitle='以 IMG_5550.HEIC 的街区平面为骨架，按像素画参考重绘',
    source=dict(layout='IMG_5550.HEIC', style='微信图片_20261121125129_228_236.png'),
    size=dict(cols=W, rows=H, tileSize=TS, displayScale=SCALE,
              pixelWidth=W * TS, pixelHeight=H * TS, previewScale=SCALE),
    origin='top-left, x right, y down',
    tileset=dict(image='tileset.png', columns=COLS, tileSize=TS, tileCount=len(TILE_ART),
                 tiles=tiles_meta),
    palette=P,
    legend=dict(ground={k: dict(glyph=k, **v) for k, v in GROUND.items()},
                props={k: dict(glyph=k, **v) for k, v in PROPS.items()}),
    navigation=dict(
        walkableGlyphs=[g for g, v in GROUND.items() if v['walkable']],
        blockedGlyphs=[g for g, v in GROUND.items() if not v['walkable']],
        solidProps=[p for p, v in PROPS.items() if v['solid']],
        diagonal=False,
        note='四邻道路不可通行；过街只能走斑马线（z 横穿 / x 纵穿）。',
    ),
    layers=dict(ground=ground_rows, props=prop_rows, groundIds=ground_ids, propIds=prop_ids,
                walkable=walk_rows),
    buildings=[dict(id=b['id'], label=b['label'], name=b['name'], zh=b['zh'],
                    rects=[list(r) for r in b['rects']], door=b['door'],
                    roof=b['roof'], roofTileId=ROOF_TILE[b['roof']],
                    solid=True, tags=b['tags']) for b in BUILDINGS],
    pois=POIS,
    spawn=dict(x=30, y=56, facing='north'),
    regions=REGIONS,
    roads=ROADS,
    bounds=dict(x=0, y=0, w=W, h=H),
)

with open(os.path.join(OUT, 'campus.tilemap.json'), 'w', encoding='utf-8') as f:
    json.dump(MAP, f, ensure_ascii=False, indent=1)

# --------------------------------------------------------------------------
# Tiled .tmj
# --------------------------------------------------------------------------
gid_ground = []
for row in ground_ids:
    gid_ground.extend(0 if v is None else v + 1 for v in row)
gid_props = []
for row in prop_ids:
    gid_props.extend(0 if v < 0 else v + 1 for v in row)

tmj = dict(
    type='map', version='1.10', tiledversion='1.10.2', orientation='orthogonal',
    renderorder='right-down', width=W, height=H, tilewidth=TS, tileheight=TS,
    infinite=False, backgroundcolor='#23262D',
    tilesets=[dict(firstgid=1, name='campus', image='tileset.png', imagewidth=COLS * TS,
                   imageheight=len(TILE_ART) // COLS * TS, tilewidth=TS, tileheight=TS,
                   tilecount=len(TILE_ART), columns=COLS,
                   tiles=[dict(id=i, type=t[0]) for i, t in enumerate(TILE_ART)][:23])],
    layers=[
        dict(id=1, name='ground', type='tilelayer', width=W, height=H, opacity=1,
             visible=True, data=gid_ground),
        dict(id=2, name='props', type='tilelayer', width=W, height=H, opacity=1,
             visible=True, data=gid_props),
        dict(id=3, name='objects', type='objectgroup', opacity=1, visible=True,
             objects=([dict(id=100 + i, name=p['id'], type=p['kind'],
                            x=p['x'] * TS, y=p['y'] * TS, width=TS, height=TS,
                            properties=[dict(name='zh', type='string', value=p['zh'])])
                       for i, p in enumerate(POIS)] +
                      [dict(id=200 + i, name=b['id'], type='building',
                            x=b['rects'][0][0] * TS, y=b['rects'][0][1] * TS,
                            width=(b['rects'][0][2] - b['rects'][0][0] + 1) * TS,
                            height=(b['rects'][0][3] - b['rects'][0][1] + 1) * TS,
                            properties=[dict(name='zh', type='string', value=b['zh'])])
                       for i, b in enumerate(BUILDINGS)])),
    ],
)
with open(os.path.join(OUT, 'campus.tmj'), 'w', encoding='utf-8') as f:
    json.dump(tmj, f, ensure_ascii=False, indent=1)

# --------------------------------------------------------------------------
# ASCII export
# --------------------------------------------------------------------------
def ruler(n):
    return ''.join(str(i // 10 % 10) if i % 10 == 0 else ' ' for i in range(n))


def ruler2(n):
    return ''.join(str(i % 10) for i in range(n))


lines = ['# 张江学园 · 集电校区 tile map', f'# {W}x{H} @ {TS}px  (display x{SCALE})',
         '# 层 1 — ground', '    ' + ruler(W), '    ' + ruler2(W)]
for y, row in enumerate(ground_rows):
    lines.append(f'{y:02d}  ' + row)
lines += ['', '# 层 2 — props (. 空 / H 绿篱 / T 树 / n 长椅 / l 路灯 / B 建筑)', '    ' + ruler(W)]
for y, row in enumerate(prop_rows):
    lines.append(f'{y:02d}  ' + row)
lines += ['', '# 层 3 — walkable (1 可走 / 0 阻挡)', '    ' + ruler(W)]
for y, row in enumerate(walk_rows):
    lines.append(f'{y:02d}  ' + row)
lines += ['', '# POIs']
for p in POIS:
    lines.append(f"{p['id']:<16} ({p['x']:02d},{p['y']:02d})  {p['zh']}  [{p['kind']}]")
with open(os.path.join(OUT, 'campus_ascii.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

# --------------------------------------------------------------------------
# legend sheet
# --------------------------------------------------------------------------
FONT_CJK = '/System/Library/Fonts/Hiragino Sans GB.ttc'
try:
    fz = ImageFont.truetype(FONT_CJK, 22)
    fz_small = ImageFont.truetype(FONT_CJK, 17)
    fz_title = ImageFont.truetype(FONT_CJK, 30)
    fz_latin = ImageFont.truetype(FONT_CJK, 13)
    fz_zh = ImageFont.truetype(FONT_CJK, 15)
except Exception:
    fz = fz_small = fz_title = fz_latin = fz_zh = ImageFont.load_default()

LG_W, LG_H = 1180, 900
lg = Image.new('RGB', (LG_W, LG_H), '#23262D')
ld = ImageDraw.Draw(lg)
ld.text((36, 28), '张江学园 · 集电校区  —  Tile Map Legend', font=fz_title, fill='#F2EFEA')
ld.text((36, 68), 'tile 16px    64 x 64 tiles    display x2 = 2048px    walkable grid + POIs in campus.tilemap.json',
        font=fz_latin, fill='#9A9DA6')

sx0, sy0 = 36, 112
cell = 44
per_row = 8
for i, t in enumerate(tiles_meta[:23]):
    c, r = i % per_row, i // per_row
    x, y = sx0 + c * 112, sy0 + r * 92
    ld.rectangle([x, y, x + cell - 1, y + cell - 1], fill=P['grass'])
    fn = TILE_ART[t['id']][1]()
    tile_rgba = fn.resize((cell, cell), Image.NEAREST)
    lg.paste(tile_rgba, (x, y), tile_rgba)
    ld.rectangle([x - 1, y - 1, x + cell, y + cell], outline='#4A4E57')
    ld.text((x + 2, y + cell + 1), f"{t['id']:02d} {t['key']}", font=fz_latin, fill='#8FAE45')
    info = GROUND.get(t.get('glyph')) or PROPS.get(t.get('glyph')) or {}
    zh = info.get('zh', t['key']).split('·')[0]
    ld.text((x + 2, y + cell + 16), zh, font=fz_zh, fill='#D8D3CE')

# right column: key
kx = 36 + 8 * 112 + 16
ld.text((kx, sy0), 'NAVIGATION', font=fz_small, fill='#8FAE45')
nav_lines = [
    'walkable ground:',
    '  g f u  lawn / flowers',
    '  p P b  paved / plaza',
    '  z x    zebra crossings',
    '  k c s  track / court / stairs',
    'blocked ground:  r  w',
    'solid props:     H T n l B',
]
for i, line in enumerate(nav_lines):
    ld.text((kx, sy0 + 28 + i * 20), line, font=fz_latin, fill='#D8D3CE')

ld.text((kx, sy0 + 200), 'ROADS', font=fz_small, fill='#8FAE45')
for i, rd in enumerate(ROADS):
    ld.text((kx, sy0 + 228 + i * 24), f"{rd['zh']}  {rd['en']}", font=fz_zh, fill='#D8D3CE')

ld.text((kx, sy0 + 354), 'BUILDINGS', font=fz_small, fill='#8FAE45')
for i, b in enumerate(BUILDINGS):
    ld.text((kx, sy0 + 382 + i * 21), f"{b['label']:<6} {b['zh']}", font=fz_zh, fill='#D8D3CE')

ld.text((kx, sy0 + 570), 'POIs  (x, y)', font=fz_small, fill='#8FAE45')
for i, p in enumerate(POIS[:13]):
    ld.text((kx, sy0 + 596 + i * 19), f"{p['id']:<12} ({p['x']:02d},{p['y']:02d})", font=fz_latin,
            fill='#D8D3CE')
ld.text((kx, sy0 + 852), '+ 5 more in campus.tilemap.json', font=fz_latin, fill='#7E828B')

# mini map fills the lower-left space
thumb = Image.open(os.path.join(OUT, 'campus_clean_1024.png')).resize((360, 360), Image.NEAREST)
lg.paste(thumb, (36, 420))
ld.rectangle([35, 419, 396, 781], outline='#4A4E57')
ld.text((36, 790), 'campus_clean.png  —  rendered 64 x 64 tile map, label-free', font=fz_latin, fill='#8E929B')

ld.text((36, LG_H - 46), 'style: 16px tiles, 2px pixel clusters, muted lawn/pavement/asphalt palette sampled from the reference render',
        font=fz_latin, fill='#7E828B')
lg.save(os.path.join(OUT, 'campus_legend.png'), optimize=True)

print('wrote', OUT)
print('sizes:', os.path.getsize(os.path.join(OUT, 'campus_preview.png')),
      os.path.getsize(os.path.join(OUT, 'campus.tilemap.json')))
