// run.js — 操场：跨栏比赛。
// 流程：准备（加载条）→ 按「开始」→ 3·2·1 → 各就各位（等枪）→ 枪响后自己按一下起跑 → 跑 → 结算。
// 起跑那一下拼反应：枪响到按下之间的时间直接变成起跑延迟；抢跑罚 0.6 秒。
// 两条对手分在不同跑道，画得小一点、抬高一点做纵深，它们也会自己跨栏。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 640;
const H = 240;
const GROUND = H - 62;
const PLAYER_X = 138;
const PX_PER_M = 9;
const TOTAL_M = 60;
const HURDLE_GAP = 7;
const JUMP_V = -560;
const GRAVITY = 1700;
const MAX_SPEED = 6.4;
const COUNT_STEP = 0.66;
const FALSE_START_PENALTY = 0.6;
const MAX_REACT = 1.2;

const PREP_LINES = ['准备场地…', '检查栏架…', '对手就位…', '各就各位…'];
const PREP_TIME = 1.9;

// 对手：强的那位按 10.05s 跑完（含 0.22s 反应），玩家全程不撞约 9.8s；
// 起跑慢 0.4 秒以上或者撞一次，就追不上陈了。
const RIVALS = [
  { id: 'chen', name: '陈', speed: TOTAL_M / 9.83, react: 0.22, color: '#7fa8d9', dy: 24, scale: 0.86 },
  { id: 'zhou', name: '周', speed: TOTAL_M / 10.75, react: 0.38, color: '#9ad98b', dy: 13, scale: 0.92 },
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
    phase: 'prep', // prep | ready | count | set | race | over
    prep: 0,
    line: 0,
    countT: 0,
    countN: 4,
    setWait: 0,
    fired: false,
    raceT: 0,
    reaction: null,
    falseStart: false,
    started: false,
    startAt: 0,
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
    rivals: RIVALS.map((r) => ({ ...r, dist: 0 })),
  };

  const html = `
    <div class="mg run-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🏃</span>
          <div>
            <h2>跨栏</h2>
            <p class="sub">${TOTAL_M} 米 · 枪响再起跑 · 不失误才追得上陈</p>
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
        <span id="run-start-hint">按「开始」发令</span>
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
  const hintEl = root.querySelector('#run-start-hint');
  const mEl = root.querySelector('#run-m');
  const tagEl = root.querySelector('#run-tag');
  const titleEl = root.querySelector('#run-title');
  const msgEl = root.querySelector('#run-msg');

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function setStatus(t) { statusEl.textContent = t; }
  function setHint(t) { hintEl.textContent = t; }
  function setCount(txt) {
    const span = countEl.querySelector('span');
    if (span) span.textContent = txt;
    countEl.classList.remove('pop');
    void countEl.offsetWidth; // 强制回流，动画才会重播
    countEl.classList.add('pop');
  }

  function resetRun() {
    g.phase = 'prep';
    g.prep = 0;
    g.line = 0;
    g.countT = 0;
    g.countN = 4;
    g.setWait = 0;
    g.fired = false;
    g.raceT = 0;
    g.reaction = null;
    g.falseStart = false;
    g.started = false;
    g.startAt = 0;
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
    for (const r of g.rivals) r.dist = 0;
    for (const h of hurdles) { h.checked = false; h.hit = false; }
    prepEl.classList.remove('hidden');
    startBtn.classList.add('hidden');
    countEl.classList.add('hidden');
    overlay.classList.add('hidden');
    prepTitle.textContent = PREP_LINES[0];
    prepBar.style.transform = 'scaleX(0)';
    mEl.textContent = '0';
    setHint('按「开始」发令');
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

  // 倒计时结束 → 各就各位，枪什么时候响是随机的（1.0–1.8 秒），不能预判
  function toSet() {
    g.phase = 'set';
    g.setWait = 1.0 + Math.random() * 0.8;
    countEl.classList.add('hidden');
    setHint('等枪响再按 · 空格 / E / ↑ / W');
    setStatus('各就各位……');
  }

  function fire() {
    g.phase = 'race';
    g.fired = true;
    g.raceT = 0;
    sfx('gun');
    g.shake = 6;
    setCount('跑');
    countEl.classList.remove('hidden');
    setTimeout(() => { if (!destroyed) countEl.classList.add('hidden'); }, 420);
    setHint('空格 / E / ↑ / W 起跳');
    setStatus('枪响了，起跑！');
  }

  function pressStart() {
    if (!g.fired || g.started) return false;
    g.started = true;
    g.reaction = g.raceT;
    g.startAt = g.raceT + (g.falseStart ? FALSE_START_PENALTY : 0);
    setStatus(g.falseStart
      ? '抢跑了，罚 0.6 秒。'
      : '反应 ' + g.reaction.toFixed(2) + ' 秒。');
    return true;
  }

  function jump() {
    if (g.phase === 'over') return;
    if (g.phase === 'prep') return;
    if (g.phase === 'ready') { beginCountdown(); return; }
    if (g.phase === 'count') return;
    if (g.phase === 'set') { // 枪还没响就按 = 抢跑
      if (!g.falseStart) { g.falseStart = true; sfx('foul'); setStatus('抢跑了！等枪响再按。'); }
      return;
    }
    if (!g.started) { pressStart(); return; }
    if (!g.onGround) return;
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
    // 谁先冲线谁赢：对手还没到 60 米才算被超过（不能截断对手距离，否则同时到达会被算成赢）
    const beaten = g.rivals.filter((r) => r.dist < TOTAL_M).length;
    const place = 3 - beaten;
    const outcome = place === 1 ? 'win' : place === 2 ? 'draw' : 'lose';
    let reward = '';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish
        ? opts.onFinish(outcome, { misses: g.misses, jumps: g.jumps, place, reaction: g.reaction })
        : null;
      reward = res && res.msg ? res.msg : '';
    }
    sfx(outcome === 'win' ? 'win' : 'lose');
    tagEl.textContent = place === 1 ? '第一名' : place === 2 ? '第二名' : '第三名';
    titleEl.textContent = '第 ' + place + ' 名 · 撞了 ' + g.misses + ' 次' +
      (g.reaction !== null ? ' · 反应 ' + g.reaction.toFixed(2) + 's' : '');
    msgEl.textContent = (reward || '跑完了。') + ' · 可以再来一次，但今天的结算已经记下了。';
    overlay.classList.remove('hidden');
    setStatus('第 ' + place + ' 名。');
  }

  // ------------------------------------------------------------ 绘制
  function drawStands() {
    for (let i = 0; i < 4; i++) {
      const y = GROUND - 112 + i * 18;
      ctx.fillStyle = 'rgba(90,104,128,' + (0.10 + i * 0.05) + ')';
      ctx.fillRect(0, y, W, 13);
      // 观众：一排小点，走动的时候轻轻晃
      ctx.fillStyle = 'rgba(20,26,36,' + (0.10 + i * 0.05) + ')';
      const off = (g.dist * (1.2 + i * 0.5)) % 26;
      for (let x = -26 + off; x < W + 26; x += 26) {
        const bob = Math.sin(g.raceT * 3 + x * 0.3 + i) * 1.2;
        ctx.fillRect(x + i * 7, y + 4 + bob, 7, 7);
      }
    }
  }

  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7fa8d9');
    sky.addColorStop(0.6, '#cfd9e6');
    sky.addColorStop(1, '#e6ded0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    drawStands();

    // 远处楼群：视差 1.2 倍
    ctx.fillStyle = 'rgba(70,86,112,0.20)';
    for (let i = 0; i < 6; i++) {
      const bw = 74 + (i % 3) * 26;
      const bh = 40 + ((i * 37) % 48);
      const bx = ((i * 150 - g.dist * 1.2) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(bx, GROUND - 116 - bh, bw, bh);
    }

    // 跑道：三条道，越靠上越暗（远）
    const bands = [
      { y: GROUND - 30, h: 30, c: '#b87f61' },
      { y: GROUND - 8, h: 22, c: '#c1866a' },
      { y: GROUND, h: 30, c: '#c98b6b' },
    ];
    for (const b of bands) {
      ctx.fillStyle = b.c;
      ctx.fillRect(0, b.y, W, b.h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, GROUND - 30, W, 1.5);
    ctx.fillRect(0, GROUND - 8, W, 1.5);

    // 分道虚线跟着速度滚
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.lineDashOffset = -(g.dist * PX_PER_M) % 40;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 7);
    ctx.lineTo(W, GROUND + 7);
    ctx.stroke();
    ctx.setLineDash([]);

    // 前景：跑道靠近镜头的边，滚得比别处快，速度感靠它
    ctx.fillStyle = '#8f5f47';
    ctx.fillRect(0, H - 16, W, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, H - 16, W, 3);
  }

  function drawHurdle(h) {
    const x = PLAYER_X + (h.at - g.dist) * PX_PER_M;
    if (x < -30 || x > W + 30) return;
    // 栏横跨三条道，远处那条画得矮一点，纵深就出来了
    const tops = [
      { y0: GROUND - 30, y1: GROUND - 52, w: 3 },
      { y0: GROUND - 8, y1: GROUND - 38, w: 3.5 },
      { y0: GROUND, y1: GROUND - 38, w: 4 },
    ];
    for (const t of tops) {
      const dark = h.hit ? '#8a5a5a' : '#3a4358';
      const light = h.hit ? '#c98080' : '#f0e2bb';
      ctx.fillStyle = dark;
      ctx.fillRect(x - 2, t.y1, t.w, t.y0 - t.y1);
      ctx.fillRect(x + 16, t.y1, t.w, t.y0 - t.y1);
      ctx.fillStyle = light;
      ctx.fillRect(x - 4, t.y1, 26, 3);
      ctx.fillRect(x - 4, t.y1 + 8, 26, 3);
    }
  }

  function drawRunner(px, baseY, stride, scale, body, skin, isMe, lift) {
    ctx.save();
    ctx.translate(px, baseY + (lift || 0));
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

  // 对手自己也会跨栏：离栏 0.5 米内就走一段正弦弧
  function rivalLift(r) {
    let lift = 0;
    for (const h of hurdles) {
      const d = r.dist - h.at;
      if (d > -0.5 && d < 0.5) {
        const t = (d + 0.5) / 1.0;
        lift = Math.min(lift, -Math.sin(t * Math.PI) * 26);
      }
    }
    return lift;
  }

  function drawField() {
    // 远的先画
    const order = g.rivals.slice().sort((a, b) => b.dy - a.dy);
    for (const r of order) {
      const x = PLAYER_X + (r.dist - g.dist) * PX_PER_M;
      if (x < -70 || x > W + 70) continue;
      const stride = Math.sin(r.dist * 5.6) * 4;
      ctx.globalAlpha = 0.9;
      drawRunner(x, GROUND - r.dy, stride, r.scale, r.color, '#f3c9a3', false, rivalLift(r));
      ctx.globalAlpha = 1;
      // 名字挂在头顶
      ctx.fillStyle = 'rgba(10,14,20,0.5)';
      ctx.fillRect(x - 15, GROUND - r.dy - 62 * r.scale, 30, 13);
      ctx.fillStyle = r.color;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, x, GROUND - r.dy - 52 * r.scale);
    }
    drawRunner(PLAYER_X, GROUND + g.py, g.onGround ? Math.sin(g.dist * 6) * 4 : 0,
      1, '#33456b', '#f3c9a3', true, 0);
  }

  function drawFinish() {
    const x = PLAYER_X + (TOTAL_M - g.dist) * PX_PER_M;
    if (x > W + 20) return;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#2b3446' : '#f0e2bb';
      ctx.fillRect(x + i * 6, GROUND - 56, 6, 56);
    }
  }

  function drawHud() {
    if (g.phase !== 'race' && g.phase !== 'over') return;
    const place = rank();
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(W - 108, 10, 96, 24);
    ctx.fillStyle = place === 1 ? '#ffe38a' : '#c9d2e2';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('第 ' + place + ' 名', W - 60, 27);
    if (g.reaction !== null) {
      ctx.fillStyle = 'rgba(10,14,20,0.5)';
      ctx.fillRect(W - 108, 38, 96, 20);
      ctx.fillStyle = g.falseStart ? '#f0a0a0' : '#9fd0f0';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText((g.falseStart ? '抢跑 ' : '反应 ') + g.reaction.toFixed(2) + 's', W - 60, 52);
    }
  }

  function render() {
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBackdrop();
    drawFinish();
    for (const h of hurdles) drawHurdle(h);
    drawField();
    drawHud();
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
      const n = 3 - Math.floor(g.countT / COUNT_STEP);
      if (n !== g.countN) {
        g.countN = n;
        if (n > 0) { setCount(String(n)); sfx('tick'); }
        else toSet();
      }
      return;
    }

    if (g.phase === 'set') {
      g.setWait -= dt;
      if (g.setWait <= 0) fire();
      return;
    }

    if (g.phase !== 'race') return;

    g.raceT += dt;

    // 对手按各自的反应时间起跑
    for (const r of g.rivals) {
      if (g.raceT > r.react) r.dist += r.speed * dt;
    }

    // 玩家：枪响后按了键才开始跑
    if (!g.started && g.raceT >= MAX_REACT) {
      g.falseStart = true;
      pressStart();
    }
    const running = g.started && g.raceT > g.startAt;
    if (running) {
      g.speed = Math.min(MAX_SPEED, g.speed + dt * 7);
      g.dist += g.speed * dt;
    }

    if (!g.onGround) {
      g.vy += GRAVITY * dt;
      g.py += g.vy * dt;
      if (g.py >= 0) { g.py = 0; g.vy = 0; g.onGround = true; sfx('wall'); }
    }

    // 没起跑之前不算撞栏
    if (running) {
      for (const h of hurdles) {
        if (h.checked || g.dist < h.at) continue;
        h.checked = true;
        if (g.py > -20) {
          h.hit = true;
          g.misses++;
          g.shake = 9;
          g.speed = Math.min(g.speed, 2.2);
          sfx('foul');
          setStatus('撞了第 ' + g.misses + ' 个栏。');
        } else {
          sfx('paddle', 0.8);
        }
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
      if (e.repeat) return;
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
