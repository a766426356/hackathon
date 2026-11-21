// run.js — 操场：跨栏比赛。
// 流程：准备（加载条）→ 按「开始」→ 3-2-1 发令 → 跑 → 结算。
// 两条对手都在相邻跑道：一个强一点（不失误才追得上），一个弱一点（掉两次也还在你后面）。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 640;
const H = 240;
const GROUND = H - 58;
const PLAYER_X = 132;
const PX_PER_M = 9;
const TOTAL_M = 60;
const HURDLE_GAP = 7;
const JUMP_V = -560;
const GRAVITY = 1700;
const MAX_SPEED = 6.4;
const COUNT_STEP = 0.72;

const PREP_LINES = ['准备场地…', '检查栏架…', '对手就位…', '各就各位…'];
const PREP_TIME = 1.9;

// 对手：强的那位按 10.05s 跑完，玩家全程不撞大约 9.8s；撞一次大约多花 0.5s
const RIVALS = [
  { id: 'chen', name: '陈', speed: TOTAL_M / 10.05, color: '#7fa8d9', lane: -1 },
  { id: 'zhou', name: '周', speed: TOTAL_M / 11.20, color: '#9ad98b', lane: 1 },
];

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
    phase: 'prep', // prep | ready | count | race | over
    prep: 0,
    line: 0,
    countT: 0,
    countN: 4,
    dist: 0,
    speed: 0,
    py: 0,
    vy: 0,
    onGround: true,
    misses: 0,
    jumps: 0,
    shake: 0,
    time: 0,
    over: false,
    settled: false,
    rivals: RIVALS.map((r) => ({ ...r, dist: 0 })),
  };

  const html = `
    <div class="mg run-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🏃</span>
          <div>
            <h2>跨栏</h2>
            <p class="sub">${TOTAL_M} 米 · 撞两次就落后 · 不失误才追得上陈</p>
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
            <button class="btn primary run-start hidden" id="run-start" data-act="start">开始</button>
          </div>
        </div>
        <div class="run-count hidden" id="run-count"><span>3</span></div>
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
        <span><kbd>空格</kbd> / <kbd>E</kbd> / <kbd>↑</kbd> 起跳 · 落地就能再跳</span>
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
  const startBtn = root.querySelector('#run-start');
  const countEl = root.querySelector('#run-count');
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

  function setStatus(t) { statusEl.textContent = t; }
  function setCount(txt) {
    countEl.querySelector('span').textContent = txt;
    countEl.classList.remove('pop');
    // 强制回流，动画才会重播
    void countEl.offsetWidth;
    countEl.classList.add('pop');
  }

  function resetRun() {
    g.phase = 'prep';
    g.prep = 0;
    g.line = 0;
    g.countT = 0;
    g.countN = 4;
    g.dist = 0;
    g.speed = 0;
    g.py = 0;
    g.vy = 0;
    g.onGround = true;
    g.misses = 0;
    g.jumps = 0;
    g.shake = 0;
    g.time = 0;
    g.over = false;
    g.settled = false;
    for (const r of g.rivals) r.dist = 0;
    for (const h of hurdles) { h.checked = false; h.hit = false; }
    prepEl.classList.remove('hidden');
    startBtn.classList.add('hidden');
    countEl.classList.add('hidden');
    overlay.classList.add('hidden');
    prepTitle.textContent = PREP_LINES[0];
    prepBar.style.transform = 'scaleX(0)';
    mEl.textContent = '0';
    setStatus('还没开始。');
  }

  function readyToStart() {
    g.phase = 'ready';
    prepTitle.textContent = '各就各位。';
    prepBar.style.transform = 'scaleX(1)';
    startBtn.classList.remove('hidden');
    startBtn.focus();
    setStatus('按「开始」发令。');
  }

  function beginCountdown() {
    if (g.phase !== 'ready') return;
    g.phase = 'count';
    g.countT = 0;
    g.countN = 3;
    prepEl.classList.add('hidden');
    countEl.classList.remove('hidden');
    setCount('3');
    sfx('tick');
    setStatus('三…');
  }

  function startRace() {
    g.phase = 'race';
    countEl.classList.add('hidden');
    sfx('gun');
    setStatus('跑起来！');
  }

  function jump() {
    if (g.phase === 'prep' || g.phase === 'ready') { if (g.phase === 'ready') beginCountdown(); return; }
    if (g.phase === 'count') return;
    if (g.phase !== 'race' || !g.onGround) return;
    g.vy = JUMP_V;
    g.onGround = false;
    g.jumps++;
    sfx('paddle', 0.5);
  }

  function rank() {
    const all = [{ me: true, dist: g.dist }, ...g.rivals.map((r) => ({ me: false, dist: r.dist }))];
    all.sort((a, b) => b.dist - a.dist);
    return all.findIndex((x) => x.me) + 1;
  }

  function finish() {
    if (g.over) return;
    g.over = true;
    g.phase = 'over';
    // 谁先冲线就算赢：对手还没到 60 米才算被我们超过。
    // （不能把对手距离截断到 60 —— 那样「同时到达」会被算成玩家赢。）
    const beaten = g.rivals.filter((r) => r.dist < TOTAL_M).length;
    const place = 3 - beaten;
    const outcome = place === 1 ? 'win' : place === 2 ? 'draw' : 'lose';
    let reward = '';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish ? opts.onFinish(outcome, { misses: g.misses, jumps: g.jumps, place }) : null;
      reward = res && res.msg ? res.msg : '';
    }
    sfx(outcome === 'win' ? 'win' : 'lose');
    tagEl.textContent = place === 1 ? '第一名' : place === 2 ? '第二名' : '第三名';
    titleEl.textContent = '第 ' + place + ' 名 · 撞了 ' + g.misses + ' 次';
    msgEl.textContent = (reward || '跑完了。') + ' · 可以再来一次，但今天的结算已经记下了。';
    overlay.classList.remove('hidden');
    setStatus('第 ' + place + ' 名。');
  }

  // ------------------------------------------------------------ 绘制
  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7fa8d9');
    sky.addColorStop(0.6, '#cfd9e6');
    sky.addColorStop(1, '#e6ded0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    // 看台：一条条渐变的座位，越远越淡
    for (let i = 0; i < 4; i++) {
      const y = GROUND - 108 + i * 17;
      ctx.fillStyle = 'rgba(90,104,128,' + (0.10 + i * 0.05) + ')';
      ctx.fillRect(0, y, W, 12);
    }
    // 远处楼
    ctx.fillStyle = 'rgba(70,86,112,0.20)';
    for (let i = 0; i < 6; i++) {
      const bw = 74 + (i % 3) * 26;
      const bh = 40 + ((i * 37) % 48);
      const bx = ((i * 150 - g.dist * 1.2) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(bx, GROUND - 112 - bh, bw, bh);
    }

    // 跑道
    ctx.fillStyle = '#c98b6b';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillRect(0, GROUND + 26, W, 1);
    ctx.fillRect(0, GROUND + 52, W, 1);
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
    ctx.fillRect(x - 2, GROUND - 36, 4, 36);
    ctx.fillRect(x + 14, GROUND - 36, 4, 36);
    ctx.fillStyle = h.hit ? '#c98080' : '#f0e2bb';
    ctx.fillRect(x - 4, GROUND - 34, 24, 4);
    ctx.fillRect(x - 4, GROUND - 24, 24, 4);
  }

  // 小人：近的跑道画大一点，相邻跑道上的人画小一点、抬高一点，看起来有纵深
  function drawRunner(px, baseY, stride, scale, body, skin, isMe) {
    ctx.save();
    ctx.translate(px, baseY);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a35';
    ctx.fillRect(-6, -12 + Math.max(0, stride), 5, 14);
    ctx.fillRect(1, -12 + Math.max(0, -stride), 5, 14);
    ctx.fillStyle = body;
    ctx.fillRect(-7, -28, 14, 17);
    ctx.fillStyle = skin;
    ctx.fillRect(-6, -40, 12, 12);
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(-6, -40, 12, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(-10, -26 - stride, 4, 10);
    ctx.fillRect(6, -26 + stride, 4, 10);
    if (isMe) {
      // 自己头顶一个小箭头，人多了也找得到
      ctx.fillStyle = '#ffe38a';
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.lineTo(-5, -56);
      ctx.lineTo(5, -56);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawField() {
    // 相邻跑道的对手先画（在后面），再画自己
    const order = g.rivals.slice().sort((a, b) => Math.abs(b.lane) - Math.abs(a.lane));
    for (const r of order) {
      const x = PLAYER_X + (r.dist - g.dist) * PX_PER_M * 0.96;
      if (x < -60 || x > W + 60) continue;
      const y = GROUND - 14 * Math.abs(r.lane) - 8;
      ctx.globalAlpha = 0.92;
      drawRunner(x, y, Math.sin(r.dist * 5.6) * 4, 0.86, r.color, '#f3c9a3', false);
      ctx.globalAlpha = 1;
    }
    drawRunner(PLAYER_X, GROUND + g.py, g.onGround ? Math.sin(g.dist * 6) * 4 : 0, 1, '#33456b', '#f3c9a3', true);
  }

  function drawFinish() {
    const x = PLAYER_X + (TOTAL_M - g.dist) * PX_PER_M;
    if (x > W + 20) return;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#2b3446' : '#f0e2bb';
      ctx.fillRect(x + i * 6, GROUND - 54, 6, 54);
    }
  }

  function drawRibbon() {
    if (g.phase !== 'race' && g.phase !== 'over') return;
    const place = rank();
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(W - 104, 10, 92, 24);
    ctx.fillStyle = place === 1 ? '#ffe38a' : '#c9d2e2';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(place === 1 ? '第 1 名' : '第 ' + place + ' 名', W - 58, 27);
  }

  function render() {
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBackdrop();
    drawFinish();
    for (const h of hurdles) drawHurdle(h);
    drawField();
    drawRibbon();
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
      if (g.prep >= PREP_TIME) readyToStart();
      return;
    }

    if (g.phase === 'count') {
      g.countT += dt;
      const elapsed = g.countT;
      const n = 3 - Math.floor(elapsed / COUNT_STEP);
      if (n !== g.countN) {
        g.countN = n;
        if (n > 0) { setCount(String(n)); sfx('tick'); }
        else startRace();
      }
      return;
    }

    if (g.phase !== 'race') return;

    g.time += dt;
    g.speed = Math.min(MAX_SPEED, g.speed + dt * 7);
    g.dist += g.speed * dt;
    for (const r of g.rivals) {
      r.dist += r.speed * dt;
    }

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
        g.speed = Math.min(g.speed, 2.2); // 踉跄一下，速度掉回起跑水平
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
    if (act === 'start') { beginCountdown(); return; }
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
