// rules.js — 行动结算 / 夜晚推进 / 考试。纯函数，可在 node 里直接跑（tests/sim.mjs 依赖）。

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
    if (existing.power >= 14) return '「' + topic.name + '」已经完全吃透了。';
    existing.power += 2;
    return '「' + topic.name + '」威力 +2。';
  }
  if (s.deck.length >= CONFIG.deckCap) return '笔记已经写满了，这张卡没地方放。';
  s.deck.push({ id: topic.id + '-' + s.deck.length, topic: topic.id, name: topic.name, en: topic.en, power: topic.power });
  return '「' + topic.name + '」进了牌组。';
}

// ---------------------------------------------------------------- 白天行动
// 每天 2 节必修大课：不占自由行动点，两节合成一页完整笔记（所以牌组不会因为天数翻倍而爆掉）
export function requiredCourses(s) {
  if (s.today.courses) return no('今天的必修课已经上完了。');
  s.today.courses = true;
  const n = CONFIG.requiredCourses;
  const gain = CONFIG.requiredCourseGain * n;
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.requiredCourseMoodCost * n);
  s.stats.studies += n;
  const cardMsg = gainCard(s);
  const msg = '必修的两节课上完了：知识 +' + gain + '，心境 −' +
    CONFIG.requiredCourseMoodCost * n + '。' + cardMsg;
  hhLog(s, msg, 'study');
  return ok(msg);
}

export function study(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  spendAp(s);
  const focus = s.focus;
  s.focus = false;
  const gain = Math.ceil(CONFIG.studyGain * moodMult(s) * (focus ? CONFIG.studyFocusMult : 1));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.studyMoodCost);
  s.stats.studies += 1;
  s.stats.course += 1;
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
  const gain = Math.ceil(CONFIG.socialGain * moodMult(s));
  s.friend[npcId] = clamp(s.friend[npcId] + gain, 0, 100);
  // 社交带来的快乐是递减的：心情越高，加成越少
  const moodUp = Math.max(2, Math.round(CONFIG.socialMood * (1 - s.mood / 120)));
  s.mood = clampMood(s.mood + moodUp);
  s.stats.socials += 1;
  s.stats.talk += 1;
  const unlocked = refreshSupport(s);
  const msg = '和' + npc.name + '聊了一会儿：友谊 +' + gain + '（' + s.friend[npcId] + '），心境 +' +
    moodUp + '。' + (unlocked ? ' · 解锁支援卡：TA 会在夜战里帮你。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 操场：跨栏小游戏结算。默认 win，sim 里不带参数调用，数值不变。
export function field(s, outcome = 'win') {
  if (!hasAp(s)) return no('今天没有行动点了。');
  spendAp(s);
  const win = outcome === 'win';
  const draw = outcome === 'draw';
  const mood = win ? CONFIG.fieldMood : draw ? Math.round(CONFIG.fieldMood / 2) : 4;
  const phys = win ? CONFIG.fieldPhysique : draw ? Math.round(CONFIG.fieldPhysique / 2) : 1;
  s.mood = clampMood(s.mood + mood);
  s.physique = clamp(s.physique + phys, 0, CONFIG.physiqueCap);
  if (win) s.focus = true;
  s.stats.field += 1;
  const label = win ? '跑了第一名' : draw ? '跑了个中间' : '被套了一圈';
  const msg = '跨栏（' + label + '）：心境 +' + mood + '，体质 +' + phys +
    (win ? '，获得「专注」（下次自习 ×' + CONFIG.studyFocusMult + '）' : '') + '。';
  hhLog(s, msg, 'field');
  return ok(msg);
}

export function rest(s) {
  if (!hasAp(s)) return no('今天没有行动点了。');
  s.ap = 0;
  s.mood = clampMood(s.mood + CONFIG.restMood);
  s.stats.rest += 1;
  const msg = '躺到床上：心境 +' + CONFIG.restMood + '，今天到此为止。';
  hhLog(s, msg, 'rest');
  return ok(msg);
}

// B1 健身房：反应小游戏结算。成功一次记一天，失败也给一点（毕竟真的动了）
export function gym(s, outcome = 'win') {
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.gym) return no('今天已经练过了，肌肉还酸着。');
  spendAp(s);
  s.today.gym = true;
  const win = outcome === 'win';
  const R = CONFIG.room.gym;
  const mood = win ? R.mood : R.loseMood;
  const phys = win ? R.physique : R.losePhysique;
  s.mood = clampMood(s.mood + mood);
  s.physique = clamp(s.physique + phys, 0, CONFIG.physiqueCap);
  s.stats.field += 1;
  const msg = (win ? '把杠铃举起来了' : '最后一组没撑住') + '：心境 ' + num(mood) +
    '，体质 +' + phys + '（血量上限 ' + playerMaxHp(s) + '）。';
  hhLog(s, msg, 'field');
  return ok(msg);
}

