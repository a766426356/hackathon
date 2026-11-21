// state.js — state, derived values, save/load. Pure logic; touches nothing but localStorage.

import { CONFIG } from '../data.js';
import { freshCalendar } from './calendar.js';
import { lootMult } from './loot.js';

export const SAVE_KEY = 'zjxy.save.v4';
export const SAVE_VERSION = 4;

// the daily "used it today?" reset: defined once, used by both new games and day turns.
export function freshToday() {
  return {
    talked: { lin: false, chen: false, zhou: false },
    board: false,
    doubt: false,
    pingpong: false,
    piano: false,
    pray: false,
    courses: false, // whether today's 2 required lectures were settled
    zhe: false,     // whether you asked your roommate today
    gym: false,     // whether you trained today
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampMood(m) {
  return clamp(Math.round(m), CONFIG.moodMin, CONFIG.moodMax);
}

// xorshift32: the state is a single number, so it saves straight into the file
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
    // the ending persona report splits on these counters: class / social / play / study / run / events / night fights / night study / lying flat
    stats: {
      studies: 0, socials: 0, fights: 0, nights: 0,
      course: 0, talk: 0, play: 0, indoor: 0, field: 0, events: 0, nightStudy: 0, rest: 0,
    },
  };
}

// mood only governs daytime gains; loot of the day kind is amplified here, so it also tightens/loosens knowledge gain indirectly
export function moodMult(s) {
  return (0.5 + s.mood * 0.01) * (1 + lootMult(s, 'day'));
}

export function maxFriend(s) {
  return Math.max(0, ...Object.values(s.friend));
}

// HP comes from physique; loot of the hp kind is amplified at the output
export function playerMaxHp(s) {
  const base = CONFIG.battle.playerBaseHp + Math.floor(s.physique * CONFIG.hpPerPhysique);
  return Math.floor(base * (1 + lootMult(s, 'hp')));
}

// panel breakdown: how much of GPA comes from knowledge, how much from mood
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
  } catch (e) { /* ignore in private mode */ }
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
    if (s.today.gym === undefined) s.today.gym = false;
    if (s.physique === undefined) s.physique = CONFIG.startPhysique;
    // old saves have no calendar: add one, past days get marked missed on the next turn (no penalty)
    if (!Array.isArray(s.calendar)) s.calendar = freshCalendar();
    if (!Array.isArray(s.loot)) s.loot = [];
    if (typeof s.lootCount !== 'number') s.lootCount = s.loot.length;
    if (s.lootHasRare === undefined) s.lootHasRare = s.loot.some((l) => l.rarity !== 'common');
    // fill new counters missing from old saves with 0, so the persona report never produces NaN
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
