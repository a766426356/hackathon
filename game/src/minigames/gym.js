// gym.js — B1 健身房：反应小游戏。
// 两个键平时都是灰的，随机一个亮成黄色，在窗口时间内按它 → 成功一次、杠铃举一次。
// 按错或者超时算一次失手。成功次数够了就算这组练完。

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const WINDOW_MS = 850;   // 亮起后多久内必须按
const STRIKES = 3;       // 失手几次算失败
const KEYS = ['q', 'e'];

let active = null;

export function openGym(opts = {}) {
  if (active) active();
  unlockAudio();

  const dpr = 1;
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
    lift: 0,
    shake: 0,
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
        <div class="gym-lift" id="gym-lift">
          <span class="gym-plate l"></span>
          <span class="gym-bar"></span>
          <span class="gym-plate r"></span>
        </div>
        <div class="gym-keys">
          <button class="gkey" data-key="q"><b>Q</b><i>左</i></button>
          <button class="gkey" data-key="e"><b>E</b><i>右</i></button>
        </div>
        <div class="gym-progress"><i id="gym-bar-fill"></i></div>
      </div>

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
  const liftEl = root.querySelector('#gym-lift');
  const buttons = Array.from(root.querySelectorAll('.gkey'));
  const hitsEl = root.querySelector('#gym-hits');
  const missEl = root.querySelector('#gym-miss');
  const barFill = root.querySelector('#gym-bar-fill');
  const statusEl = root.querySelector('#gym-status');
  const overlay = root.querySelector('#gym-overlay');
  const tagEl = root.querySelector('#gym-tag');
  const titleEl = root.querySelector('#gym-title');
  const msgEl = root.querySelector('#gym-msg');

  function setStatus(t) { statusEl.textContent = t; }

  function paintKeys() {
    for (const b of buttons) {
      b.classList.toggle('armed', g.armed === b.dataset.key);
      b.classList.toggle('off', g.phase === 'over');
    }
  }

  function paint() {
    hitsEl.textContent = String(g.hits);
    missEl.textContent = String(g.strikes);
    barFill.style.transform = 'scaleX(' + Math.min(1, g.hits / need).toFixed(3) + ')';
    liftEl.classList.toggle('up', g.lift > 0);
    root.classList.toggle('shake', g.shake > 0);
    paintKeys();
  }

  function reset() {
    g.phase = 'idle';
    g.hits = 0;
    g.strikes = 0;
    g.armed = null;
    g.timer = 0;
    g.wait = 0.9;
    g.lift = 0;
    g.shake = 0;
    g.over = false;
    g.settled = false;
    overlay.classList.add('hidden');
    setStatus('先热个身。');
    paint();
  }

  function arm() {
    g.armed = KEYS[Math.floor(Math.random() * KEYS.length)];
    g.phase = 'armed';
    g.timer = WINDOW_MS / 1000;
    setStatus('按 ' + g.armed.toUpperCase() + '！');
    paint();
    sfx('score', 0.4);
  }

  function hit() {
    g.hits++;
    g.armed = null;
    g.phase = 'idle';
    g.wait = 0.32;
    g.lift = 0.30;
    sfx('pot');
    setStatus(g.hits >= need ? '这组完成了。' : '举起来了。');
    paint();
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
    paint();
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
    paint();
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

    if (g.lift > 0) g.lift = Math.max(0, g.lift - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);

    if (g.phase === 'idle' && !g.over) {
      g.wait -= dt;
      if (g.wait <= 0) arm();
    } else if (g.phase === 'armed') {
      g.timer -= dt;
      if (g.timer <= 0) miss('慢了半拍');
    }

    paint();
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