// 寝室的床就是原来的 rest，只是换了个地方
export const bed = rest;

// 室友：不产数值、不进友谊条，只根据你现在的状态说一句有用的话。
// 刻意不用 nextRandom —— 情报不应该改动随机序列，否则同 seed 复现会被它影响。
function roomieTip(s) {
  const ev = activeEntry(s);
  if (ev) {
    const p = placeOf(ev);
    return '今天有「' + ev.title + '」，在' + (p ? p.name : '校园') + '。' +
      effectLine(ev) + '，要 ' + ev.ap + ' 点。';
  }
  if (s.day >= s.maxDay - 1) return '明天就期末了。今晚别硬撑，打不过就选深造。';
  if (!s.deck.length) return '你牌组是空的。去 CDS-1 三楼坐一节课，至少有一张能打的。';
  if (playerMaxHp(s) < 42) return '你今天太脆了，' + playerMaxHp(s) + ' 点血。体育场跑两圈能长体质，血量跟着涨。';
  if (s.mood < 30) return '你脸色不对。文娱楼三楼的祷告室，心境低到那一步才进得去。';
  if (examGpa(s) >= CONFIG.endingGreat && s.battleWins >= CONFIG.endingGreatWins) return '分数和胜场都够了，剩下几天稳住就行。';
  if (s.mood < 50) return '心境这么低，学也是白学。先去文娱楼弹个琴，或者打两局。';
  return '想晚上抗揍就去体育场，想分数就进楼。别都想要，一天只有三点。';
}

export function roomieTalk(s) {
  if (s.phase !== 'day') return no('现在不是说话的时候。');
  if (s.today.zhe) return no(ROOMMATE.name + '已经戴上耳机了，别吵他。');
  s.today.zhe = true;
  const msg = ROOMMATE.name + '：' + roomieTip(s);
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
  s.stats.indoor += 1;
  const msg = '在自习室坐了一节：知识 +' + R.studyroom.know + '，心境 ' + num(R.studyroom.mood) +
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
  s.stats.indoor += 1;
  const ids = Object.keys(s.friend);
  const who = ids[Math.floor(nextRandom(s) * ids.length) % ids.length];
  const unlocked = bumpFriend(s, who, R.doubt.friend);
  const msg = '在答疑角问了两道题：知识 +' + R.doubt.know + '，心情 ' + num(R.doubt.mood) +
    '，顺便和' + NPCS[who].name + '说上话（友谊 +' + R.doubt.friend + '）。' +
    (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'study');
  return ok(msg);
}

