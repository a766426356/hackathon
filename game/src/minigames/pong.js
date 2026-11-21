// minigames/pong.js — 1F 乒乓球台。
// 经典 Pong 的两块拍子 + 一颗球，换成更耐看的霓虹球台：拖尾、粒子、扫描线、比分。
// 鼠标 / W S / 上下键控制左边的拍子，先到 7 分。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 900;
const H = 520;
const PAD_W = 15;
const PAD_H = 96;
const PAD_X = 46;
const BALL_R = 9;
const WIN_SCORE = 7;

const SKILL = { lin: 0.58, chen: 0.82, zhou: 0.7 };

let active = null;

export function openPong(opts) {
  if (active) active();
  unlockAudio();

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const skill = SKILL[opts.npc.id] || 0.62;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let acc = 0;

  const g = {
    phase: 'serve', // serve | play | over
    serveTimer: 1.35,
    serveDir: Math.random() < 0.5 ? -1 : 1,
    player: { y: H / 2, target: H / 2 },
    ai: { y: H / 2 },
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    score: { p: 0, a: 0 },
    trail: [],
    particles: [],
    flash: 0,
    shake: 0,
    message: '准备发球',
    messageTimer: 0,
    ended: false,
    settled: false,
    rewardMsg: '',
    rally: 0,
  };
  const keys = new Set();

  const html = `
    <div class="mg pong-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🏓</span>
          <div>
            <h2>乒乓球</h2>
            <p class="sub">和${esc(opts.npc.name)}打一局 · 先到 ${WIN_SCORE} 分</p>
          </div>
        </div>
        <div class="pong-scoreline">
          <span class="ps you">你 <b id="pp-p">0</b></span>
          <span class="ps sep">:</span>
          <span class="ps foe"><b id="pp-a">0</b> ${esc(opts.npc.name)}</span>
        </div>
      </div>
      <div class="pong-stage">
        <canvas id="pong-canvas"></canvas>
        <div class="mg-overlay hidden" id="pong-overlay">
          <div class="po-card">
            <div class="po-tag" id="pp-tag">本局结束</div>
            <h3 id="pp-title">—</h3>
            <p id="pp-msg"></p>
            <div class="mg-row">
              <button class="btn primary" data-act="again">再打一局</button>
              <button class="btn" data-act="close">收拍</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mg-hint">
        <span>移动鼠标 / 触屏拖动，或按 <kbd>W</kbd> <kbd>S</kbd>（↑ ↓）控制球拍</span>
        <span id="pp-status" class="mg-status">${esc(opts.npc.taunt || '开球吧。')}</span>
      </div>
      <div class="mg-row">
        <button class="btn" data-act="restart">重新发球</button>
        <button class="btn" data-act="close">不打了</button>
      </div>
    </div>`;
  ui.openModal(html, { cls: 'mg-panel pong-panel' });

  const root = ui.els.modal;
  const canvas = root.querySelector('#pong-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = root.querySelector('#pong-overlay');
  const statusEl = root.querySelector('#pp-status');
  const pEl = root.querySelector('#pp-p');
  const aEl = root.querySelector('#pp-a');
  const titleEl = root.querySelector('#pp-title');
  const msgEl = root.querySelector('#pp-msg');
  const tagEl = root.querySelector('#pp-tag');

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function esc(x) { return String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function resetMatch() {
    g.phase = 'serve';
    g.serveTimer = 1.25;
    g.serveDir = Math.random() < 0.5 ? -1 : 1;
    g.score.p = 0;
    g.score.a = 0;
    g.player.y = H / 2;
    g.player.target = H / 2;
    g.ai.y = H / 2;
    g.ball.x = W / 2;
    g.ball.y = H / 2;
    g.ball.vx = 0;
    g.ball.vy = 0;
    g.trail = [];
    g.particles = [];
    g.ended = false;
    g.overlayShown = false;
    g.rally = 0;
    g.message = '准备发球';
    g.messageTimer = 1.2;
    overlay.classList.add('hidden');
    pEl.textContent = '0';
    aEl.textContent = '0';
    setStatus('先到 ' + WIN_SCORE + ' 分。' + (opts.npc.taunt || ''));
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'mg-status' + (kind ? ' ' + kind : '');
  }

  function serve() {
    g.phase = 'play';
    const angle = (Math.random() * 0.7 - 0.35);
    const speed = 430;
    g.ball.x = W / 2;
    g.ball.y = H / 2 + (Math.random() * 80 - 40);
    g.ball.vx = Math.cos(angle) * speed * g.serveDir;
    g.ball.vy = Math.sin(angle) * speed;
    g.trail = [];
    g.message = '发球';
    g.messageTimer = 0.5;
  }

  function point(who) {
    if (who === 'p') g.score.p++; else g.score.a++;
    pEl.textContent = String(g.score.p);
    aEl.textContent = String(g.score.a);
    sfx('score');
    g.shake = 8;
    g.flash = 1;
    burst(W / 2, H / 2, who === 'p' ? '#ffe38a' : opts.npc.color || '#d98b8b', 24);
    g.phase = 'serve';
    g.serveTimer = 0.9;
    g.serveDir = who === 'p' ? -1 : 1;
    g.ball.vx = 0;
    g.ball.vy = 0;
    g.message = who === 'p' ? '你得分' : opts.npc.name + '得分';
    g.messageTimer = 0.9;
    if (g.score.p >= WIN_SCORE || g.score.a >= WIN_SCORE) finish();
  }

  function finish() {
    g.phase = 'over';
    g.ended = true;
    const win = g.score.p > g.score.a;
    const draw = g.score.p === g.score.a;
    const outcome = draw ? 'draw' : win ? 'win' : 'lose';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish ? opts.onFinish(outcome, { p: g.score.p, a: g.score.a }) : null;
      g.rewardMsg = res && res.msg ? res.msg : '';
    } else {
      g.rewardMsg = '今天的结算已经记过了，这局纯属娱乐。';
    }
    sfx(win ? 'win' : 'lose');
    tagEl.textContent = win ? '这局你赢了' : '这局你输了';
    titleEl.textContent = g.score.p + ' : ' + g.score.a;
    msgEl.textContent = (g.rewardMsg || (win ? '打得不错。' : '再来一局找找手感。')) +
      ' · 可以继续打，但今天的结算已经记下了。';
    overlay.classList.remove('hidden');
    setStatus(win ? '赢了这局。' : '输了这局。', win ? 'ok' : 'muted');
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260;
      g.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.55, max: 1, color, r: 1 + Math.random() * 2.4,
      });
    }
  }

  function paddleHit(pad) {
    const rel = (g.ball.y - pad.y) / (PAD_H / 2);
    const angle = Math.max(-0.95, Math.min(0.95, rel)) * 0.92;
    const speed = Math.min(1050, Math.hypot(g.ball.vx, g.ball.vy) * 1.045 + 18);
    const dir = pad === g.player ? 1 : -1;
    g.ball.vx = Math.cos(angle) * speed * dir;
    g.ball.vy = Math.sin(angle) * speed;
    g.ball.x = pad === g.player
      ? PAD_X + PAD_W + BALL_R + 0.5
      : W - PAD_X - PAD_W - BALL_R - 0.5;
    g.rally++;
    g.shake = Math.min(6, 2 + speed / 400);
    sfx('paddle', Math.min(1, speed / 900));
    burst(g.ball.x, g.ball.y, pad === g.player ? '#ffe38a' : (opts.npc.color || '#7fa8d9'), 8);
    if (g.rally > 0 && g.rally % 6 === 0) setStatus('连续对拉 ' + g.rally + ' 拍。');
  }

  function step(h) {
    if (g.phase !== 'play') {
      if (g.phase === 'serve') {
        g.serveTimer -= h;
        if (g.serveTimer <= 0) serve();
      }
      return;
    }

    // 玩家拍子：鼠标目标 + 键盘
    const kSpeed = 640;
    if (keys.has('w') || keys.has('arrowup')) g.player.target -= kSpeed * h;
    if (keys.has('s') || keys.has('arrowdown')) g.player.target += kSpeed * h;
    g.player.target = clamp(g.player.target, PAD_H / 2 + 8, H - PAD_H / 2 - 8);
    g.player.y += (g.player.target - g.player.y) * Math.min(1, h * 22);

    // 对手：预测落点，带一点人的误差
    const aiSpeed = 250 + skill * 330;
    let target = H / 2;
    if (g.ball.vx > 0) {
      target = predictY();
      target += Math.sin(performance.now() / 380) * (1 - skill) * 34;
    }
    g.ai.y += clamp(target - g.ai.y, -aiSpeed * h, aiSpeed * h);
    g.ai.y = clamp(g.ai.y, PAD_H / 2 + 8, H - PAD_H / 2 - 8);

    const b = g.ball;
    b.x += b.vx * h;
    b.y += b.vy * h;

    if (b.y - BALL_R < 0 && b.vy < 0) {
      b.y = BALL_R;
      b.vy = -b.vy;
      sfx('wall');
    } else if (b.y + BALL_R > H && b.vy > 0) {
      b.y = H - BALL_R;
      b.vy = -b.vy;
      sfx('wall');
    }

    // 左拍
    if (b.vx < 0 &&
      b.x - BALL_R <= PAD_X + PAD_W &&
      b.x - BALL_R >= PAD_X - 8 &&
      Math.abs(b.y - g.player.y) <= PAD_H / 2 + BALL_R * 0.8) {
      paddleHit(g.player);
    }
    // 右拍
    if (b.vx > 0 &&
      b.x + BALL_R >= W - PAD_X - PAD_W &&
      b.x + BALL_R <= W - PAD_X + 10 &&
      Math.abs(b.y - g.ai.y) <= PAD_H / 2 + BALL_R * 0.8) {
      paddleHit(g.ai);
    }

    if (b.x < -30) point('a');
    else if (b.x > W + 30) point('p');
  }

  function predictY() {
    const b = g.ball;
    const dist = W - PAD_X - PAD_W - b.x;
    if (b.vx <= 0 || dist <= 0) return H / 2;
    let y = b.y + b.vy * (dist / b.vx);
    const span = H - BALL_R * 2;
    let t = (y - BALL_R) / span;
    t = t - Math.floor(t);
    t = t < 0.5 ? t : 1 - t;
    return BALL_R + t * span;
  }

  function update(dt) {
    acc += Math.min(dt, 0.05);
    const fixed = 1 / 240;
    let guard = 0;
    while (acc >= fixed && guard++ < 24) {
      step(fixed);
      acc -= fixed;
    }
    for (const p of g.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 1 - 3.5 * dt;
      p.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    if (g.phase === 'play') {
      g.trail.push({ x: g.ball.x, y: g.ball.y, life: 0.22 });
      if (g.trail.length > 26) g.trail.shift();
    }
    for (const t of g.trail) t.life -= dt;
    g.trail = g.trail.filter((t) => t.life > 0);
    g.shake *= 1 - Math.min(1, dt * 8);
    g.flash = Math.max(0, g.flash - dt * 2.6);
    if (g.messageTimer > 0) g.messageTimer -= dt;
  }

  function roundRect(x, y, w, h, r) {
    const rr = typeof r === 'number' ? r : 10;
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function draw() {
    ctx.save();
    if (g.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    }

    // 底色
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1620');
    bg.addColorStop(1, '#081019');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // 球台
    const table = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    table.addColorStop(0, '#123a3b');
    table.addColorStop(0.6, '#0e2c30');
    table.addColorStop(1, '#081c22');
    ctx.fillStyle = table;
    roundRect(18, 18, W - 36, H - 36, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(112, 232, 210, .34)';
    ctx.lineWidth = 2;
    roundRect(18, 18, W - 36, H - 36, 18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(112, 232, 210, .1)';
    ctx.lineWidth = 1;
    roundRect(30, 30, W - 60, H - 60, 12);
    ctx.stroke();

    // 中线 + 中场圆
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = 'rgba(178, 255, 240, .2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 34);
    ctx.lineTo(W / 2, H - 34);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 74, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(178, 255, 240, .13)';
    ctx.stroke();

    // 大比分底纹
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#d8fff6';
    ctx.font = '700 190px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(g.score.p), W / 2 - 190, H / 2 + 8);
    ctx.fillText(String(g.score.a), W / 2 + 190, H / 2 + 8);
    ctx.restore();

    // 拖尾
    for (const t of g.trail) {
      ctx.globalAlpha = Math.max(0, t.life / 0.22) * 0.35;
      ctx.fillStyle = '#d8fff6';
      ctx.beginPath();
      ctx.arc(t.x, t.y, BALL_R * (0.4 + t.life / 0.22 * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 球
    if (g.phase !== 'over') {
      const glow = ctx.createRadialGradient(g.ball.x, g.ball.y, 1, g.ball.x, g.ball.y, BALL_R * 3);
      glow.addColorStop(0, 'rgba(220, 255, 248, .5)');
      glow.addColorStop(1, 'rgba(220, 255, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(g.ball.x, g.ball.y, BALL_R * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2fffb';
      ctx.beginPath();
      ctx.arc(g.ball.x, g.ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(g.ball.x - 3, g.ball.y - 3, BALL_R * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPaddle(PAD_X, g.player.y, '#ffe38a', true);
    drawPaddle(W - PAD_X - PAD_W, g.ai.y, opts.npc.color || '#7fa8d9', false);

    // 粒子
    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 中央提示
    if (g.messageTimer > 0 && !g.ended) {
      ctx.globalAlpha = Math.min(1, g.messageTimer * 2.2);
      ctx.fillStyle = '#e8fff9';
      ctx.font = '700 26px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.message, W / 2, H / 2 - 130);
      ctx.globalAlpha = 1;
    }

    if (g.phase === 'serve' && !g.ended) {
      ctx.fillStyle = 'rgba(232, 255, 249, .55)';
      ctx.font = '600 15px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(Math.max(0, g.serveTimer)) + ' 秒后发球', W / 2, H / 2 + 120);
    }

    // 扫描线 + 暗角
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.restore();
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    if (g.flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (g.flash * 0.12) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawPaddle(x, y, color, isPlayer) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = isPlayer ? 20 : 16;
    const grad = ctx.createLinearGradient(x, y - PAD_H / 2, x + PAD_W, y + PAD_H / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, isPlayer ? '#c79a2e' : '#365e8c');
    ctx.fillStyle = grad;
    roundRect(x, y - PAD_H / 2, PAD_W, PAD_H, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    roundRect(x + 3, y - PAD_H / 2 + 5, 3, PAD_H - 10, 2);
    ctx.fill();
    ctx.restore();
  }

  function frame(ts) {
    if (destroyed) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---------------------------------------------------------------- 输入
  function movePointer(clientY) {
    const r = canvas.getBoundingClientRect();
    const y = (clientY - r.top) / r.height * H;
    g.player.target = clamp(y, PAD_H / 2 + 8, H - PAD_H / 2 - 8);
  }

  function onPointerMove(ev) {
    if (ev.pointerType === 'mouse' && ev.buttons === 0 && ev.isPrimary) {
      movePointer(ev.clientY);
    }
  }
  function onPointerDown(ev) {
    ev.preventDefault();
    canvas.setPointerCapture?.(ev.pointerId);
    movePointer(ev.clientY);
  }
  function onPointerDrag(ev) {
    if (ev.buttons || ev.pointerType !== 'mouse') movePointer(ev.clientY);
  }

  function onKeyDown(ev) {
    const k = ev.key.toLowerCase();
    if (k === 'escape') { ev.preventDefault(); close(); return; }
    if (k === 'w' || k === 's' || k === 'arrowup' || k === 'arrowdown') {
      ev.preventDefault();
      keys.add(k);
    }
  }
  function onKeyUp(ev) {
    keys.delete(ev.key.toLowerCase());
  }

  function restart() {
    resetMatch();
    last = performance.now();
  }

  function close() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ui.closeModal();
    if (opts.onExit) opts.onExit();
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerDrag);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  ui.bindModal({
    close,
    restart,
    again: restart,
  });

  active = () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerDrag);
  };
  ui.setModalCleanup(active);

  resetMatch();
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
