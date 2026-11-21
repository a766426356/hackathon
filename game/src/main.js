// main.js — boot, input, scene and phase state machine. Game rules live in rules.js / battle.js.

import { INTERACTABLES, CONFIG, CAMPUS, MAP_W, MAP_H, NPCS } from '../data.js';
import {
  createState, loadGame, saveGame, clearSave,
} from './state.js';
import * as rules from './rules.js';
import * as battle from './battle.js';
import * as ui from './ui.js';
import { showTitleScreen } from './intro.js';
import { toggleLang, langLabel } from './i18n.js';
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
let battlePct = null; // last frame's HP bar percentage, for the bar animation
let started = false;
let lastTs = 0;

// No interior scenes any more: always on campus, entering a building just opens a panel

const canvas = document.getElementById('game');

// Campus interactables = fixed spots + today's calendar departure spot (at most one a day)
function campusSpots() {
  return state ? INTERACTABLES.concat(eventSpots(state)) : INTERACTABLES;
}

const CAMPUS_FRAME = { w: CAMPUS.w, h: CAMPUS.h, half: 0 };

// After an event is done or the day flips, that departure spot must vanish or move
function refreshCampusSpots() {
  const list = campusSpots();
  world.setSpots(list);
  ui.setSpots(list, CAMPUS_FRAME);
}

// ---------------------------------------------------------------- boot
function boot() {
  ui.initUI();
  fitCanvas();
  world = createWorld(canvas);
  ui.setSpots(INTERACTABLES, CAMPUS_FRAME);
  ui.setSceneChip('Campus');
  ui.onMarkerClick(onMarkerClick);
  document.getElementById('btn-endday').addEventListener('click', () => {
    if (!started || !state || state.phase !== 'day') return;
    openNight();
  });
  document.getElementById('btn-char').addEventListener('click', () => {
    if (!started || !state) return;
    openCharacter();
  });

  // Language switch. setLang writes localStorage and reloads, so every render path
  // runs once in the new language and nothing can be left half-translated.
  const langBtn = document.getElementById('btn-lang');
  if (langBtn) {
    langBtn.textContent = langLabel();
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLang();
    });
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => world.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => world.keys.clear());

  const hasSave = !!loadGame();
  // Demo shortcut: ?demo=ending goes straight to the ending + persona report, skipping six nights
  if (new URLSearchParams(location.search).get('demo') === 'ending') {
    demoEnding();
    requestAnimationFrame(frame);
    return;
  }
  requestAnimationFrame(frame);

  // Opening: title screen → 3D flip. The campus renders underneath the whole time, so when the flip lands
  // you see the main screen itself; the welcome card (introPanel) follows the flip.
  showTitleScreen().then(() => {
    ui.introPanel(hasSave);
    ui.bindModal({
      start: () => startNew(),
      resume: () => resume(),
    });
  });
}

// Demo / acceptance only: run six days on a fixed schedule, then stop on the ending page.
// The schedule is deliberately "like a normal player": class, play, events, a few laps, two fights,
// so all four persona axes have data and none sit at their defaults.
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
  rules.requiredCourses(state); // both required lectures for day 1
  refreshCampusSpots();
  renderAll();
  save();
  ui.toast('Day 1 required lectures done: ' + CONFIG.freeAp + ' free Action Points left.');
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
    // Reloaded while stuck on night: offer the night choice again instead of hanging
    state.phase = 'day';
    renderAll();
    openNight();
    return;
  }
  renderAll();
  if (state.ap <= 0) openNight();
}

// ---------------------------------------------------------------- entering buildings
// Campus is the only scene: press E at a building door for the elevator panel, then floor, room, confirm.
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
  // Single-floor buildings (the Dormitory) open the room itself, no elevator first
  if (b.floors.length <= 1) {
    openFloor(b, b.floors[0].level);
    return;
  }
  openElevator(b, null);
}

// Elevator panel: list this building's floors
function openElevator(building, currentLevel) {
  world.keys.clear();
  ui.elevatorPanel(building, currentLevel);
  ui.bindModal({
    floor: (el) => openFloor(building, Number(el.dataset.level)),
    cancel: () => ui.closeModal(),
  });
}

// One floor: turn its rooms into options
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
      // The three free actions open their panel directly, no "Start" confirmation
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

