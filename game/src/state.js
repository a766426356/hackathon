// state.js — 状态、派生数值、存读档。纯逻辑，除了 localStorage 之外不碰 DOM。

import { CONFIG } from '../data.js';
import { freshCalendar } from './calendar.js';
import { lootMult } from './loot.js';

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
    loot: [],
    lootCount: 0,
    lootHasRare: false,
    today: freshToday(),
    calendar: freshCalendar(),
    scene: 'campus',
    scenePos: null,
    gpa: null,
    ending: null,
    collapsedOnce: false,
    log: [],
    // 结局的人格报告靠这几个计数分轴：上课 / 交友 / 娱乐 / 自习 / 跑步 / 活动 / 夜战 / 夜读 / 躺平
    stats: {
      studies: 0, socials: 0, fights: 0, nights: 0,
      course: 0, talk: 0, play: 0, indoor: 0, field: 0, events: 0, nightStudy: 0, rest: 0,
    },
  };
}

// 心境只管白天收益；战利品里的 day 类在这里放大，所以它也会间接收紧/放松知识积累
export function moodMult(s) {
  return (0.5 + s.mood * 0.01) * (1 + lootMult(s, 'day'));
}

export function maxFriend(s) {
  return Math.max(0, ...Object.values(s.friend));
}

// 血量由体质决定，战利品的 hp 类在出口上放大
export function playerMaxHp(s) {
  const base = CONFIG.battle.playerBaseHp + Math.floor(s.physique * CONFIG.hpPerPhysique);
  return Math.floor(base * (1 + lootMult(s, 'hp')));
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
    if (s.today.zhe === undefined) s.today.zhe = false;
    if (s.physique === undefined) s.physique = CONFIG.startPhysique;
    // 旧档没有日历：补一份，过去的天会在下次翻页时被判成 missed（不扣分）
    if (!Array.isArray(s.calendar)) s.calendar = freshCalendar();
    if (!Array.isArray(s.loot)) s.loot = [];
    if (typeof s.lootCount !== 'number') s.lootCount = s.loot.length;
    if (s.lootHasRare === undefined) s.lootHasRare = s.loot.some((l) => l.rarity !== 'common');
    // 旧档缺的新计数补 0，人格报告才不会算出 NaN
    if (s.stats) {
      for (const k of ['studies', 'socials', 'fights', 'nights', 'course', 'talk', 'play', 'indoor', 'field', 'events', 'nightStudy', 'rest']) {
        if (typeof s.stats[k] !== 'number') s.stats[k] = 0;
      }
    }
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
