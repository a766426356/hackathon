// indoor.js — 室内场景：渲染、移动、碰撞、邻近交互。和 world.js 同构，只是换了一套平面数据。

import { IW, IH, ITILE, ISOLID, sceneOf } from './interiors.js';
import { drawPlayerSprite } from './world.js';

const INTERACT_RANGE = 46;
const MAP_W = IW * ITILE;
const MAP_H = IH * ITILE;

const FURN = {
  B: { base: '#8a6b45', top: '#a98757', dark: '#5d452b' },
  T: { base: '#2f6b4a', top: '#3d8259', dark: '#1e4a32' },
  G: { base: '#1f5a3c', top: '#2a7049', dark: '#123425' },
  P: { base: '#12151c', top: '#232936', dark: '#0b0d12' },
  O: { base: '#6f4242', top: '#8a5454', dark: '#472a2a' },
};

export function createIndoor(canvas) {
  const ctx = canvas.getContext('2d');
  const keys = new Set();
  const player = { x: 0, y: 0, dir: 'down', walk: 0, moving: false };
  let scene = null;
  let grid = null;
  let near = null;
  let t = 0;
  let blocks = []; // 连成一片的家具/门，按整体绘制（不然一张球台会变成八张小桌）

  // 同字符四邻连通 → 一个整体对象
  const CLUSTER = new Set(['T', 'G', 'P', 'O', 'E', 'D']);

  function computeBlocks() {
    blocks = [];
    const seen = new Set();
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const ch = grid[y][x];
        if (!CLUSTER.has(ch) || seen.has(x + ',' + y)) continue;
        const q = [[x, y]];
        seen.add(x + ',' + y);
        let x0 = x, x1 = x, y0 = y, y1 = y;
        while (q.length) {
          const [cx, cy] = q.pop();
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
          y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx; const ny = cy + dy;
            const k = nx + ',' + ny;
            if (seen.has(k)) continue;
            if (!grid[ny] || grid[ny][nx] !== ch) continue;
            seen.add(k);
            q.push([nx, ny]);
          }
        }
        blocks.push({ ch, x0, y0, x1, y1 });
      }
    }
  }

  function load(sceneId, pos) {
    const sc = sceneOf(sceneId);
    if (!sc) return false;
    scene = sc;
    grid = sc.map.map((row) => row.split(''));
    // pos 是像素坐标（存档里存的就是像素），没传就从这一层的固定落点出生
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      player.x = Math.max(8, Math.min(MAP_W - 8, pos.x));
      player.y = Math.max(8, Math.min(MAP_H - 8, pos.y));
    } else {
      player.x = sc.spawn.x * ITILE + ITILE / 2;
      player.y = sc.spawn.y * ITILE + ITILE / 2;
    }
    // 存档位置如果压在桌子/墙上（地图改过），退回出生点，别把人卡进家具里
    if (blockedAt(player.x, player.y)) {
      player.x = sc.spawn.x * ITILE + ITILE / 2;
      player.y = sc.spawn.y * ITILE + ITILE / 2;
    }
    player.dir = 'down';
    player.moving = false;
    computeBlocks();
    near = null;
    keys.clear();
    return true;
  }

  function tileAt(px, py) {
    const tx = Math.floor(px / ITILE);
    const ty = Math.floor(py / ITILE);
    if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return '#';
    return grid[ty][tx];
  }

  function blockedAt(cx, cy) {
    const box = { l: cx - 8, r: cx + 8, t: cy - 7, b: cy + 3 };
    const x0 = Math.floor(box.l / ITILE);
    const x1 = Math.floor(box.r / ITILE);
    const y0 = Math.floor(box.t / ITILE);
    const y1 = Math.floor(box.b / ITILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = (grid[ty] && grid[ty][tx]) || '#';
        if (ISOLID.has(c)) return true;
      }
    }
    return false;
  }

  function update(dt, canMove = true) {
    t += dt;
    if (!scene) return;
    let dx = 0;
    let dy = 0;
    if (canMove) {
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    }

    player.moving = dx !== 0 || dy !== 0;
    if (player.moving) {
      if (dx < 0) player.dir = 'left';
      else if (dx > 0) player.dir = 'right';
      else if (dy < 0) player.dir = 'up';
      else player.dir = 'down';

      const len = Math.hypot(dx, dy) || 1;
      const speed = 112 * dt;
      const stepX = (dx / len) * speed;
      const stepY = (dy / len) * speed;
      if (!blockedAt(player.x + stepX, player.y)) player.x += stepX;
      if (!blockedAt(player.x, player.y + stepY)) player.y += stepY;
      player.walk += dt * 9;
    }

    player.x = Math.max(8, Math.min(MAP_W - 8, player.x));
    player.y = Math.max(8, Math.min(MAP_H - 8, player.y));

    near = null;
    let best = INTERACT_RANGE;
    for (const item of scene.spots) {
      const cx = item.x * ITILE + ITILE / 2;
      const cy = item.y * ITILE + ITILE / 2;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < best) { best = d; near = item; }
    }
  }

  // ------------------------------------------------------------ 绘制
  function drawFloorTile(x, y) {
    const pal = scene.pal;
    ctx.fillStyle = (x + y) % 2 === 0 ? pal.a : pal.b;
    ctx.fillRect(x * ITILE, y * ITILE, ITILE, ITILE);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * ITILE + 0.5, y * ITILE + 0.5, ITILE - 1, ITILE - 1);
  }

  function drawWall(x, y) {
    const pal = scene.pal;
    const px = x * ITILE;
    const py = y * ITILE;
    ctx.fillStyle = pal.wall;
    ctx.fillRect(px, py, ITILE, ITILE);
    // 朝下的一面墙给一条亮边，室内才有“站在房间里”的纵深
    const below = grid[y + 1] && grid[y + 1][x];
    if (below && below !== '#') {
      ctx.fillStyle = pal.edge;
      ctx.fillRect(px, py + ITILE - 5, ITILE, 5);
    }
  }

  // 一整件家具：按连通块的包围盒画一次，一张球台就是一张球台
  function drawBlock(b) {
    const px = b.x0 * ITILE;
    const py = b.y0 * ITILE;
    const w = (b.x1 - b.x0 + 1) * ITILE;
    const h = (b.y1 - b.y0 + 1) * ITILE;
    const c = b.ch;
    const f = FURN[c];

    if (c === 'E') {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(px, py, w, h);
      const grd = ctx.createLinearGradient(0, py, 0, py + h);
      grd.addColorStop(0, '#78849a');
      grd.addColorStop(1, '#414a5c');
      ctx.fillStyle = grd;
      ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
      ctx.fillStyle = '#1c2029';
      ctx.fillRect(px + w / 2 - 1, py + 3, 2, h - 6);
      ctx.fillStyle = '#e0b64a';
      ctx.fillRect(px + w / 2 - 11, py + h / 2 - 3, 4, 6);
      ctx.fillRect(px + w / 2 + 7, py + h / 2 - 3, 4, 6);
      ctx.fillStyle = '#ffe38a';
      ctx.fillRect(px + w / 2 - 7, py + 1, 14, 2);
      return;
    }

    if (c === 'D') {
      ctx.fillStyle = '#16241c';
      ctx.fillRect(px, py + 1, w, h - 2);
      ctx.fillStyle = '#3d7a58';
      ctx.fillRect(px + 2, py + 3, w - 4, h - 6);
      ctx.fillStyle = 'rgba(200,255,215,0.32)';
      ctx.fillRect(px + 2, py + 7, w - 4, 4);
      return;
    }

    if (!f) return;

    if (c === 'T') {
      ctx.fillStyle = f.dark;
      ctx.fillRect(px + 2, py + 4, w - 4, h - 8);
      ctx.fillStyle = f.base;
      ctx.fillRect(px + 5, py + 7, w - 10, h - 14);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 5.5, py + 7.5, w - 11, h - 15);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      if (w >= h) ctx.fillRect(px + w / 2 - 1, py + 4, 2, h - 8);
      else ctx.fillRect(px + 4, py + h / 2 - 1, w - 8, 2);
      return;
    }

    if (c === 'G') {
      ctx.fillStyle = '#5b3f22';
      ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
      ctx.fillStyle = f.base;
      ctx.fillRect(px + 5, py + 5, w - 10, h - 10);
      ctx.fillStyle = f.top;
      ctx.fillRect(px + 8, py + 8, w - 16, 5);
      ctx.fillStyle = '#f0e6cf';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(px + 14 + i * ((w - 28) / 3), py + h * 0.62, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (c === 'P') {
      ctx.fillStyle = f.dark;
      ctx.fillRect(px + 3, py + 2, w - 6, h - 8);
      ctx.fillStyle = f.top;
      ctx.fillRect(px + 5, py + 4, w - 10, 7);
      ctx.fillStyle = '#eceef2';
      ctx.fillRect(px + 5, py + h - 13, w - 10, 8);
      ctx.fillStyle = '#16181d';
      const keys = Math.max(3, Math.floor((w - 12) / 9));
      for (let i = 0; i < keys; i++) ctx.fillRect(px + 8 + i * 9, py + h - 13, 3, 6);
      return;
    }

    // O 沙发
    ctx.fillStyle = f.dark;
    ctx.fillRect(px + 2, py + 3, w - 4, h - 6);
    ctx.fillStyle = f.base;
    ctx.fillRect(px + 4, py + 10, w - 8, h - 14);
    ctx.fillStyle = f.top;
    ctx.fillRect(px + 4, py + 4, w - 8, 8);
    ctx.fillStyle = f.dark;
    ctx.fillRect(px + w / 3, py + 10, 2, h - 14);
    ctx.fillRect(px + (2 * w) / 3, py + 10, 2, h - 14);
  }

  // 课桌仍逐格画：一排桌子就是一排桌子
  function drawDesk(x, y) {
    const f = FURN.B;
    const px = x * ITILE;
    const py = y * ITILE;
    ctx.fillStyle = f.dark;
    ctx.fillRect(px + 1, py + 3, ITILE - 2, ITILE - 6);
    ctx.fillStyle = f.base;
    ctx.fillRect(px + 2, py + 4, ITILE - 4, ITILE - 9);
    ctx.fillStyle = f.top;
    ctx.fillRect(px + 2, py + 4, ITILE - 4, 4);
  }

  function drawMarkers() {
    for (const item of scene.spots) {
      const cx = item.x * ITILE + ITILE / 2;
      const cy = item.y * ITILE + ITILE / 2;
      const active = near && near.id === item.id;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + item.x);
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + pulse * (active ? 3 : 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(255,236,150,0.95)' : 'rgba(255,255,255,0.26)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.stroke();
    }
  }

  function draw() {
    if (!scene) return;
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const c = grid[y][x];
        if (c === '#') { drawWall(x, y); continue; }
        drawFloorTile(x, y);
      }
    }
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] === 'B') drawDesk(x, y);
      }
    }
    for (const b of blocks) drawBlock(b);
    drawMarkers();
    drawPlayerSprite(ctx, player);

    // 室内偏暗一点点，和操场的日光分开
    const g = ctx.createLinearGradient(0, 0, 0, MAP_H);
    g.addColorStop(0, 'rgba(8,10,16,0.14)');
    g.addColorStop(0.55, 'rgba(8,10,16,0.02)');
    g.addColorStop(1, 'rgba(8,10,16,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }

  return {
    player,
    keys,
    load,
    update,
    draw,
    get near() { return near; },
    get scene() { return scene; },
    get sceneId() { return scene ? scene.id : null; },
    get spots() { return scene ? scene.spots : []; },
    get pos() { return { x: player.x, y: player.y }; },
    interactRange: INTERACT_RANGE,
  };
}
