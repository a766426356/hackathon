// ui.js — HUD / 标签 / 日志 / 各种弹窗。只负责 DOM，不碰游戏逻辑。

import { CONFIG, INTERACTABLES, NPCS, TEXTS, EVENT_PLACES } from '../data.js';
import { cardDamage, enemyFor } from './battle.js';
import { moodMult, examParts, examGpa, playerMaxHp } from './state.js';
import { roomsText } from './interiors.js';
import { entriesOf, placeOf, effectLine } from './calendar.js';
import { lootTotals, lootStack, lootEffectText, pct as pctText } from './loot.js';
import { buildPersona } from './persona.js';
import { sfx } from './audio.js';

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
  els.flash = document.getElementById('flash');
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
let modalCleanup = null;

// 小游戏模块在打开弹窗时注册清理函数：关窗时停掉动画 / 键盘 / 音频
export function setModalCleanup(fn) {
  modalCleanup = typeof fn === 'function' ? fn : null;
}

export function openModal(html, opts = {}) {
  els.modal.className = 'panel ' + (opts.cls || '');
  els.modal.innerHTML = html;
  els.modalRoot.classList.remove('hidden');
  return els.modal;
}

export function closeModal() {
  const fn = modalCleanup;
  modalCleanup = null;
  if (fn) {
    try { fn(); } catch (e) { /* 清理失败也别卡住关窗 */ }
  }
  els.modalRoot.classList.add('hidden');
  els.modalRoot.classList.remove('has-bg');
  if (els.modalBg) els.modalBg.classList.add('hidden');
  els.modal.innerHTML = '';
}

// 开场屏翻转落地之后的欢迎卡：先把「你是谁、来干嘛」说清楚，再给玩法和操作。
// 文案分三层，别混在一起说：身份（body）、怎么玩（TEXTS.intro）、结算（body.note）。
export function introPanel(hasSave) {
  const html = `
    <div class="intro">
      <div class="tag">张江校区 · 七天体验</div>
      <h1>欢迎来到${esc(CONFIG.schoolName)}</h1>
      <p class="sub">给访客的一次校园生活模拟</p>
      <p class="body">接下来七天，你以一名新生的身份在这里生活：上课、自习、交朋友，
        把平时路过却没进去过的门推开看看——我们想让你先替自己过一遍，再决定往后的日子怎么过。</p>
      <p class="body dim">${esc(TEXTS.intro)}</p>
      <p class="body note">第七天是期末考。考完你会拿到一张成绩单，和一份把这七天写出来的人格报告。
        不用怕走错，这里没有标准答案。</p>
      <ul class="rules">${TEXTS.introRules.map((r) => '<li>' + esc(r) + '</li>').join('')}</ul>
      <div class="row">
        <button class="btn primary" data-act="start">开始这七天</button>
        ${hasSave ? '<button class="btn" data-act="resume">继续上次</button>' : ''}
      </div>
    </div>`;
  return openModal(html, { cls: 'intro-panel' });
}

function esc(x) { return escapeHtml(x); }

