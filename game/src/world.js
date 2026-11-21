// world.js — canvas 地图：渲染、移动、碰撞、邻近交互。

import { MAP, BUILDINGS, INTERACTABLES, TILE, MAP_W, MAP_H, SPAWN } from '../data.js';

const SOLID = new Set(['T', 'B', 'W']);
const INTERACT_RANGE = 46;

const COLORS = {
  grassA: '#6faa55',
  grassB: '#78b35c',
  pathA: '#d8c8a2',
  pathB: '#cfbe97',
  water: '#3f7fb5',
  waterLight: '#67a4cf',
  tree: '#2f6b3a',
  treeLight: '#3d8248',
  trunk: '#5a3d26',
  ink: '#20301f',
};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  const board = INTERACTABLES.find((i) => i.id === 'board');
  const field = INTERACTABLES.find((i) => i.id === 'field');
  const grid = MAP.map((row) => row.split(''));
  const player = {
    x: SPAWN.x * TILE + TILE / 2,
    y: SPAWN.y * TILE + TILE / 2,
    dir: 'down',
    walk: 0,
    moving: false,
  };
  const keys = new Set();
  let near = null;
  let t = 0;

  function tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return 'T';
    return grid[ty][tx];
  }

  function blockedAt(cx, cy) {
    const box = { l: cx - 8, r: cx + 8, t: cy - 7, b: cy + 3 };
    const x0 = Math.floor(box.l / TILE);
    const x1 = Math.floor(box.r / TILE);
    const y0 = Math.floor(box.t / TILE);
    const y1 = Math.floor(box.b / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = (grid[ty] && grid[ty][tx]) || 'T';
        if (SOLID.has(c)) return true;
      }
    }
    return false;
  }

  function update(dt, canMove = true) {
    t += dt;
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
      const speed = 122 * dt;
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
    for (const item of INTERACTABLES) {
      const cx = item.x * TILE + TILE / 2;
      const cy = item.y * TILE + TILE / 2;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < best) { best = d; near = item; }
    }
  }

  // ------------------------------------------------------------ 绘制
  function drawGround() {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const c = grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (c === 'W') continue;
        if (c === '=') {
          ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.pathA : COLORS.pathB;
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.grassA : COLORS.grassB;
        }
        ctx.fillRect(px, py, TILE, TILE);
        if (c !== '=' && hash(x, y) > 0.72) {
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          ctx.fillRect(px + 8 + Math.floor(hash(y, x) * 14), py + 10, 4, 3);
        }
      }
    }
    // 水面
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] !== 'W') continue;
        const px = x * TILE;
        const py = y * TILE;
        ctx.fillStyle = COLORS.water;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = COLORS.waterLight;
        const bob = Math.sin(t * 1.6 + x * 0.7 + y) * 3;
        ctx.fillRect(px + 6, py + 12 + bob, 10, 2);
        ctx.fillRect(px + 18, py + 20 + bob, 8, 2);
      }
    }
  }

  function drawField() {
    if (!field) return;
    const cx = field.x * TILE + TILE / 2;
    const cy = field.y * TILE + TILE / 2;
    ctx.save();
    ctx.strokeStyle = '#d98f6b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 62, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 50, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSign() {
    if (!board) return;
    const px = board.x * TILE;
    const py = (board.y - 1) * TILE; // 牌子立在交互点上方那一格
    ctx.fillStyle = '#6b4a2c';
    ctx.fillRect(px + 14, py + 14, 4, 18);
    ctx.fillStyle = '#c8a26a';
    ctx.fillRect(px + 4, py + 2, 24, 16);
    ctx.strokeStyle = '#4a3520';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 2, 24, 16);
    ctx.fillStyle = 'rgba(60,44,24,0.65)';
    ctx.fillRect(px + 8, py + 7, 16, 2);
    ctx.fillRect(px + 8, py + 12, 10, 2);
  }

  function drawBuilding(b) {
    const px = b.x * TILE;
    const py = b.y * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    ctx.fillStyle = b.wall;
    ctx.fillRect(px, py, w, h);
    // 屋顶
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(px - 3, py + 20);
    ctx.lineTo(px + w + 3, py + 20);
    ctx.lineTo(px + w - 6, py);
    ctx.lineTo(px + 6, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(px, py + 20, w, 3);
    // 门窗
    const doorW = 16;
    ctx.fillStyle = '#7a4b2a';
    ctx.fillRect(px + w / 2 - doorW / 2, py + h - 20, doorW, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(px + 10, py + 34, 14, 12);
    ctx.fillRect(px + w - 24, py + 34, 14, 12);
    ctx.strokeStyle = 'rgba(32,48,31,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
  }

  function drawTree(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(px + 13, py + 20, 6, 10);
    ctx.fillStyle = COLORS.tree;
    ctx.beginPath();
    ctx.arc(px + 16, py + 15, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.treeLight;
    ctx.beginPath();
    ctx.arc(px + 12, py + 11, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMarkers() {
    for (const item of INTERACTABLES) {
      const cx = item.x * TILE + TILE / 2;
      const cy = item.y * TILE + TILE / 2;
      const active = near && near.id === item.id;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + item.x);
      ctx.beginPath();
      ctx.arc(cx, cy, 13 + pulse * (active ? 3 : 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(255,236,150,0.95)' : 'rgba(255,255,255,0.32)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.stroke();
    }
  }

  function drawPlayer() {
    drawPlayerSprite(ctx, player);
  }

  function draw(night) {
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    drawGround();
    drawField();
    drawSign();
    for (const b of BUILDINGS) drawBuilding(b);
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] === 'T') drawTree(x, y);
      }
    }
    drawMarkers();
    drawPlayer();

    if (night) {
      ctx.fillStyle = 'rgba(24,32,64,0.42)';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
  }

  return {
    player,
    keys,
    update,
    draw,
    get near() { return near; },
    interactRange: INTERACT_RANGE,
  };
}

// 室内和室外共用同一个小人：换场景时不换画风，玩家不会觉得自己换了个人。
export function drawPlayerSprite(ctx, player) {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const bob = player.moving ? Math.sin(player.walk) * 1.5 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(px, py + 2, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const step = player.moving ? Math.sin(player.walk) * 3 : 0;
  ctx.fillStyle = '#2a2a35';
  ctx.fillRect(px - 6, py - 8 + Math.max(0, step), 5, 8);
  ctx.fillRect(px + 1, py - 8 + Math.max(0, -step), 5, 8);

  ctx.fillStyle = '#33456b';
  ctx.fillRect(px - 7, py - 20 + bob, 14, 13);
  ctx.fillStyle = '#f2f2f6';
  ctx.fillRect(px - 3, py - 20 + bob, 6, 4);

  ctx.fillStyle = '#f3c9a3';
  ctx.fillRect(px - 6, py - 31 + bob, 12, 11);
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(px - 6, py - 31 + bob, 12, 4);

  if (player.dir !== 'up') {
    ctx.fillStyle = '#2a2118';
    const ox = player.dir === 'left' ? -2 : player.dir === 'right' ? 2 : 0;
    ctx.fillRect(px - 3 + ox, py - 26 + bob, 2, 2);
    ctx.fillRect(px + 2 + ox, py - 26 + bob, 2, 2);
  }
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(px - 7, py - 20 + bob, 14, 1);
}
