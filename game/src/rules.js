// rules.js — 行动结算 / 夜晚推进 / 考试。纯函数，可在 node 里直接跑（tests/sim.mjs 依赖）。

import { CONFIG, TOPICS, NPCS } from '../data.js';
import {
  clamp, clampMood, moodMult, maxFriend, examGpa, endingOf, nextRandom, hhLog, freshToday,
} from './state.js';

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
    if (existing.power >= 14) return '「' + topic.name + '」已经完全吃透了。';
    existing.power += 2;
    return '「' + topic.name + '」威力 +2。';
  }
  if (s.deck.length >= CONFIG.deckCap) return '笔记已经写满了，这张卡没地方放。';
  s.deck.push({ id: topic.id + '-' + s.deck.length, topic: topic.id, name: topic.name, power: topic.power });
  return '「' + topic.name + '」进了牌组。';
}

// ---------------------------------------------------------------- 白天行动
export function study(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  spendAp(s);
  const focus = s.focus;
  s.focus = false;
  const gain = Math.round(CONFIG.studyGain * moodMult(s) * (focus ? CONFIG.studyFocusMult : 1));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.studyMoodCost);
  s.stats.studies += 1;
  const cardMsg = gainCard(s);
  const msg = '在大课教室坐了一小时：知识 +' + gain + (focus ? '（专注加成）' : '') +
    '，心情 −' + CONFIG.studyMoodCost + '。' + cardMsg;
  hhLog(s, msg, 'study');
  return ok(msg);
}

export function board(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  if (s.today.board) return no('公告板今天已经看过了。');
  spendAp(s);
  s.today.board = true;
  addKnowledge(s, CONFIG.boardKnowledge);
  const ids = Object.keys(s.friend);
  const who = ids[Math.floor(nextRandom(s) * ids.length) % ids.length];
  s.friend[who] = clamp(s.friend[who] + CONFIG.boardFriend, 0, 100);
  s.mood = clampMood(s.mood - CONFIG.boardMoodCost);
  refreshSupport(s);
  const msg = '公告板上贴着今天的事：知识 +' + CONFIG.boardKnowledge + '，和' +
    NPCS[who].name + '搭上了话（友谊 +' + CONFIG.boardFriend + '），心情 −' + CONFIG.boardMoodCost + '。';
  hhLog(s, msg, 'board');
  return ok(msg);
}

