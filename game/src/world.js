// world.js — 校园：一张画好的大图当背景，走位靠「可行走矩形」，不再是地砖格子。

import { CAMPUS, WALKABLE, INTERACTABLES, SPAWN, MAP_W, MAP_H } from '../data.js';

const INTERACT_RANGE = 46;
const S = MAP_W / CAMPUS.w; // 图片坐标 → 画布坐标（1024 → 768）

// 镜头：只看见玩家周围一小块，人跟着镜头走（数值在 data.js 的 CAMPUS 里）
const SPEED = CAMPUS.speed;
const ZOOM = CAMPUS.zoom;
const VIEW_W = MAP_W / ZOOM;
const VIEW_H = MAP_H / ZOOM;
const PLAYER_SCALE = CAMPUS.playerScale;
const LEAD = 16; // 镜头朝向前瞻的像素数

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
  // 交互点不是固定的：当天有日历活动时会多出一个出发点。
  // 留一份可变列表，setSpots 由 main 在场景切换和行动结算后调用。
  let spots = INTERACTABLES;
  // 镜头中心：平滑跟到玩家身上，并夹在图的边界内
  const cam = { x: player.x, y: player.y };
  const lead = { x: 0, y: 0 }; // 镜头前瞻：朝哪走就先往哪偏一点

  function clampCam() {
    cam.x = Math.max(VIEW_W / 2, Math.min(MAP_W - VIEW_W / 2, cam.x));
    cam.y = Math.max(VIEW_H / 2, Math.min(MAP_H - VIEW_H / 2, cam.y));
  }
  clampCam();

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

    // 镜头跟得慢一点：先慢慢飘向玩家朝的那一侧（前瞻），再追上玩家，走起来有"镜头在追人"的手感
    const leadX = player.dir === 'left' ? -LEAD : player.dir === 'right' ? LEAD : 0;
    const leadY = player.dir === 'up' ? -LEAD * 0.7 : player.dir === 'down' ? LEAD * 0.7 : 0;
    const leadK = Math.min(1, dt * 2.4);
    lead.x += (leadX - lead.x) * leadK;
    lead.y += (leadY - lead.y) * leadK;

    const follow = Math.min(1, dt * 4.2); // 原来是 10，慢下来才有延迟感
    cam.x += (player.x + lead.x - cam.x) * follow;
    cam.y += (player.y + lead.y - cam.y) * follow;
    clampCam();

    near = null;
    let best = INTERACT_RANGE;
    for (const item of spots) {
      const cx = item.x * S;
      const cy = item.y * S;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < best) { best = d; near = item; }
    }
  }

  // 换一批交互点（当天多了一个活动出发点时用）
  function setSpots(list) {
    spots = list && list.length ? list : INTERACTABLES;
    near = null;
  }

  // ------------------------------------------------------------ 绘制
  function drawMarkers() {
    for (const item of spots) {
      const cx = item.x * S;
      const cy = item.y * S;
      const active = near && near.id === item.id;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + item.x);
      const k = 1 / ZOOM; // 已经乘过 ZOOM 的坐标系，这里除回去，光圈在屏幕上才不会跟着变大
      ctx.beginPath();
      ctx.arc(cx, cy, (13 + pulse * (active ? 3 : 1.5)) * k, 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(255,236,150,0.95)' : 'rgba(255,255,255,0.38)';
      ctx.lineWidth = (active ? 3 : 2) * k;
      ctx.stroke();
      if (active) {
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * k, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,236,150,0.9)';
        ctx.fill();
      }
    }
  }

  function draw(night) {
    ctx.clearRect(0, 0, MAP_W, MAP_H);

    // 镜头：以玩家为中心放大 ZOOM 倍，图上只有他周围这一块被画出来
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-(cam.x - VIEW_W / 2), -(cam.y - VIEW_H / 2));

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
    drawPlayerSprite(ctx, player, PLAYER_SCALE, t);

    ctx.restore();

    if (night) {
      ctx.fillStyle = 'rgba(24,32,64,0.42)';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
  }

  // 把某个交互点换算成「占画面百分之几」，DOM 标签跟着镜头走
  function project(item) {
    const sx = (item.x * S - (cam.x - VIEW_W / 2)) * ZOOM;
    const sy = (item.y * S - (cam.y - VIEW_H / 2)) * ZOOM;
    return { left: (sx / MAP_W) * 100, top: (sy / MAP_H) * 100, visible: sx > -60 && sx < MAP_W + 60 && sy > -60 && sy < MAP_H + 60 };
  }

  return {
    player,
    keys,
    update,
    draw,
    setSpots,
    get spots() { return spots; },
    get near() { return near; },
    interactRange: INTERACT_RANGE,
    get size() { return { w: MAP_W, h: MAP_H }; },
    project,
  };
}

