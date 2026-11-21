// main.js — 启动、输入、场景与阶段状态机。游戏规则都在 rules.js / battle.js 里。

import { INTERACTABLES, CONFIG, CAMPUS, MAP_W, MAP_H } from '../data.js';
import {
  createState, loadGame, saveGame, clearSave,
} from './state.js';
import * as rules from './rules.js';
import * as battle from './battle.js';
import * as ui from './ui.js';
import { createWorld } from './world.js';
import { buildingOf, floorByLevel } from './interiors.js';

let state = null;
let world = null;
let battleState = null;
let started = false;
let lastTs = 0;

// 现在没有室内场景了：一直在校园，进楼只弹面板
let pianoState = null; // 钢琴弹到一半的连击状态

const canvas = document.getElementById('game');

// ---------------------------------------------------------------- 启动
function boot() {
  ui.initUI();
  fitCanvas();
  world = createWorld(canvas);
  ui.setSpots(INTERACTABLES, { w: CAMPUS.w, h: CAMPUS.h, half: 0 });
  ui.setSceneChip('校园');
  ui.onMarkerClick(onMarkerClick);
  document.getElementById('btn-endday').addEventListener('click', () => {
    if (!started || !state || state.phase !== 'day') return;
    openNight();
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => world.keys.delete(e.key.toLowerCase()));
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
  pianoState = null;
  started = true;
  ui.closeModal();
  renderAll();
  save();
}

function resume() {
  const s = loadGame();
  if (!s) { startNew(); return; }
  state = s;
  battleState = null;
  pianoState = null;
  started = true;
  ui.closeModal();
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

  // 琴键优先：1–8 直接对应 do–do
  if (pianoState && !ui.els.modalRoot.classList.contains('hidden')) {
    const n = Number(e.key);
    if (n >= 1 && n <= 8) { e.preventDefault(); playNote(n - 1); return; }
  }

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
  const item = INTERACTABLES.find((i) => i.id === id);
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
  if (state.ap <= 0) return '没行动点了';
  const a = room.action;
  if (a === 'doubt' && state.today.doubt) return '今天用过了';
  if (a === 'pingpong' && state.today.pingpong) return '今天打过了';
  if (a === 'piano' && state.today.piano) return '今天弹过了';
  if (a === 'pray') {
    if (state.mood > CONFIG.room.pray.moodMax) return '心情高于 ' + CONFIG.room.pray.moodMax;
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
      pick: (el) => {
        const res = room.pick === 'snooker'
          ? rules.snooker(state, el.dataset.npc)
          : rules.pingpong(state, el.dataset.npc);
        afterAction(res, building, floor);
      },
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
function openPiano(room, building, floor) {
  const blocked = roomBlocked(room);
  if (blocked) { ui.toast(blocked, 'warn'); return; }
  pianoState = { room, building, floor, notes: [], done: null };
  renderPiano();
}

function renderPiano() {
  ui.pianoPanel(pianoState.room, pianoState.notes, state, pianoState.done);
  ui.bindModal({
    note: (el) => playNote(Number(el.dataset.note)),
    cancel: () => {
      const { building, floor } = pianoState;
      pianoState = null;
      if (state.ap <= 0 && state.phase === 'day') { ui.closeModal(); openNight(); return; }
      if (building && floor) openFloor(building, floor.level);
      else ui.closeModal();
    },
  });
}

function playNote(i) {
  if (!pianoState || pianoState.done) return;
  ui.playTone(i);
  pianoState.notes.push(i);
  const need = CONFIG.room.piano.notes;
  if (pianoState.notes.length >= need) {
    const res = rules.piano(state, pianoState.notes.length);
    pianoState.done = res.msg;
    if (res.ok) { renderAll(); save(); }
    renderPiano();
    return;
  }
  renderPiano();
}

// ---------------------------------------------------------------- 夜晚
function openNight() {
  if (state.phase !== 'day') return;
  state.phase = 'night';
  world.keys.clear();
  pianoState = null;
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
  renderBattle();
}

function renderBattle() {
  ui.battlePanel(state, battleState);
  ui.bindModal({ card: onPlayCard, done: onBattleDone });
  ui.renderHUD(state);
}

function onPlayCard(idx) {
  if (!battleState || battleState.over) return;
  battle.playCard(state, battleState, idx);
  renderBattle();
}

function onBattleDone() {
  if (!battleState) return;
  const res = rules.settleBattle(state, battleState);
  ui.toast(res.msg, battleState.result === 'win' ? 'win' : 'warn');
  battleState = null;
  ui.renderAll(state);
  finishNight();
}

function finishNight() {
  rules.endDay(state);
  save();
  if (state.phase === 'exam') { examNow(); return; }
  state.phase = 'day';
  ui.closeModal();
  renderAll();
  save();
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
  saveGame(state);
}

boot();
