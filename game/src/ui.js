// ui.js — HUD / labels / log / all the panels. DOM only, no game logic.

import { CONFIG, INTERACTABLES, NPCS, TEXTS, EVENT_PLACES } from '../data.js';
import { cardDamage, enemyFor } from './battle.js';
import { moodMult, examParts, examGpa, playerMaxHp } from './state.js';
import { roomsText } from './interiors.js';
import { entriesOf, placeOf, effectLine } from './calendar.js';
import { lootTotals, lootStack, lootEffectText, pct as pctText } from './loot.js';
import { buildPersona } from './persona.js';
import { sfx } from './audio.js';
import { localize } from './i18n.js';

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
  localize(document.body); // static markup in index.html carries the same English copy
}

// Interactables of the current scene: the campus uses INTERACTABLES (pixel coords), a building uses that floor's spots (grid coords)
let spots = INTERACTABLES;
// Coordinate frame for label placement: half is the tile-centre offset; pixel coords don't need one
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

// id → label element; camera moves only touch these positions
let labelById = new Map();

// Scenes with a camera (the campus): nudge labels every frame so they match the zoomed image
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
    els.prompt.textContent = 'E · ' + itemAt.name + ' — ' + (itemAt.hint || 'push the door open');
    els.prompt.classList.remove('hidden');
    localize(els.prompt);
  } else {
    els.prompt.classList.add('hidden');
  }
}

export function renderHUD(s) {
  els.hudDay.textContent = String(Math.min(s.day, s.maxDay));
  // 5 points = 2 required lectures (already attended at the start of each day) + 3 free
  const req = CONFIG.requiredCourses;
  const free = CONFIG.totalAp - req;
  const dots = [];
  for (let i = 0; i < req; i++) dots.push('<i class="req"></i>');
  for (let i = 0; i < free; i++) dots.push('<i class="' + (i < s.ap ? 'on' : '') + '"></i>');
  els.hudAp.innerHTML = '<i class="lbl" data-zh="行动点">AP</i> <span class="ap-dots">' + dots.join('') + '</span>';
  els.hudAp.title = 'Each day ' + CONFIG.totalAp + ' AP: ' + req + ' required lectures (auto-attended) + ' +
    free + ' flexible' + (s.ap < free ? ' (collapsed once, fewer free AP today)' : '');
  els.hudKnow.textContent = String(s.knowledge);
  els.hudMood.textContent = String(s.mood);
  els.hudMood.parentElement.classList.toggle('low', s.mood <= 25);
  els.hudMood.parentElement.classList.toggle('high', s.mood >= 80);
  els.hudDeck.textContent = String(s.deck.length) + (s.supportUnlocked ? ' +support' : '');
  els.hudFriend.innerHTML = Object.keys(NPCS).map((id) => {
    const v = s.friend[id] || 0;
    const cls = v >= CONFIG.friendSupportAt ? 'ok' : '';
    return '<b class="' + cls + '">' + NPCS[id].name + ' ' + v + '</b>';
  }).join(' ');
  els.endDay.disabled = s.phase !== 'day';
}

// Every card in the deck carries "what it hits for tonight", so stat gains show up immediately
export function renderDeck(s) {
  const items = s.deck.map((c) => {
    const dmg = cardDamage(s, { kind: 'attack', power: c.power });
    return '<li title="' + esc(c.name + ': power ' + c.power + ' × (0.8 + Knowledge ' + s.knowledge +
      '/100) = ' + dmg + ' damage') + '">' + esc(c.name) + ' <b>' + c.power + '</b>' +
      '<em class="dmg">' + dmg + '</em></li>';
  });
  if (s.supportUnlocked) items.push('<li class="support">Friend support</li>');
  els.deck.innerHTML = items.length
    ? items.join('')
    : '<li class="empty">No notes yet. Go to the 3F Lecture Hall in CDS-1</li>';
}

export function renderAll(s) {
  renderHUD(s);
  renderLog(s);
  renderDeck(s);
  localize(document.body);
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
  localize(els.toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'hidden'; }, 2600);
}

// ---------------------------------------------------------------- Panels
let modalCleanup = null;

// Minigame modules register a cleanup callback when a panel opens: stop animation / keys / audio on close
export function setModalCleanup(fn) {
  modalCleanup = typeof fn === 'function' ? fn : null;
}

