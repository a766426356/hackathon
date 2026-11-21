// main.js — 启动、输入、场景与阶段状态机。游戏规则都在 rules.js / battle.js 里。

import { INTERACTABLES, CONFIG, CAMPUS, MAP_W, MAP_H, NPCS } from '../data.js';
import {
  createState, loadGame, saveGame, clearSave,
} from './state.js';
import * as rules from './rules.js';
import * as battle from './battle.js';
import * as ui from './ui.js';
import { showTitleScreen } from './intro.js';
import { createWorld } from './world.js';
import { buildingOf, floorByLevel } from './interiors.js';
import { eventSpots } from './calendar.js';
import { openPiano as openPianoGame } from './minigames/piano.js';
import { openPong } from './minigames/pong.js';
import { openSnooker } from './minigames/snooker.js';
import { openRun } from './minigames/run.js';
import { openGym } from './minigames/gym.js';

let state = null;
let world = null;
let battleState = null;
let battlePct = null; // 上一帧的血条百分比，给血条动画用
let started = false;
let lastTs = 0;

// 现在没有室内场景了：一直在校园，进楼只弹面板

const canvas = document.getElementById('game');

// 校园交互点 = 固定点 + 当天日历活动的出发点（一天最多一个）
function campusSpots() {
  return state ? INTERACTABLES.concat(eventSpots(state)) : INTERACTABLES;
}

const CAMPUS_FRAME = { w: CAMPUS.w, h: CAMPUS.h, half: 0 };

// 事件做完 / 翻页之后，校园上那个出发点要跟着消失或换位置
function refreshCampusSpots() {
  const list = campusSpots();
  world.setSpots(list);
  ui.setSpots(list, CAMPUS_FRAME);
}

// ---------------------------------------------------------------- 启动
function boot() {
  ui.initUI();
  fitCanvas();
  world = createWorld(canvas);
  ui.setSpots(INTERACTABLES, CAMPUS_FRAME);
  ui.setSceneChip('校园');
  ui.onMarkerClick(onMarkerClick);
  document.getElementById('btn-endday').addEventListener('click', () => {
    if (!started || !state || state.phase !== 'day') return;
    openNight();
  });
  document.getElementById('btn-char').addEventListener('click', () => {
    if (!started || !state) return;
    openCharacter();
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => world.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => world.keys.clear());

  const hasSave = !!loadGame();
  // 演示捷径：?demo=ending 直接看结局 + 人格报告，不用点六个晚上
  if (new URLSearchParams(location.search).get('demo') === 'ending') {
    demoEnding();
    requestAnimationFrame(frame);
    return;
  }
  requestAnimationFrame(frame);

  // 开场：标题屏 → 3D 翻转。底下的校园一直在渲染，所以翻转落地时看到的
  // 就是主页面本身，翻转接完再弹欢迎卡（introPanel）。
  showTitleScreen().then(() => {
    ui.introPanel(hasSave);
    ui.bindModal({
      start: () => startNew(),
      resume: () => resume(),
    });
  });
}

// 只给演示 / 验收用：按一张固定的日程表跑完六天，然后停在结局页。
// 这张表刻意排得"像一个正常玩家"——上课、玩、参加活动、跑两圈、打两场，
// 这样人格报告的四个轴都有数据，不会全落在默认值上。
function demoEnding() {
  state = createState(2049);
  state.phase = 'day';
  rules.requiredCourses(state);

  const act = (fn) => { if (state.ap > 0) fn(); };
  const event = (id) => {
    const e = state.calendar.find((x) => x.id === id && !x.done && !x.missed);
    if (e && e.day === state.day) rules.doEvent(state, e);
  };

  while (state.day <= 6) {
    const d = state.day;
    if (d === 1) { act(() => rules.study(state)); act(() => rules.study(state)); act(() => rules.study(state)); }
    if (d === 2) { act(() => rules.study(state)); act(() => rules.study(state)); act(() => event('ev.club')); }
    if (d === 3) { act(() => rules.study(state)); act(() => rules.study(state)); act(() => event('ev.run')); }
    if (d === 4) { act(() => rules.study(state)); act(() => event('ev.read')); act(() => rules.field(state)); }
    if (d === 5) { act(() => rules.study(state)); act(() => rules.study(state)); act(() => rules.social(state, 'lin')); }
    if (d === 6) {
      act(() => rules.study(state)); act(() => rules.study(state));
      act(() => { state.today.piano = false; rules.piano(state, 4); });
    }
    state.ap = 0;
    state.phase = 'night';
    if (d === 4 || d === 6) {
      const b = battle.startBattle(state);
      let guard = 0;
      while (!b.over && guard++ < 20) battle.playCard(state, b, 0);
      rules.settleBattle(state, b);
    } else {
      rules.nightStudy(state);
    }
    rules.endDay(state);
  }

  rules.runExam(state);
  started = true;
  ui.setSpots(INTERACTABLES, CAMPUS_FRAME);
  world.setSpots(INTERACTABLES);
  ui.renderAll(state);
  showEnding();
  save();
}

function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}

