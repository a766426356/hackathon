// ui.js — HUD / 标签 / 日志 / 各种弹窗。只负责 DOM，不碰游戏逻辑。

import { CONFIG, INTERACTABLES, NPCS, TEXTS } from '../data.js';
import { cardDamage } from './battle.js';
import { moodMult, examParts, examGpa, playerMaxHp } from './state.js';

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
  els.endDay = document.getElementById('btn-endday');
  els.scene = document.getElementById('scene');
  els.hudScene = document.getElementById('hud-scene');
  buildLabels();
}

// 当前场景的交互点：校园用 INTERACTABLES，进楼后换成这一层的 spots
let spots = INTERACTABLES;

export function setSpots(list) {
  spots = list && list.length ? list : INTERACTABLES;
  nearId = null;
  buildLabels();
  els.prompt.classList.add('hidden');
}

export function setSceneChip(text) {
  if (els.hudScene) els.hudScene.textContent = text;
}

function buildLabels() {
  els.labels.innerHTML = '';
  for (const item of spots) {
    const el = document.createElement('button');
    el.className = 'marker' + (item.labelBelow ? ' below' : '');
    el.dataset.id = item.id;
    el.style.left = ((item.x + 0.5) / 24) * 100 + '%';
    el.style.top = ((item.y + 0.5) / 15) * 100 + '%';
    el.innerHTML = '<span class="micon">' + item.icon + '</span><span class="mname">' + item.name + '</span>';
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
  // 5 点 = 2 节必修（每天开头已自动上完）+ 3 点自由
  const req = CONFIG.requiredCourses;
  const free = CONFIG.totalAp - req;
  const dots = [];
  for (let i = 0; i < req; i++) dots.push('<i class="req"></i>');
  for (let i = 0; i < free; i++) dots.push('<i class="' + (i < s.ap ? 'on' : '') + '"></i>');
  els.hudAp.innerHTML = '行动点 <span class="ap-dots">' + dots.join('') + '</span>';
  els.hudAp.title = '每天 ' + CONFIG.totalAp + ' 点：' + req + ' 节必修大课（已自动上完）+ ' +
    free + ' 点自由支配' + (s.ap < free ? '（崩过一次，今天自由点减少）' : '');
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

// 牌组里每张牌都挂上「它今晚打多少」，属性涨了能立刻看见
export function renderDeck(s) {
  const items = s.deck.map((c) => {
    const dmg = cardDamage(s, { kind: 'attack', power: c.power });
    return '<li title="' + esc(c.name + '：power ' + c.power + ' × (0.8 + 知识 ' + s.knowledge +
      '/100) = ' + dmg + ' 伤害') + '">' + esc(c.name) + ' <b>' + c.power + '</b>' +
      '<em class="dmg">' + dmg + '</em></li>';
  });
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
          <span class="cnum">知识 +${Math.ceil(CONFIG.nightStudyGain * moodMult(s))} · 心情 −${CONFIG.nightStudyMoodCost}</span>
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
        <tr><th>心境 / 体质</th><td>${s.mood} / ${s.physique}</td></tr>
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

// ---------------------------------------------------------------- 角色属性面板
// 上面三格是「今晚用得上的属性」，下面是「第 7 天结算的指标」。
// 每格悬停展开算式：这个数字到底换成了多少伤害 / 多少血。
export function characterPanel(s) {
  const kMult = 0.8 + s.knowledge / 100;
  const samplePower = s.deck.length ? Math.max(...s.deck.map((c) => c.power)) : 10;
  const sampleDmg = cardDamage(s, { kind: 'attack', power: samplePower });
  const nextDmg = cardDamage({ ...s, knowledge: s.knowledge + CONFIG.studyGain }, { kind: 'attack', power: samplePower });
  const hp = playerMaxHp(s);
  const nextHp = CONFIG.battle.playerBaseHp +
    Math.floor((s.physique + CONFIG.fieldPhysique) * CONFIG.hpPerPhysique);
  const mMult = moodMult(s);
  const gainNow = Math.ceil(CONFIG.studyGain * mMult);
  const gainLow = Math.ceil(CONFIG.studyGain * (0.5 + 40 * 0.01));
  const g = examParts(s);
  const gpa = examGpa(s);
  const hits = Math.floor(hp / 6); // 一般怪 atk 5–7，按 6 算能扛几下

  const tip = (lines) => '<div class="ctip">' + lines.map((l) => '<p>' + l + '</p>').join('') + '</div>';

  const todayBits = [];
  todayBits.push(s.today.courses
    ? '必修 ' + CONFIG.requiredCourses + ' 节 · 已上完'
    : '必修 ' + CONFIG.requiredCourses + ' 节 · 还没上');
  todayBits.push('自由行动点 ' + s.ap + ' / ' + CONFIG.freeAp);
  if (!s.today.board) todayBits.push('公告板 空着');
  if (!s.today.doubt) todayBits.push('答疑角 可去');
  if (!s.today.pingpong) todayBits.push('乒乓球 可打');
  if (!s.today.piano) todayBits.push('钢琴 可弹');
  if (s.mood <= CONFIG.room.pray.moodMax && !s.today.pray) todayBits.push('祷告室 进得去');

  const html = `
    <div class="char">
      <h2>角色</h2>
      <p class="sub">三个属性各管一件事，悬停看换算</p>

      <div class="cstats">
        <div class="cstat know">
          <span class="csn">知识</span>
          <span class="csv">${s.knowledge}</span>
          <span class="cse">伤害 ×${kMult.toFixed(2)}</span>
          ${tip([
            '<b>夜战伤害</b>　power × (0.8 + 知识/100)',
            '最强的一张牌 power ' + samplePower + ' → <b>' + sampleDmg + ' 伤害</b>',
            '再上一节课（+' + CONFIG.studyGain + '）→ <b>' + nextDmg + ' 伤害</b>',
            'GPA 贡献　3 × ' + s.knowledge + ' / ' + CONFIG.examKnowledgeDiv + ' = <b>+' + g.knowledge.toFixed(2) + '</b>',
          ])}
        </div>

        <div class="cstat mood">
          <span class="csn">心境</span>
          <span class="csv">${s.mood}</span>
          <span class="cse">白天收益 ×${mMult.toFixed(2)}</span>
          ${tip([
            '<b>只影响白天，不进夜战</b>　倍率 = 0.5 + 心境/100（向上取整）',
            '现在：一节大课 ' + CONFIG.studyGain + ' → <b>' + gainNow + ' 知识</b>',
            '心境掉到 40：→ <b>' + gainLow + ' 知识</b>（少 ' + (gainNow - gainLow) + '）',
            '归零会崩一次，第二天只剩 ' + CONFIG.collapseAp + ' 个自由点',
          ])}
        </div>

        <div class="cstat phys">
          <span class="csn">体质</span>
          <span class="csv">${s.physique}</span>
          <span class="cse">血量 ${hp}</span>
          ${tip([
            '<b>血量上限</b>　' + CONFIG.battle.playerBaseHp + ' + ⌊体质 × ' + CONFIG.hpPerPhysique + '⌋',
            '现在：' + CONFIG.battle.playerBaseHp + ' + ⌊' + s.physique + ' × ' + CONFIG.hpPerPhysique + '⌋ = <b>' + hp + '</b>',
            '跑一次操场（+' + CONFIG.fieldPhysique + '）→ <b>' + nextHp + ' HP</b>（+' + (nextHp - hp) + '）',
            '按敌人 atk 6 算，现在能扛 <b>' + hits + ' 下</b>',
          ])}
        </div>
      </div>

      <h3 class="csec">第 7 天结算</h3>
      <table class="stats">
        <tr><th>预估 GPA</th><td class="big">${gpa.toFixed(2)}</td></tr>
        <tr><th>　基础 / 知识 / 心境</th><td class="muted">${g.base.toFixed(2)} + ${g.knowledge.toFixed(2)} + ${g.mood.toFixed(2)}</td></tr>
        <tr><th>夜战胜场</th><td>${s.battleWins}（学神要 ≥ ${CONFIG.endingGreatWins}）</td></tr>
        <tr><th>牌组</th><td>${s.deck.length} 张 · 总威力 ${s.deck.reduce((n, c) => n + c.power, 0)}</td></tr>
        <tr><th>友谊</th><td>${Object.keys(NPCS).map((id) =>
          NPCS[id].name + ' ' + s.friend[id] + (s.friend[id] >= CONFIG.friendSupportAt ? '·支援' : '')).join(' · ')}</td></tr>
      </table>

      <h3 class="csec">今天还能做什么</h3>
      <ul class="clist">${todayBits.map((b) => '<li>' + esc(b) + '</li>').join('')}</ul>

      <div class="row"><button class="btn" data-act="close">合上</button></div>
    </div>`;
  return openModal(html, { cls: 'char-panel' });
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
export function elevatorPanel(building, currentId) {
  const rows = building.floors.map((f) => {
    const here = f.id === currentId;
    const locked = !!f.locked;
    const attr = here || locked ? 'disabled' : 'data-act="floor" data-to="' + f.id + '"';
    return '<button class="flo' + (here ? ' here' : '') + (locked ? ' locked' : '') + '" ' + attr + '>' +
      '<span class="flab">' + esc(f.label) + '</span>' +
      '<span class="fname">' + esc(f.name) + '</span>' +
      '<span class="frooms">' + esc(f.rooms) + '</span>' +
      (here ? '<span class="ftag">当前</span>' : locked ? '<span class="ftag">未开放</span>' : '') +
      '</button>';
  }).join('');
  const html = `
    <div class="elev">
      <h2>${esc(building.full)} · 电梯</h2>
      <p class="sub">楼层之间走动不花行动点。选一层，走到那间房间门口再决定做不做。</p>
      <div class="floors">${rows}</div>
      <div class="row"><button class="btn" data-act="cancel">再逛逛</button></div>
    </div>`;
  return openModal(html, { cls: 'elev-panel' });
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