export function openModal(html, opts = {}) {
  els.modal.className = 'panel ' + (opts.cls || '');
  els.modal.innerHTML = html;
  els.modalRoot.classList.remove('hidden');
  localize(els.modal);
  return els.modal;
}

export function closeModal() {
  const fn = modalCleanup;
  modalCleanup = null;
  if (fn) {
    try { fn(); } catch (e) { /* a failed cleanup shouldn't block the close */ }
  }
  els.modalRoot.classList.add('hidden');
  els.modalRoot.classList.remove('has-bg');
  if (els.modalBg) els.modalBg.classList.add('hidden');
  els.modal.innerHTML = '';
}

// The welcome card after the title screen flips over: say who you are and why you're here first, then rules and controls.
// Three layers of copy, kept apart: identity (body), how to play (TEXTS.intro), the reckoning (body.note).
export function introPanel(hasSave) {
  const html = `
    <div class="intro">
      <div class="tag">Seven-day freshman run</div>
      <h1>Welcome to ${esc(CONFIG.schoolName)}</h1>
      <p class="sub">A campus-life simulation for visitors</p>
      <p class="body">Seven days living here as a freshman: lectures, study, friends,
        and a look behind the doors you usually walk past. Live it once, then decide your own days.</p>
      <p class="body dim">${esc(TEXTS.intro)}</p>
      <p class="body note">Day seven is the Final Exam. Afterwards you get a transcript, and a personality report
        written out of these seven days. No fear of wrong turns — there are no correct answers here.</p>
      <ul class="rules">${TEXTS.introRules.map((r) => '<li>' + esc(r) + '</li>').join('')}</ul>
      <div class="row">
        <button class="btn primary" data-act="start">Start the seven days</button>
        ${hasSave ? '<button class="btn" data-act="resume">Continue</button>' : ''}
      </div>
    </div>`;
  return openModal(html, { cls: 'intro-panel' });
}

function esc(x) { return escapeHtml(x); }

export function nightPanel(s) {
  const foe = enemyFor(s);
  // Estimate with the strongest card in the deck instead of a flat power 10; and spell out the round cap.
  // A bare number with no cap reads as "about 5 cards", not as "you can't finish this".
  const best = s.deck.length ? Math.max(...s.deck.map((c) => c.power)) : CONFIG.battle.fillerPower;
  const per = Math.max(1, cardDamage(s, { kind: 'attack', power: best }));
  const hits = Math.ceil(foe.maxHp / per);
  const canWin = hits <= CONFIG.battle.rounds;
  const html = `
    <div class="night">
      <h2>Day ${s.day} · Night</h2>
      <p class="sub">${s.deck.length} notes left, mood ${s.mood}. One thing tonight, that's all.</p>
      <div class="choices">
        <button class="choice" data-act="study">
          <span class="ct">${TEXTS.nightStudy}</span>
          <span class="cd">${TEXTS.nightStudyDesc}</span>
          <span class="cnum">Knowledge +${Math.ceil(CONFIG.nightStudyGain * moodMult(s))} · Mood −${CONFIG.nightStudyMoodCost}</span>
        </button>
        <button class="choice" data-act="fight">
          <span class="ct">${TEXTS.nightFight}</span>
          <span class="cd">${TEXTS.nightFightDesc}</span>
          <span class="cnum">Tonight: <b>${esc(foe.name)}</b> Lv.${foe.lv} · HP ${foe.maxHp} · ATK ${foe.atk}</span>
          <span class="cnum dim">You ${playerMaxHp(s)} HP; best card hits ${per}, needs ${hits} cards, cap is ${CONFIG.battle.rounds}</span>
          <span class="cnum ${canWin ? 'ok' : 'danger'}">${canWin
            ? 'Winnable. Win for a permanent piece of loot'
            : 'Not finishable. Study tonight, thicken the deck tomorrow'}</span>
        </button>
      </div>
    </div>`;
  return openModal(html, { cls: 'night-panel' });
}