export function nightPanel(s) {
  const foe = enemyFor(s);
  // 用牌组里最强的那张估，而不是拍一个 power 10；同时把「最多几回合」写出来。
  // 只给数字不给出上限的话，玩家看到「大约要 5 张」也不知道那是打不完的意思。
  const best = s.deck.length ? Math.max(...s.deck.map((c) => c.power)) : CONFIG.battle.fillerPower;
  const per = Math.max(1, cardDamage(s, { kind: 'attack', power: best }));
  const hits = Math.ceil(foe.maxHp / per);
  const canWin = hits <= CONFIG.battle.rounds;
  const html = `
    <div class="night">
      <h2>第 ${s.day} 天 · 夜晚</h2>
      <p class="sub">今天还有 ${s.deck.length} 张笔记、心境 ${s.mood}。晚上只能做一件事。</p>
      <div class="choices">
        <button class="choice" data-act="study">
          <span class="ct">${TEXTS.nightStudy}</span>
          <span class="cd">${TEXTS.nightStudyDesc}</span>
          <span class="cnum">知识 +${Math.ceil(CONFIG.nightStudyGain * moodMult(s))} · 心境 −${CONFIG.nightStudyMoodCost}</span>
        </button>
        <button class="choice" data-act="fight">
          <span class="ct">${TEXTS.nightFight}</span>
          <span class="cd">${TEXTS.nightFightDesc}</span>
          <span class="cnum">今晚的对手：<b>${esc(foe.name)}</b> Lv.${foe.lv} · HP ${foe.maxHp} · ATK ${foe.atk}</span>
          <span class="cnum dim">你 ${playerMaxHp(s)} 血；最强的一张牌打 ${per}，要 ${hits} 张才够，最多只能出 ${CONFIG.battle.rounds} 张</span>
          <span class="cnum ${canWin ? 'ok' : 'danger'}">${canWin
            ? '打得动。赢了掉一件永久战利品'
            : '打不完。今晚去深造，明天先把牌攒厚'}</span>
        </button>
      </div>
    </div>`;
  return openModal(html, { cls: 'night-panel' });
}

// prev 是上一帧的血条百分比：面板每次都整块重建，靠它把新血条从旧位置动画推下来，
// 不然血量是「跳」下去的，看不出掉了多少。
export function battlePanel(s, b, prev) {
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
  const epFrom = prev ? prev.enemy : pct;
  const hpFrom = prev ? prev.hp : hpPct;

  const html = `
    <div class="battle">
      <div class="btop">
        <div class="enemy">
          <div class="ename">${esc(b.enemy.name)}<span class="elv">Lv.${b.enemy.lv}</span></div>
          <div class="ebar"><i style="width:${pct}%;--from:${epFrom}%"></i></div>
          <div class="ehp">${b.enemy.hp} / ${b.enemy.maxHp} · ATK ${b.enemy.atk}</div>
        </div>
        <div class="round">第 ${b.round} / ${b.rounds} 回合</div>
      </div>
      <div class="notes"><ul>${notes}</ul></div>
      ${b.over ? `
        <div class="result ${b.result}">${b.result === 'win' ? '你赢了这场夜战。' : '你输掉了这场夜战。'}</div>
        ${b.reward && b.reward.loot ? `
          <div class="drop ${b.reward.loot.rarity}">
            <span class="dname">${esc(b.reward.loot.name)}</span>
            <span class="deff">${esc(lootEffectText(b.reward.loot))}</span>
            <span class="dnote">永久生效</span>
          </div>` : ''}
        <button class="btn primary" data-act="done">收工，回去睡觉</button>
      ` : `
        <div class="hand">${hand}</div>
        <div class="bhud">
          <span>你的 HP ${b.playerHp} / ${b.playerMaxHp}</span>
          <span class="mini"><i style="width:${hpPct}%;--from:${hpFrom}%"></i></span>
          <span>${b.enemy.desc}</span>
        </div>
      `}
    </div>`;
  return openModal(html, { cls: 'battle-panel' });
}

// 报告看过一次之前，结局页不给「再来一局」——玩家必须先读完自己的报告
let reportSeen = false;
export function resetReportSeen() { reportSeen = false; }