function startNew() {
  clearSave();
  state = createState(seedFromUrl());
  battleState = null;
  battlePct = null;
  started = true;
  ui.closeModal();
  ui.resetReportSeen();
  rules.requiredCourses(state); // 第 1 天的两节必修课
  refreshCampusSpots();
  renderAll();
  save();
  ui.toast('第 1 天的两节必修课上完了，剩下 ' + CONFIG.freeAp + ' 个自由行动点。');
}

function resume() {
  const s = loadGame();
  if (!s) { startNew(); return; }
  state = s;
  battleState = null;
  battlePct = null;
  started = true;
  ui.closeModal();
  refreshCampusSpots();
  if (state.phase === 'ending') { showEnding(); return; }
  if (state.phase === 'exam') { examNow(); return; }
  if (state.phase === 'night') {
    // 刷新时正好停夜晚：把夜晚选择重新摆出来，避免卡在半路
    state.phase = 'day';
    renderAll();
    openNight();
    return;
  }
  renderAll();
  if (state.ap <= 0) openNight();
}

// ---------------------------------------------------------------- 进楼
// 校园是唯一场景：在楼门口按 E 就弹电梯面板，选层 → 房间选项 → 确认面板。
function fitCanvas() {
  if (canvas.width !== MAP_W || canvas.height !== MAP_H) {
    canvas.width = MAP_W;
    canvas.height = MAP_H;
  }
  ui.els.scene.classList.add('square');
}

function enterBuilding(buildingId) {
  const b = buildingOf(buildingId);
  if (!b) return;
  // 单层建筑（寝室）进门就是屋子本身，不用先看电梯
  if (b.floors.length <= 1) {
    openFloor(b, b.floors[0].level);
    return;
  }
  openElevator(b, null);
}

// 电梯面板：列这栋楼的楼层
function openElevator(building, currentLevel) {
  world.keys.clear();
  ui.elevatorPanel(building, currentLevel);
  ui.bindModal({
    floor: (el) => openFloor(building, Number(el.dataset.level)),
    cancel: () => ui.closeModal(),
  });
}

// 某一层：把房间做成几个选项
function openFloor(building, level) {
  const floor = floorByLevel(building, level);
  if (!floor) return;
  world.keys.clear();
  ui.floorPanel(building, floor, state, roomBlocked);
  ui.bindModal({
    room: (el) => {
      const room = floor.rooms.find((r) => r.id === el.dataset.room);
      if (!room) return;
      const why = roomBlocked(room);
      if (why) { ui.toast(why, 'warn'); return; }
      // 不花行动点的三件事直接开面板，不弹「开始」确认
      if (room.action === 'char') { openCharacter(true, () => openFloor(building, floor.level)); return; }
      if (room.action === 'calendar') { openCalendar(true, () => openFloor(building, floor.level)); return; }
      if (room.action === 'roomie') { afterAction(rules.roomieTalk(state), building, floor); return; }
      if (room.action === 'gym') { launchGym(building, floor); return; }
      if (room.action === 'piano') openPiano(room, building, floor);
      else openRoom(room, building, floor);
    },
    back: () => openElevator(building, level),
    cancel: () => ui.closeModal(),
  });
  save();
}

