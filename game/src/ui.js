// ui.js — HUD / 标签 / 日志 / 各种弹窗。只负责 DOM，不碰游戏逻辑。

import { CONFIG, INTERACTABLES, NPCS, TEXTS } from '../data.js';
import { cardDamage } from './battle.js';
import { moodMult } from './state.js';
import { roomsText } from './interiors.js';

export const els = {};

export function initUI() {
  els.hudDay = document.getElementById('hud-day');
  els.hudAp = document.getElementById('hud-ap');
  els.hudKnow = document.getElementById('hud-know');
  els.hudMood = document.getElementById('hud-mood');
  els.hudDeck = document.getElementById('hud-deck');
  els.hudFriend = document.getElementById('hud-friend');
  els.labels = document.getElementById('labels');
  els.prompt = document.getElementById('prompt');
  els.log = document.getElementById('log');
  els.deck = document.getElementById('deck');
  els.toast = document.getElementById('toast');
  els.modalRoot = document.getElementById('modal-root');
  els.modal = document.getElementById('modal');
  els.backdrop = document.getElementById('modal-backdrop');
  els.modalBg = document.getElementById('modal-bg');
  els.bgLayers = els.modalBg ? Array.from(els.modalBg.querySelectorAll('.bg-layer')) : [];
  els.endDay = document.getElementById('btn-endday');
  els.scene = document.getElementById('scene');
  els.hudScene = document.getElementById('hud-scene');
  buildLabels();
}

// 当前场景的交互点：校园用 INTERACTABLES（像素坐标），进楼后换成这一层的 spots（格子坐标）
let spots = INTERACTABLES;
// 标签定位用的坐标系：half 是「格子中心」的偏移，像素坐标不需要
let frame = { w: 768, h: 768, half: 0 };

export function setSpots(list, nextFrame) {
  spots = list && list.length ? list : INTERACTABLES;
  frame = nextFrame || { w: 24, h: 15, half: 0.5 };
  nearId = null;
  buildLabels();
  els.prompt.classList.add('hidden');
}

export function setSceneChip(text) {
  if (els.hudScene) els.hudScene.textContent = text;
}

// id → 标签元素，镜头移动时只改这几个的位置
let labelById = new Map();

// 有镜头的场景（校园）：每帧把标签挪到新的位置，标签才对得上放大后的图
export function updateMarkers(project) {
  for (const item of spots) {
    const el = labelById.get(item.id);
    if (!el) continue;
    const p = project(item);
    const left = Math.round(p.left * 100) / 100;
    const top = Math.round(p.top * 100) / 100;
    if (el.dataset.l !== String(left)) { el.style.left = left + '%'; el.dataset.l = String(left); }
    if (el.dataset.t !== String(top)) { el.style.top = top + '%'; el.dataset.t = String(top); }
    const vis = p.visible === false ? 'hidden' : '';
    if (el.style.visibility !== vis) el.style.visibility = vis;
  }
}

function buildLabels() {
  els.labels.innerHTML = '';
  labelById = new Map();
  for (const item of spots) {
    const el = document.createElement('button');
    el.className = 'marker' + (item.labelBelow ? ' below' : '');
    el.dataset.id = item.id;
    el.style.left = ((item.x + frame.half) / frame.w) * 100 + '%';
    el.style.top = ((item.y + frame.half) / frame.h) * 100 + '%';
    el.innerHTML = '<span class="micon">' + item.icon + '</span><span class="mname">' + item.name + '</span>';
    labelById.set(item.id, el);
    els.labels.appendChild(el);
  }
}

export function onMarkerClick(fn) {
  els.labels.addEventListener('click', (e) => {
    const btn = e.target.closest('.marker');
    if (btn) fn(btn.dataset.id);
  });
}

let nearId = null;

export function setNear(item) {
  const id = item ? item.id : null;
  if (id === nearId) return;
  nearId = id;
  for (const el of els.labels.querySelectorAll('.marker')) {
    el.classList.toggle('near', !!id && el.dataset.id === id);
  }
  const itemAt = spots.find((i) => i && i.id === id);
  if (itemAt) {
    els.prompt.textContent = 'E · ' + itemAt.name + ' — ' + (itemAt.hint || '推门进去看看');
    els.prompt.classList.remove('hidden');
  } else {
    els.prompt.classList.add('hidden');
  }
}

