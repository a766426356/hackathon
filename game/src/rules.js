// rules.js — action settlement / night progression / exam. Pure functions, runnable in node (tests/sim.mjs relies on it).

import { CONFIG, TOPICS, NPCS, ROOMMATE, LOOT, LOOT_WEIGHT } from '../data.js';
import {
  clamp, clampMood, moodMult, maxFriend, examGpa, endingOf, nextRandom, hhLog, freshToday, playerMaxHp,
} from './state.js';
import { activeEntry, expirePast, effectLine, placeOf } from './calendar.js';
import { lootEffectText, lootCapped } from './loot.js';

const KNOWN_CAP = 150;

function addKnowledge(s, amount) {
  s.knowledge = clamp(s.knowledge + amount, 0, KNOWN_CAP);
}

export function hasAp(s) {
  return s.phase === 'day' && s.ap > 0;
}

function spendAp(s) {
  if (!hasAp(s)) return false;
  s.ap -= 1;
  return true;
}

const ok = (msg) => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

function gainCard(s) {
  const topic = TOPICS[Math.floor(nextRandom(s) * TOPICS.length) % TOPICS.length];
  const existing = s.deck.find((c) => c.topic === topic.id);
  if (existing) {
    if (existing.power >= 14) return '"' + topic.name + '" is already fully mastered.';
    existing.power += 2;
    return '"' + topic.name + '" power +2.';
  }
  if (s.deck.length >= CONFIG.deckCap) return 'Notes are full; no room for this card.';
  s.deck.push({ id: topic.id + '-' + s.deck.length, topic: topic.id, name: topic.name, en: topic.en, power: topic.power });
  return '"' + topic.name + '" joined the deck.';
}

// ---------------------------------------------------------------- daytime actions
// 2 required lectures a day: they take no free Action Point, both merge into one full note page.
export function requiredCourses(s) {
  if (s.today.courses) return no('Required lectures are already done today.');
  s.today.courses = true;
  const n = CONFIG.requiredCourses;
  const gain = CONFIG.requiredCourseGain * n;
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.requiredCourseMoodCost * n);
  s.stats.studies += n;
  const cardMsg = gainCard(s);
  const msg = 'Both required lectures done: Knowledge +' + gain + ', Mood −' +
    CONFIG.requiredCourseMoodCost * n + '. ' + cardMsg;
  hhLog(s, msg, 'study');
  return ok(msg);
}

export function study(s) {
  if (!hasAp(s)) return no('No Action Points left today.');
  spendAp(s);
  const focus = s.focus;
  s.focus = false;
  const gain = Math.ceil(CONFIG.studyGain * moodMult(s) * (focus ? CONFIG.studyFocusMult : 1));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.studyMoodCost);
  s.stats.studies += 1;
  s.stats.course += 1;
  const cardMsg = gainCard(s);
  const msg = 'Sat in the Lecture Hall for an hour: Knowledge +' + gain + (focus ? ' (Focus bonus)' : '') +
    ', Mood −' + CONFIG.studyMoodCost + '. ' + cardMsg;
  hhLog(s, msg, 'study');
  return ok(msg);
}

export function board(s) {
  if (!hasAp(s)) return no('No Action Points left today.');
  if (s.today.board) return no('Already checked the Notice Board today.');
  spendAp(s);
  s.today.board = true;
  addKnowledge(s, CONFIG.boardKnowledge);
  const ids = Object.keys(s.friend);
  const who = ids[Math.floor(nextRandom(s) * ids.length) % ids.length];
  s.friend[who] = clamp(s.friend[who] + CONFIG.boardFriend, 0, 100);
  s.mood = clampMood(s.mood - CONFIG.boardMoodCost);
  refreshSupport(s);
  const msg = 'Notice Board says today: Knowledge +' + CONFIG.boardKnowledge + ', talked with ' +
    NPCS[who].name + ' (Friendship +' + CONFIG.boardFriend + '), Mood −' + CONFIG.boardMoodCost + '.';
  hhLog(s, msg, 'board');
  return ok(msg);
}

