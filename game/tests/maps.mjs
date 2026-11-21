// maps.mjs — data health check: campus walkable areas + floor/room tables.
// Usage: node tests/maps.mjs

import * as rules from '../src/rules.js';
import { BUILDING_FLOORS, roomsText } from '../src/interiors.js';
import { PERSONA_TYPES, buildPersona } from '../src/persona.js';
import { createState } from '../src/state.js';

let bad = 0;
const fail = (msg) => { console.log('✗ ' + msg); bad++; };

// ---------------------------------------------------------------- campus
const campus = await import('../data.js');
const { WALKABLE, INTERACTABLES, SPAWN, MAP_W, MAP_H, CAMPUS } = campus;
const S = MAP_W / CAMPUS.w;
const RECTS = WALKABLE.map((r) => ({
  x0: r.x * S, y0: r.y * S, x1: (r.x + r.w) * S, y1: (r.y + r.h) * S,
}));
const walk = (x, y) => RECTS.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

// 8px grid BFS: fine enough, still fast
const STEP = 8;
const key = (x, y) => Math.round(x / STEP) + ',' + Math.round(y / STEP);
const seen = new Set();
if (!walk(SPAWN.x * S, SPAWN.y * S)) fail('campus: spawn point is not inside a walkable area');

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

const REACH = 46; // matches the interaction range in world.js
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
  if (!okSpot) fail('campus: interactable ' + it.id + ' has no standing spot within ' + REACH + 'px');
}

// every walkable area must be reachable from the spawn point (no islands)
for (const r of WALKABLE) {
  if (!seen.has(key((r.x + r.w / 2) * S, (r.y + r.h / 2) * S))) {
    fail('campus: area ' + r.id + ' is unreachable (island)');
  }
}

// ---------------------------------------------------------------- floors / rooms
// a room either maps to a function in rules, or it is a "read-only panel" (Desk / Calendar Wall / roommate),
// and the latter must cost 0 AP — looking at things should not burn Action Points.
const ACTION_FN = {
  course: 'course', doubt: 'doubt', pingpong: 'pingpong', snooker: 'snooker',
  piano: 'piano', studyroom: 'studyroom', pray: 'pray', bed: 'bed', gym: 'gym',
};
const UI_ACTION = { char: 1, calendar: 1, roomie: 1 };
let roomCount = 0;

for (const [id, b] of Object.entries(BUILDING_FLOORS)) {
  if (!b.floors.length) fail(id + ': no floors at all');
  const levels = new Set();
  for (const f of b.floors) {
    if (levels.has(f.level)) fail(id + ': duplicate floor level (' + f.level + ')');
    levels.add(f.level);
    if (!roomsText(f)) fail(id + ' ' + f.label + ': the floor plate does not say what is on this floor');
    if (f.locked) {
      if (f.rooms.length) fail(id + ' ' + f.label + ': marked as locked but still has rooms');
      continue;
    }
    if (!f.rooms.length) fail(id + ' ' + f.label + ': open floor with no rooms');
    for (const r of f.rooms) {
      roomCount++;
      if (UI_ACTION[r.action]) {
        if (r.ap !== 0) fail(id + ' / ' + r.name + ': a read-only panel should not cost Action Points (' + r.ap + ')');
      } else if (!ACTION_FN[r.action]) {
        fail(id + ' ' + f.label + ' / ' + r.name + ': action "' + r.action + '" has no matching rule');
      } else if (typeof rules[ACTION_FN[r.action]] !== 'function') {
        fail('rules.' + ACTION_FN[r.action] + ' is not a function');
      } else if (!(r.ap > 0)) {
        fail(id + ' / ' + r.name + ': AP cost is off');
      }
      if (!r.effect) fail(id + ' / ' + r.name + ': no effect stated');
    }
  }
  // the vertical elevator sorts by level, so at least one floor must be above ground
  if (!b.floors.some((f) => f.level > 0)) fail(id + ': no above-ground floor');
}

console.log(bad
  ? ''
  : 'campus: ' + WALKABLE.length + ' areas form one connected piece, ' + INTERACTABLES.length +
    ' interactables are reachable; ' + Object.keys(BUILDING_FLOORS).length + ' buildings / ' + roomCount + ' rooms all check out ✓');

// ---------------------------------------------------------------- HKUTI report
// all 16 combinations must be present, spelled along the four axes, or the ending page falls back to ISMD
const codes = Object.keys(PERSONA_TYPES);
if (codes.length !== 16) fail('HKUTI type table should hold 16 types, got ' + codes.length);
for (const c of codes) {
  if (!/^[EI][AS][BM][PD]$/.test(c)) fail('HKUTI type code is invalid: ' + c);
  const t = PERSONA_TYPES[c];
  if (!t || !t[0] || !t[1]) fail('HKUTI type ' + c + ' is missing a title or a one-liner');
}
// doing nothing must always land on ISMD, or slacking off counts as a good type
const probe = createState(1);
probe.phase = 'day';
const idle = buildPersona(probe);
if (idle.code !== 'ISMD') fail('doing nothing should be ISMD, got ' + idle.code);

console.log(bad ? '\nchecks failed: ' + bad + ' issue(s)' : 'all checks passed ✓');
process.exit(bad ? 1 : 0);