export function renderHUD(s) {
  els.hudDay.textContent = String(Math.min(s.day, s.maxDay));
  const dots = [];
  for (let i = 0; i < CONFIG.startAp; i++) dots.push('<i class="' + (i < s.ap ? 'on' : '') + '"></i>');
  els.hudAp.innerHTML = '行动点 <span class="ap-dots">' + dots.join('') + '</span>';
  els.hudKnow.textContent = String(s.knowledge);
  els.hudMood.textContent = String(s.mood);
  els.hudMood.parentElement.classList.toggle('low', s.mood <= 25);
  els.hudMood.parentElement.classList.toggle('high', s.mood >= 80);
  els.hudDeck.textContent = String(s.deck.length) + (s.supportUnlocked ? ' +支援' : '');
  els.hudFriend.innerHTML = Object.keys(NPCS).map((id) => {
    const v = s.friend[id] || 0;
    const cls = v >= CONFIG.friendSupportAt ? 'ok' : '';
    return '<b class="' + cls + '">' + NPCS[id].name + ' ' + v + '</b>';
  }).join(' ');
  els.endDay.disabled = s.phase !== 'day';
}

export function renderDeck(s) {
  const items = s.deck.map((c) => '<li>' + esc(c.name) + ' <b>' + c.power + '</b></li>');
  if (s.supportUnlocked) items.push('<li class="support">好友支援</li>');
  els.deck.innerHTML = items.length
    ? items.join('')
    : '<li class="empty">还没有笔记，去 CDS-1 的 3F 大课教室</li>';
}

export function renderAll(s) {
  renderHUD(s);
  renderLog(s);
  renderDeck(s);
}