// 结局页 = 只有成绩和结局，外加一个「生成报告」的按钮。
// 报告单独一页（personaPanel），点开时带一段入场动画，背景仍是游戏里的校园。
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
        <tr><th>知识 / 心境 / 体质</th><td>${s.knowledge} / ${s.mood} / ${s.physique}</td></tr>
        <tr><th>牌组</th><td>${s.deck.length} 张 · 总威力 ${total}</td></tr>
        <tr><th>友谊</th><td>${Object.keys(NPCS).map((id) => NPCS[id].name + ' ' + s.friend[id]).join(' · ')}</td></tr>
      </table>

      <div class="row">
        <button class="btn primary" data-act="report">生成我的 HKUTI 报告</button>
        ${reportSeen ? '<button class="btn" data-act="restart">再来一局</button>' : ''}
      </div>
    </div>`;
  return openModal(html, { cls: 'ending-panel' });
}

// ---------------------------------------------------------------- HKUTI 报告
// 独立一页：面板半透明，背后就是游戏里的校园（#modal-backdrop 本来就在压暗它）。
// 入场分三段：标题先落，卡片再弹，四根轴依次长出来。
export function personaPanel(s) {
  const p = buildPersona(s);
  reportSeen = true; // 看过报告，结局页才会解锁「再来一局」

  const axisRows = p.axes.map((a, i) => {
    const share = a.share === null ? 50 : a.share;
    const negShare = 100 - share;
    const neutral = a.share === null;
    return '<div class="paxis" style="animation-delay:' + (0.30 + i * 0.13).toFixed(2) + 's">' +
      '<span class="pal pos' + (a.letter === a.pos && !neutral ? ' on' : '') + '">' + esc(a.posLabel) + '</span>' +
      '<span class="pbar' + (neutral ? ' neutral' : '') + '">' +
        '<i class="l" style="width:' + share + '%;animation-delay:' + (0.34 + i * 0.13).toFixed(2) + 's"></i>' +
        '<i class="r" style="width:' + negShare + '%"></i>' +
      '</span>' +
      '<span class="pal neg' + (a.letter === a.neg || neutral ? ' on' : '') + '">' + esc(a.negLabel) + '</span>' +
      '<span class="pnote">' + (neutral ? 'no data' : esc(a.question)) + '</span>' +
      '</div>';
  }).join('');

  const c = p.counts;
  const bits = [];
  if (c.lectures) bits.push('Lectures ' + c.lectures);
  if (c.soloStudy) bits.push('Solo study ' + c.soloStudy);
  if (c.chats) bits.push('Chats ' + c.chats);
  if (c.play) bits.push('Play ' + c.play);
  if (c.events) bits.push('Events ' + c.events);
  if (c.runs) bits.push('Runs ' + c.runs);
  if (c.fights) bits.push('Night fights ' + c.fights + ' (' + c.wins + 'W)');
  if (c.lateNights) bits.push('Late nights ' + c.lateNights);
  if (c.earlyNights) bits.push('Early nights ' + c.earlyNights);
  if (p.eventsMissed) bits.push('Missed ' + p.eventsMissed + ' event' + (p.eventsMissed > 1 ? 's' : ''));

  const html = `
    <div class="rpt">
      <div class="phead rpt-head">
        <b>HKUTI</b><span>HKU Type Indicator · seven days, four axes, one thoroughly unofficial verdict</span>
      </div>
      <div class="pcard rpt-card">
        <div class="pcode">${esc(p.code)}</div>
        <div class="ptitle">
          <b>${esc(p.name)}</b>
          <span>${esc(p.line)}</span>
        </div>
      </div>
      <div class="paxes">${axisRows}</div>
      <p class="pverdict">${esc(p.verdict)}</p>
      <ul class="plist">${bits.map((b) => '<li>' + esc(b) + '</li>').join('')}</ul>
      <div class="pmeta">
        ${p.topFriend ? '<span>Closest to <b>' + esc(p.topFriend.name) + '</b> ' + p.topFriend.value + '</span>' : ''}
        ${p.bestCard ? '<span>Best card <b>' + esc(p.bestCard.label) + '</b> ' + p.bestCard.power + '</span>' : ''}
        ${p.lootCount ? '<span>Loot <b>' + p.lootCount + '</b>' +
          (p.bestLoot ? ', best &ldquo;' + esc(p.bestLoot.label) + '&rdquo;' : '') + '</span>' : ''}
        ${p.collapsed ? '<span class="warn">Collapsed once</span>' : ''}
      </div>

      <div class="row">
        <button class="btn" data-act="back">回到结局</button>
        <button class="btn primary" data-act="restart">再来一局</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'ending-panel rpt-panel' });
}