export function social(s, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return no('Nobody here.');
  if (!hasAp(s)) return no('No Action Points left today.');
  if (s.today.talked[npcId]) return no('Already talked with ' + npc.name + ' today. Again is just awkward.');
  spendAp(s);
  s.today.talked[npcId] = true;
  const gain = Math.ceil(CONFIG.socialGain * moodMult(s));
  s.friend[npcId] = clamp(s.friend[npcId] + gain, 0, 100);
  // Social joy has diminishing returns: the higher the Mood, the smaller the bonus
  const moodUp = Math.max(2, Math.round(CONFIG.socialMood * (1 - s.mood / 120)));
  s.mood = clampMood(s.mood + moodUp);
  s.stats.socials += 1;
  s.stats.talk += 1;
  const unlocked = refreshSupport(s);
  const msg = 'Chatted with ' + npc.name + ': Friendship +' + gain + ' (' + s.friend[npcId] + '), Mood +' +
    moodUp + '. ' + (unlocked ? ' · Support card unlocked: they help at night.' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// Field: Hurdles minigame settlement. Defaults to win; sim calls it with no outcome, values unchanged.
export function field(s, outcome = 'win') {
  if (!hasAp(s)) return no('No Action Points left today.');
  spendAp(s);
  const win = outcome === 'win';
  const draw = outcome === 'draw';
  const mood = win ? CONFIG.fieldMood : draw ? Math.round(CONFIG.fieldMood / 2) : 4;
  const phys = win ? CONFIG.fieldPhysique : draw ? Math.round(CONFIG.fieldPhysique / 2) : 1;
  s.mood = clampMood(s.mood + mood);
  s.physique = clamp(s.physique + phys, 0, CONFIG.physiqueCap);
  if (win) s.focus = true;
  s.stats.field += 1;
  const label = win ? 'took first' : draw ? 'mid pack' : 'lapped once';
  const msg = 'Hurdles (' + label + '): Mood +' + mood + ', Physique +' + phys +
    (win ? ', earned "Focus" (next study ×' + CONFIG.studyFocusMult + ')' : '') + '.';
  hhLog(s, msg, 'field');
  return ok(msg);
}

export function rest(s) {
  if (!hasAp(s)) return no('No Action Points left today.');
  s.ap = 0;
  s.mood = clampMood(s.mood + CONFIG.restMood);
  s.stats.rest += 1;
  const msg = 'Down on the bed: Mood +' + CONFIG.restMood + ', done for today.';
  hhLog(s, msg, 'rest');
  return ok(msg);
}

// B1 Gym: reaction minigame settlement. One success a day; failing still pays a little (you did move)
export function gym(s, outcome = 'win') {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.gym) return no('Already trained today; muscles still sore.');
  spendAp(s);
  s.today.gym = true;
  const win = outcome === 'win';
  const R = CONFIG.room.gym;
  const mood = win ? R.mood : R.loseMood;
  const phys = win ? R.physique : R.losePhysique;
  s.mood = clampMood(s.mood + mood);
  s.physique = clamp(s.physique + phys, 0, CONFIG.physiqueCap);
  s.stats.field += 1;
  const msg = (win ? 'Lifted the barbell' : 'Last set gave out') + ': Mood ' + num(mood) +
    ', Physique +' + phys + ' (max HP ' + playerMaxHp(s) + ').';
  hhLog(s, msg, 'field');
  return ok(msg);
}

// The bed in your room is the old rest, just somewhere else
export const bed = rest;

// Roommate: no stats, no friendship bar, just one useful line about your current state.
// nextRandom is avoided on purpose — intel must not shift the random sequence or same-seed replays break.
function roomieTip(s) {
  const ev = activeEntry(s);
  if (ev) {
    const p = placeOf(ev);
    return 'Today: "' + ev.title + '", at ' + (p ? p.name : 'campus') + '. ' +
      effectLine(ev) + ', costs ' + ev.ap + ' AP.';
  }
  if (s.day >= s.maxDay - 1) return 'Final Exam tomorrow. Do not push tonight; if you cannot win, just study.';
  if (!s.deck.length) return 'Your deck is empty. Sit in one lecture on CDS-1 3F; you need one card that hits.';
  if (playerMaxHp(s) < 42) return 'Too fragile today, ' + playerMaxHp(s) + ' HP. Lap the field: Physique up, max HP follows.';
  if (s.mood < 30) return 'You look off. The Prayer Room on Wenyu 3F only opens once Mood drops that low.';
  if (examGpa(s) >= CONFIG.endingGreat && s.battleWins >= CONFIG.endingGreatWins) return 'Score and wins are enough; just hold steady.';
  if (s.mood < 50) return 'Mood this low, studying is wasted. Play the Piano in Wenyu, or shoot a few games.';
  return 'Want to survive the night: field. Want score: the building. Not both, a day has only 3 AP.';
}

export function roomieTalk(s) {
  if (s.phase !== 'day') return no('Not the time to talk.');
  if (s.today.zhe) return no(ROOMMATE.name + ' has his headphones on. Do not bother him.');
  s.today.zhe = true;
  const msg = ROOMMATE.name + ': ' + roomieTip(s);
  hhLog(s, msg, 'info');
  return ok(msg);
}

function refreshSupport(s) {
  if (!s.supportUnlocked && maxFriend(s) >= CONFIG.friendSupportAt) {
    s.supportUnlocked = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- indoor rooms
const num = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));
const R = CONFIG.room;

function inDay(s) {
  if (s.phase !== 'day') return no('It is not daytime.');
  if (!hasAp(s)) return no('No Action Points left today.');
  return null;
}

function bumpFriend(s, npcId, amount) {
  s.friend[npcId] = clamp(s.friend[npcId] + amount, 0, 100);
  return refreshSupport(s);
}

// 3F Lecture Hall: the old study action, numbers unchanged (GPA rests on it)
export const course = study;

// 2F Study Room: quiet, but produces no cards
export function studyroom(s) {
  const bad = inDay(s);
  if (bad) return bad;
  spendAp(s);
  addKnowledge(s, R.studyroom.know);
  s.mood = clampMood(s.mood + R.studyroom.mood);
  s.stats.studies += 1;
  s.stats.indoor += 1;
  const msg = 'Sat a session in the Study Room: Knowledge +' + R.studyroom.know + ', Mood ' + num(R.studyroom.mood) +
    '. Notes only, no cards.';
  hhLog(s, msg, 'study');
  return ok(msg);
}

// 3F Help Desk: a little Knowledge, a little goodwill
export function doubt(s) {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.doubt) return no('The TA was mobbed once today. Come back tomorrow.');
  spendAp(s);
  s.today.doubt = true;
  addKnowledge(s, R.doubt.know);
  s.mood = clampMood(s.mood + R.doubt.mood);
  s.stats.indoor += 1;
  const ids = Object.keys(s.friend);
  const who = ids[Math.floor(nextRandom(s) * ids.length) % ids.length];
  const unlocked = bumpFriend(s, who, R.doubt.friend);
  const msg = 'Two questions at the Help Desk: Knowledge +' + R.doubt.know + ', Mood ' + num(R.doubt.mood) +
    ', plus some talk with ' + NPCS[who].name + ' (Friendship +' + R.doubt.friend + ').' +
    (unlocked ? ' · Support card unlocked.' : '');
  hhLog(s, msg, 'study');
  return ok(msg);
}