export function renderLog(s) {
  const items = s.log.slice(-7).reverse();
  els.log.innerHTML = items.map((l) =>
    '<li class="' + (l.kind || 'info') + '"><span class="d">D' + l.day + '</span>' + escapeHtml(l.text) + '</li>'
  ).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let toastTimer = 0;
export function toast(msg, kind) {
  els.toast.innerHTML = escapeHtml(msg);
  els.toast.className = 'show ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'hidden'; }, 2600);
}

// ---------------------------------------------------------------- 弹窗
export function openModal(html, opts = {}) {
  els.modal.className = 'panel ' + (opts.cls || '');
  els.modal.innerHTML = html;
  els.modalRoot.classList.remove('hidden');
  return els.modal;
}

export function closeModal() {
  els.modalRoot.classList.add('hidden');
  els.modalRoot.classList.remove('has-bg');
  if (els.modalBg) els.modalBg.classList.add('hidden');
  els.modal.innerHTML = '';
}

export function introPanel(hasSave) {
  const html = `
    <div class="intro">
      <h1>${esc(CONFIG.schoolName)}</h1>
      <p class="sub">一个白天养成、晚上抉择的小游戏 · 7 天</p>
      <p class="body">${esc(TEXTS.intro)}</p>
      <ul class="rules">${TEXTS.introRules.map((r) => '<li>' + esc(r) + '</li>').join('')}</ul>
      <div class="row">
        <button class="btn primary" data-act="start">开始（从第 1 天）</button>
        ${hasSave ? '<button class="btn" data-act="resume">继续上次</button>' : ''}
      </div>
    </div>`;
  return openModal(html, { cls: 'intro-panel' });
}

function esc(x) { return escapeHtml(x); }

export function nightPanel(s) {
  const html = `
    <div class="night">
      <h2>第 ${s.day} 天 · 夜晚</h2>
      <p class="sub">今天还有 ${s.deck.length} 张笔记、心情 ${s.mood}。晚上只能做一件事。</p>
      <div class="choices">
        <button class="choice" data-act="study">
          <span class="ct">${TEXTS.nightStudy}</span>
          <span class="cd">${TEXTS.nightStudyDesc}</span>
          <span class="cnum">知识 +${Math.round(CONFIG.nightStudyGain * moodMult(s))} · 心情 −${CONFIG.nightStudyMoodCost}</span>
        </button>
        <button class="choice" data-act="fight">
          <span class="ct">${TEXTS.nightFight}</span>
          <span class="cd">${TEXTS.nightFightDesc}</span>
          <span class="cnum">赢：心情 +${CONFIG.winMood} / 输：心情 −${CONFIG.loseMood}</span>
        </button>
      </div>
    </div>`;
  return openModal(html, { cls: 'night-panel' });
}

export function battlePanel(s, b) {
  const hand = b.hand.map((c, i) => {
    const dmg = cardDamage(s, c);
    return `<button class="card ${c.kind === 'support' ? 'support' : ''}" data-idx="${i}">
      <span class="cname">${esc(c.name)}</span>
      <span class="cnum">${c.kind === 'support' ? '支援 · ' : ''}${dmg} 伤害</span>
    </button>`;
  }).join('');

  const shownNotes = b.notes.length ? b.notes.slice(-5) : ['「' + b.enemy.name + '」挡住了去路。出一张牌。'];
  const notes = shownNotes.map((n) => '<li>' + esc(n) + '</li>').join('');
  const pct = Math.max(0, (b.enemy.hp / b.enemy.maxHp) * 100);
  const hpPct = Math.max(0, (b.playerHp / b.playerMaxHp) * 100);

  const html = `
    <div class="battle">
      <div class="btop">
        <div class="enemy">
          <div class="ename">${esc(b.enemy.name)}</div>
          <div class="ebar"><i style="width:${pct}%"></i></div>
          <div class="ehp">${b.enemy.hp} / ${b.enemy.maxHp}</div>
        </div>
        <div class="round">第 ${b.round} / ${b.rounds} 回合</div>
      </div>
      <div class="notes"><ul>${notes}</ul></div>
      ${b.over ? `
        <div class="result ${b.result}">${b.result === 'win' ? '你赢了这场夜战。' : '你输掉了这场夜战。'}</div>
        <button class="btn primary" data-act="done">收工，回去睡觉</button>
      ` : `
        <div class="hand">${hand}</div>
        <div class="bhud">
          <span>你的 HP ${b.playerHp} / ${b.playerMaxHp}</span>
          <span class="mini"><i style="width:${hpPct}%"></i></span>
          <span>${b.enemy.desc}</span>
        </div>
      `}
    </div>`;
  return openModal(html, { cls: 'battle-panel' });
}

export function endingPanel(s) {
  const e = TEXTS.endings[s.ending];
  const total = s.deck.reduce((n, c) => n + c.power, 0);
  const html = `
    <div class="ending ${s.ending}">
      <div class="tag">结局</div>
      <h2>${esc(e.name)}</h2>
      <p class="body">${esc(e.text)}</p>
      <table class="stats">
        <tr><th>GPA</th><td class="big">${s.gpa.toFixed(2)}</td></tr>
        <tr><th>期末知识</th><td>${s.knowledge}</td></tr>
        <tr><th>心情</th><td>${s.mood}</td></tr>
        <tr><th>牌组</th><td>${s.deck.length} 张 / 总威力 ${total}</td></tr>
        <tr><th>夜战胜场</th><td>${s.battleWins}</td></tr>
        <tr><th>友谊</th><td>${Object.keys(NPCS).map((id) => NPCS[id].name + ' ' + s.friend[id]).join(' · ')}</td></tr>
      </table>
      <div class="row">
        <button class="btn primary" data-act="restart">再来一局</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'ending-panel' });
}

// 用 onclick 覆盖而不是 addEventListener：每次重绘弹窗都重新绑定，不会叠加
export function bindModal(actionMap) {
  els.modal.onclick = (ev) => {
    const el = ev.target.closest('[data-act],[data-idx]');
    if (!el || !els.modal.contains(el)) return;
    if (el.dataset.idx !== undefined) {
      const fn = actionMap.card;
      if (fn) fn(Number(el.dataset.idx));
      return;
    }
    const fn = actionMap[el.dataset.act];
    if (fn) fn(el);
  };
}

// ---------------------------------------------------------------- 室内：电梯 / 房间 / 选人 / 钢琴

// 电梯厅背景：鼠标停到某层上时，把底部背景换成这一层的设定图（CSS 里再加模糊和遮罩）。
let bgIndex = 0;

function showElevatorBg(url) {
  if (!els.modalBg || !els.bgLayers.length) return;
  if (!url) {
    els.modalRoot.classList.remove('has-bg');
    els.modalBg.classList.add('hidden');
    return;
  }
  els.modalRoot.classList.add('has-bg');
  els.modalBg.classList.remove('hidden');
  const next = els.bgLayers[bgIndex ^ 1];
  const cur = els.bgLayers[bgIndex];
  next.style.backgroundImage = 'url("' + url + '")';
  next.style.zIndex = '2';
  cur.style.zIndex = '1';
  next.classList.add('on');
  cur.classList.remove('on');
  bgIndex ^= 1;
}

// 用 mouseover 代理整列楼层：在楼层之间移动不会闪回默认背景
function bindElevatorBg(panel, defaultUrl) {
  const list = panel.querySelector('.shaft');
  if (!list) return;
  const hover = (ev) => {
    const flo = ev.target instanceof Element && ev.target.closest('.plate[data-bg]');
    if (flo) showElevatorBg(flo.dataset.bg);
  };
  list.addEventListener('mouseover', hover);
  list.addEventListener('mouseleave', () => showElevatorBg(defaultUrl));
  list.addEventListener('focusin', hover);
  list.addEventListener('focusout', (ev) => {
    if (!list.contains(ev.relatedTarget)) showElevatorBg(defaultUrl);
  });
}

export function elevatorPanel(building, currentLevel) {
  // 像真电梯一样竖着排：高层在上、地下层在下，当前层亮一颗"轿厢"
  const floors = building.floors.slice().sort((a, b) => b.level - a.level);
  const plates = floors.map((f) => {
    const here = f.level === currentLevel;
    const locked = !!f.locked;
    const attr = locked ? 'disabled' : 'data-act="floor" data-level="' + f.level + '"';
    const bgAttr = f.bg ? ' data-bg="' + esc(f.bg) + '"' : '';
    return '<button class="plate' + (here ? ' here' : '') + (locked ? ' locked' : '') + '" ' + attr + bgAttr + '>' +
      '<span class="plate-dot"></span>' +
      '<span class="plate-num">' + esc(f.label) + '</span>' +
      '<span class="plate-info"><b>' + esc(f.name) + '</b><i>' + esc(roomsText(f)) + '</i></span>' +
      (locked ? '<span class="plate-tag">未开放</span>' : '<span class="plate-tag go">→</span>') +
      '</button>';
  }).join('');
  const html = `
    <div class="elev">
      <h2>${esc(building.full)} · 电梯</h2>
      <p class="sub">选一层进去。楼层之间走动不花行动点，只有真的做一件事才花。</p>
      <div class="shaft">
        <span class="shaft-rail"></span>
        ${plates}
      </div>
      <div class="row"><button class="btn" data-act="cancel">离开</button></div>
    </div>`;
  const panel = openModal(html, { cls: 'elev-panel' });
  // 先把各层背景图拉下来，鼠标移上去不用等加载
  for (const f of building.floors) {
    if (f.bg) new Image().src = f.bg;
  }
  bindElevatorBg(panel, '');
  showElevatorBg('');
  return panel;
}

// 一层里的房间就是几个选项：不再走地图，点哪个做哪个
export function floorPanel(building, floor, s, blockedOf) {
  const opts = floor.rooms.map((r) => {
    const why = blockedOf ? blockedOf(r) : null;
    const ap = r.ap || 0;
    const attr = why ? 'disabled' : 'data-act="room" data-room="' + r.id + '"';
    return '<button class="opt' + (why ? ' off' : '') + '" ' + attr + '>' +
      '<span class="oicon">' + r.icon + '</span>' +
      '<span class="obody"><b>' + esc(r.name) + '</b><i>' + esc(r.effect) + '</i>' +
      '<em>' + esc(r.tagline || '') + '</em></span>' +
      '<span class="otag">' + (why ? esc(why) : ap + ' 点') + '</span>' +
      '</button>';
  }).join('');
  const html = `
    <div class="elev floor-panel">
      <div class="fhead">
        <span class="flabel">${esc(floor.label)}</span>
        <div>
          <h2>${esc(building.full)} · ${esc(floor.name)}</h2>
          <p class="sub">今天还剩 ${s.ap} 点行动点。选一件事做。</p>
        </div>
      </div>
      <div class="opts">${opts || '<p class="sub">这一层还没有能做的事。</p>'}</div>
      <div class="row">
        <button class="btn" data-act="back">换个楼层</button>
        <button class="btn" data-act="cancel">离开</button>
      </div>
    </div>`;
  const panel = openModal(html, { cls: 'elev-panel' });
  bindElevatorBg(panel, floor.bg || '');
  showElevatorBg(floor.bg || '');
  return panel;
}

export function roomPanel(spot, s) {
  const ap = spot.ap || 0;
  const enough = s.ap >= ap;
  const html = `
    <div class="room">
      <div class="rhead">
        <span class="ricon">${spot.icon || '·'}</span>
        <div>
          <h2>${esc(spot.name)}</h2>
          <p class="sub">${esc(spot.desc || '')}</p>
        </div>
      </div>
      <p class="reffect">${esc(spot.effect || '')}</p>
      <p class="rcost">花费 ${ap} 行动点 · 今天还剩 ${s.ap}</p>
      <div class="row">
        <button class="btn primary" data-act="go"${enough ? '' : ' disabled'}>${enough ? '开始' : '行动点不够'}</button>
        <button class="btn" data-act="cancel">算了</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'room-panel' });
}