// ---------------------------------------------------------------- 角色面板
// 上面三格是「今晚用得上的属性」，下面是「第 7 天结算的指标」。
// 每格悬停展开算式：这个数字到底换成了多少伤害 / 多少血。
export function characterPanel(s) {
  const kMult = 0.8 + s.knowledge / 100;
  const samplePower = s.deck.length ? Math.max(...s.deck.map((c) => c.power)) : 10;
  const sampleDmg = cardDamage(s, { kind: 'attack', power: samplePower });
  const nextDmg = cardDamage({ ...s, knowledge: s.knowledge + CONFIG.studyGain }, { kind: 'attack', power: samplePower });
  const hp = playerMaxHp(s);
  const nextHp = Math.floor((CONFIG.battle.playerBaseHp +
    Math.floor((s.physique + CONFIG.fieldPhysique) * CONFIG.hpPerPhysique)) * (1 + lootTotals(s).hp));
  const mMult = moodMult(s);
  const gainNow = Math.ceil(CONFIG.studyGain * mMult);
  const gainLow = Math.ceil(CONFIG.studyGain * (0.5 + 40 * 0.01));
  const g = examParts(s);
  const gpa = examGpa(s);
  const hits = Math.floor(hp / 6);
  const lt = lootTotals(s);
  const bag = lootStack(s);

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
            '<span class="warn">只作用于大课教室、社交、夜读；自习室 / 答疑角 / 公告板 / 日历活动是固定值，不受它和行囊影响</span>',
          ])}
        </div>

        <div class="cstat phys">
          <span class="csn">体质</span>
          <span class="csv">${s.physique}</span>
          <span class="cse">血量 ${hp}</span>
          ${tip([
            '<b>血量上限</b>　(' + CONFIG.battle.playerBaseHp + ' + ⌊体质 × ' + CONFIG.hpPerPhysique + '⌋) × 行囊',
            '现在：' + CONFIG.battle.playerBaseHp + ' + ⌊' + s.physique + ' × ' + CONFIG.hpPerPhysique + '⌋ → <b>' + hp + '</b>',
            '跑一次体育场（+' + CONFIG.fieldPhysique + '）→ <b>' + nextHp + ' HP</b>（+' + (nextHp - hp) + '）',
            '按敌人 atk 6 算，现在能扛 <b>' + hits + ' 下</b>',
          ])}
        </div>
      </div>

      <h3 class="csec">行囊 · 战利品只放大出口，不动属性</h3>
      ${bag.length ? `
        <div class="bagsum">
          <span>夜战伤害 <b>${pctText(lt.damage)}</b></span>
          <span>血量上限 <b>${pctText(lt.hp)}</b></span>
          <span>白天收益 <b>${pctText(lt.day)}</b></span>
          <span class="cap">每类封顶 ${pctText(CONFIG.lootCap)}</span>
        </div>
        <ul class="baglist">${bag.map((l) =>
          '<li class="' + l.rarity + '"><b>' + esc(l.name) + '</b>' +
          (l.n > 1 ? ' ×' + l.n : '') +
          '<span>' + esc(lootEffectText(l)) + '</span></li>').join('')}</ul>
      ` : '<p class="empty">还没有战利品。夜战赢一场就掉一件，越早赢越早变强。</p>'}

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

