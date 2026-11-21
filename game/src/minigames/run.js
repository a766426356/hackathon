// run.js — 操场：跨栏比赛。像小恐龙那样，跨过一个一个栏架跑到终点。
// 前面有一段「准备」：背景图 + 加载条 + 做准备的字幕，和文娱楼那几个小游戏保持一个节奏。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 640;
const H = 240;
const GROUND = H - 54;
const PLAYER_X = 118;
const PX_PER_M = 9;      // 一米多少像素
const TOTAL_M = 60;      // 跑到这儿算完
const HURDLE_GAP = 7;    // 每 7 米一个栏
const JUMP_V = -560;
const GRAVITY = 1700;

const PREP_LINES = ['准备场地…', '检查栏架…', '对手就位…', '各就各位…'];
const PREP_TIME = 2.0;

let active = null;

export function openRun(opts = {}) {
  if (active) active();
  unlockAudio();

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let raf = 0;
  let last = 0;
  let destroyed = false;

  const hurdles = [];
  for (let m = 8; m <= TOTAL_M - 4; m += HURDLE_GAP) hurdles.push({ at: m, checked: false, hit: false });

  const g = {
    phase: 'prep', // prep | race | over
    prep: 0,
    line: 0,
    dist: 0,
    speed: 0,
    py: 0,
    vy: 0,
    onGround: true,
    misses: 0,
    jumps: 0,
    shake: 0,
    over: false,
    settled: false,
  };

  const html = `
    <div class="mg run-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🏃</span>
          <div>
            <h2>跨栏</h2>
            <p class="sub">跑到 ${TOTAL_M} 米 · 撞两次就落后</p>
          </div>
        </div>
        <div class="run-meters"><b id="run-m">0</b> / ${TOTAL_M} m</div>
      </div>
      <div class="run-stage">
        <canvas id="run-canvas"></canvas>
        <div class="run-prep" id="run-prep">
          <div class="run-prep-card">
            <div class="run-prep-title" id="run-prep-title">准备场地…</div>
            <div class="run-prep-bar"><i id="run-prep-bar"></i></div>
            <div class="run-prep-sub">体育场 · 400 米跑道</div>
          </div>
        </div>
        <div class="mg-overlay hidden" id="run-overlay">
          <div class="po-card">
            <div class="po-tag" id="run-tag">比赛结束</div>
            <h3 id="run-title">—</h3>
            <p id="run-msg"></p>
            <div class="mg-row">
              <button class="btn primary" data-act="again">再跑一次</button>
              <button class="btn" data-act="close">回去了</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mg-hint">
        <span><kbd>空格</kbd> / <kbd>E</kbd> / <kbd>↑</kbd> 起跳 · 落地的瞬间再按可以连跳</span>
        <span id="run-status" class="mg-status">还没开始。</span>
      </div>
      <div class="mg-row">
        <button class="btn" data-act="again">重来</button>
        <button class="btn" data-act="close">不跑了</button>
      </div>
    </div>`;
  ui.openModal(html, { cls: 'mg-panel run-panel' });

  const root = ui.els.modal;
  const canvas = root.querySelector('#run-canvas');
  const ctx = canvas.getContext('2d');
  const prepEl = root.querySelector('#run-prep');
  const prepTitle = root.querySelector('#run-prep-title');
  const prepBar = root.querySelector('#run-prep-bar');
  const overlay = root.querySelector('#run-overlay');
  const statusEl = root.querySelector('#run-status');
  const mEl = root.querySelector('#run-m');
  const tagEl = root.querySelector('#run-tag');
  const titleEl = root.querySelector('#run-title');
  const msgEl = root.querySelector('#run-msg');

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function esc(x) { return String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function setStatus(t) { statusEl.textContent = t; }

  function resetRun() {
    g.phase = 'prep';
    g.prep = 0;
    g.line = 0;
    g.dist = 0;
    g.speed = 0;
    g.py = 0;
    g.vy = 0;
    g.onGround = true;
    g.misses = 0;
    g.jumps = 0;
    g.shake = 0;
    g.over = false;
    g.settled = false;
    for (const h of hurdles) { h.checked = false; h.hit = false; }
    prepEl.classList.remove('hidden');
    overlay.classList.add('hidden');
    prepTitle.textContent = PREP_LINES[0];
    prepBar.style.transform = 'scaleX(0)';
    mEl.textContent = '0';
    setStatus('还没开始。');
  }

  function startRace() {
    g.phase = 'race';
    prepEl.classList.add('hidden');
    setStatus('跑起来！');
    sfx('paddle', 0.6);
  }

  function jump() {
    if (g.phase === 'prep') { g.prep = PREP_TIME; return; } // 按一下直接跳过准备
    if (g.phase !== 'race' || !g.onGround) return;
    g.vy = JUMP_V;
    g.onGround = false;
    g.jumps++;
    sfx('paddle', 0.5);
  }

  function finish() {
    if (g.over) return;
    g.over = true;
    g.phase = 'over';
    const outcome = g.misses === 0 ? 'win' : g.misses === 1 ? 'draw' : 'lose';
    let reward = '';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish ? opts.onFinish(outcome, { misses: g.misses, jumps: g.jumps }) : null;
      reward = res && res.msg ? res.msg : '';
    }
    sfx(outcome === 'win' ? 'win' : 'lose');
    tagEl.textContent = outcome === 'win' ? '第一名' : outcome === 'draw' ? '勉强跟上' : '被套了一圈';
    titleEl.textContent = TOTAL_M + ' 米 · 撞了 ' + g.misses + ' 次';
    msgEl.textContent = (reward || '跑完了。') + ' · 可以再来一次，但今天的结算已经记下了。';
    overlay.classList.remove('hidden');
    setStatus(outcome === 'win' ? '赢了。' : outcome === 'draw' ? '还行。' : '下次早点起跳。');
  }

  // ------------------------------------------------------------ 绘制
  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7fa8d9');
    sky.addColorStop(0.62, '#cfd9e6');
    sky.addColorStop(1, '#e6ded0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    // 远处楼的剪影，跟着跑动缓慢平移
    ctx.fillStyle = 'rgba(70,86,112,0.22)';
    for (let i = 0; i < 6; i++) {
      const bw = 70 + (i % 3) * 26;
      const bh = 34 + ((i * 37) % 46);
      const bx = ((i * 150 - g.dist * 1.2) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(bx, GROUND - bh - 10, bw, bh);
    }

    // 跑道
    ctx.fillStyle = '#c98b6b';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 3; i++) ctx.fillRect(0, GROUND + 12 + i * 13, W, 1);
    // 跑道上的分道线跟着速度走，跑起来才有速度感
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.lineDashOffset = -(g.dist * PX_PER_M) % 40;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 6);
    ctx.lineTo(W, GROUND + 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawHurdle(h) {
    const x = PLAYER_X + (h.at - g.dist) * PX_PER_M;
    if (x < -30 || x > W + 30) return;
    ctx.fillStyle = h.hit ? '#8a5a5a' : '#3a4358';
    ctx.fillRect(x - 2, GROUND - 34, 4, 34);
    ctx.fillRect(x + 14, GROUND - 34, 4, 34);
    ctx.fillStyle = h.hit ? '#c98080' : '#f0e2bb';
    ctx.fillRect(x - 4, GROUND - 32, 24, 4);
    ctx.fillRect(x - 4, GROUND - 22, 24, 4);
  }

  function drawPlayer() {
    const px = PLAYER_X;
    const py = GROUND + g.py;
    const stride = g.onGround ? Math.sin(g.dist * 6) * 4 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(px, GROUND + 2, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // 腿
    ctx.fillStyle = '#2a2a35';
    ctx.fillRect(px - 6, py - 12 + Math.max(0, stride), 5, 14);
    ctx.fillRect(px + 1, py - 12 + Math.max(0, -stride), 5, 14);
    // 身体
    ctx.fillStyle = '#33456b';
    ctx.fillRect(px - 7, py - 28, 14, 17);
    // 头
    ctx.fillStyle = '#f3c9a3';
    ctx.fillRect(px - 6, py - 40, 12, 12);
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(px - 6, py - 40, 12, 4);
    // 手臂摆动
    ctx.fillStyle = '#f3c9a3';
    ctx.fillRect(px - 10, py - 26 + (g.onGround ? -stride : -4), 4, 10);
    ctx.fillRect(px + 6, py - 26 + (g.onGround ? stride : -4), 4, 10);
  }

  function drawFinish() {
    const x = PLAYER_X + (TOTAL_M - g.dist) * PX_PER_M;
    if (x > W + 20) return;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#2b3446' : '#f0e2bb';
      ctx.fillRect(x + i * 6, GROUND - 52, 6, 52);
    }
  }

  function render() {
    ctx.save();
    if (g.shake > 0) {
      ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBackdrop();
    drawFinish();
    for (const h of hurdles) drawHurdle(h);
    drawPlayer();
    ctx.restore();
    mEl.textContent = String(Math.min(TOTAL_M, Math.floor(g.dist)));
  }

  // ------------------------------------------------------------ 主循环
  function step(dt) {
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 40);

    if (g.phase === 'prep') {
      g.prep += dt;
      const p = Math.min(1, g.prep / PREP_TIME);
      prepBar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
      const idx = Math.min(PREP_LINES.length - 1, Math.floor(p * PREP_LINES.length));
      if (idx !== g.line) { g.line = idx; prepTitle.textContent = PREP_LINES[idx]; }
      if (g.prep >= PREP_TIME) startRace();
      return;
    }

    if (g.phase !== 'race') return;

    // 起步有个短加速，别一上来就全速
    g.speed = Math.min(6.4, g.speed + dt * 7);
    g.dist += g.speed * dt;

    if (!g.onGround) {
      g.vy += GRAVITY * dt;
      g.py += g.vy * dt;
      if (g.py >= 0) { g.py = 0; g.vy = 0; g.onGround = true; sfx('wall'); }
    }

    for (const h of hurdles) {
      if (h.checked || g.dist < h.at) continue;
      h.checked = true;
      if (g.py > -20) {
        h.hit = true;
        g.misses++;
        g.shake = 9;
        sfx('foul');
        setStatus('撞了第 ' + g.misses + ' 个栏。');
      } else {
        sfx('paddle', 0.8);
        setStatus('过栏。');
      }
    }

    if (g.dist >= TOTAL_M) finish();
  }

  function frame(ts) {
    if (destroyed) return;
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
    last = ts;
    step(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ 输入
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'e' || k === 'enter' || k === 'arrowup' || k === 'w') {
      e.preventDefault();
      if (g.phase === 'over') return;
      jump();
    }
  }
  window.addEventListener('keydown', onKey);

  root.onclick = (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'close') { destroy(); ui.closeModal(); if (opts.onExit) opts.onExit(); return; }
    if (act === 'again') { resetRun(); return; }
  };

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    active = null;
  }
  active = destroy;
  ui.setModalCleanup(destroy);

  resetRun();
  raf = requestAnimationFrame(frame);
}
