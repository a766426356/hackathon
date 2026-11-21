// loot.js — loot bonuses. Pure math, no DOM, no randomness (drawing happens in rules.rollLoot).
//
// Loot only amplifies the "output" side:
//   damage → cards hit harder   hp → thicker max HP   day → better daytime gains
// The three stats themselves (Knowledge / Mood / Physique) never move, so examGpa is basically untouched.

import { CONFIG, LOOT_KIND } from '../data.js';

// how much a bonus type has stacked up by now (already clamped to the cap)
export function lootMult(s, kind) {
  let sum = 0;
  for (const l of s.loot || []) if (l.kind === kind) sum += l.value;
  return Math.min(CONFIG.lootCap, sum);
}

// raw stacked amount (unclamped), used to tell whether it has hit the cap
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

// same-name loot merged for display: "Procrastination Beast tail ×2"
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