export function friendPanel(spot, s) {
  const needFresh = spot.pick === 'snooker';
  const cards = Object.keys(NPCS).map((id) => {
    const npc = NPCS[id];
    const v = s.friend[id];
    const talked = !!s.today.talked[id];
    const blocked = needFresh && talked;
    return '<button class="pick' + (blocked ? ' off' : '') + '" ' +
      (blocked ? 'disabled' : 'data-act="pick" data-npc="' + id + '"') + '>' +
      '<span class="av" style="background:' + npc.color + '"></span>' +
      '<span class="pn">' + esc(npc.name) + '</span>' +
      '<span class="pf">友谊 ' + v + (v >= CONFIG.friendSupportAt ? ' · 支援已解锁' : '') + '</span>' +
      '<span class="pnote">' + (blocked ? '今天已经聊过了' : needFresh ? '还没搭过话' : esc(npc.taunt || '正好有空')) + '</span>' +
      '</button>';
  }).join('');
  const html = `
    <div class="room">
      <div class="rhead">
        <span class="ricon">${spot.icon || '·'}</span>
        <div>
          <h2>${esc(spot.name)}</h2>
          <p class="sub">${esc(spot.desc || '')}</p>
        </div>
      </div>
      <p class="reffect">${esc(spot.effect || '')}</p>
      <p class="rcost">叫谁一起？花费 ${spot.ap || 0} 行动点 · 今天还剩 ${s.ap}</p>
      <div class="picks">${cards}</div>
      <div class="row"><button class="btn" data-act="cancel">算了</button></div>
    </div>`;
  return openModal(html, { cls: 'room-panel' });
}

