// state.js — 状态、派生数值、存读档。纯逻辑，除了 localStorage 之外不碰 DOM。

import { CONFIG } from '../data.js';

export const SAVE_KEY = 'zjxy.save.v4';
export const SAVE_VERSION = 4;

// 每天重置的「今天用过了没」：一处定义，创建存档和翻页都用它。
export function freshToday() {
  return {
    talked: { lin: false, chen: false, zhou: false },
    board: false,
    doubt: false,
    pingpong: false,
    piano: false,
    pray: false,
    courses: false, // 今天的 2 节必修课结算过没有
    zhe: false,     // 今天问过室友没有
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampMood(m) {
  return clamp(Math.round(m), CONFIG.moodMin, CONFIG.moodMax);
}

// xorshift32：状态是一个数字，可以直接存进存档里
export function nextRandom(state) {
  let s = state.rngState >>> 0;
  s ^= s << 13; s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5; s >>>= 0;
  state.rngState = s || 0x9e3779b9;
  return state.rngState / 4294967296;
}

export function pick(state, arr) {
  return arr[Math.floor(nextRandom(state) * arr.length) % arr.length];
}

export function createState(seed) {
  const s0 = (seed === undefined ? Math.floor(Math.random() * 0xffffffff) : seed) >>> 0;
  return {
    version: SAVE_VERSION,
    seed: s0,
    rngState: s0 || 0x9e3779b9,
    day: 1,
    maxDay: CONFIG.maxDay,
    phase: 'day', // day | night | exam | ending
    ap: CONFIG.freeAp,
    mood: CONFIG.startMood,
    knowledge: 0,
    physique: CONFIG.startPhysique,
    friend: { lin: 0, chen: 0, zhou: 0 },
    deck: [],
    supportUnlocked: false,
    focus: false,
    battleWins: 0,
    today: freshToday(),
    scene: 'campus',
    scenePos: null,
    gpa: null,
    ending: null,
    collapsedOnce: false,
    log: [],
    stats: { studies: 0, socials: 0, fights: 0, nights: 0 },
  };
}

export function moodMult(s) {
  return 0.5 + s.mood * 0.01;
}

export function maxFriend(s) {
  return Math.max(0, ...Object.values(s.friend));
}

// 血量只由体质决定：知识管伤害、心境管白天收益，三件事互不重叠
export function playerMaxHp(s) {
  return CONFIG.battle.playerBaseHp + Math.floor(s.physique * CONFIG.hpPerPhysique);
}

// 面板用的分项：GPA 里知识贡献多少、心境贡献多少
export function examParts(s) {
  return {
    base: CONFIG.examBase,
    knowledge: 3 * (s.knowledge / CONFIG.examKnowledgeDiv),
    mood: ((s.mood - 50) / 100) * CONFIG.examMoodScale,
  };
}

export function examGpa(s) {
  const p = examParts(s);
  const raw = p.base + p.knowledge + p.mood;
  return Math.round(clamp(raw, 0, CONFIG.gpaMax) * 100) / 100;
}

export function endingOf(s) {
  if (s.gpa >= CONFIG.endingGreat && s.battleWins >= CONFIG.endingGreatWins) return 'great';
  if (s.gpa >= CONFIG.endingPass) return 'pass';
  return 'warn';
}

export function saveGame(s) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) { /* 隐私模式下忽略 */ }
}

export function loadGame() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    if (!s.today) s.today = freshToday();
    if (s.today.courses === undefined) s.today.courses = false;
    if (s.physique === undefined) s.physique = CONFIG.startPhysique;
    if (!s.scene) s.scene = 'campus';
    return s;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

export function hhLog(s, text, kind = 'info') {
  s.log.push({ day: s.day, text, kind });
  if (s.log.length > 80) s.log.shift();
}
