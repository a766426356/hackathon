// maps.mjs — 数据体检：校园可行走区域 + 楼层/房间表。
// 用法：node tests/maps.mjs

import * as rules from '../src/rules.js';
import { BUILDING_FLOORS, roomsText } from '../src/interiors.js';

let bad = 0;
const fail = (msg) => { console.log('✗ ' + msg); bad++; };

// ---------------------------------------------------------------- 校园
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
const seen = new Set();
if (!walk(SPAWN.x * S, SPAWN.y * S)) fail('校园：出生点不在可行走区域');

const q = [[SPAWN.x * S, SPAWN.y * S]];
seen.add(key(SPAWN.x * S, SPAWN.y * S));
while (q.length) {
  const [x, y] = q.pop();
  for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx > MAP_W || ny > MAP_H) continue;
    const k = key(nx, ny);
    if (seen.has(k) || !walk(nx, ny)) continue;
    seen.add(k);
    q.push([nx, ny]);
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
      if (seen.has(key(cx + dx * STEP, cy + dy * STEP))) okSpot = true;
    }
  }
  if (!okSpot) fail('校园：交互点 ' + it.id + ' 附近 ' + REACH + 'px 内没有能站的地方');
}

// 每一块可行走区域都必须能从出生点走到（不能有孤岛）
for (const r of WALKABLE) {
  if (!seen.has(key((r.x + r.w / 2) * S, (r.y + r.h / 2) * S))) {
    fail('校园：区域 ' + r.id + ' 走不到（孤岛）');
  }
}

// ---------------------------------------------------------------- 楼层 / 房间
// 房间动作分两类：走 rules 的，和直接开面板的（char/calendar/leave）
const ACTION_FN = {
  course: 1, doubt: 1, pingpong: 1, snooker: 1, piano: 1, studyroom: 1, pray: 1,
  rest: 1, roomieTalk: 1, char: 1, calendar: 1, leave: 1,
};
const UI_ACTIONS = new Set(['char', 'calendar', 'leave']);
let roomCount = 0;

for (const [id, b] of Object.entries(BUILDING_FLOORS)) {
  if (!b.floors.length) fail(id + '：一层都没有');
  const levels = new Set();
  for (const f of b.floors) {
    if (levels.has(f.level)) fail(id + '：楼层 level 重复（' + f.level + '）');
    levels.add(f.level);
    if (!roomsText(f)) fail(id + ' ' + f.label + '：楼层牌上没有写这层有什么');
    if (f.locked) {
      if (f.rooms.length) fail(id + ' ' + f.label + '：标了未开放却有房间');
      continue;
    }
    if (!f.rooms.length) fail(id + ' ' + f.label + '：开放楼层却没有房间');
    for (const r of f.rooms) {
      roomCount++;
      if (!ACTION_FN[r.action]) {
        fail(id + ' ' + f.label + ' / ' + r.name + '：action「' + r.action + '」没有对应规则');
      } else if (!UI_ACTIONS.has(r.action) && typeof rules[r.action] !== 'function') {
        fail('rules.' + r.action + ' 不是函数');
      }
      if (!r.effect) fail(id + ' / ' + r.name + '：没有写清收益');
      if (!(r.ap >= 0)) fail(id + ' / ' + r.name + '：AP 成本异常（' + r.ap + '）');
    }
  }
  // 竖排电梯靠 level 排序，至少要有一层在地上
  if (!b.floors.some((f) => f.level > 0)) fail(id + '：没有地上的楼层');
}

console.log(bad
  ? ''
  : '校园 ' + WALKABLE.length + ' 块区域连成一片、' + INTERACTABLES.length +
    ' 个交互点够得着；' + Object.keys(BUILDING_FLOORS).length + ' 栋楼 / ' + roomCount + ' 个房间数据自洽 ✓');
console.log(bad ? '\n检查失败：' + bad + ' 处' : '全部检查通过 ✓');
process.exit(bad ? 1 : 0);