// prev is the HP bar percentage from the last frame: the panel is rebuilt whole every time, and this
// animates the new bar down from the old spot. Otherwise HP "jumps" and you can't see how much went.
export function battlePanel(s, b, prev) {
  const hand = b.hand.map((c, i) => {
    const dmg = cardDamage(s, c);
    return `<button class="card ${c.kind === 'support' ? 'support' : ''}" data-idx="${i}">
      <span class="cname">${esc(c.name)}</span>
      <span class="cnum">${c.kind === 'support' ? 'Support · ' : ''}${dmg} damage</span>
    </button>`;
  }).join('');

  const shownNotes = b.notes.length ? b.notes.slice(-5) : ['"' + b.enemy.name + '" blocks the way. Play a card.'];
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
        <div class="round">Round ${b.round} / ${b.rounds}</div>
      </div>
      <div class="notes"><ul>${notes}</ul></div>
      ${b.over ? `
        <div class="result ${b.result}">${b.result === 'win' ? 'You win the night fight.' : 'You lose the night fight.'}</div>
        ${b.reward && b.reward.loot ? `
          <div class="drop ${b.reward.loot.rarity}">
            <span class="dname">${esc(b.reward.loot.name)}</span>
            <span class="deff">${esc(lootEffectText(b.reward.loot))}</span>
            <span class="dnote">Permanent</span>
          </div>` : ''}
        <button class="btn primary" data-act="done">Done, off to bed</button>
      ` : `
        <div class="hand">${hand}</div>
        <div class="bhud">
          <span>Your HP ${b.playerHp} / ${b.playerMaxHp}</span>
          <span class="mini"><i style="width:${hpPct}%;--from:${hpFrom}%"></i></span>
          <span>${b.enemy.desc}</span>
        </div>
      `}
    </div>`;
  return openModal(html, { cls: 'battle-panel' });
}

// Play again stays hidden on the ending page until the report has been seen once — you read your report first
let reportSeen = false;
export function resetReportSeen() { reportSeen = false; }

// The ending page is grades and an ending, plus one button to generate the report.
// The report gets its own page (personaPanel), opening with an entrance animation over the same campus.
export function endingPanel(s) {
  const e = TEXTS.endings[s.ending];
  const total = s.deck.reduce((n, c) => n + c.power, 0);

  const html = `
    <div class="ending ${s.ending}">
      <div class="tag">Ending</div>
      <h2>${esc(e.name)}</h2>
      <p class="body">${esc(e.text)}</p>
      <table class="stats">
        <tr><th>GPA</th><td class="big">${s.gpa.toFixed(2)}</td></tr>
        <tr><th>Knowledge / Mood / Physique</th><td>${s.knowledge} / ${s.mood} / ${s.physique}</td></tr>
        <tr><th>Deck</th><td>${s.deck.length} cards · total power ${total}</td></tr>
        <tr><th>Friendship</th><td>${Object.keys(NPCS).map((id) => NPCS[id].name + ' ' + s.friend[id]).join(' · ')}</td></tr>
      </table>

      <div class="row">
        <button class="btn primary" data-act="report">Generate my HKUTI report</button>
        ${reportSeen ? '<button class="btn" data-act="restart">Play again</button>' : ''}
      </div>
    </div>`;
  return openModal(html, { cls: 'ending-panel' });
}

// ---------------------------------------------------------------- HKUTI report
// Its own page: the panel is translucent, so the campus sits right behind it (#modal-backdrop already dims it).
// The entrance runs in three beats: title drops first, then the card pops, then the four axes grow one by one.
export function personaPanel(s) {
  const p = buildPersona(s);
  reportSeen = true; // once the report is seen, the ending page unlocks "Play again"

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
        <button class="btn" data-act="back">Back to ending</button>
        <button class="btn primary" data-act="restart">Play again</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'ending-panel rpt-panel' });
}

// ---------------------------------------------------------------- Character panel
// The top three cells are "the stats tonight"; below is "the day-7 tally".
// Hovering a cell opens the math: what that number actually turns into in damage / HP.
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
    ? 'Required ' + CONFIG.requiredCourses + ' lectures · done'
    : 'Required ' + CONFIG.requiredCourses + ' lectures · not yet');
  todayBits.push('Free AP ' + s.ap + ' / ' + CONFIG.freeAp);
  if (!s.today.board) todayBits.push('Notice Board empty');
  if (!s.today.doubt) todayBits.push('Help Desk open');
  if (!s.today.pingpong) todayBits.push('Table Tennis available');
  if (!s.today.piano) todayBits.push('Piano available');
  if (s.mood <= CONFIG.room.pray.moodMax && !s.today.pray) todayBits.push('Prayer Room accessible');

  const html = `
    <div class="char">
      <h2>Character</h2>
      <p class="sub">Three stats, one job each. Hover for the math</p>

      <div class="cstats">
        <div class="cstat know">
          <span class="csn">Knowledge</span>
          <span class="csv">${s.knowledge}</span>
          <span class="cse">Damage ×${kMult.toFixed(2)}</span>
          ${tip([
            '<b>Night-fight damage</b>　power × (0.8 + Knowledge/100)',
            'Best card power ' + samplePower + ' → <b>' + sampleDmg + ' damage</b>',
            'One more lecture (+' + CONFIG.studyGain + ') → <b>' + nextDmg + ' damage</b>',
            'GPA share　3 × ' + s.knowledge + ' / ' + CONFIG.examKnowledgeDiv + ' = <b>+' + g.knowledge.toFixed(2) + '</b>',
          ])}
        </div>

        <div class="cstat mood">
          <span class="csn">Mood</span>
          <span class="csv">${s.mood}</span>
          <span class="cse">Daylight gain ×${mMult.toFixed(2)}</span>
          ${tip([
            '<b>Daylight only, never night fights</b>　multiplier = 0.5 + Mood/100 (rounded up)',
            'Now: one lecture ' + CONFIG.studyGain + ' → <b>' + gainNow + ' Knowledge</b>',
            'Mood down to 40: → <b>' + gainLow + ' Knowledge</b> (less ' + (gainNow - gainLow) + ')',
            'Hit zero and you collapse once; next day only ' + CONFIG.collapseAp + ' free AP',
            '<span class="warn">Applies to Lecture Hall, socialising, night reading; Study Room / Help Desk / Notice Board / calendar events are fixed values, untouched by mood or pack</span>',
          ])}
        </div>

        <div class="cstat phys">
          <span class="csn">Physique</span>
          <span class="csv">${s.physique}</span>
          <span class="cse">HP ${hp}</span>
          ${tip([
            '<b>Max HP</b>　(' + CONFIG.battle.playerBaseHp + ' + ⌊Physique × ' + CONFIG.hpPerPhysique + '⌋) × pack',
            'Now: ' + CONFIG.battle.playerBaseHp + ' + ⌊' + s.physique + ' × ' + CONFIG.hpPerPhysique + '⌋ → <b>' + hp + '</b>',
            'One Stadium run (+' + CONFIG.fieldPhysique + ') → <b>' + nextHp + ' HP</b> (+' + (nextHp - hp) + ')',
            'At enemy atk 6, that is <b>' + hits + ' hits</b>',
          ])}
        </div>
      </div>

      <h3 class="csec">Pack · loot only scales output, never stats</h3>
      ${bag.length ? `
        <div class="bagsum">
          <span>Night-fight damage <b>${pctText(lt.damage)}</b></span>
          <span>Max HP <b>${pctText(lt.hp)}</b></span>
          <span>Daylight gain <b>${pctText(lt.day)}</b></span>
          <span class="cap">Cap per type ${pctText(CONFIG.lootCap)}</span>
        </div>
        <ul class="baglist">${bag.map((l) =>
          '<li class="' + l.rarity + '"><b>' + esc(l.name) + '</b>' +
          (l.n > 1 ? ' ×' + l.n : '') +
          '<span>' + esc(lootEffectText(l)) + '</span></li>').join('')}</ul>
      ` : '<p class="empty">No loot yet. One night-fight win drops a piece. Win early, get strong early.</p>'}

      <h3 class="csec">Day 7 tally</h3>
      <table class="stats">
        <tr><th>Projected GPA</th><td class="big">${gpa.toFixed(2)}</td></tr>
        <tr><th>　base / Knowledge / Mood</th><td class="muted">${g.base.toFixed(2)} + ${g.knowledge.toFixed(2)} + ${g.mood.toFixed(2)}</td></tr>
        <tr><th>Night wins</th><td>${s.battleWins} (Scholar and Daredevil needs ≥ ${CONFIG.endingGreatWins})</td></tr>
        <tr><th>Deck</th><td>${s.deck.length} cards · total power ${s.deck.reduce((n, c) => n + c.power, 0)}</td></tr>
        <tr><th>Friendship</th><td>${Object.keys(NPCS).map((id) =>
          NPCS[id].name + ' ' + s.friend[id] + (s.friend[id] >= CONFIG.friendSupportAt ? '·support' : '')).join(' · ')}</td></tr>
      </table>

      <h3 class="csec">Still open today</h3>
      <ul class="clist">${todayBits.map((b) => '<li>' + esc(b) + '</li>').join('')}</ul>

      <div class="row"><button class="btn" data-act="close">Close</button></div>
    </div>`;
  return openModal(html, { cls: 'char-panel' });
}

// ---------------------------------------------------------------- Calendar Wall
// Term timeline: seven days, one row each, in three states — past / today / ahead.
// Every row carries that day's entries (events / the exam); today's row also says what tonight holds.
export function calendarPanel(s) {
  const rows = [];
  for (let d = 1; d <= s.maxDay; d++) {
    const cls = d < s.day ? 'past' : d === s.day ? 'today' : 'next';
    const evs = entriesOf(s, d).map((e) => {
      const st = e.done ? 'done' : e.missed ? 'missed' : 'open';
      const tail = e.done ? ' went' : e.missed ? ' missed' : '';
      return '<span class="cev ' + st + '">' + esc(e.title + tail) + '</span>';
    });
    if (d === s.maxDay) evs.push('<span class="cev exam">Final Exam</span>');
    const tail = d === s.day && d !== s.maxDay ? '<span class="cev night">Tonight: study or fight</span>' : '';
    rows.push(
      '<li class="' + cls + '">' +
        '<span class="cday">Day ' + d + '</span>' +
        '<span class="cflag">' + (d < s.day ? 'past' : d === s.day ? 'today' : '') + '</span>' +
        '<span class="cnote">' + (evs.join('') + tail || '—') + '</span>' +
      '</li>'
    );
  }
  const left = Math.max(0, s.maxDay - s.day);
  const now = [];
  now.push(s.today.courses ? 'Both required lectures done' : 'Required lectures not done');
  now.push('Free AP ' + s.ap + ' / ' + CONFIG.freeAp);
  now.push('Mood ' + s.mood + ' (daylight gain ×' + moodMult(s).toFixed(2) + ')');
  for (const e of entriesOf(s, s.day).filter((x) => !x.done && !x.missed)) {
    const p = placeOf(e);
    now.push('Today: "' + e.title + '" · ' + (p ? p.name : 'campus') + ' · ' + effectLine(e));
  }

  const html = `
    <div class="cal">
      <h2>Calendar Wall</h2>
      <p class="sub">A ${s.maxDay}-day term; today is day ${s.day}${left ? ', ' + left + ' days to the final' : ', the final itself'}</p>
      <ul class="ctimeline">${rows.join('')}</ul>
      <h3 class="csec">Today</h3>
      <ul class="clist">${now.map((b) => '<li>' + esc(b) + '</li>').join('')}</ul>
      <div class="row"><button class="btn" data-act="close">Leave</button></div>
    </div>`;
  return openModal(html, { cls: 'cal-panel' });
}

// ---------------------------------------------------------------- Event confirm panel
// Spell out the three stat deltas before you set off: what the event gives, what it costs in AP, how big.
export function eventPanel(entry, s) {
  const place = EVENT_PLACES[entry.place];
  const host = entry.host ? NPCS[entry.host] : null;
  const enough = s.ap >= entry.ap;
  const rows = [];
  const row = (label, val, cls) =>
    '<div class="evrow ' + cls + '"><span class="evl">' + label + '</span>' +
    '<span class="evv">' + val + '</span></div>';
  if (entry.know) rows.push(row('Knowledge', '+' + entry.know + ' (damage multiplier +' + (entry.know / 100).toFixed(2) + ')', 'gain'));
  if (entry.mood) {
    rows.push(row('Mood', (entry.mood > 0 ? '+' : '−') + Math.abs(entry.mood), entry.mood > 0 ? 'gain' : 'cost'));
  }
  if (entry.physique) {
    const hpGain = Math.floor((s.physique + entry.physique) * CONFIG.hpPerPhysique) -
      Math.floor(s.physique * CONFIG.hpPerPhysique);
    rows.push(row('Physique', '+' + entry.physique + ' (max HP +' + hpGain + ')', 'gain'));
  }

  const html = `
    <div class="room event">
      <div class="rhead">
        <span class="ricon">📌</span>
        <div>
          <h2>${esc(entry.title)}</h2>
          <p class="sub">${esc(place ? place.name : 'Campus')}${host ? ' · hosted by ' + esc(host.name) : ''}</p>
        </div>
      </div>
      <p class="body">${esc(entry.desc || '')}</p>
      <div class="evrows">${rows.join('')}</div>
      <p class="rcost">Costs ${entry.ap} AP · ${s.ap} left today${entry.ap > 1 ? ' · this one eats most of the day' : ''}</p>
      <div class="row">
        <button class="btn primary" data-act="go"${enough ? '' : ' disabled'}>${enough ? 'Set off' : 'Not enough AP'}</button>
        <button class="btn" data-act="cancel">Not going</button>
      </div>
    </div>`;
  return openModal(html, { cls: 'room-panel event-panel' });
}

// ---------------------------------------------------------------- Hit feel
// The shake hits the battle panel content: 2–4px, small when you land a hit, big when you take one.
// The red flash uses a fixed overlay and only changes opacity, so no DOM rebuild and no animation is cut off.
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
  } catch (e) { /* no Web Animations support, skip it */ }
}

function flashScreen(strength) {
  const el = els.flash;
  if (!el || typeof el.animate !== 'function') return;
  try {
    el.animate(
      [{ opacity: 0 }, { opacity: strength }, { opacity: 0 }],
      { duration: 90 + strength * 260, easing: 'ease-out' }
    );
  } catch (e) { /* same as above */ }
}

// All the feedback after playing one card: dealt is what you hit for, taken is what you ate
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

// Overwrite onclick instead of addEventListener: every panel redraw rebinds, so handlers never stack
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

// Panel background: hovering a floor or a room swaps the backdrop for its concept art (CSS adds blur and scrim).
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

// mouseover delegates across the whole list: moving between floor plates / room options never snaps back to the default
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
  // Stacked like a real elevator: high floors on top, basement at the bottom, a lit "car" on the current floor
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
      (locked ? '<span class="plate-tag">Closed</span>' : '<span class="plate-tag go">→</span>') +
      '</button>';
  }).join('');
  const html = `
    <div class="elev">
      <h2>${esc(building.full)} · Elevator</h2>
      <p class="sub">Pick a floor. Walking between floors is free — only actually doing something costs AP.</p>
      <div class="shaft">
        <span class="shaft-rail"></span>
        ${plates}
      </div>
      <div class="row"><button class="btn" data-act="cancel">Leave</button></div>
    </div>`;
  const panel = openModal(html, { cls: 'elev-panel' });
  // Warm the floor backgrounds so hover doesn't wait on a load
  for (const f of building.floors) {
    if (f.bg) new Image().src = f.bg;
  }
  const defaultBg = building.bg || '';
  bindHoverBg(panel, defaultBg);
  showPanelBg(defaultBg);
  return panel;
}

// The rooms on a floor are just a few options: no more map walking, click one and it happens
export function floorPanel(building, floor, s, blockedOf) {
  const opts = floor.rooms.map((r) => {
    const why = blockedOf ? blockedOf(r) : null;
    const ap = r.ap || 0;
    const attr = why ? 'disabled' : 'data-act="room" data-room="' + r.id + '"';
    const bgAttr = r.bg ? ' data-bg="' + esc(r.bg) + '"' : '';
    const tag = why ? esc(why) : r.freeEntry ? 'Free' : ap + ' AP';
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
          <p class="sub">${s.ap} AP left today. Pick one thing.</p>
        </div>
      </div>
      <div class="opts">${opts || '<p class="sub">Nothing to do on this floor yet.</p>'}</div>
      <div class="row">
        <button class="btn" data-act="back">Change floor</button>
        <button class="btn" data-act="cancel">Leave</button>
      </div>
    </div>`;
  const panel = openModal(html, { cls: 'elev-panel' });
  // Warm the room backgrounds so hover doesn't wait
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
      <p class="rcost">Costs ${ap} AP · ${s.ap} left today</p>
      <div class="row">
        <button class="btn primary" data-act="go"${enough ? '' : ' disabled'}>${enough ? 'Start' : 'Not enough AP'}</button>
        <button class="btn" data-act="cancel">Never mind</button>
      </div>
    </div>`;
  const panel = openModal(html, { cls: 'room-panel' });
  // Rooms and places with concept art reuse the same backdrop on the confirm panel (unset: leave the hovered one)
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
      '<span class="pf">Friendship ' + v + (v >= CONFIG.friendSupportAt ? ' · support unlocked' : '') + '</span>' +
      '<span class="pnote">' + (blocked ? 'Already talked today' : needFresh ? 'Not talked yet' : esc(npc.taunt || 'free right now')) + '</span>' +
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
      <p class="rcost">Who with? Costs ${spot.ap || 0} AP · ${s.ap} left today</p>
      <div class="picks">${cards}</div>
      <div class="row"><button class="btn" data-act="cancel">Never mind</button></div>
    </div>`;
  return openModal(html, { cls: 'room-panel' });
}
