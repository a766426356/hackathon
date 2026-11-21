// nav.mjs — dependency-free helpers for campus.tilemap.json.
// Runs in the browser (viewer) and in Node (agent/load.mjs, agent/check.mjs).
//
//   import map from '../campus.tilemap.json' with { type: 'json' };
//   import { createNav, findPath } from './nav.mjs';
//   const nav = createNav(map);
//   const path = findPath(nav, nav.spawn, nav.poi('cds1'));

export function createNav(map) {
  if (!map || !map.size || !map.layers) throw new Error('not a campus tilemap');
  const cols = map.size.cols;
  const rows = map.size.rows;
  const tileSize = map.size.tileSize;
  const walk = map.layers.walkable;
  const ground = map.layers.ground;
  const props = map.layers.props;

  const inBounds = (x, y) => Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < cols && y < rows;

  function walkable(x, y) {
    return inBounds(x, y) && walk[y][x] === '1';
  }

  function groundAt(x, y) {
    return inBounds(x, y) ? ground[y][x] : null;
  }

  function propAt(x, y) {
    return inBounds(x, y) ? props[y][x] : null;
  }

  function groundInfo(x, y) {
    const glyph = groundAt(x, y);
    return glyph ? map.legend.ground[glyph] || null : null;
  }

  function propInfo(x, y) {
    const glyph = propAt(x, y);
    return glyph ? map.legend.props[glyph] || null : null;
  }

  function poi(id) {
    return map.pois.find((p) => p.id === id) || null;
  }

  function poiAt(x, y) {
    return map.pois.find((p) => p.x === x && p.y === y) || null;
  }

  function building(id) {
    return map.buildings.find((b) => b.id === id) || null;
  }

  function describe(x, y) {
    const g = groundInfo(x, y);
    const p = propInfo(x, y);
    return {
      x, y,
      walkable: walkable(x, y),
      ground: g ? { glyph: g.glyph, name: g.name, zh: g.zh, tags: g.tags || [] } : null,
      prop: p ? { glyph: p.glyph, name: p.name, zh: p.zh } : null,
      poi: poiAt(x, y),
    };
  }

  const index = (x, y) => y * cols + x;

  function neighbors(x, y) {
    const out = [];
    if (walkable(x, y - 1)) out.push([x, y - 1]);
    if (walkable(x - 1, y)) out.push([x - 1, y]);
    if (walkable(x + 1, y)) out.push([x + 1, y]);
    if (walkable(x, y + 1)) out.push([x, y + 1]);
    return out;
  }

  function nearestWalkable(x, y, radius = 6) {
    if (walkable(x, y)) return { x, y, dist: 0 };
    let best = null;
    for (let r = 1; r <= radius && !best; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!walkable(x + dx, y + dy)) continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.dist) best = { x: x + dx, y: y + dy, dist: d };
        }
      }
    }
    return best;
  }

  function reachableFrom(start, limit = Infinity) {
    const s = Array.isArray(start) ? { x: start[0], y: start[1] } : start;
    const seen = new Uint8Array(cols * rows);
    if (!walkable(s.x, s.y)) return { seen, count: 0, contains: () => false };
    const queue = [index(s.x, s.y)];
    seen[queue[0]] = 1;
    let count = 0;
    for (let head = 0; head < queue.length && count < limit; head += 1) {
      const cur = queue[head];
      count += 1;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      for (const [nx, ny] of neighbors(cx, cy)) {
        const ni = index(nx, ny);
        if (!seen[ni]) { seen[ni] = 1; queue.push(ni); }
      }
    }
    return {
      seen,
      count,
      contains: (x, y) => inBounds(x, y) && seen[index(x, y)] === 1,
    };
  }

  return {
    map, cols, rows, tileSize, spawn: map.spawn,
    walkable, groundAt, propAt, groundInfo, propInfo, poi, poiAt, building,
    describe, neighbors, nearestWalkable, reachableFrom,
    pois: map.pois, buildings: map.buildings, roads: map.roads, regions: map.regions,
  };
}