// ---------------------------------------------------------------- input
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
    ui.toast('Walk up to "' + item.name + '" first, then interact.', 'warn');
    return;
  }
  interact(item);
}

function tryInteract() {
  if (!started || !state || state.phase !== 'day') return;
  if (!world.near) {
    ui.toast('Nothing to interact with nearby. Get closer.', 'warn');
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
  else res = { ok: false, msg: 'Nothing here.' };

  afterAction(res);
}

// Field: Hurdles minigame. Ready screen (backed by assets/bg/field.jpg) → run → settle, then back to campus.
// The earlier "confirm panel first" step is folded in: screen one is that confirm + ready screen.
function openFieldRun() {
  if (!state || state.phase !== 'day') return;
  if (state.ap <= 0) { ui.toast('No Action Points left today.', 'warn'); return; }
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

// B1 Gym: reaction minigame, settled the same way
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

// Can this room be used now? Say why on the spot instead of opening a dead panel
function roomBlocked(room) {
  const a = room.action;
  // Piano costs no AP and never locks: play anytime, only the first full run of the day settles
  if (a === 'piano') return null;
  // The three free actions work anytime
  if (!room.ap) return null;
  if (state.ap <= 0) return 'no Action Points';
  if (a === 'doubt' && state.today.doubt) return 'used today';
  if (a === 'pingpong' && state.today.pingpong) return 'played today';
  if (a === 'gym' && state.today.gym) return 'trained today';
  if (a === 'pray') {
    if (state.mood > CONFIG.room.pray.moodMax) return 'Mood above ' + CONFIG.room.pray.moodMax;
    if (state.today.pray) return 'already sat today';
  }
  return null;
}

// Room: see the cost first, then decide
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

// After settling, back to this floor's options for the next action
function afterAction(res, building, floor) {
  if (!res.ok) { ui.toast(res.msg, 'warn'); return; }
  ui.toast(res.msg);
  refreshCampusSpots(); // event done, so that campus departure spot must disappear
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

// ---------------------------------------------------------------- piano
// Play freely: only the first full N notes each day costs 1 AP and settles Mood.
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

// ---------------------------------------------------------------- tables
// Play the minigame first, settle on the result; quitting midway costs no AP.
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

// ---------------------------------------------------------------- read-only panels
// The Desk and the sidebar "Character" button open the same panel: read-only, no AP, no state change.
// force is for "clicking the Desk inside a floor panel", where a modal is already open.
// onClose returns to that floor instead of kicking you back to campus.
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

// Calendar events: see what the three stats pay first, then decide
function openEvent(entry) {
  if (!entry) return;
  if (entry.done) { ui.toast('"' + entry.title + '" is already done today.', 'warn'); return; }
  world.keys.clear();
  ui.eventPanel(entry, state);
  ui.bindModal({
    go: () => afterAction(rules.doEvent(state, entry)),
    cancel: () => ui.closeModal(),
  });
}

// ---------------------------------------------------------------- night
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
  ui.battlePanel(state, battleState, battlePct); // pass the last frame so the bar drains, not jumps
  battlePct = cur;
  ui.bindModal({ card: onPlayCard, done: onBattleDone });
  ui.renderHUD(state);
}

function onPlayCard(idx) {
  if (!battleState || battleState.over) return;
  const fx = battle.playCard(state, battleState, idx);
  // Settle as soon as the fight ends, so the result screen can show the drop without a "Done" click
  if (battleState.over && !battleState.settled) {
    battleState.settled = true;
    battleState.reward = rules.settleBattle(state, battleState);
  }
  renderBattle(); // rebuild the panel first so the shake lands on fresh nodes
  ui.hitFx(fx.dealt, fx.taken);
  if (battleState.over) {
    const win = battleState.result === 'win';
    setTimeout(() => ui.outcomeFx(win), 260); // let this hit's shake finish before the result feedback
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
  refreshCampusSpots(); // new day: swap in today's event departure spot
  renderAll();
  save();
  ui.toast('Day ' + state.day + '. Both required lectures done, ' + state.ap + ' free AP left.');
  if (state.ap <= 0) openNight();
}

// ---------------------------------------------------------------- exam / ending
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

// After the ending, "Generate my HKUTI report": translucent panel over the same campus
function showPersona() {
  ui.personaPanel(state);
  ui.bindModal({ back: showEnding, restart: startNew });
  ui.renderAll(state);
}

// ---------------------------------------------------------------- render loop
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
