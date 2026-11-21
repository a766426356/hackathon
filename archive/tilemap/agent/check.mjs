#!/usr/bin/env node
// check.mjs — structural + navigational invariants for the campus tile map.
//   node agent/check.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createNav, findPath, pathBetweenPois } from './nav.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const map = JSON.parse(readFileSync(join(ROOT, 'campus.tilemap.json'), 'utf8'));
const nav = createNav(map);
let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok  ${label}`); };

function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ---------------------------------------------------------------- shape
const { cols, rows, tileSize, displayScale } = map.size;
assert.equal(cols, 64); assert.equal(rows, 64); assert.equal(tileSize, 16);
assert.equal(displayScale, 2);
ok('size is 64 x 64 tiles @ 16px');

for (const layer of ['ground', 'props', 'walkable']) {
  assert.equal(map.layers[layer].length, rows, `${layer} row count`);
  map.layers[layer].forEach((row, y) => {
    assert.equal(row.length, cols, `${layer} row ${y} length`);
  });
}
ok('every layer is a full 64 x 64 glyph grid');

assert.equal(map.layers.groundIds.length, rows);
assert.equal(map.layers.propIds.length, rows);
assert.ok(map.layers.groundIds.every((r) => r.length === cols));
assert.ok(map.layers.propIds.every((r) => r.length === cols));
ok('numeric id layers match the glyph layers');

// ---------------------------------------------------------------- legend
const groundGlyphs = Object.keys(map.legend.ground);
const propGlyphs = Object.keys(map.legend.props);
assert.equal(groundGlyphs.length, 13);
assert.equal(propGlyphs.length, 6);
for (let y = 0; y < rows; y += 1) {
  for (let x = 0; x < cols; x += 1) {
    assert.ok(groundGlyphs.includes(map.layers.ground[y][x]), `bad ground ${x},${y}`);
    assert.ok(propGlyphs.includes(map.layers.props[y][x]), `bad prop ${x},${y}`);
  }
}
ok('all glyphs exist in the legend');

const tileIds = map.tileset.tiles.map((t) => t.id).sort((a, b) => a - b);
assert.deepEqual(tileIds, Array.from({ length: 23 }, (_, i) => i));
assert.equal(map.tileset.columns, 8);
ok('tileset declares ids 0..22 in 8 columns');

// ---------------------------------------------------------------- walkable grid
for (let y = 0; y < rows; y += 1) {
  for (let x = 0; x < cols; x += 1) {
    const g = map.legend.ground[map.layers.ground[y][x]];
    const p = map.legend.props[map.layers.props[y][x]];
    const expected = g.walkable && !p.solid;
    assert.equal(map.layers.walkable[y][x], expected ? '1' : '0',
      `walkable mismatch at ${x},${y} (${map.layers.ground[y][x]}/${map.layers.props[y][x]})`);
    assert.equal(nav.walkable(x, y), expected);
  }
}
ok('walkable layer derives exactly from legend (ground.walkable && !prop.solid)');

// ---------------------------------------------------------------- buildings
const buildingCells = new Map();
for (const b of map.buildings) {
  assert.ok(b.rects.length >= 1);
  for (const [x0, y0, x1, y1] of b.rects) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const key = `${x},${y}`;
        assert.ok(!buildingCells.has(key), `overlapping building cell ${key}`);
        buildingCells.set(key, b.id);
      }
    }
  }
}
for (let y = 0; y < rows; y += 1) {
  for (let x = 0; x < cols; x += 1) {
    const hasB = map.layers.props[y][x] === 'B';
    assert.equal(hasB, buildingCells.has(`${x},${y}`), `roof/rect mismatch at ${x},${y}`);
  }
}
ok('roof cells and building rectangles agree exactly');

for (const b of map.buildings) {
  const doorPoi = nav.poi(b.id);
  assert.ok(doorPoi, `missing door POI for ${b.id}`);
  assert.equal(doorPoi.kind, 'building_entrance');
  assert.equal(doorPoi.x, b.door.x);
  assert.equal(doorPoi.y, b.door.y);
  assert.ok(nav.walkable(b.door.x, b.door.y), `door ${b.id} is not walkable`);
  assert.equal(map.layers.props[b.door.y][b.door.x], '.', `door ${b.id} sits under a prop`);
  // touching the footprint
  const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
    map.layers.props[b.door.y + dy]?.[b.door.x + dx] === 'B');
  assert.ok(touching, `door ${b.id} is not adjacent to its building`);
}
ok('every building has a walkable door POI touching its footprint');

// ---------------------------------------------------------------- POIs
const ids = new Set();
for (const p of nav.pois) {
  assert.ok(!ids.has(p.id), `duplicate POI ${p.id}`);
  ids.add(p.id);
  assert.ok(p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows, `POI out of bounds ${p.id}`);
  assert.ok(nav.walkable(p.x, p.y), `POI ${p.id} is not walkable`);
  assert.ok(p.zh && p.kind, `POI ${p.id} missing labels`);
}
assert.equal(nav.poi('spawn').x, nav.spawn.x);
assert.equal(nav.poi('spawn').y, nav.spawn.y);
ok('POIs are unique, in bounds, walkable, and spawn is one of them');

// ---------------------------------------------------------------- roads
for (const road of nav.roads) {
  const [x0, y0, x1, y1] = road.rect;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const g = map.layers.ground[y][x];
      assert.ok('rzx'.includes(g), `road ${road.id} cell ${x},${y} is "${g}"`);
      if (g === 'r') assert.equal(nav.walkable(x, y), false, `asphalt should block at ${x},${y}`);
      else assert.equal(nav.walkable(x, y), true, `crossing should be walkable at ${x},${y}`);
    }
  }
}
ok('road rectangles are asphalt + zebra; asphalt blocks, zebra walks');

// ---------------------------------------------------------------- reachability
const reach = nav.reachableFrom(nav.spawn);
assert.ok(reach.count > 1200, `only ${reach.count} reachable tiles`);
for (const p of nav.pois) assert.ok(reach.contains(p.x, p.y), `unreachable POI ${p.id}`);
for (const [label, x, y] of [
  ['north city sidewalk', 30, 1],
  ['south city sidewalk', 30, 62],
  ['west city sidewalk', 1, 30],
  ['east city sidewalk', 62, 30],
]) {
  assert.ok(reach.contains(x, y), `${label} not reachable via zebra: ${x},${y}`);
}
ok(`${reach.count} walkable tiles, all POIs reachable, all four zebra exits connect`);

// ---------------------------------------------------------------- paths
const cases = [
  ['gate_south', 'gate_north'],
  ['spawn', 'cds1'],
  ['spawn', 'b7'],
  ['spawn', 'gym'],
  ['spawn', 'track'],
  ['cds1', 'b2'],
  ['gate_west', 'gate_east'],
];
for (const [a, b] of cases) {
  const path = pathBetweenPois(nav, a, b);
  assert.ok(path && path.length > 2, `no path ${a} -> ${b}`);
  assert.deepEqual(path[0], { x: nav.poi(a).x, y: nav.poi(a).y });
  const end = path[path.length - 1];
  assert.ok(nav.walkable(end.x, end.y));
  for (let i = 1; i < path.length; i += 1) {
    const step = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.equal(step, 1, `non-adjacent step at ${i}`);
    assert.ok(nav.walkable(path[i].x, path[i].y), 'path crosses a blocked tile');
  }
}
ok(`A* returns adjacent, walkable paths for ${cases.length} POI pairs`);

// snapping: click on a roof resolves to the nearest walkable tile
const snapped = findPath(nav, nav.spawn, { x: nav.poi('cds1').x, y: 35 });
assert.ok(snapped && snapped.length > 3, 'path to a building interior should snap to a nearby walkable tile');
assert.ok(nav.walkable(snapped[snapped.length - 1].x, snapped[snapped.length - 1].y));
ok('path target snapping works for blocked points');

// ---------------------------------------------------------------- Tiled export
const tmj = JSON.parse(readFileSync(join(ROOT, 'campus.tmj'), 'utf8'));
assert.equal(tmj.width, cols); assert.equal(tmj.height, rows);
const gl = tmj.layers.find((l) => l.name === 'ground');
const pl = tmj.layers.find((l) => l.name === 'props');
assert.equal(gl.data.length, cols * rows);
assert.equal(pl.data.length, cols * rows);
for (let y = 0; y < rows; y += 1) {
  for (let x = 0; x < cols; x += 1) {
    assert.equal(gl.data[y * cols + x], map.layers.groundIds[y][x] + 1);
    assert.equal(pl.data[y * cols + x], Math.max(0, map.layers.propIds[y][x] + 1));
  }
}
assert.ok(tmj.layers.find((l) => l.name === 'objects').objects.length >= nav.pois.length + nav.buildings.length);
ok('Tiled .tmj mirrors the JSON layers and ships POI/building objects');

// ---------------------------------------------------------------- assets
const atlas = pngSize(join(ROOT, 'tileset.png'));
assert.equal(atlas.w, 8 * 16);
assert.ok(atlas.h >= 3 * 16);
assert.equal(pngSize(join(ROOT, 'campus_preview.png')).w, 2048);
assert.equal(pngSize(join(ROOT, 'campus_clean.png')).w, 2048);
assert.equal(pngSize(join(ROOT, 'campus_legend.png')).w, 1180);
assert.ok(existsSync(join(ROOT, 'campus_ascii.txt')));
const ascii = readFileSync(join(ROOT, 'campus_ascii.txt'), 'utf8');
assert.ok(ascii.includes('# 层 1 — ground'));
assert.ok(ascii.includes('POIs'));
ok('atlas, previews, legend and ASCII export exist with expected sizes');

// ---------------------------------------------------------------- regions
for (const r of nav.regions) {
  const [x0, y0, x1, y1] = r.rect;
  assert.ok(x0 >= 0 && y0 >= 0 && x1 < cols && y1 < rows, `region ${r.id} out of bounds`);
  assert.ok(x1 >= x0 && y1 >= y0);
}
ok('named regions are in bounds');

console.log(`\nPASS — ${checks} checks.`);