export function social(s, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return no('这里没有人。');
  if (!hasAp(s)) return no('今天没有行动点了。');
  if (s.today.talked[npcId]) return no('今天已经和' + npc.name + '聊过了，再说就尬了。');
  spendAp(s);
  s.today.talked[npcId] = true;
  const gain = Math.round(CONFIG.socialGain * moodMult(s));
  s.friend[npcId] = clamp(s.friend[npcId] + gain, 0, 100);
  // 社交带来的快乐是递减的：心情越高，加成越少
  const moodUp = Math.max(2, Math.round(CONFIG.socialMood * (1 - s.mood / 120)));
  s.mood = clampMood(s.mood + moodUp);
  s.stats.socials += 1;
  const unlocked = refreshSupport(s);
  const msg = '和' + npc.name + '聊了一会儿：友谊 +' + gain + '（' + s.friend[npcId] + '），心情 +' +
    moodUp + '。' + (unlocked ? ' · 解锁支援卡：TA 会在夜战里帮你。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

export function field(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  spendAp(s);
  s.mood = clampMood(s.mood + CONFIG.fieldMood);
  s.focus = true;
  const msg = '在操场跑了两圈：心情 +' + CONFIG.fieldMood + '，获得「专注」（下次自习 ×' +
    CONFIG.studyFocusMult + '）。';
  hhLog(s, msg, 'field');
  return ok(msg);
}

export function rest(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  s.ap = 0;
  s.mood = clampMood(s.mood + CONFIG.restMood);
  const msg = '回宿舍躺下了：心情 +' + CONFIG.restMood + '，今天到此为止。';
  hhLog(s, msg, 'rest');
  return ok(msg);
}

function refreshSupport(s) {
  if (!s.supportUnlocked && maxFriend(s) >= CONFIG.friendSupportAt) {
    s.supportUnlocked = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- 室内房间
const num = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));
const R = CONFIG.room;

function inDay(s) {
  if (s.phase !== 'day') return no('现在不是白天。');
  if (!hasAp(s)) return no('今天没有行动点了。');
  return null;
}

function bumpFriend(s, npcId, amount) {
  s.friend[npcId] = clamp(s.friend[npcId] + amount, 0, 100);
  return refreshSupport(s);
}

// 3F 大课教室：就是原来的自习，数值不动（GPA 全靠它撑着）
export const course = study;

// 2F 自习室：安静但产不出卡片
export function studyroom(s) {
  const bad = inDay(s);
  if (bad) return bad;
  spendAp(s);
  addKnowledge(s, R.studyroom.know);
  s.mood = clampMood(s.mood + R.studyroom.mood);
  s.stats.studies += 1;
  const msg = '在自习室坐了一节：知识 +' + R.studyroom.know + '，心情 ' + num(R.studyroom.mood) +
    '。这里只能记，写不成卡片。';
  hhLog(s, msg, 'study');
  return ok(msg);
}

// 3F 答疑角：知识一点点，人情一点点
export function doubt(s) {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.doubt) return no('助教今天已经被围过一轮了，明天再来。');
  spendAp(s);
  s.today.doubt = true;
  addKnowledge(s, R.doubt.know);
  s.mood = clampMood(s.mood + R.doubt.mood);
  const ids = Object.keys(s.friend);
  const who = ids[Math.floor(nextRandom(s) * ids.length) % ids.length];
  const unlocked = bumpFriend(s, who, R.doubt.friend);
  const msg = '在答疑角问了两道题：知识 +' + R.doubt.know + '，心情 ' + num(R.doubt.mood) +
    '，顺便和' + NPCS[who].name + '说上话（友谊 +' + R.doubt.friend + '）。' +
    (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'study');
  return ok(msg);
}

// 1F 乒乓球：不挑人，谁来都能打
export function pingpong(s, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return no('这里没有人。');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.pingpong) return no('今天已经打过球了，胳膊抬不起来。');
  spendAp(s);
  s.today.pingpong = true;
  s.mood = clampMood(s.mood + R.pingpong.mood);
  const unlocked = bumpFriend(s, npcId, R.pingpong.friend);
  s.stats.socials += 1;
  const msg = '和' + npc.name + '打了两局：心情 +' + R.pingpong.mood + '，友谊 +' + R.pingpong.friend +
    '（' + s.friend[npcId] + '）。' + (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F 斯诺克：更亲近，但对方今天得还没跟你聊过
export function snooker(s, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return no('这里没有人。');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.talked[npcId]) return no(npc.name + '今天已经跟你聊过了，一局球也说不出更多东西。');
  spendAp(s);
  s.today.talked[npcId] = true;
  s.mood = clampMood(s.mood + R.snooker.mood);
  const unlocked = bumpFriend(s, npcId, R.snooker.friend);
  s.stats.socials += 1;
  const msg = '和' + npc.name + '打了一局斯诺克：心情 +' + R.snooker.mood + '，友谊 +' + R.snooker.friend +
    '（' + s.friend[npcId] + '）。' + (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F 钢琴：真的弹，弹够几个音才结算
export function piano(s, notes) {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.piano) return no('今天已经弹过了，再弹就成扰民了。');
  spendAp(s);
  s.today.piano = true;
  s.mood = clampMood(s.mood + R.piano.mood);
  const played = notes || R.piano.notes;
  const msg = '你在钢琴前按了 ' + played + ' 个音：心情 +' + R.piano.mood + '。';
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 3F 祷告室：只有撑不住的时候才进得去
export function pray(s) {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.mood > R.pray.moodMax) return no('心情还没低到那一步，坐着反而别扭（要 ≤ ' + R.pray.moodMax + '）。');
  if (s.today.pray) return no('今天已经静过一次了。');
  spendAp(s);
  s.today.pray = true;
  s.mood = clampMood(s.mood + R.pray.mood);
  const msg = '在祷告室坐了一会儿，没人来打扰：心情 +' + R.pray.mood + '。';
  hhLog(s, msg, 'info');
  return ok(msg);
}

// ---------------------------------------------------------------- 夜晚
export function nightStudy(s) {
  if (s.phase !== 'night') return no('现在不是晚上。');
  const gain = Math.round(CONFIG.nightStudyGain * moodMult(s));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.nightStudyMoodCost);
  s.stats.nights += 1;
  const msg = '在宿舍台灯下继续啃书：知识 +' + gain + '，心情 −' + CONFIG.nightStudyMoodCost + '。';
  hhLog(s, msg, 'night');
  return ok(msg);
}

export function settleBattle(s, battle) {
  s.stats.fights += 1;
  if (battle.result === 'win') {
    s.battleWins += 1;
    s.mood = clampMood(s.mood + CONFIG.winMood);
    addKnowledge(s, CONFIG.winKnowledge);
    const msg = '赢了。心情 +' + CONFIG.winMood + '，实战总结让知识 +' + CONFIG.winKnowledge + '。';
    hhLog(s, msg, 'win');
    return ok(msg);
  }
  s.mood = clampMood(s.mood - CONFIG.loseMood);
  addKnowledge(s, -CONFIG.loseKnowledge);
  const msg = '输了。心情 −' + CONFIG.loseMood + '，知识 −' + CONFIG.loseKnowledge + '。';
  hhLog(s, msg, 'lose');
  return ok(msg);
}

// 推进到下一天；第 7 天进入考试
export function endDay(s) {
  s.stats.nights += 1;
  const collapsed = s.mood <= CONFIG.moodMin;
  s.day += 1;
  s.today = freshToday();
  s.scene = 'campus';
  s.scenePos = null;
  s.ap = CONFIG.startAp;
  s.focus = false;

  if (collapsed) {
    s.collapsedOnce = true;
    s.mood = CONFIG.collapseMood;
    s.ap = CONFIG.collapseAp;
    hhLog(s, '心情见底，你崩了一次：第二天只剩 ' + CONFIG.collapseAp + ' 个行动点。', 'warn');
  }

  if (s.day >= s.maxDay) {
    s.phase = 'exam';
  } else {
    s.phase = 'day';
  }
  return collapsed;
}

export function runExam(s) {
  s.phase = 'exam';
  s.gpa = examGpa(s);
  s.ending = endingOf(s);
  s.phase = 'ending';
  hhLog(s, '期末成绩出来了：GPA ' + s.gpa.toFixed(2) + '。', 'exam');
  return s.gpa;
}
