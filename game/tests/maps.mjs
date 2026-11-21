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

// 校园门口：能不能走到两栋楼的门
const campus = await import('../data.js');
const { MAP, INTERACTABLES, SPAWN } = campus;
const seenCampus = new Set();
const qc = [[SPAWN.x, SPAWN.y]];
seenCampus.add(SPAWN.x + ',' + SPAWN.y);
while (qc.length) {
  const [x, y] = qc.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx; const ny = y + dy;
    const k = nx + ',' + ny;
    if (seenCampus.has(k)) continue;
    const row = MAP[ny];
    if (!row || 'TBW'.includes(row[nx])) continue;
    seenCampus.add(k);
    qc.push([nx, ny]);
  }
}
for (const it of INTERACTABLES) {
  if (!seenCampus.has(it.x + ',' + it.y)) fail('校园：交互点 ' + it.id + ' 走不到');
}

// 日历活动的出发点：只在当天出现，所以不在 INTERACTABLES 里，但必须同样站得住、走得到
const { EVENT_PLACES, EVENTS } = campus;
for (const [key, p] of Object.entries(EVENT_PLACES)) {
  const ch = MAP[p.y] && MAP[p.y][p.x];
  if (ch === undefined) { fail('活动出发点 ' + key + '：坐标越界'); continue; }
  if ('TBW'.includes(ch)) fail('活动出发点 ' + key + '（' + p.x + ',' + p.y + '）压在实体格「' + ch + '」上');
  if (!seenCampus.has(p.x + ',' + p.y)) fail('活动出发点 ' + key + '（' + p.x + ',' + p.y + '）走不到');
}
for (const e of EVENTS) {
  if (!EVENT_PLACES[e.place]) fail('活动 ' + e.id + ' 的 place「' + e.place + '」没有定义');
  if (e.day < 1 || e.day > 7) fail('活动 ' + e.id + ' 的 day 越界：' + e.day);
}

// 活动点必须和固定点隔开两格以上：走近时只认最近的一个，
// 两个点挨在一起会出现「站在活动点旁边却按出别的点」。
for (const [key, p] of Object.entries(EVENT_PLACES)) {
  for (const it of INTERACTABLES) {
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d < 2) {
      fail('活动出发点 ' + key + ' 和固定点 ' + it.id + ' 只隔 ' + d.toFixed(1) + ' 格，会抢交互');
    }
  }
}

console.log(bad ? '\n地图检查失败：' + bad + ' 处'
  : '室内 ' + Object.keys(SCENES).length + ' 张图 + 校园门口 + ' +
    Object.keys(EVENT_PLACES).length + ' 个活动出发点：全部可达 ✓');
process.exit(bad ? 1 : 0);