// ---------------------------------------------------------------- 输入
function onKeyDown(e) {
  const k = e.key.toLowerCase();

  const move = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  if (modalOpen()) return;
  if (move.includes(k)) {
    world.keys.add(k);
    e.preventDefault();
    return;
  }
  if (k === 'e' || k === ' ' || k === 'enter') {
    e.preventDefault();
    tryInteract();
  }
}

function modalOpen() {
  return !ui.els.modalRoot.classList.contains('hidden');
}

function onMarkerClick(id) {
  if (!started || !state || state.phase !== 'day') return;
  const item = world.spots.find((i) => i.id === id);
  if (!item) return;
  if (!world.near || world.near.id !== id) {
    ui.toast('先走到「' + item.name + '」旁边再互动。', 'warn');
    return;
  }
  interact(item);
}

function tryInteract() {
  if (!started || !state || state.phase !== 'day') return;
  if (!world.near) {
    ui.toast('附近没有可以互动的点，走近一点。', 'warn');
    return;
  }
  interact(world.near);
}

function interact(item) {
  if (item.kind === 'enter') { enterBuilding(item.building); return; }
  if (item.kind === 'event') { openEvent(item.entry); return; }
  if (item.kind === 'field') { openFieldRun(); return; }

  let res;
  if (item.kind === 'study') res = rules.study(state);
  else if (item.kind === 'board') res = rules.board(state);
  else if (item.kind === 'social') res = rules.social(state, item.npc);
  else if (item.kind === 'rest') res = rules.rest(state);
  else res = { ok: false, msg: '这里什么也没有。' };

  afterAction(res);
}

// 操场：跨栏小游戏。准备画面（铺 assets/bg/field.jpg）→ 跑 → 按结果结算，关门回校园。
// 队友那边的「先弹一个确认面板」被并进来了：这里的第一屏就是那张确认 + 准备画面。
function openFieldRun() {
  if (!state || state.phase !== 'day') return;
  if (state.ap <= 0) { ui.toast('今天没有行动点了。', 'warn'); return; }
  world.keys.clear();
  let settled = false;
  openRun({
    onFinish: (outcome) => {
      if (settled) return null;
      settled = true;
      const res = rules.field(state, outcome);
      if (res.ok) { ui.renderAll(state); save(); }
      return res;
    },
    onExit: () => {
      ui.renderAll(state);
      save();
      if (state.ap <= 0 && state.phase === 'day') { openNight(); return; }
      ui.closeModal();
    },
  });
}

// B1 健身房：反应小游戏，同样按结果结算
function launchGym(building, floor) {
  if (!state || state.phase !== 'day') return;
  world.keys.clear();
  let settled = false;
  openGym({
    need: CONFIG.room.gym.need,
    onFinish: (outcome) => {
      if (settled) return null;
      settled = true;
      const res = rules.gym(state, outcome);
      if (res.ok) { ui.renderAll(state); save(); }
      return res;
    },
    onExit: () => {
      ui.renderAll(state);
      save();
      if (state.ap <= 0 && state.phase === 'day') { openNight(); return; }
      openFloor(building, floor.level);
    },
  });
}

// 这间房现在能不能用：不能就当场说清楚，不弹一个按不动的面板
function roomBlocked(room) {
  const a = room.action;
  // 钢琴不占行动点、不封门：随时能弹，只有每天第一次弹满才结算
  if (a === 'piano') return null;
  // 不花行动点的三件事任何时候都能用
  if (!room.ap) return null;
  if (state.ap <= 0) return '没行动点了';
  if (a === 'doubt' && state.today.doubt) return '今天用过了';
  if (a === 'pingpong' && state.today.pingpong) return '今天打过了';
  if (a === 'gym' && state.today.gym) return '今天练过了';
  if (a === 'pray') {
    if (state.mood > CONFIG.room.pray.moodMax) return '心境高于 ' + CONFIG.room.pray.moodMax;
    if (state.today.pray) return '今天静过了';
  }
  return null;
}