// 玩家小人：像素风，站着不动时有呼吸 + 眨眼 + 轻微晃身；走路时手臂和腿摆起来。
// drawPlayerSprite(ctx, player, scale, time) —— time 是场景时钟，用来驱动待机动画。
export function drawPlayerSprite(ctx, player, scale = 1, time = 0) {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  if (scale !== 1) {
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);
  }

  const walking = player.moving;
  // 走路：腿和手臂跟着 walk 相位摆；待机：呼吸起伏 + 每 3.4 秒眨一次眼
  const swing = walking ? Math.sin(player.walk) : 0;
  const breathe = walking ? Math.sin(player.walk) * 1.5 : Math.sin(time * 1.9) * 0.9;
  const sway = walking ? 0 : Math.sin(time * 1.1) * 0.7; // 站立时身体轻轻晃
  const blink = !walking && time % 3.4 < 0.13;
  const bob = breathe;

  // 影子：待机时随呼吸微微缩放，看着像在"喘气"
  const shadowR = walking ? 9 : 8.4 + Math.sin(time * 1.9) * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(px, py + 2, shadowR, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿：走路时前后交替，待机时并拢
  const legA = py - 8 + Math.max(0, swing * 3) * (walking ? 1 : 0);
  const legB = py - 8 + Math.max(0, -swing * 3) * (walking ? 1 : 0);
  ctx.fillStyle = '#2a2a35';
  ctx.fillRect(px - 6, legA, 5, 8);
  ctx.fillRect(px + 1, legB, 5, 8);
  // 鞋
  ctx.fillStyle = '#15151c';
  ctx.fillRect(px - 6, legA + 7, 5, 2);
  ctx.fillRect(px + 1, legB + 7, 5, 2);

  const bodyY = py - 20 + bob;
  const bodyX = px + sway;

  // 手臂：先画在身体后面，摆幅小一点
  ctx.fillStyle = '#2b3a5c';
  const armA = walking ? swing * 2.5 : Math.sin(time * 1.9 + 0.6) * 0.6;
  ctx.fillRect(bodyX - 9, bodyY + 2 - armA, 2, 8);
  ctx.fillRect(bodyX + 7, bodyY + 2 + armA, 2, 8);

  // 校服 / 身体
  ctx.fillStyle = '#33456b';
  ctx.fillRect(bodyX - 7, bodyY, 14, 13);
  // 身体暗部（右侧）
  ctx.fillStyle = '#2a3a5c';
  ctx.fillRect(bodyX + 4, bodyY, 3, 13);
  // 白领口 + 领带
  ctx.fillStyle = '#f2f2f6';
  ctx.fillRect(bodyX - 4, bodyY, 8, 4);
  ctx.fillStyle = '#8c3b45';
  ctx.fillRect(bodyX - 1, bodyY + 3, 2, 6);
  // 下摆一条深线
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(bodyX - 7, bodyY + 12, 14, 1);

  // 头
  const headY = py - 31 + bob;
  const headX = px + sway;
  ctx.fillStyle = '#f3c9a3';
  ctx.fillRect(headX - 6, headY, 12, 11);
  // 头发：上面一块 + 两侧鬓角 + 一撮高光
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(headX - 6, headY, 12, 4);
  ctx.fillRect(headX - 6, headY + 4, 2, 3);
  ctx.fillRect(headX + 4, headY + 4, 2, 3);
  ctx.fillStyle = '#3d3025';
  ctx.fillRect(headX - 4, headY + 1, 6, 1);

  // 脸：眨眼时眼睛压成一条线；朝上走只露后脑勺，不画眼睛
  if (player.dir !== 'up') {
    const ox = player.dir === 'left' ? -2 : player.dir === 'right' ? 2 : 0;
    ctx.fillStyle = '#2a2118';
    if (blink) {
      ctx.fillRect(headX - 3 + ox, headY + 7, 2, 1);
      ctx.fillRect(headX + 2 + ox, headY + 7, 2, 1);
    } else {
      ctx.fillRect(headX - 3 + ox, headY + 6, 2, 2);
      ctx.fillRect(headX + 2 + ox, headY + 6, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(headX - 3 + ox, headY + 6, 1, 1);
      ctx.fillRect(headX + 2 + ox, headY + 6, 1, 1);
    }
    // 腮红一点点，像素小人看起来不至于太硬
    ctx.fillStyle = 'rgba(226,140,120,0.45)';
    ctx.fillRect(headX - 5 + ox, headY + 8, 2, 1);
    ctx.fillRect(headX + 3 + ox, headY + 8, 2, 1);
    // 嘴：走路时张开一点
    ctx.fillStyle = '#8a5c48';
    ctx.fillRect(headX - 1 + ox, headY + 9, 2, walking ? 2 : 1);
  }

  if (scale !== 1) ctx.restore();
}