// 1F 乒乓球：真打一局，按小球结果结算
export function pingpong(s, npcId, outcome = 'win') {
  const npc = NPCS[npcId];
  if (!npc) return no('这里没有人。');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.pingpong) return no('今天已经打过球了，胳膊抬不起来。');
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
  const label = win ? '你赢了' : draw ? '打平了' : '你输了';
  const msg = '和' + npc.name + '打了一局乒乓球（' + label + '）：心境 +' + mood +
    '，友谊 +' + friend + '（' + s.friend[npcId] + '）。' + (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F 斯诺克：真打一局，更亲近，但对方今天得还没跟你聊过
export function snooker(s, npcId, outcome = 'win') {
  const npc = NPCS[npcId];
  if (!npc) return no('这里没有人。');
  const bad = inDay(s);
  if (bad) return bad;
  if (s.today.talked[npcId]) return no(npc.name + '今天已经跟你聊过了，一局球也说不出更多东西。');
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
  const label = win ? '你赢了' : draw ? '打平了' : '你输了';
  const msg = '和' + npc.name + '打了一局斯诺克（' + label + '）：心境 +' + mood +
    '，友谊 +' + friend + '（' + s.friend[npcId] + '）。' + (unlocked ? ' · 解锁支援卡。' : '');
  hhLog(s, msg, 'social');
  return ok(msg);
}

// 1F 钢琴：可以无限弹，只有每天第一次弹满才结算
export function piano(s, notes) {
  if (s.phase !== 'day') return no('现在不是白天。');
  if (s.today.piano) return no('今天已经弹尽兴了，继续随便弹。');
  if (!hasAp(s)) return no('今天没有行动点了。琴可以随便弹，但不算今天的收获。');
  spendAp(s);
  s.today.piano = true;
  s.mood = clampMood(s.mood + R.piano.mood);
  s.stats.play += 1;
  const played = notes || R.piano.notes;
  const msg = '你在钢琴前弹了 ' + played + ' 个音：心境 +' + R.piano.mood + '。';
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

// ---------------------------------------------------------------- 日历活动
// 活动不是在房间里做的：当天校园上多出一个出发点，走到那里才出发。
// 每个活动的三条属性配比不一样，幅度也不一样 —— 面板负责把它们写清楚。
export function doEvent(s, entry) {
  if (!entry) return no('今天日程上是空的。');
  if (entry.done) return no('「' + entry.title + '」已经去过了。');
  if (entry.missed) return no('「' + entry.title + '」已经过期了。');
  if (entry.day !== s.day) return no('不是今天的事。');
  if (s.phase !== 'day') return no('现在不是白天。');
  if (s.ap < entry.ap) return no('行动点不够，「' + entry.title + '」要 ' + entry.ap + ' 点。');
  s.ap -= entry.ap;
  entry.done = true;

  addKnowledge(s, entry.know);
  if (entry.mood) s.mood = clampMood(s.mood + entry.mood);
  if (entry.physique) s.physique = clamp(s.physique + entry.physique, 0, CONFIG.physiqueCap);
  s.stats.events += 1;

  const msg = '「' + entry.title + '」：' + effectLine(entry) + '。';
  hhLog(s, msg, 'event');
  return ok(msg);
}

// ---------------------------------------------------------------- 夜晚
export function nightStudy(s) {
  if (s.phase !== 'night') return no('现在不是晚上。');
  const gain = Math.ceil(CONFIG.nightStudyGain * moodMult(s));
  addKnowledge(s, gain);
  s.mood = clampMood(s.mood - CONFIG.nightStudyMoodCost);
  s.stats.nights += 1;
  s.stats.nightStudy += 1;
  const msg = '在宿舍台灯下继续啃书：知识 +' + gain + '，心境 −' + CONFIG.nightStudyMoodCost + '。';
  hhLog(s, msg, 'night');
  return ok(msg);
}

// 打赢就随机掉一件。前三次掉落里必有一件稀有以上 ——
// 一局只有 6 次机会，方差必须压住，否则运气差的人整局都在捡普通货。
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
    const capped = lootCapped(s, item.kind) ? '（这一类已经到顶了）' : '';
    const msg = '赢了。心境 +' + CONFIG.winMood + '，实战总结让知识 +' + CONFIG.winKnowledge +
      '。掉了一件「' + item.name + '」：' + lootEffectText(item) + capped + '。';
    hhLog(s, msg, 'win');
    return { ok: true, msg, loot: item };
  }
  s.mood = clampMood(s.mood - CONFIG.loseMood);
  addKnowledge(s, -CONFIG.loseKnowledge);
  const msg = '输了。心境 −' + CONFIG.loseMood + '，知识 −' + CONFIG.loseKnowledge + '。';
  hhLog(s, msg, 'lose');
  return ok(msg);
}

// 推进到下一天；第 7 天进入考试
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
    hhLog(s, '心境见底，你崩了一次：第二天只剩 ' + CONFIG.collapseAp + ' 个自由行动点。', 'warn');
  }

  // 昨天没去的事，今天就划掉了。只记一笔，不扣分（罚分留给 ddl）。
  for (const e of expirePast(s)) {
    hhLog(s, '错过了「' + e.title + '」，日程上划掉了一条。', 'warn');
  }

  if (s.day >= s.maxDay) {
    s.phase = 'exam';
  } else {
    s.phase = 'day';
    requiredCourses(s); // 新的一天：先替玩家把两节必修课上了
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
