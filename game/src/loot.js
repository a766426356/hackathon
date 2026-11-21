// loot.js — 战利品加成。纯计算，不碰 DOM，也不碰随机（抽取在 rules.rollLoot 里做）。
//
// 战利品只放大「出口」：
//   damage → 牌打得更疼   hp → 血量上限更厚   day → 白天收益更高
// 三个属性本身（知识 / 心境 / 体质）一点不动，所以 examGpa 基本不受影响。

import { CONFIG, LOOT_KIND } from '../data.js';

// 某一类加成现在叠了多少（已按上限截断）
export function lootMult(s, kind) {
  let sum = 0;
  for (const l of s.loot || []) if (l.kind === kind) sum += l.value;
  return Math.min(CONFIG.lootCap, sum);
}

// 原始叠量（没截断），用来判断「到顶了没」
export function lootRaw(s, kind) {
  let sum = 0;
  for (const l of s.loot || []) if (l.kind === kind) sum += l.value;
  return sum;
}

export function lootCapped(s, kind) {
  return lootRaw(s, kind) >= CONFIG.lootCap;
}

export function lootTotals(s) {
  return {
    damage: lootMult(s, 'damage'),
    hp: lootMult(s, 'hp'),
    day: lootMult(s, 'day'),
  };
}

export function lootCount(s) {
  return (s.loot || []).length;
}

// 同名战利品合起来显示：「拖延兽的尾巴 ×2」
export function lootStack(s) {
  const map = new Map();
  for (const l of s.loot || []) {
    const cur = map.get(l.id);
    if (cur) cur.n += 1;
    else map.set(l.id, { ...l, n: 1 });
  }
  return Array.from(map.values());
}

export function lootEffectText(item) {
  const label = LOOT_KIND[item.kind] || item.kind;
  return label + ' +' + Math.round(item.value * 100) + '%';
}

export function pct(v) {
  return '+' + Math.round(v * 100) + '%';
}