// 房间：先看清楚代价，再决定做不做
function openRoom(room, building, floor) {
  const blocked = roomBlocked(room);
  if (blocked) { ui.toast(blocked, 'warn'); return; }
  if (room.pick) {
    ui.friendPanel(room, state);
    ui.bindModal({
      pick: (el) => openVersus(room, el.dataset.npc, building, floor),
      cancel: () => openFloor(building, floor.level),
    });
    return;
  }
  ui.roomPanel(room, state);
  ui.bindModal({
    go: () => {
      const fn = {
        course: rules.course,
        doubt: rules.doubt,
        studyroom: rules.studyroom,
        pray: rules.pray,
        bed: rules.bed,
      }[room.action];
      if (!fn) { ui.closeModal(); return; }
      afterAction(fn(state), building, floor);
    },
    cancel: () => openFloor(building, floor.level),
  });
}

// 结算完回到这一层的选项面板，接着做下一件事
function afterAction(res, building, floor) {
  if (!res.ok) { ui.toast(res.msg, 'warn'); return; }
  ui.toast(res.msg);
  refreshCampusSpots(); // 活动做完了，校园上那个出发点要消失
  renderAll();
  save();
  if (state.ap <= 0) {
    ui.closeModal();
    setTimeout(() => { if (state.phase === 'day') openNight(); }, 320);
    return;
  }
  if (building && floor) openFloor(building, floor.level);
  else ui.closeModal();
}

// ---------------------------------------------------------------- 钢琴
// 琴可以无限弹：只有每天第一次弹满 N 个音，才花 1 AP 结算心情。
function openPiano(room, building, floor) {
  if (!started || !state || state.phase !== 'day') return;
  world.keys.clear();
  const canReward = !state.today.piano && state.ap > 0;
  openPianoGame({
    state,
    notes: CONFIG.room.piano.notes,
    canReward,
    onReward: (notes) => {
      const res = rules.piano(state, notes);
      if (res.ok) { renderAll(); save(); }
      return res;
    },
    onExit: () => {
      if (state.ap <= 0 && state.phase === 'day') { openNight(); return; }
      openFloor(building, floor.level);
    },
  });
}

// ---------------------------------------------------------------- 球台
// 先打完小球，再按胜负结算；中途收杆不花行动点。
function openVersus(room, npcId, building, floor) {
  const npc = NPCS[npcId];
  if (!npc) return;
  ui.closeModal();
  world.keys.clear();
  let settled = false;
  const launch = room.pick === 'snooker' ? openSnooker : openPong;
  launch({
    state,
    npc,
    onFinish: (outcome) => {
      if (settled) return null;
      settled = true;
      const res = room.pick === 'snooker'
        ? rules.snooker(state, npcId, outcome)
        : rules.pingpong(state, npcId, outcome);
      if (res.ok) { renderAll(); save(); }
      return res;
    },
    onExit: () => {
      renderAll();
      save();
      if (state.ap <= 0 && state.phase === 'day') { openNight(); return; }
      openFloor(building, floor.level);
    },
  });
}

// ---------------------------------------------------------------- 只读面板
// 书桌和侧栏「角色」按钮打开的是同一个面板：只读，不花行动点，不改状态。
// force 用于「从楼层面板里点书桌」——那时弹窗本来就是开着的。
// onClose 用来回到刚才那一层，而不是被踢回校园。
function openCharacter(force, onClose) {
  if (!state) return;
  if (!force && modalOpen()) return;
  world.keys.clear();
  ui.characterPanel(state);
  ui.bindModal({
    close: () => { ui.closeModal(); if (onClose) onClose(); },
  });
}

function openCalendar(force, onClose) {
  if (!state) return;
  if (!force && modalOpen()) return;
  world.keys.clear();
  ui.calendarPanel(state);
  ui.bindModal({
    close: () => { ui.closeModal(); if (onClose) onClose(); },
  });
}

