#!/usr/bin/env node
// load.mjs — CLI for the campus tile map. No dependencies.
//
//   node agent/load.mjs info
//   node agent/load.mjs pois
//   node agent/load.mjs tile 30 56
//   node agent/load.mjs path 30 56 45 42
//   node agent/load.mjs path spawn cds1
//   node agent/load.mjs near 17 14 4
//   node agent/load.mjs ascii 20 28 44 48
//   node agent/load.mjs reachable
//
// Import it:  import { loadMap } from './agent/load.mjs';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createNav, findPath, pathBetweenPois, pathLength, pathToCsv, toAscii,
} from './nav.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MAP_PATH = join(HERE, '..', 'campus.tilemap.json');

export function loadMap(path = MAP_PATH) {
  const map = JSON.parse(readFileSync(path, 'utf8'));
  return { map, nav: createNav(map) };
}

function isPoint(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b));
}

function parsePoint(nav, a, b) {
  if (isPoint(a, b)) return { x: Number(a), y: Number(b) };
  const p = nav.poi(a);
  if (!p) throw new Error(`unknown POI "${a}"`);
  return { x: p.x, y: p.y };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const { map, nav } = loadMap();

  if (!cmd || cmd === 'info') {
    console.log(`${map.name}  (${map.subtitle})`);
    console.log(`grid     ${nav.cols} x ${nav.rows} tiles @ ${nav.tileSize}px  -> ${map.size.pixelWidth}px square`);
    console.log(`spawn    (${nav.spawn.x},${nav.spawn.y})  ${nav.spawn.facing}`);
    console.log(`pois     ${nav.pois.length}   buildings ${nav.buildings.length}   roads ${nav.roads.length}`);
    console.log(`regions  ${nav.regions.map((r) => r.id).join(', ')}`);
    console.log(`walkable ${nav.reachableFrom(nav.spawn).count} tiles reachable from spawn`);
    console.log('');
    console.log('POIs:');
    for (const p of nav.pois) {
      console.log(`  ${p.id.padEnd(14)} (${String(p.x).padStart(2)},${String(p.y).padStart(2)})  ${p.zh}`);
    }
    return;
  }

  if (cmd === 'pois') {
    for (const p of nav.pois) {
      console.log(`${p.id}\t${p.x}\t${p.y}\t${p.kind}\t${p.zh}`);
    }
    return;
  }

  if (cmd === 'tile') {
    const x = Number(rest[0]);
    const y = Number(rest[1]);
    const d = nav.describe(x, y);
    if (!d.ground) throw new Error(`out of bounds: ${x},${y}`);
    console.log(JSON.stringify({
      ...d,
      tileId: map.legend.ground[d.ground.glyph]?.id ?? null,
      propId: d.prop ? map.legend.props[d.prop.glyph]?.id ?? null : -1,
      region: nav.regions.find((r) => x >= r.rect[0] && y >= r.rect[1] && x <= r.rect[2] && y <= r.rect[3])?.id ?? null,
    }, null, 2));
    return;
  }

  if (cmd === 'path') {
    let path;
    const a = rest[0];
    const b = rest[1];
    if (isPoint(a, b)) {
      if (rest.length >= 4) {
        path = findPath(nav, { x: Number(a), y: Number(b) }, { x: Number(rest[2]), y: Number(rest[3]) });
      } else {
        throw new Error('usage: path x0 y0 x1 y1  |  path poiA poiB');
      }
    } else {
      path = pathBetweenPois(nav, a, b);
    }
    if (!path) {
      console.log('NO PATH');
      process.exitCode = 1;
      return;
    }
    const start = path[0];
    const end = path[path.length - 1];
    const goals = nav.pois.filter((p) => p.x === end.x && p.y === end.y);
    console.log(`from (${start.x},${start.y}) to (${end.x},${end.y})  steps=${pathLength(path)}`);
    if (goals.length) console.log(`arrives at: ${goals.map((g) => g.id).join(', ')}`);
    console.log(pathToCsv(path));
    return;
  }

  if (cmd === 'near') {
    const x = Number(rest[0]);
    const y = Number(rest[1]);
    const r = Number(rest[2] ?? 3);
    for (const p of nav.pois) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= r) console.log(`${p.id.padEnd(14)} (${p.x},${p.y}) d=${d.toFixed(1)}  ${p.zh}`);
    }
    return;
  }

  if (cmd === 'ascii') {
    const x0 = Number(rest[0] ?? 0);
    const y0 = Number(rest[1] ?? 0);
    const x1 = Number(rest[2] ?? nav.cols - 1);
    const y1 = Number(rest[3] ?? nav.rows - 1);
    console.log(`# (${x0},${y0})-(${x1},${y1})  #=blocked .=walkable @=spawn  letters=POIs`);
    console.log(toAscii(nav, { x0, y0, x1, y1 }));
    return;
  }

  if (cmd === 'reachable') {
    const r = nav.reachableFrom(nav.spawn);
    console.log(`reachable from spawn: ${r.count} / ${nav.cols * nav.rows} tiles`);
    const bad = nav.pois.filter((p) => !r.contains(p.x, p.y));
    console.log(bad.length ? `unreachable: ${bad.map((p) => p.id).join(', ')}` : 'all POIs reachable');
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
