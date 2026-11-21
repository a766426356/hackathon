// minigames/piano.js — 文娱楼 1F 的钢琴。
// 三个八度（C3–C6）的真采样钢琴：鼠标 / 触屏 / 电脑键盘都能弹，空格踩延音。
// 琴随便弹、无限弹；每天第一次弹满 N 个音才结算心情奖励。

import * as ui from '../ui.js';
import {
  unlockAudio, loadPianoSamples, playPianoNote, releasePianoNote,
  setPianoSustain, stopAllPiano, pianoLoadProgress, sfx,
} from '../audio.js';

const LOW = 48; // C3
const HIGH = 84; // C6
const BLACK_PC = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYMAP = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  ',': 60, l: 61, '.': 62, ';': 63, '/': 64,
  q: 60, '2': 61, w: 62, '3': 63, e: 64, r: 65, '5': 66, t: 67, '6': 68,
  y: 69, '7': 70, u: 71, i: 72, '9': 73, o: 74, '0': 75, p: 76,
  '[': 77, '=': 78, ']': 79,
};

let active = null; // 当前这一局钢琴的清理函数

export function openPiano(opts) {
  if (active) active();
  unlockAudio();
  loadPianoSamples();

  const notes = [];
  const pressed = new Map(); // midi → 还在按着的音
  const pointerNotes = new Map(); // pointerId → midi
  const entry = {
    state: opts.state,
    need: opts.notes || 16,
    canReward: !!opts.canReward,
    rewarded: false,
    count: 0,
    sustain: false,
    over: false,
  };
  let destroyed = false;

  const html = `
    <div class="mg piano-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🎹</span>
          <div>
            <h2>钢琴</h2>
            <p class="sub">三个八度 · 真钢琴采样 · 想弹多久都行</p>
          </div>
        </div>
        <div class="mg-meters">
          <div class="mg-meter"><b id="pg-count">0</b><span>今日手感</span></div>
          <div class="mg-meter"><b id="pg-notes">/ ${entry.need}</b><span>结算所需</span></div>
        </div>
      </div>
      <div class="piano-toolbar">
        <span id="pg-status" class="mg-status">先弹几个音试试。</span>
        <span id="pg-pedal" class="piano-pedal">延音 <kbd>空格</kbd></span>
      </div>
      <div class="piano-progress"><i id="pg-bar"></i></div>
      <div class="piano-body">
        <div class="piano-keys" id="pg-keys"></div>
      </div>
      <div class="piano-hint">
        <span>鼠标 / 触屏点琴键</span>
        <span>键盘：<kbd>Z X C V…</kbd> 低音区 · <kbd>Q W E R…</kbd> 中高音区</span>
        <span>按住 <kbd>空格</kbd> 踩延音</span>
      </div>
      <div class="mg-row">
        <button class="btn primary" data-act="close">合上琴盖</button>
      </div>
    </div>`;
  ui.openModal(html, { cls: 'mg-panel piano-panel' });

  const root = ui.els.modal;
  const keysEl = root.querySelector('#pg-keys');
  const countEl = root.querySelector('#pg-count');
  const barEl = root.querySelector('#pg-bar');
  const statusEl = root.querySelector('#pg-status');
  const pedalEl = root.querySelector('#pg-pedal');

  buildKeys(keysEl);

  function buildKeys(host) {
    const whites = [];
    const blacks = [];
    for (let midi = LOW; midi <= HIGH; midi++) {
      const pc = midi % 12;
      (BLACK_PC.has(pc) ? blacks : whites).push(midi);
    }
    const whiteW = 100 / whites.length;

    for (const midi of whites) {
      const b = document.createElement('button');
      b.className = 'pkey white';
      b.dataset.midi = String(midi);
      b.type = 'button';
      b.innerHTML = `<span>${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}</span>`;
      if (midi % 12 === 0) b.classList.add('c-note');
      host.appendChild(b);
    }

    let whiteBefore = 0;
    const whiteSet = new Set(whites);
    for (let midi = LOW; midi <= HIGH; midi++) {
      if (!whiteSet.has(midi)) {
        const b = document.createElement('button');
        b.className = 'pkey black';
        b.dataset.midi = String(midi);
        b.type = 'button';
        b.style.left = (whiteBefore * whiteW) + '%';
        b.style.width = (whiteW * 0.62) + '%';
        b.innerHTML = `<span>${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}</span>`;
        host.appendChild(b);
      } else {
        whiteBefore++;
      }
    }
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'mg-status' + (kind ? ' ' + kind : '');
  }

  function refreshProgress() {
    countEl.textContent = String(entry.count);
    barEl.style.width = Math.min(100, (entry.count / entry.need) * 100) + '%';
  }

  function updatePedal() {
    pedalEl.classList.toggle('on', entry.sustain);
  }

  function rewardIfReady() {
    if (entry.rewarded || entry.over) return;
    if (entry.count < entry.need) return;
    entry.rewarded = true;
    if (!entry.canReward) {
      setStatus(entry.state.today.piano
        ? '今天已经弹尽兴了。琴盖开着，继续随便弹。'
        : '今天没有行动点了。琴可以随便弹，但不算今天的收获。', 'muted');
      return;
    }
    const res = opts.onReward ? opts.onReward(entry.count) : null;
    if (res && res.ok) {
      setStatus(res.msg + ' 继续弹不额外结算。', 'ok');
      sfx('win');
      entry.canReward = false;
    } else {
      setStatus((res && res.msg) || '今天已经弹过了。', 'muted');
    }
  }

  function noteOn(midi, velocity) {
    if (entry.over) return;
    playPianoNote(midi, velocity);
    pressed.set(midi, (pressed.get(midi) || 0) + 1);
    const key = keysEl.querySelector('.pkey[data-midi="' + midi + '"]');
    if (key) key.classList.add('on');
    entry.count++;
    notes.push(midi);
    if (notes.length > 64) notes.shift();
    refreshProgress();
    rewardIfReady();
  }

  function noteOff(midi) {
    const n = (pressed.get(midi) || 1) - 1;
    if (n > 0) { pressed.set(midi, n); return; }
    pressed.delete(midi);
    releasePianoNote(midi);
    const key = keysEl.querySelector('.pkey[data-midi="' + midi + '"]');
    if (key) key.classList.remove('on');
  }

  function velocityFor(ev, el) {
    const r = el.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (ev.clientY - r.top) / Math.max(1, r.height)));
    return 0.55 + rel * 0.4;
  }

  function midiAt(ev) {
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const key = hit && hit.closest ? hit.closest('.pkey') : null;
    return key ? Number(key.dataset.midi) : null;
  }

  // 鼠标 / 触屏：按下响，抬起停；按住滑过琴键也能连起来
  function onPointerDown(ev) {
    const key = ev.target.closest && ev.target.closest('.pkey');
    if (!key) return;
    ev.preventDefault();
    const midi = Number(key.dataset.midi);
    pointerNotes.set(ev.pointerId, midi);
    noteOn(midi, velocityFor(ev, key));
    try { key.setPointerCapture(ev.pointerId); } catch (e) { /* 老浏览器 */ }
  }

  function onPointerMove(ev) {
    if (!pointerNotes.has(ev.pointerId)) return;
    const next = midiAt(ev);
    const prev = pointerNotes.get(ev.pointerId);
    if (next == null || next === prev) return;
    noteOff(prev);
    pointerNotes.set(ev.pointerId, next);
    noteOn(next, 0.78);
  }

  function onPointerUp(ev) {
    const midi = pointerNotes.get(ev.pointerId);
    if (midi == null) return;
    pointerNotes.delete(ev.pointerId);
    noteOff(midi);
  }

  function keyDown(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.code === 'Space' || ev.key === ' ') {
      ev.preventDefault();
      if (!entry.sustain) { entry.sustain = true; setPianoSustain(true); updatePedal(); }
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
    const k = ev.key.toLowerCase();
    const midi = KEYMAP[k];
    if (midi == null || ev.repeat) return;
    ev.preventDefault();
    noteOn(midi, 0.78);
  }

  function keyUp(ev) {
    if (ev.code === 'Space' || ev.key === ' ') {
      ev.preventDefault();
      if (entry.sustain) { entry.sustain = false; setPianoSustain(false); updatePedal(); }
      return;
    }
    const midi = KEYMAP[ev.key.toLowerCase()];
    if (midi == null) return;
    noteOff(midi);
  }

  function close() {
    if (destroyed) return;
    destroyed = true;
    stopAllPiano();
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    ui.closeModal();
    if (opts.onExit) opts.onExit();
  }

  keysEl.addEventListener('pointerdown', onPointerDown);
  keysEl.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  ui.bindModal({ close });

  active = () => {
    destroyed = true;
    stopAllPiano();
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    keysEl.removeEventListener('pointerdown', onPointerDown);
    keysEl.removeEventListener('pointermove', onPointerMove);
  };
  ui.setModalCleanup(active);

  // 采样加载状态：先显示"调音中"，好了再换掉，不挡着弹
  const total = pianoLoadProgress().total;
  if (!pianoLoadProgress().loaded) {
    setStatus('正在调音（0 / ' + total + ' 个采样）…');
    let timer = 0;
    timer = setInterval(() => {
      if (destroyed) { clearInterval(timer); return; }
      const p = pianoLoadProgress();
      if (p.loaded >= p.total) clearInterval(timer);
      else setStatus('正在调音（' + p.loaded + ' / ' + p.total + ' 个采样）…');
    }, 220);
    loadPianoSamples().then((ok) => {
      clearInterval(timer);
      if (destroyed) return;
      if (ok && pianoLoadProgress().loaded >= total) {
        setStatus('钢琴调好了。随便弹，弹满 ' + entry.need + ' 个音结算今天的收获。', 'ok');
      } else {
        setStatus('采样没加载出来，先用合成钢琴音顶着。照样能弹。', 'muted');
      }
    });
    active = ((prev) => () => { clearInterval(timer); prev(); })(active);
    ui.setModalCleanup(active);
  } else {
    setStatus(entry.canReward
      ? '弹满 ' + entry.need + ' 个音：今天的心情结算 + 1 AP。之后随便弹。'
      : entry.state.today.piano
        ? '今天已经弹尽兴了。琴盖开着，继续随便弹。'
        : '今天没有行动点了。琴可以随便弹，但不算今天的收获。', entry.canReward ? '' : 'muted');
  }
  refreshProgress();
  updatePedal();
}