// ---------------------------------------------------------------------------
// A* (4-way, unit cost, deterministic tie-break)
// ---------------------------------------------------------------------------
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f < a[i].f || (a[p].f === a[i].f && a[p].seq <= a[i].seq)) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        const better = (j) => a[j].f < a[m].f || (a[j].f === a[m].f && a[j].seq < a[m].seq);
        if (l < a.length && better(l)) m = l;
        if (r < a.length && better(r)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function asPoint(p) {
  if (!p) throw new Error('missing point');
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  if (typeof p === 'object' && 'x' in p && 'y' in p) return { x: p.x, y: p.y };
  throw new Error(`bad point: ${JSON.stringify(p)}`);
}

export function findPath(nav, from, to, opts = {}) {
  const start = asPoint(from);
  let goal = asPoint(to);
  const maxNodes = opts.maxNodes || nav.cols * nav.rows * 4;

  if (!nav.walkable(goal.x, goal.y)) {
    if (opts.noSnap) return null;
    const snap = nav.nearestWalkable(goal.x, goal.y, opts.snapRadius ?? 6);
    if (!snap) return null;
    goal = { x: snap.x, y: snap.y };
  }
  let fromPoint = start;
  if (!nav.walkable(fromPoint.x, fromPoint.y)) {
    const snap = nav.nearestWalkable(fromPoint.x, fromPoint.y, opts.snapRadius ?? 6);
    if (!snap) return null;
    fromPoint = { x: snap.x, y: snap.y };
  }

  const W = nav.cols;
  const size = W * nav.rows;
  const idx = (x, y) => y * W + x;
  const startI = idx(fromPoint.x, fromPoint.y);
  const goalI = idx(goal.x, goal.y);
  if (startI === goalI) return [{ x: fromPoint.x, y: fromPoint.y }];

  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  const h = (x, y) => Math.abs(goal.x - x) + Math.abs(goal.y - y);
  let seq = 0;

  gScore[startI] = 0;
  heap.push({ i: startI, x: fromPoint.x, y: fromPoint.y, g: 0, f: h(fromPoint.x, fromPoint.y), seq: seq += 1 });

  let expanded = 0;
  while (heap.size && expanded < maxNodes) {
    const cur = heap.pop();
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    expanded += 1;
    if (cur.i === goalI) {
      const path = [];
      let i = goalI;
      while (i !== -1) {
        const x = i % W;
        path.push({ x, y: (i - x) / W });
        i = came[i];
      }
      path.reverse();
      return path;
    }
    for (const [nx, ny] of nav.neighbors(cur.x, cur.y)) {
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const tentative = cur.g + 1;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur.i;
        heap.push({ i: ni, x: nx, y: ny, g: tentative, f: tentative + h(nx, ny), seq: seq += 1 });
      }
    }
  }
  return null;
}

export function pathBetweenPois(nav, fromId, toId, opts = {}) {
  const a = nav.poi(fromId);
  const b = nav.poi(toId);
  if (!a || !b) throw new Error(`unknown poi: ${!a ? fromId : toId}`);
  return findPath(nav, a, b, opts);
}

export function pathLength(path) {
  return path ? Math.max(0, path.length - 1) : null;
}

export function pathToCsv(path) {
  return path ? path.map((p) => `${p.x},${p.y}`).join(' ') : '';
}

// ASCII preview: blocked = #, walkable = ., spawn = @, POI = letters/numbers
export function toAscii(nav, rect = {}, opts = {}) {
  const x0 = rect.x0 ?? 0;
  const y0 = rect.y0 ?? 0;
  const x1 = rect.x1 ?? nav.cols - 1;
  const y1 = rect.y1 ?? nav.rows - 1;
  const poiChars = new Map();
  const marks = opts.pois === false ? [] : nav.pois;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  marks.forEach((p, i) => {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) poiChars.set(`${p.x},${p.y}`, chars[i % chars.length]);
  });
  const rows = [];
  for (let y = y0; y <= y1; y += 1) {
    let line = '';
    for (let x = x0; x <= x1; x += 1) {
      if (nav.spawn.x === x && nav.spawn.y === y) line += '@';
      else if (poiChars.has(`${x},${y}`)) line += poiChars.get(`${x},${y}`);
      else line += nav.walkable(x, y) ? '.' : '#';
    }
    rows.push(line);
  }
  return rows.join('\n');
}
