// world.js — 校园：一张画好的大图当背景，走位靠「可行走矩形」，不再是地砖格子。

import { CAMPUS, WALKABLE, INTERACTABLES, SPAWN, MAP_W, MAP_H } from '../data.js';

const INTERACT_RANGE = 46;
const SPEED = 195; // 图比原来的格子地图大，走快点才不烦
const S = MAP_W / CAMPUS.w; // 图片坐标 → 画布坐标（1024 → 768）

// 把行走矩形换到画布坐标系，只算一次
const WALK = WALKABLE.map((r) => ({
  x0: r.x * S,
  y0: r.y * S,
  x1: (r.x + r.w) * S,
  y1: (r.y + r.h) * S,
}));

function onWalkable(x, y) {
  for (const r of WALK) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true;
  }
  return false;
}

export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  // 画好的图缩放后当背景；加载失败就退成一块底色，不让游戏卡住
  const bg = new Image();
  let bgReady = false;
  bg.onload = () => { bgReady = true; };
  bg.src = CAMPUS.src;
  const player = {
    x: SPAWN.x * S,
    y: SPAWN.y * S,
    dir: 'down',
    walk: 0,
    moving: false,
  };
  const keys = new Set();
  let near = null;
  let t = 0;

  // 只要身体的四角都踩在可行走区域里，就算站得住
  function blockedAt(cx, cy) {
    const l = cx - 7;
    const r = cx + 7;
    const top = cy - 6;
    const bot = cy + 2;
    return !(onWalkable(l, top) && onWalkable(r, top) && onWalkable(l, bot) && onWalkable(r, bot));
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
      const step = SPEED * dt;
      const stepX = (dx / len) * step;
      const stepY = (dy / len) * step;
      if (!blockedAt(player.x + stepX, player.y)) player.x += stepX;
      if (!blockedAt(player.x, player.y + stepY)) player.y += stepY;
      player.walk += dt * 9;
    }

    player.x = Math.max(8, Math.min(MAP_W - 8, player.x));
    player.y = Math.max(8, Math.min(MAP_H - 8, player.y));

    near = null;
    let best = INTERACT_RANGE;
    for (const item of INTERACTABLES) {
      const cx = item.x * S;
      const cy = item.y * S;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < best) { best = d; near = item; }
    }
  }

  // ------------------------------------------------------------ 绘制
  function drawMarkers() {
    for (const item of INTERACTABLES) {
      const cx = item.x * S;
      const cy = item.y * S;
      const active = near && near.id === item.id;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + item.x);
      ctx.beginPath();
      ctx.arc(cx, cy, 13 + pulse * (active ? 3 : 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(255,236,150,0.95)' : 'rgba(255,255,255,0.38)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,236,150,0.9)';
        ctx.fill();
      }
    }
  }

  function draw(night) {
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    if (bgReady) {
      ctx.drawImage(bg, 0, 0, MAP_W, MAP_H);
    } else {
      ctx.fillStyle = '#2a3330';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      ctx.fillStyle = 'rgba(230,240,235,0.7)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('校园图载入中…', 24, 40);
    }
    drawMarkers();
    drawPlayerSprite(ctx, player, 1.35); // 图比格子地图大，小人放大一点才看得清

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
    get size() { return { w: MAP_W, h: MAP_H }; },
  };
}

// 室内和室外共用同一个小人：换场景时不换画风，玩家不会觉得自己换了个人。
export function drawPlayerSprite(ctx, player, scale = 1) {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  if (scale !== 1) {
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);
  }
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
  if (scale !== 1) ctx.restore();
}
