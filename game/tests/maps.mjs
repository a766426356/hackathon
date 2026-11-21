// maps.mjs — 室内地图体检：尺寸、交互点落脚、从出生点能不能走到每个点。
// 只依赖纯数据，node 直接跑：node tests/maps.mjs

import { SCENES, ISOLID, IW, IH } from '../src/interiors.js';

let bad = 0;
const fail = (msg) => { console.log('✗ ' + msg); bad++; };

function walkable(ch) {
  return ch !== undefined && !ISOLID.has(ch);
}

// 从出生点做一次四邻 BFS，判断哪些地砖真的能站人
function reachable(sc) {
  const seen = new Set();
  const start = sc.spawn;
  if (!walkable(sc.map[start.y] && sc.map[start.y][start.x])) return seen;
  const q = [[start.x, start.y]];
  seen.add(start.x + ',' + start.y);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = nx + ',' + ny;
      if (seen.has(k)) continue;
      const row = sc.map[ny];
      if (!row || !walkable(row[nx])) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

for (const [id, sc] of Object.entries(SCENES)) {
  if (sc.map.length !== IH) fail(id + '：应有 ' + IH + ' 行，实际 ' + sc.map.length);
  sc.map.forEach((row, y) => {
    if (row.length !== IW) fail(id + ' 第 ' + y + ' 行宽度 ' + row.length + '（应为 ' + IW + '）');
  });

  const seen = reachable(sc);

  // 出生点
  if (!walkable(sc.map[sc.spawn.y][sc.spawn.x])) fail(id + '：出生点压在实体上');

  for (const sp of sc.spots) {
    const ch = sc.map[sp.y] && sc.map[sp.y][sp.x];
    if (!walkable(ch)) {
      fail(id + '：交互点 ' + sp.id + ' 落在实体格「' + ch + '」上');
      continue;
    }
    if (!seen.has(sp.x + ',' + sp.y)) {
      fail(id + '：交互点 ' + sp.id + '（' + sp.x + ',' + sp.y + '）从出生点走不到');
    }
  }
}

// 校园：可行走矩形必须连成一片，而且每个交互点附近都得有能站人的地方
const campus = await import('../data.js');
const { WALKABLE, INTERACTABLES, SPAWN, MAP_W, MAP_H, CAMPUS } = campus;
const S = MAP_W / CAMPUS.w;
const RECTS = WALKABLE.map((r) => ({
  x0: r.x * S, y0: r.y * S, x1: (r.x + r.w) * S, y1: (r.y + r.h) * S,
}));
const walk = (x, y) => RECTS.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

// 8px 网格 BFS，够细，又能跑得很快
const STEP = 8;
const key = (x, y) => Math.round(x / STEP) + ',' + Math.round(y / STEP);
const seenCampus = new Set();
const startKey = key(SPAWN.x * S, SPAWN.y * S);
if (!walk(SPAWN.x * S, SPAWN.y * S)) fail('校园：出生点不在可行走区域');

const qc = [[SPAWN.x * S, SPAWN.y * S]];
seenCampus.add(startKey);
while (qc.length) {
  const [x, y] = qc.pop();
  for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx > MAP_W || ny > MAP_H) continue;
    const k = key(nx, ny);
    if (seenCampus.has(k) || !walk(nx, ny)) continue;
    seenCampus.add(k);
    qc.push([nx, ny]);
  }
}

const REACH = 46; // 和 world.js 的交互距离一致
for (const it of INTERACTABLES) {
  const cx = it.x * S;
  const cy = it.y * S;
  const r = Math.ceil(REACH / STEP);
  let okSpot = false;
  for (let dy = -r; dy <= r && !okSpot; dy++) {
    for (let dx = -r; dx <= r && !okSpot; dx++) {
      if (dx * dx + dy * dy > REACH * REACH) continue;
      const px = cx + dx * STEP;
      const py = cy + dy * STEP;
      if (seenCampus.has(key(px, py))) okSpot = true;
    }
  }
  if (!okSpot) fail('校园：交互点 ' + it.id + ' 附近 ' + REACH + 'px 内没有能站的地方');
}

// 每一块可行走区域都必须能从出生点走到（不能有孤岛）
for (const r of WALKABLE) {
  const cx = (r.x + r.w / 2) * S;
  const cy = (r.y + r.h / 2) * S;
  if (!seenCampus.has(key(cx, cy))) fail('校园：区域 ' + r.id + ' 从出生点走不到（孤岛）');
}

console.log(bad ? '' : '校园 ' + WALKABLE.length + ' 块区域连成一片、' + INTERACTABLES.length + ' 个交互点都够得着 ✓');
if (bad) console.log('校园检查失败');
console.log(bad ? '\n地图检查失败：' + bad + ' 处' : '室内 ' + Object.keys(SCENES).length + ' 张图 + 校园：全部可达 ✓');
process.exit(bad ? 1 : 0);