// ---------------------------------------------------------------- 日历墙
// 学期时间轴：7 天一行，已过 / 今天 / 未来三态。
// 每行都带上那天的日程条目（活动 / 期末考试），今天那行再补一句今晚要面对什么。
export function calendarPanel(s) {
  const rows = [];
  for (let d = 1; d <= s.maxDay; d++) {
    const cls = d < s.day ? 'past' : d === s.day ? 'today' : 'next';
    const evs = entriesOf(s, d).map((e) => {
      const st = e.done ? 'done' : e.missed ? 'missed' : 'open';
      const tail = e.done ? ' 已去' : e.missed ? ' 错过' : '';
      return '<span class="cev ' + st + '">' + esc(e.title + tail) + '</span>';
    });
    if (d === s.maxDay) evs.push('<span class="cev exam">期末考试</span>');
    const tail = d === s.day && d !== s.maxDay ? '<span class="cev night">今晚：深造 或 夜战</span>' : '';
    rows.push(
      '<li class="' + cls + '">' +
        '<span class="cday">第 ' + d + ' 天</span>' +
        '<span class="cflag">' + (d < s.day ? '已过' : d === s.day ? '今天' : '') + '</span>' +
        '<span class="cnote">' + (evs.join('') + tail || '—') + '</span>' +
      '</li>'
    );
  }
  const left = Math.max(0, s.maxDay - s.day);
  const now = [];
  now.push(s.today.courses ? '必修两节已上' : '必修两节没上');
  now.push('自由行动点 ' + s.ap + ' / ' + CONFIG.freeAp);
  now.push('心境 ' + s.mood + '（白天收益 ×' + moodMult(s).toFixed(2) + '）');
  for (const e of entriesOf(s, s.day).filter((x) => !x.done && !x.missed)) {
    const p = placeOf(e);
    now.push('今天有「' + e.title + '」· ' + (p ? p.name : '校园') + ' · ' + effectLine(e));
  }

  const html = `
    <div class="cal">
      <h2>日历墙</h2>
      <p class="sub">学期共 ${s.maxDay} 天，今天第 ${s.day} 天${left ? '，距期末还有 ' + left + ' 天' : '，就是期末'}</p>
      <ul class="ctimeline">${rows.join('')}</ul>
      <h3 class="csec">今天</h3>
      <ul class="clist">${now.map((b) => '<li>' + esc(b) + '</li>').join('')}</ul>
      <div class="row"><button class="btn" data-act="close">走开</button></div>
    </div>`;
  return openModal(html, { cls: 'cal-panel' });
}

// ---------------------------------------------------------------- 活动确认面板
// 出发之前把三条属性的增减写清楚：这个活动给什么、要几点行动点、幅度多大。
export function eventPanel(entry, s) {
  const place = EVENT_PLACES[entry.place];
  const host = entry.host ? NPCS[entry.host] : null;
  const enough = s.ap >= entry.ap;
  const rows = [];
  const row = (label, val, cls) =>
    '<div class="evrow ' + cls + '"><span class="evl">' + label + '</span>' +
    '<span class="evv">' + val + '</span></div>';
  if (entry.know) rows.push(row('知识', '+' + entry.know + '（伤害倍率 +' + (entry.know / 100).toFixed(2) + '）', 'gain'));
  if (entry.mood) {
    rows.push(row('心境', (entry.mood > 0 ? '+' : '−') + Math.abs(entry.mood), entry.mood > 0 ? 'gain' : 'cost'));
  }
  if (entry.physique) {
    const hpGain = Math.floor((s.physique + entry.physique) * CONFIG.hpPerPhysique) -
      Math.floor(s.physique * CONFIG.hpPerPhysique);
    rows.push(row('体质', '+' + entry.physique + '（血量上限 +' + hpGain + '）', 'gain'));
  }

  const html = `
    <div class="room event">
      <div class="rhead">
        <span class="ricon">📌</span>
        <div>
          <h2>${esc(entry.title)}</h2>
          <p class="sub">${esc(place ? place.name : '校园')}${host ? ' · ' + esc(host.name) + ' 主办' : ''}</p>
        </div>
      </div>
      <p class="body">${esc(entry.desc || '')}</p>
      <div class="evrows">${rows.join('')}</div>
      <p class="rcost">花费 ${entry.ap} 行动点 · 今天还剩 ${s.ap}${entry.ap > 1 ? ' · 这一趟要占掉大半天' : ''}</p>
      <div class="row">
        <button class="btn primary" data-act="go"${enough ? '' : ' disabled'}>${enough ? '出发' : '行动点不够'}</button>
        <button class="btn" data-act="cancel">不去了</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'room-panel event-panel' });
}

// ---------------------------------------------------------------- 打击感
// 抖动作用在战斗面板内容上：幅度 2–4px，打中抖小、挨打抖大。
// 闪红用一层固定覆盖层改 opacity，不用重建 DOM，所以不会打断正在播的动画。
let lastShake = null;

function shake(amp, dur) {
  const box = els.modal && els.modal.querySelector('.battle');
  if (!box || typeof box.animate !== 'function') return;
  try {
    if (lastShake) lastShake.cancel();
    lastShake = box.animate([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-amp}px, ${amp * 0.4}px)` },
      { transform: `translate(${amp}px, ${-amp * 0.4}px)` },
      { transform: `translate(${-amp * 0.5}px, 0)` },
      { transform: 'translate(0, 0)' },
    ], { duration: dur, easing: 'ease-out' });
  } catch (e) { /* 不支持 Web Animations 就跳过 */ }
}