// 1F Table Tennis: a real game, settled on the minigame result
export function pingpong(s, npcId, outcome = 'win') {
  const npc = NPCS[npcId];
  if (!npc) return no('Nobody here.');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.pingpong) return no('Already played today; arms will not lift.');
  const win = outcome === 'win';
  const draw = outcome === 'draw';
  const mood = win ? R.pingpong.mood : draw ? R.pingpong.drawMood : R.pingpong.loseMood;
  const friend = win ? R.pingpong.friend : draw ? R.pingpong.drawFriend : R.pingpong.loseFriend;
  spendAp(s);
  s.today.pingpong = true;
  s.mood = clampMood(s.mood + mood);
  const unlocked = bumpFriend(s, npcId, friend);
  s.stats.socials += 1;
  s.stats.play += 1;
  const label = win ? 'you won' : draw ? 'a draw' : 'you lost';
  const msg = 'Table Tennis with ' + npc.name + ' (' + label + '): Mood +' + mood +
    ', Friendship +' + friend + ' (' + s.friend[npcId] + ').' + (unlocked ? ' · Support card unlocked.' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F Snooker: a real game, closer bond, but only if they have not talked to you today
export function snooker(s, npcId, outcome = 'win') {
  const npc = NPCS[npcId];
  if (!npc) return no('Nobody here.');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.talked[npcId]) return no(npc.name + ' already talked with you today; a game adds nothing.');
  const win = outcome === 'win';
  const draw = outcome === 'draw';
  const mood = win ? R.snooker.mood : draw ? R.snooker.drawMood : R.snooker.loseMood;
  const friend = win ? R.snooker.friend : draw ? R.snooker.drawFriend : R.snooker.loseFriend;
  spendAp(s);
  s.today.talked[npcId] = true;
  s.mood = clampMood(s.mood + mood);
  const unlocked = bumpFriend(s, npcId, friend);
  s.stats.socials += 1;
  s.stats.play += 1;
  const label = win ? 'you won' : draw ? 'a draw' : 'you lost';
  const msg = 'Snooker with ' + npc.name + ' (' + label + '): Mood +' + mood +
    ', Friendship +' + friend + ' (' + s.friend[npcId] + ').' + (unlocked ? ' · Support card unlocked.' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F Piano: play as long as you like, only the first full run of the day settles
export function piano(s, notes) {
  if (s.phase !== 'day') return no('It is not daytime.');
  if (s.today.piano) return no('Already played your fill today. Keep playing, it is free.');
  if (!hasAp(s)) return no('No Action Points left. Play freely, it will not count today.');
  spendAp(s);
  s.today.piano = true;
  s.mood = clampMood(s.mood + R.piano.mood);
  s.stats.play += 1;
  const played = notes || R.piano.notes;
  const msg = 'You played ' + played + ' notes at the Piano: Mood +' + R.piano.mood + '.';
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 3F Prayer Room: only enter when you cannot hold up
export function pray(s) {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.mood > R.pray.moodMax) return no('Mood is not that low yet; sitting here feels wrong (needs ≤ ' + R.pray.moodMax + ').');
  if (s.today.pray) return no('Already sat in silence today.');
  spendAp(s);
  s.today.pray = true;
  s.mood = clampMood(s.mood + R.pray.mood);
  const msg = 'Sat a while in the Prayer Room, no one came: Mood +' + R.pray.mood + '.';
  hhLog(s, msg, 'info');
  return ok(msg);
}

// ---------------------------------------------------------------- calendar events
// Events are not done in rooms: the campus gains a departure spot that day; walk there to start.
// Each event mixes the three stats differently, at different sizes — the panel spells it out.
export function doEvent(s, entry) {
  if (!entry) return no('Nothing on the schedule today.');
  if (entry.done) return no('"' + entry.title + '" is already done.');
  if (entry.missed) return no('"' + entry.title + '" has expired.');
  if (entry.day !== s.day) return no('That is not today.');
  if (s.phase !== 'day') return no('It is not daytime.');
  if (s.ap < entry.ap) return no('Not enough AP: "' + entry.title + '" costs ' + entry.ap + ' AP.');
  s.ap -= entry.ap;
  entry.done = true;

  addKnowledge(s, entry.know);
  if (entry.mood) s.mood = clampMood(s.mood + entry.mood);
  if (entry.physique) s.physique = clamp(s.physique + entry.physique, 0, CONFIG.physiqueCap);
  s.stats.events += 1;

  const msg = '"' + entry.title + '": ' + effectLine(entry) + '.';
  hhLog(s, msg, 'event');
  return ok(msg);
}

// ---------------------------------------------------------------- night
export function nightStudy(s) {
  if (s.phase !== 'night') return no('It is not night.');
  const gain = Math.ceil(CONFIG.nightStudyGain * moodMult(s));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.nightStudyMoodCost);
  s.stats.nights += 1;
  s.stats.nightStudy += 1;
  const msg = 'Kept reading under the desk lamp in the Dormitory: Knowledge +' + gain + ', Mood −' + CONFIG.nightStudyMoodCost + '.';
  hhLog(s, msg, 'night');
  return ok(msg);
}

// Winning drops one random item. One of the first three drops is a rare or better —
// a run has only 6 chances, so variance has to stay down or unlucky players pick commons all game.
export function rollLoot(s) {
  const needRare = s.lootCount === 2 && !s.lootHasRare;
  const pool = needRare ? LOOT.filter((l) => l.rarity !== 'common') : LOOT;
  const weights = pool.map((l) => LOOT_WEIGHT[l.rarity] || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = nextRandom(s) * total;
  let picked = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) { picked = pool[i]; break; }
  }
  const item = {
    id: picked.id, name: picked.name, en: picked.en, kind: picked.kind,
    value: picked.value, rarity: picked.rarity,
  };
  s.loot.push(item);
  s.lootCount += 1;
  if (picked.rarity !== 'common') s.lootHasRare = true;
  return item;
}