const PIANO_KEYS = ['do', 're', 'mi', 'fa', 'so', 'la', 'si', 'do'];

// 钢琴：真的能弹。弹够 CONFIG.room.piano.notes 个音才结算。
export function pianoPanel(spot, played, s, doneMsg) {
  const need = CONFIG.room.piano.notes;
  const keys = PIANO_KEYS.map((k, i) =>
    '<button class="pkey' + (i === 7 ? ' hi' : '') + '" data-act="note" data-note="' + i + '">' +
    '<span>' + k + '</span><i>' + (i + 1) + '</i></button>').join('');
  const dots = PIANO_KEYS.map((_, i) => '<i class="' + (i < played.length ? 'on' : '') + '"></i>').join('');

  if (doneMsg) {
    const html = `
      <div class="room">
        <div class="rhead"><span class="ricon">🎹</span><div><h2>钢琴</h2>
          <p class="sub">最后一个音还在空气里。</p></div></div>
        <p class="reffect">${esc(doneMsg)}</p>
        <div class="row"><button class="btn primary" data-act="cancel">合上琴盖</button></div>
      </div>`;
    return openModal(html, { cls: 'room-panel' });
  }

  const html = `
    <div class="room">
      <div class="rhead"><span class="ricon">🎹</span><div><h2>钢琴</h2>
        <p class="sub">${esc(spot.desc || '')}</p></div></div>
      <p class="rcost">点琴键，或者按键盘 1–8。弹够 ${need} 个音就结算（已弹 ${played.length} / ${need}）</p>
      <div class="piano">${keys}</div>
      <div class="pdots">${dots}</div>
      <div class="row"><button class="btn" data-act="cancel">不弹了</button></div>
    </div>`;
  return openModal(html, { cls: 'room-panel piano-panel' });
}

let actx = null;
const TONES = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

export function playTone(i) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.value = TONES[i % TONES.length];
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.05);
  } catch (e) { /* 音频被拦就静音，照样能弹 */ }
}
