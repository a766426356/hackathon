// main.js — 启动、输入、场景与阶段状态机。游戏规则都在 rules.js / battle.js 里。

import { INTERACTABLES, CONFIG, CAMPUS, MAP_W, MAP_H } from '../data.js';
import {
  createState, loadGame, saveGame, clearSave,
} from './state.js';
import * as rules from './rules.js';
import * as battle from './battle.js';
import * as ui from './ui.js';
import { createWorld } from './world.js';
import { createIndoor } from './indoor.js';
import { BUILDING_FLOORS, sceneOf } from './interiors.js';

let state = null;
let world = null;
let indoor = null;
let battleState = null;
let started = false;
let lastTs = 0;

// 'campus' = 校园大图，其它值 = 室内场景 id（如 'cds1.f3'）
let scene = 'campus';
let pianoState = null; // 钢琴弹到一半的连击状态

const canvas = document.getElementById('game');

// ---------------------------------------------------------------- 启动
function boot() {
  ui.initUI();
  world = createWorld(canvas);
  indoor = createIndoor(canvas);
  fitCanvas(true); // 开场就是校园方图，别让 canvas 先用 4:3 画一帧
  ui.onMarkerClick(onMarkerClick);
  document.getElementById('btn-endday').addEventListener('click', () => {
    if (!started || !state || state.phase !== 'day') return;
    openNight();
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => {
    world.keys.delete(e.key.toLowerCase());
    indoor.keys.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => { world.keys.clear(); indoor.keys.clear(); });

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
  enterScene('campus');
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
    enterScene('campus');
    renderAll();
    openNight();
    return;
  }
  // 停在楼里：回到那一层、那个位置
  if (state.scene && state.scene !== 'campus' && sceneOf(state.scene)) {
    enterScene(state.scene, state.scenePos);
  } else {
    enterScene('campus');
  }
  renderAll();
  if (state.ap <= 0) openNight();
}

// ---------------------------------------------------------------- 场景
function engine() {
  return scene === 'campus' ? world : indoor;
}

// 校园是方图（768×768），室内是 24×15 的横图（768×480）：换场景时连画布尺寸一起换
function fitCanvas(square) {
  if (square) {
    if (canvas.width !== MAP_W || canvas.height !== MAP_H) {
      canvas.width = MAP_W;
      canvas.height = MAP_H;
    }
    ui.els.scene.classList.add('square');
  } else {
    if (canvas.width !== 768 || canvas.height !== 480) {
      canvas.width = 768;
      canvas.height = 480;
    }
    ui.els.scene.classList.remove('square');
  }
}

function enterScene(id, pos) {
  if (id === 'campus') {
    scene = 'campus';
    fitCanvas(true);
    ui.setSpots(INTERACTABLES, { w: CAMPUS.w, h: CAMPUS.h, half: 0 });
    ui.setSceneChip('校园');
  } else {
    if (!indoor.load(id, pos)) return false;
    scene = id;
    fitCanvas(false);
    ui.setSpots(indoor.spots);
    ui.setSceneChip(indoor.scene.tag);
  }
  if (state) {
    state.scene = scene;
    state.scenePos = scene === 'campus' ? null : indoor.pos;
    if (started) save();
  }
  return true;
}

function enterBuilding(buildingId) {
  const b = BUILDING_FLOORS[buildingId];
  if (!b) return;
  if (!enterScene(b.lobby)) return;
  ui.toast('你走进' + b.full + '。先去电梯口。');
  setTimeout(() => {
    if (started && state.phase === 'day' && scene === b.lobby) openElevator();
  }, 140);
}

function leaveBuilding() {
  enterScene('campus');
  ui.toast('你回到校园。');
}

function openElevator() {
  const b = BUILDING_FLOORS[indoor.scene.building];
  if (!b) return;
  indoor.keys.clear();
  ui.elevatorPanel(b, scene);
  ui.bindModal({
    floor: (el) => {
      ui.closeModal();
      goFloor(el.dataset.to);
    },
    cancel: () => ui.closeModal(),
  });
}

function goFloor(to) {
  if (!to || !sceneOf(to)) return;
  enterScene(to);
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
    engine().keys.add(k);
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
  const eng = engine();
  const item = eng.spots.find((i) => i.id === id);
  if (!item) return;
  if (!eng.near || eng.near.id !== id) {
    ui.toast('先走到「' + item.name + '」旁边再互动。', 'warn');
    return;
  }
  interact(item);
}

function tryInteract() {
  if (!started || !state || state.phase !== 'day') return;
  const eng = engine();
  if (!eng.near) {
    ui.toast('附近没有可以互动的点，走近一点。', 'warn');
    return;
  }
  interact(eng.near);
}

function interact(item) {
  switch (item.kind) {
    case 'enter': return enterBuilding(item.building);
    case 'elevator': return openElevator();
    case 'leave': return leaveBuilding();
    case 'room': return openRoom(item);
    case 'piano': return openPiano(item);
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
function roomBlocked(spot) {
  if (state.ap <= 0) return '今天没有行动点了。';
  const a = spot.action;
  if (a === 'doubt' && state.today.doubt) return '助教今天已经被围过一轮了，明天再来。';
  if (a === 'pingpong' && state.today.pingpong) return '今天已经打过球了，胳膊抬不起来。';
  if (a === 'piano' && state.today.piano) return '今天已经弹过了，再弹就是扰民。';
  if (a === 'pray') {
    if (state.mood > CONFIG.room.pray.moodMax) return '心情还没低到那一步（要 ≤ ' + CONFIG.room.pray.moodMax + '）。';
    if (state.today.pray) return '今天已经静过一次了。';
  }
  return null;
}

// 房间：先看清楚代价，再决定做不做
function openRoom(spot) {
  const blocked = roomBlocked(spot);
  if (blocked) { ui.toast(blocked, 'warn'); return; }
  if (spot.pick) {
    ui.friendPanel(spot, state);
    ui.bindModal({
      pick: (el) => {
        const res = spot.pick === 'snooker'
          ? rules.snooker(state, el.dataset.npc)
          : rules.pingpong(state, el.dataset.npc);
        afterAction(res);
      },
      cancel: () => ui.closeModal(),
    });
    return;
  }
  ui.roomPanel(spot, state);
  ui.bindModal({
    go: () => {
      const fn = {
        course: rules.course,
        doubt: rules.doubt,
        studyroom: rules.studyroom,
        pray: rules.pray,
      }[spot.action];
      if (!fn) { ui.closeModal(); return; }
      afterAction(fn(state));
    },
    cancel: () => ui.closeModal(),
  });
}

function afterAction(res) {
  if (!res.ok) { ui.toast(res.msg, 'warn'); return; }
  ui.closeModal();
  ui.toast(res.msg);
  renderAll();
  save();
  if (state.ap <= 0) setTimeout(() => { if (state.phase === 'day') openNight(); }, 320);
}

// ---------------------------------------------------------------- 钢琴
function openPiano(spot) {
  const blocked = roomBlocked(spot);
  if (blocked) { ui.toast(blocked, 'warn'); return; }
  pianoState = { spot, notes: [], done: null };
  renderPiano();
}

function renderPiano() {
  ui.pianoPanel(pianoState.spot, pianoState.notes, state, pianoState.done);
  ui.bindModal({
    note: (el) => playNote(Number(el.dataset.note)),
    cancel: () => {
      pianoState = null;
      ui.closeModal();
      if (state.ap <= 0 && state.phase === 'day') openNight();
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
  indoor.keys.clear();
  pianoState = null;
  enterScene('campus');
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
  enterScene('campus');
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
  const eng = engine();
  eng.update(dt, active);
  if (scene === 'campus') {
    world.draw(state && state.phase === 'night');
  } else {
    indoor.draw();
  }
  if (active) ui.setNear(eng.near);
  else ui.setNear(null);
  requestAnimationFrame(frame);
}

function save() {
  if (!state) return;
  state.scene = scene;
  state.scenePos = scene === 'campus' ? null : indoor.pos;
  saveGame(state);
}

boot();
