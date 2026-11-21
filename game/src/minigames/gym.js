// gym.js — B1 Gym: a reflex minigame.
// Both keys sit grey. One lights up yellow at random; press it inside the window → one rep, one lift.
// Wrong key or too slow costs a strike. Enough clean reps and the set is done.
// The middle scene is drawn: a lifter on the rack, dumbbell rack left, bench right.

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 520;
const H = 210;
const FLOOR = H - 42;
const WINDOW_MS = 850;   // how long you get once it lights
const STRIKES = 3;       // strikes before it fails
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
    lift: 0,        // lift animation time left
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
            <h2>Gym</h2>
            <p class="sub">Press when it lights · ${need} reps finish the set</p>
          </div>
        </div>
        <div class="gym-score">
          <span>Reps <b id="gym-hits">0</b> / ${need}</span>
          <span class="gym-miss">Misses <b id="gym-miss">0</b> / ${STRIKES}</span>
        </div>
      </div>

      <div class="gym-stage">
        <canvas id="gym-canvas"></canvas>
      </div>

      <div class="gym-keys">
        <button class="gkey" data-key="q"><b>Q</b><i>Left</i></button>
        <button class="gkey" data-key="e"><b>E</b><i>Right</i></button>
      </div>
      <div class="gym-progress"><i id="gym-bar-fill"></i></div>

      <div class="mg-hint">
        <span>Press whichever one lights · keys <kbd>Q</kbd> <kbd>E</kbd>, or just tap</span>
        <span id="gym-status" class="mg-status">Warm up first.</span>
      </div>

      <div class="mg-overlay hidden" id="gym-overlay">
        <div class="po-card">
          <div class="po-tag" id="gym-tag">Set over</div>
          <h3 id="gym-title">—</h3>
          <p id="gym-msg"></p>
          <div class="mg-row">
            <button class="btn primary" data-act="again">One more set</button>
            <button class="btn" data-act="close">Leave</button>
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

  // ------------------------------------------------------------ Scene
  // The whole gym is drawn: ceiling light strips + big back-wall mirror + dumbbell rack left + bench right + floor mat.
  // (External image sources are blocked in here anyway, so it's drawn instead — and it suits the pixel look.)
  function drawRoom() {
    // back wall
    const wall = ctx.createLinearGradient(0, 22, 0, FLOOR);
    wall.addColorStop(0, '#242d3d');
    wall.addColorStop(1, '#151b24');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 22, W, FLOOR - 22);

    // wainscot
    ctx.fillStyle = 'rgba(10,15,22,0.72)';
    ctx.fillRect(0, FLOOR - 28, W, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, FLOOR - 28, W, 1);

    drawMirror();
    drawRack();
    drawBench();

    // floor + mat
    ctx.fillStyle = '#10161e';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = 'rgba(90,104,128,0.16)';
    ctx.fillRect(0, FLOOR, W, 2);
    // mat: one slab in the middle, with seams
    ctx.fillStyle = 'rgba(58,70,94,0.75)';
    ctx.fillRect(W / 2 - 150, FLOOR - 2, 300, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const gx = W / 2 - 150 + i * 75;
      ctx.beginPath();
      ctx.moveTo(gx, FLOOR - 2);
      ctx.lineTo(gx, FLOOR + 14);
      ctx.stroke();
    }
    // a bit of white chalk dust
    ctx.fillStyle = 'rgba(220,228,242,0.05)';
    ctx.beginPath();
    ctx.ellipse(W / 2 + 42, FLOOR + 8, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    drawCeiling();
  }

  function drawCeiling() {
    // ceiling
    ctx.fillStyle = '#0d1219';
    ctx.fillRect(0, 0, W, 22);

    // three light strips + cones: the cones land on wall and gear, so the room reads as lit
    for (const lx of [92, W / 2, W - 92]) {
      ctx.fillStyle = '#ffe9b0';
      ctx.fillRect(lx - 30, 15, 60, 4);
      ctx.fillStyle = 'rgba(255,233,176,0.35)';
      ctx.fillRect(lx - 34, 19, 68, 2);

      const cone = ctx.createLinearGradient(lx, 20, lx, FLOOR);
      cone.addColorStop(0, 'rgba(255,233,176,0.13)');
      cone.addColorStop(0.65, 'rgba(255,233,176,0.04)');
      cone.addColorStop(1, 'rgba(255,233,176,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 34, 20);
      ctx.lineTo(lx + 34, 20);
      ctx.lineTo(lx + 104, FLOOR + 8);
      ctx.lineTo(lx - 104, FLOOR + 8);
      ctx.closePath();
      ctx.fill();
    }

    // darken the corners
    const vig = ctx.createRadialGradient(W / 2, FLOOR * 0.55, 60, W / 2, FLOOR * 0.55, W * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(4,7,12,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMirror() {
    const mx = 138;
    const my = 34;
    const mw = 244;
    const mh = 92;

    // frame
    ctx.fillStyle = '#2b364a';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.fillStyle = '#1b2431';
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);

    // glass
    const glass = ctx.createLinearGradient(mx, my, mx, my + mh);
    glass.addColorStop(0, 'rgba(176,200,232,0.24)');
    glass.addColorStop(0.55, 'rgba(140,166,200,0.14)');
    glass.addColorStop(1, 'rgba(96,120,152,0.20)');
    ctx.fillStyle = glass;
    ctx.fillRect(mx, my, mw, mh);

    // two lamps reflected in the mirror
    ctx.fillStyle = 'rgba(255,233,176,0.30)';
    for (const rx of [mx + 62, mx + mw - 62]) ctx.fillRect(rx - 22, my + 10, 44, 3);

    // diagonal highlight
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.beginPath();
    ctx.moveTo(mx + 18, my + mh);
    ctx.lineTo(mx + 92, my);
    ctx.lineTo(mx + 126, my);
    ctx.lineTo(mx + 52, my + mh);
    ctx.closePath();
    ctx.fill();

    // dark edge along the bottom of the mirror
    ctx.fillStyle = 'rgba(10,15,22,0.35)';
    ctx.fillRect(mx, my + mh - 6, mw, 6);
  }

  function drawDumbbell(x, y, len) {
    // shaft
    ctx.fillStyle = '#8d99ad';
    ctx.fillRect(x, y, len, 3);
    // plates on both ends
    ctx.fillStyle = '#3f4d66';
    ctx.fillRect(x - 4, y - 5, 5, 13);
    ctx.fillRect(x + len - 1, y - 5, 5, 13);
    ctx.fillStyle = '#5d6f96';
    ctx.fillRect(x - 4, y - 5, 5, 3);
    ctx.fillRect(x + len - 1, y - 5, 5, 3);
  }

  function drawRack() {
    // left dumbbell rack: A-frame, two tiers, three pairs each
    const bx = 24;
    const top = FLOOR - 74;
    ctx.strokeStyle = '#39465c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, FLOOR);
    ctx.lineTo(bx + 4, top);
    ctx.lineTo(bx + 84, top);
    ctx.lineTo(bx + 88, FLOOR);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 4, top + 30);
    ctx.lineTo(bx + 84, top + 30);
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      drawDumbbell(bx + 10 + i * 25, top + 4, 16);
      drawDumbbell(bx + 10 + i * 25, top + 34, 16);
    }

    // a kettlebell on the floor
    ctx.fillStyle = '#3f4d66';
    ctx.beginPath();
    ctx.arc(bx + 104, FLOOR - 9, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d6f96';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx + 104, FLOOR - 16, 6, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  function drawBench() {
    // right bench
    const bx = W - 132;
    const by = FLOOR - 30;
    ctx.fillStyle = '#2c3648';
    ctx.fillRect(bx, by, 98, 10);
    ctx.fillStyle = '#5b6f96';
    ctx.fillRect(bx + 4, by - 5, 90, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(bx + 4, by - 5, 90, 2);
    // bench legs
    ctx.fillStyle = '#39465c';
    ctx.fillRect(bx + 12, by + 10, 5, 20);
    ctx.fillRect(bx + 80, by + 10, 5, 20);

    // plate tree: post + three plates
    const px = bx + 116;
    ctx.fillStyle = '#39465c';
    ctx.fillRect(px, FLOOR - 62, 4, 62);
    for (let i = 0; i < 3; i++) {
      const py = FLOOR - 54 + i * 17;
      ctx.fillStyle = i === 0 ? '#5d6f96' : '#3f4d66';
      ctx.beginPath();
      ctx.ellipse(px + 2, py, 13, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b2431';
      ctx.beginPath();
      ctx.arc(px + 2, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function poseAmount() {
    if (g.lift <= 0) return 0;
    // 0.30 → 0: snap up fast, then lower it slow
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

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, FLOOR - 2, 26 + pose * 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.fillStyle = '#2a2a35';
    ctx.fillRect(cx - 12, hipY, 9, FLOOR - hipY - 2);
    ctx.fillRect(cx + 3, hipY, 9, FLOOR - hipY - 2);
    // shoes
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(cx - 14, FLOOR - 5, 13, 5);
    ctx.fillRect(cx + 2, FLOOR - 5, 13, 5);

    // torso
    ctx.fillStyle = '#33456b';
    ctx.fillRect(cx - 12, shoulderY, 24, hipY - shoulderY + 2);
    ctx.fillStyle = '#3d5382';
    ctx.fillRect(cx - 12, shoulderY, 24, 5);

    // head
    ctx.fillStyle = '#f3c9a3';
    ctx.fillRect(cx - 9, shoulderY - 20, 18, 17);
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(cx - 9, shoulderY - 20, 18, 6);
    // eyes: squint on the effort
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(cx - 5, shoulderY - 11, 2, pose > 0.2 ? 1 : 2);
    ctx.fillRect(cx + 3, shoulderY - 11, 2, pose > 0.2 ? 1 : 2);

    // arms: shoulders out to the bar
    ctx.strokeStyle = '#f3c9a3';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, shoulderY + 6);
    ctx.lineTo(cx - 26, barY);
    ctx.moveTo(cx + 10, shoulderY + 6);
    ctx.lineTo(cx + 26, barY);
    ctx.stroke();

    // barbell
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
    drawLifter(poseAmount());
    drawDust(dt || 0);
  }

  // ------------------------------------------------------------ Flow
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
    setStatus('Warm up first.');
    paintHud();
  }

  function arm() {
    g.armed = KEYS[Math.floor(Math.random() * KEYS.length)];
    g.phase = 'armed';
    g.timer = WINDOW_MS / 1000;
    setStatus('Press ' + g.armed.toUpperCase() + '!');
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
    setStatus(g.hits >= need ? 'Set complete.' : 'That is a rep.');
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
    setStatus(why + ', ' + Math.max(0, STRIKES - g.strikes) + ' strikes left.');
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
    tagEl.textContent = win ? 'Set complete' : 'Gave out';
    titleEl.textContent = 'Reps ' + g.hits + ' / ' + need + ' · Misses ' + g.strikes;
    msgEl.textContent = (reward || (win ? 'Not bad.' : 'Slow down next time.')) + ' · Another set is fine, but the tally for today is already booked.';
    overlay.classList.remove('hidden');
    setStatus(win ? 'Set complete.' : 'Gave out.');
    paintHud();
  }

  function press(k) {
    if (g.phase === 'over') return;
    if (g.phase !== 'armed') return; // pressing while unlit does not count; no need to punish fast hands
    if (k === g.armed) hit();
    else miss('Wrong key');
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
      if (g.timer <= 0) miss('Too slow');
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
