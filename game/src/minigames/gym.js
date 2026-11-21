// gym.js — B1 健身房：反应小游戏。
// 两个键平时是灰的，随机一个亮成黄色，在窗口时间内按它 → 成功一次、杠铃举一次。
// 按错或者超时算一次失手。成功次数够了就算这组练完。
// 中间那一幕是画出来的：小人在架子上举杠铃，两边有哑铃架和卧推凳。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 520;
const H = 210;
const FLOOR = H - 42;
const WINDOW_MS = 850;   // 亮起后多久内必须按
const STRIKES = 3;       // 失手几次算失败
const KEYS = ['q', 'e'];

let active = null;

export function openGym(opts = {}) {
  if (active) active();
  unlockAudio();

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const need = Math.max(1, opts.need || 6);
  let raf = 0;
  let last = 0;
  let destroyed = false;

  const g = {
    phase: 'idle', // idle | armed | over
    hits: 0,
    strikes: 0,
    armed: null,
    timer: 0,
    wait: 0.9,
    lift: 0,        // 举起动画剩余时间
    shake: 0,
    t: 0,
    dust: [],
    over: false,
    settled: false,
  };

  const html = `
    <div class="mg gym-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🏋️</span>
          <div>
            <h2>健身房</h2>
            <p class="sub">灯亮就按 · 举 ${need} 次算这组完成</p>
          </div>
        </div>
        <div class="gym-score">
          <span>完成 <b id="gym-hits">0</b> / ${need}</span>
          <span class="gym-miss">失手 <b id="gym-miss">0</b> / ${STRIKES}</span>
        </div>
      </div>

      <div class="gym-stage">
        <canvas id="gym-canvas"></canvas>
      </div>

      <div class="gym-keys">
        <button class="gkey" data-key="q"><b>Q</b><i>左</i></button>
        <button class="gkey" data-key="e"><b>E</b><i>右</i></button>
      </div>
      <div class="gym-progress"><i id="gym-bar-fill"></i></div>

      <div class="mg-hint">
        <span>亮起来的那一下就按它 · 键盘 <kbd>Q</kbd> <kbd>E</kbd> 或者直接点</span>
        <span id="gym-status" class="mg-status">先热个身。</span>
      </div>

      <div class="mg-overlay hidden" id="gym-overlay">
        <div class="po-card">
          <div class="po-tag" id="gym-tag">这组结束</div>
          <h3 id="gym-title">—</h3>
          <p id="gym-msg"></p>
          <div class="mg-row">
            <button class="btn primary" data-act="again">再来一组</button>
            <button class="btn" data-act="close">走人</button>
          </div>
        </div>
      </div>
    </div>`;
  ui.openModal(html, { cls: 'mg-panel gym-panel' });

  const root = ui.els.modal;
  const canvas = root.querySelector('#gym-canvas');
  const ctx = canvas.getContext('2d');
  const buttons = Array.from(root.querySelectorAll('.gkey'));
  const hitsEl = root.querySelector('#gym-hits');
  const missEl = root.querySelector('#gym-miss');
  const barFill = root.querySelector('#gym-bar-fill');
  const statusEl = root.querySelector('#gym-status');
  const overlay = root.querySelector('#gym-overlay');
  const tagEl = root.querySelector('#gym-tag');
  const titleEl = root.querySelector('#gym-title');
  const msgEl = root.querySelector('#gym-msg');

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function setStatus(t) { statusEl.textContent = t; }

  function paintKeys() {
    for (const b of buttons) {
      b.classList.toggle('armed', g.armed === b.dataset.key);
      b.classList.toggle('off', g.phase === 'over');
    }
  }

  function paintHud() {
    hitsEl.textContent = String(g.hits);
    missEl.textContent = String(g.strikes);
    barFill.style.transform = 'scaleX(' + Math.min(1, g.hits / need).toFixed(3) + ')';
    root.classList.toggle('shake', g.shake > 0);
    paintKeys();
  }

  // ------------------------------------------------------------ 场景
  function drawRoom() {
    // 后墙
    const wall = ctx.createLinearGradient(0, 0, 0, FLOOR);
    wall.addColorStop(0, '#242c3b');
    wall.addColorStop(1, '#171d28');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, FLOOR);

    // 镜子：两块带斜高光的板子
    for (const bx of [26, W - 186]) {
      ctx.fillStyle = 'rgba(150,180,220,0.10)';
      ctx.fillRect(bx, 22, 160, 96);
      ctx.strokeStyle = 'rgba(150,180,220,0.28)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, 22, 160, 96);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(bx + 12, 118);
      ctx.lineTo(bx + 74, 22);
      ctx.lineTo(bx + 106, 22);
      ctx.lineTo(bx + 44, 118);
      ctx.closePath();
      ctx.fill();
    }

    // 地板 + 地胶
    ctx.fillStyle = '#121821';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, FLOOR, W, 2);
    ctx.fillStyle = 'rgba(60,72,96,0.55)';
    ctx.fillRect(W / 2 - 112, FLOOR - 6, 224, 12);
  }

  function drawDumbbell(x, y, size, flip) {
    ctx.fillStyle = '#8d99ad';
    ctx.fillRect(x, y, size, 3);
    ctx.fillStyle = '#4b5b78';
    ctx.fillRect(x - 3 * (flip ? -1 : 1) * 0, y - 3, 4, 9);
    ctx.fillRect(x + size - 4, y - 3, 4, 9);
  }

  function drawRack() {
    // 左边哑铃架：两层，每层三副
    const bx = 22;
    const by = FLOOR - 62;
    ctx.strokeStyle = '#3b4a63';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, FLOOR);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + 78, by);
    ctx.lineTo(bx + 78, FLOOR);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by + 26);
    ctx.lineTo(bx + 78, by + 26);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      drawDumbbell(bx + 8 + i * 24, by - 2, 16, false);
      drawDumbbell(bx + 8 + i * 24, by + 24, 16, false);
    }
  }

  function drawBench() {
    // 右边卧推凳 + 杠铃片
    const bx = W - 128;
    const by = FLOOR - 26;
    ctx.fillStyle = '#2f3a4d';
    ctx.fillRect(bx, by, 92, 12);
    ctx.fillStyle = '#5b6f96';
    ctx.fillRect(bx + 4, by - 4, 84, 8);
    ctx.fillStyle = '#3b4a63';
    ctx.fillRect(bx + 10, by + 12, 4, 14);
    ctx.fillRect(bx + 76, by + 12, 4, 14);
    // 地上的片子
    ctx.fillStyle = '#3b4a63';
    ctx.beginPath();
    ctx.arc(bx + 20, FLOOR - 8, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232b3b';
    ctx.beginPath();
    ctx.arc(bx + 20, FLOOR - 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function poseAmount() {
    if (g.lift <= 0) return 0;
    // 0.30 → 0：先快速顶起，再慢慢放回
    const p = 1 - g.lift / 0.30;
    return p < 0.42 ? p / 0.42 : 1 - (p - 0.42) / 0.58;
  }

  function drawLifter(pose) {
    const cx = W / 2;
    const hipY = FLOOR - 34;
    const shoulderY = hipY - 34;
    const barY = shoulderY - 6 - pose * 54;
    const jitter = g.shake > 0 ? (Math.random() - 0.5) * 3 : 0;

    ctx.save();
    ctx.translate(jitter, 0);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, FLOOR - 2, 26 + pose * 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 腿
    ctx.fillStyle = '#2a2a35';
    ctx.fillRect(cx - 12, hipY, 9, FLOOR - hipY - 2);
    ctx.fillRect(cx + 3, hipY, 9, FLOOR - hipY - 2);
    // 鞋
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(cx - 14, FLOOR - 5, 13, 5);
    ctx.fillRect(cx + 2, FLOOR - 5, 13, 5);

    // 躯干
    ctx.fillStyle = '#33456b';
    ctx.fillRect(cx - 12, shoulderY, 24, hipY - shoulderY + 2);
    ctx.fillStyle = '#3d5382';
    ctx.fillRect(cx - 12, shoulderY, 24, 5);

    // 头
    ctx.fillStyle = '#f3c9a3';
    ctx.fillRect(cx - 9, shoulderY - 20, 18, 17);
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(cx - 9, shoulderY - 20, 18, 6);
    // 眼睛：用力的时候眯着
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(cx - 5, shoulderY - 11, 2, pose > 0.2 ? 1 : 2);
    ctx.fillRect(cx + 3, shoulderY - 11, 2, pose > 0.2 ? 1 : 2);

    // 手臂：从肩膀连到杠
    ctx.strokeStyle = '#f3c9a3';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, shoulderY + 6);
    ctx.lineTo(cx - 26, barY);
    ctx.moveTo(cx + 10, shoulderY + 6);
    ctx.lineTo(cx + 26, barY);
    ctx.stroke();

    // 杠铃
    ctx.fillStyle = '#b9c2d4';
    ctx.fillRect(cx - 74, barY - 3, 148, 6);
    ctx.fillStyle = '#8a95a8';
    ctx.fillRect(cx - 74, barY, 148, 3);
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#4b5b78';
      ctx.fillRect(cx + s * 62 - 6, barY - 17, 12, 34);
      ctx.fillStyle = '#5d6f96';
      ctx.fillRect(cx + s * 62 - 6, barY - 17, 12, 4);
      ctx.fillStyle = '#8d99ad';
      ctx.fillRect(cx + s * 44 - 2, barY - 12, 4, 24);
    }

    ctx.restore();
  }

  function drawDust(dt) {
    for (const p of g.dust) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
    }
    g.dust = g.dust.filter((p) => p.life > 0);
    for (const p of g.dust) {
      ctx.fillStyle = 'rgba(255,238,180,' + Math.max(0, p.life * 1.6) + ')';
      ctx.fillRect(p.x, p.y, 3, 3);
    }
  }

  function puff() {
    const cx = W / 2;
    for (let i = 0; i < 8; i++) {
      g.dust.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: FLOOR - 6,
        vx: (Math.random() - 0.5) * 90,
        vy: -40 - Math.random() * 70,
        life: 0.35 + Math.random() * 0.25,
      });
    }
  }

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    drawRoom();
    drawRack();
    drawBench();
    drawLifter(poseAmount());
    drawDust(dt || 0);
  }

  // ------------------------------------------------------------ 流程
  function reset() {
    g.phase = 'idle';
    g.hits = 0;
    g.strikes = 0;
    g.armed = null;
    g.timer = 0;
    g.wait = 0.9;
    g.lift = 0;
    g.shake = 0;
    g.dust = [];
    g.over = false;
    g.settled = false;
    overlay.classList.add('hidden');
    setStatus('先热个身。');
    paintHud();
  }

  function arm() {
    g.armed = KEYS[Math.floor(Math.random() * KEYS.length)];
    g.phase = 'armed';
    g.timer = WINDOW_MS / 1000;
    setStatus('按 ' + g.armed.toUpperCase() + '！');
    paintHud();
    sfx('score', 0.4);
  }

  function hit() {
    g.hits++;
    g.armed = null;
    g.phase = 'idle';
    g.wait = 0.34;
    g.lift = 0.30;
    puff();
    sfx('pot');
    setStatus(g.hits >= need ? '这组完成了。' : '举起来了。');
    paintHud();
    if (g.hits >= need) finish(true);
  }

  function miss(why) {
    g.strikes++;
    g.armed = null;
    g.phase = 'idle';
    g.wait = 0.55;
    g.shake = 0.22;
    sfx('foul');
    setStatus(why + '，还剩 ' + Math.max(0, STRIKES - g.strikes) + ' 次机会。');
    paintHud();
    if (g.strikes >= STRIKES) finish(false);
  }

  function finish(win) {
    if (g.over) return;
    g.over = true;
    g.phase = 'over';
    let reward = '';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish ? opts.onFinish(win ? 'win' : 'lose', { hits: g.hits, strikes: g.strikes }) : null;
      reward = res && res.msg ? res.msg : '';
    }
    sfx(win ? 'win' : 'lose');
    tagEl.textContent = win ? '练完了' : '没撑住';
    titleEl.textContent = '完成 ' + g.hits + ' / ' + need + ' · 失手 ' + g.strikes;
    msgEl.textContent = (reward || (win ? '还行。' : '下次慢一点。')) + ' · 可以再来一组，但今天的结算已经记下了。';
    overlay.classList.remove('hidden');
    setStatus(win ? '练完了。' : '没撑住。');
    paintHud();
  }

  function press(k) {
    if (g.phase === 'over') return;
    if (g.phase !== 'armed') return; // 没亮的时候按不算，别罚手快的人
    if (k === g.armed) hit();
    else miss('按错了');
  }

  function frame(ts) {
    if (destroyed) return;
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0);
    last = ts;
    g.t += dt;

    if (g.lift > 0) g.lift = Math.max(0, g.lift - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);

    if (g.phase === 'idle' && !g.over) {
      g.wait -= dt;
      if (g.wait <= 0) arm();
    } else if (g.phase === 'armed') {
      g.timer -= dt;
      if (g.timer <= 0) miss('慢了半拍');
    }

    render(dt);
    raf = requestAnimationFrame(frame);
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    e.preventDefault();
    press(k);
  }
  window.addEventListener('keydown', onKey);

  root.onclick = (ev) => {
    const keyBtn = ev.target.closest('.gkey');
    if (keyBtn && !keyBtn.classList.contains('off')) { press(keyBtn.dataset.key); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'close') { destroy(); ui.closeModal(); if (opts.onExit) opts.onExit(); return; }
    if (el.dataset.act === 'again') { reset(); return; }
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

  reset();
  raf = requestAnimationFrame(frame);
}