function flashScreen(strength) {
  const el = els.flash;
  if (!el || typeof el.animate !== 'function') return;
  try {
    el.animate(
      [{ opacity: 0 }, { opacity: strength }, { opacity: 0 }],
      { duration: 90 + strength * 260, easing: 'ease-out' }
    );
  } catch (e) { /* 同上 */ }
}

// 一次出牌之后的全部反馈：dealt 打出去多少，taken 挨了多少
export function hitFx(dealt, taken) {
  if (dealt > 0) {
    shake(taken > 0 ? 4 : 2, taken > 0 ? 240 : 160);
    sfx('hit', taken > 0);
  }
  if (taken > 0) flashScreen(0.85);
}

export function outcomeFx(win) {
  shake(win ? 3 : 5, win ? 200 : 380);
  flashScreen(win ? 0.35 : 1);
  sfx(win ? 'win' : 'lose');
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

// 面板背景：鼠标停到某一层/某个房间上时，把底图换成它对应的设定图（CSS 里再加模糊和遮罩）。
let bgIndex = 0;

function showPanelBg(url) {
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

// 用 mouseover 代理整个列表：在楼层牌/房间选项之间移动不会闪回默认背景
function bindHoverBg(panel, defaultUrl) {
  const list = panel.querySelector('.shaft, .opts');
  if (!list) return;
  const hover = (ev) => {
    const flo = ev.target instanceof Element && ev.target.closest('.plate[data-bg], .opt[data-bg]');
    if (flo) showPanelBg(flo.dataset.bg);
  };
  list.addEventListener('mouseover', hover);
  list.addEventListener('mouseleave', () => showPanelBg(defaultUrl));
  list.addEventListener('focusin', hover);
  list.addEventListener('focusout', (ev) => {
    if (!list.contains(ev.relatedTarget)) showPanelBg(defaultUrl);
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
  const defaultBg = building.bg || '';
  bindHoverBg(panel, defaultBg);
  showPanelBg(defaultBg);
  return panel;
}

// 一层里的房间就是几个选项：不再走地图，点哪个做哪个
export function floorPanel(building, floor, s, blockedOf) {
  const opts = floor.rooms.map((r) => {
    const why = blockedOf ? blockedOf(r) : null;
    const ap = r.ap || 0;
    const attr = why ? 'disabled' : 'data-act="room" data-room="' + r.id + '"';
    const bgAttr = r.bg ? ' data-bg="' + esc(r.bg) + '"' : '';
    const tag = why ? esc(why) : r.freeEntry ? '免费' : ap + ' 点';
    return '<button class="opt' + (why ? ' off' : '') + '" ' + attr + bgAttr + '>' +
      '<span class="oicon">' + r.icon + '</span>' +
      '<span class="obody"><b>' + esc(r.name) + '</b><i>' + esc(r.effect) + '</i>' +
      '<em>' + esc(r.tagline || '') + '</em></span>' +
      '<span class="otag">' + tag + '</span>' +
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
  // 先把房间底图拉下来，悬停不用等
  for (const r of floor.rooms) {
    if (r.bg) new Image().src = r.bg;
  }
  const defaultBg = floor.bg || (building.bg || '');
  bindHoverBg(panel, defaultBg);
  showPanelBg(defaultBg);
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
  const panel = openModal(html, { cls: 'room-panel' });
  // 有设定图的房间/地点：确认面板也用同一张底图（没设就不动，保留上一层悬停留下的那张）
  if (spot.bg) showPanelBg(spot.bg);
  return panel;
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
