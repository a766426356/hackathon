// main.js — 启动、输入、场景与阶段状态机。游戏规则都在 rules.js / battle.js 里。

import { INTERACTABLES, CONFIG, CAMPUS, MAP_W, MAP_H } from '../data.js';
import {
  createState, loadGame, saveGame, clearSave,
} from './state.js';
import * as rules from './rules.js';
import * as battle from './battle.js';
import * as ui from './ui.js';
import { createWorld } from './world.js';
import { openPiano as openPianoGame } from './minigames/piano.js';
import { openPong } from './minigames/pong.js';
import { openSnooker } from './minigames/snooker.js';
import { buildingOf, floorByLevel } from './interiors.js';
import { eventSpots } from './calendar.js';

let state = null;
let world = null;
let battleState = null;
let battlePct = null; // 上一帧的血条百分比，给血条动画用
let started = false;
let lastTs = 0;

// 'campus' = 校园大图，其它值 = 室内场景 id（如 'cds1.f3'）

const canvas = document.getElementById('game');

// ---------------------------------------------------------------- 启动
function boot() {
  ui.initUI();
  fitCanvas();
  world = createWorld(canvas);
  enterCampus();
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
  window.addEventListener('keyup', (e) => {
    world.keys.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => world.keys.clear());

  const hasSave = !!loadGame();
  ui.introPanel(hasSave);
  ui.bindModal({
    start: () => startNew(),
    resume: () => resume(),
  });

  requestAnimationFrame(frame);
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
  rules.requiredCourses(state); // 第 1 天的两节必修课
  enterCampus();
  renderAll();
  ui.toast('第 1 天的两节必修课上完了，剩下 ' + CONFIG.freeAp + ' 个自由行动点。寝室在 2# 门口。');
  save();
}

function resume() {
  const s = loadGame();
  if (!s) { startNew(); return; }
  state = s;
  battleState = null;
  battlePct = null;
  started = true;
  ui.closeModal();
  if (state.phase === 'ending') { showEnding(); return; }
  if (state.phase === 'exam') { examNow(); return; }
  if (state.phase === 'night') {
    // 刷新时正好停夜晚：把夜晚选择重新摆出来，避免卡在半路
    state.phase = 'day';
    enterCampus();
    renderAll();
    openNight();
    return;
  }
  enterCampus();
  renderAll();
  if (state.ap <= 0) openNight();
}

function fitCanvas() {
  if (canvas.width !== MAP_W || canvas.height !== MAP_H) {
    canvas.width = MAP_W;
    canvas.height = MAP_H;
  }
  ui.els.scene.classList.add('square');
}

// ---------------------------------------------------------------- 校园 / 进楼
// 校园是唯一场景。进楼 → 电梯面板 → 楼层房间选项 → 确认面板，全程不走路。

// 校园交互点 = 固定点 + 当天日历活动的出发点（一天最多一个）
function campusSpots() {
  return state ? INTERACTABLES.concat(eventSpots(state)) : INTERACTABLES;
}

// 事件做完 / 翻页之后，校园上那个出发点要跟着消失或换位置
function refreshCampusSpots() {
  const list = campusSpots();
  world.setSpots(list);
  ui.setSpots(list, { w: CAMPUS.w, h: CAMPUS.h, half: 0 });
}

function enterCampus() {
  const list = campusSpots();
  world.setSpots(list);
  ui.setSpots(list, { w: CAMPUS.w, h: CAMPUS.h, half: 0 });
  ui.setSceneChip('校园');
  if (state) { state.scene = 'campus'; state.scenePos = null; if (started) save(); }
}

function enterBuilding(buildingId) {
  const b = buildingOf(buildingId);
  if (!b) return;
  // 单层建筑（寝室）没有电梯，进门就是那一层
  if (b.floors.length <= 1) {
    ui.toast(b.id === 'dorm' ? '你回到寝室。' : '你走进' + b.full + '。');
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
      if (room.action === 'char') return openCharacter();
      if (room.action === 'calendar') return openCalendar();
      if (room.action === 'leave') { ui.closeModal(); return; }
      if (room.action === 'piano') return openPiano(room, building, floor);
      openRoom(room, building, floor);
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
  switch (item.kind) {
    case 'enter': return enterBuilding(item.building);
    case 'elevator': return openElevator();
    case 'leave': return leaveBuilding();
    case 'room': return openRoom(item);
    case 'char': return openCharacter();
    case 'calendar': return openCalendar();
    case 'roomie': return afterAction(rules.roomieTalk(state));
    case 'event': return openEvent(item.entry);
    default: break;
  }

  let res;
  if (item.kind === 'study') res = rules.study(state);
  else if (item.kind === 'board') res = rules.board(state);
  else if (item.kind === 'social') res = rules.social(state, item.npc);
  else if (item.kind === 'field') res = rules.field(state);
  else if (item.kind === 'rest') res = rules.rest(state);
  else res = { ok: false, msg: '这里什么也没有。' };

  afterAction(res);
}

// 这间房现在能不能用：不能就当场说清楚，不弹一个按不动的面板
function roomBlocked(room) {
  if ((room.ap || 0) > 0 && state.ap <= 0) return '没行动点了';
  const a = room.action;
  if (a === 'doubt' && state.today.doubt) return '今天用过了';
  if (a === 'pingpong' && state.today.pingpong) return '今天打过了';
  if (a === 'pray') {
    if (state.mood > CONFIG.room.pray.moodMax) return '心情高于 ' + CONFIG.room.pray.moodMax;
    if (state.today.pray) return '今天静过了';
  }
  if (a === 'roomieTalk' && state.today.zhe) return '今天聊过了';
  if (a === 'rest' && state.ap <= 0) return '没行动点了';
  return null;
}

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
  enterCampus();
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
  ui.bindModal({ restart: startNew });
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
  state.scene = 'campus';
  state.scenePos = null;
  saveGame(state);
}

boot();