// 日历活动：先看清三条属性给多少，再决定去不去
function openEvent(entry) {
  if (!entry) return;
  if (entry.done) { ui.toast('「' + entry.title + '」今天已经去过了。', 'warn'); return; }
  world.keys.clear();
  ui.eventPanel(entry, state);
  ui.bindModal({
    go: () => afterAction(rules.doEvent(state, entry)),
    cancel: () => ui.closeModal(),
  });
}

// ---------------------------------------------------------------- 夜晚
function openNight() {
  if (state.phase !== 'day') return;
  state.phase = 'night';
  world.keys.clear();
  save();
  ui.nightPanel(state);
  ui.bindModal({ study: nightStudy, fight: nightFight });
}

function nightStudy() {
  const res = rules.nightStudy(state);
  ui.toast(res.msg);
  ui.renderAll(state);
  finishNight();
}

function nightFight() {
  battleState = battle.startBattle(state);
  battlePct = null;
  renderBattle();
}

function renderBattle() {
  const cur = {
    enemy: Math.max(0, (battleState.enemy.hp / battleState.enemy.maxHp) * 100),
    hp: Math.max(0, (battleState.playerHp / battleState.playerMaxHp) * 100),
  };
  ui.battlePanel(state, battleState, battlePct); // 传上一帧，血条才会「掉」而不是「跳」
  battlePct = cur;
  ui.bindModal({ card: onPlayCard, done: onBattleDone });
  ui.renderHUD(state);
}

function onPlayCard(idx) {
  if (!battleState || battleState.over) return;
  const fx = battle.playCard(state, battleState, idx);
  // 战斗一结束就立刻结算，这样结算画面就能把掉落摆出来，不用等玩家点「收工」
  if (battleState.over && !battleState.settled) {
    battleState.settled = true;
    battleState.reward = rules.settleBattle(state, battleState);
  }
  renderBattle(); // 先重建面板，抖动才作用在新节点上
  ui.hitFx(fx.dealt, fx.taken);
  if (battleState.over) {
    const win = battleState.result === 'win';
    setTimeout(() => ui.outcomeFx(win), 260); // 等这一下的抖动播完再给结算反馈
  }
}

function onBattleDone() {
  if (!battleState) return;
  if (!battleState.settled) {
    battleState.settled = true;
    battleState.reward = rules.settleBattle(state, battleState);
  }
  const res = battleState.reward;
  ui.toast(res.msg, battleState.result === 'win' ? 'win' : 'warn');
  battleState = null;
  battlePct = null;
  ui.renderAll(state);
  finishNight();
}

function finishNight() {
  rules.endDay(state);
  save();
  if (state.phase === 'exam') { examNow(); return; }
  state.phase = 'day';
  ui.closeModal();
  refreshCampusSpots(); // 新的一天，活动出发点换成今天的那个
  renderAll();
  save();
  ui.toast('第 ' + state.day + ' 天。必修两节已上，还有 ' + state.ap + ' 点自由。');
  if (state.ap <= 0) openNight();
}

// ---------------------------------------------------------------- 考试 / 结局
function examNow() {
  rules.runExam(state);
  save();
  showEnding();
}

function showEnding() {
  ui.endingPanel(state);
  ui.bindModal({ restart: startNew, report: showPersona });
  ui.renderAll(state);
}

// 结局看完再点「生成我的 HKUTI 报告」：面板半透明，背后还是刚才那张校园
function showPersona() {
  ui.personaPanel(state);
  ui.bindModal({ back: showEnding, restart: startNew });
  ui.renderAll(state);
}

// ---------------------------------------------------------------- 渲染循环
function renderAll() {
  ui.renderAll(state);
}

function frame(ts) {
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts;
  const active = started && state && state.phase === 'day' && !modalOpen();
  world.update(dt, active);
  world.draw(state && state.phase === 'night');
  ui.updateMarkers(world.project);
  if (active) ui.setNear(world.near);
  else ui.setNear(null);
  requestAnimationFrame(frame);
}

function save() {
  if (!state) return;
  saveGame(state);
}

boot();