export function settleBattle(s, battle) {
  s.stats.fights += 1;
  if (battle.result === 'win') {
    s.battleWins += 1;
    s.mood = clampMood(s.mood + CONFIG.winMood);
    addKnowledge(s, CONFIG.winKnowledge);
    const item = rollLoot(s);
    const capped = lootCapped(s, item.kind) ? ' (this category is maxed out)' : '';
    const msg = 'Won. Mood +' + CONFIG.winMood + ', the debrief gives Knowledge +' + CONFIG.winKnowledge +
      '. Dropped "' + item.name + '": ' + lootEffectText(item) + capped + '.';
    hhLog(s, msg, 'win');
    return { ok: true, msg, loot: item };
  }
  s.mood = clampMood(s.mood - CONFIG.loseMood);
  addKnowledge(s, -CONFIG.loseKnowledge);
  const msg = 'Lost. Mood −' + CONFIG.loseMood + ', Knowledge −' + CONFIG.loseKnowledge + '.';
  hhLog(s, msg, 'lose');
  return ok(msg);
}

// Advance to the next day; day 7 goes to the exam
export function endDay(s) {
  s.stats.nights += 1;
  const collapsed = s.mood <= CONFIG.moodMin;
  s.day += 1;
  s.today = freshToday();
  s.ap = CONFIG.freeAp;
  s.focus = false;

  if (collapsed) {
    s.collapsedOnce = true;
    s.mood = CONFIG.collapseMood;
    s.ap = CONFIG.collapseAp;
    hhLog(s, 'Mood bottomed out, you collapsed once: tomorrow leaves only ' + CONFIG.collapseAp + ' free Action Points.', 'warn');
  }

  // Yesterday's skipped events get struck out today. Just a note, no penalty (penalties wait for the ddl).
  for (const e of expirePast(s)) {
    hhLog(s, 'Missed "' + e.title + '"; struck off the schedule.', 'warn');
  }

  if (s.day >= s.maxDay) {
    s.phase = 'exam';
  } else {
    s.phase = 'day';
    requiredCourses(s); // new day: run both required lectures for the player first
  }
  return collapsed;
}

export function runExam(s) {
  s.phase = 'exam';
  s.gpa = examGpa(s);
  s.ending = endingOf(s);
  s.phase = 'ending';
  hhLog(s, 'Final Exam results are in: GPA ' + s.gpa.toFixed(2) + '.', 'exam');
  return s.gpa;
}
